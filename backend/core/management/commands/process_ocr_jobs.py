from django.core.management.base import BaseCommand
from django.db import transaction

from core.models import OcrJob, OcrJobStatus
from core.serializers import OcrResultSerializer
from core.services import (
    build_ocr_warnings,
    download_from_drive,
    parse_date_or_none,
    run_label_ocr,
    run_label_ocr_stub,
)


class Command(BaseCommand):
    help = "Process pending label OCR jobs using files stored on Drive."

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=20)
        parser.add_argument("--retry-failed", action="store_true")

    def handle(self, *args, **options):
        limit = max(1, int(options.get("limit") or 20))
        retry_failed = bool(options.get("retry_failed"))
        statuses = [OcrJobStatus.PENDING]
        if retry_failed:
            statuses.append(OcrJobStatus.FAILED)

        jobs = (
            OcrJob.objects.select_related("asset", "lot")
            .filter(status__in=statuses)
            .order_by("created_at")[:limit]
        )

        processed = 0
        failed = 0
        for job in jobs:
            processed += 1
            try:
                with transaction.atomic():
                    self._process_one(job)
                    self.stdout.write(f"OCR job DONE: {job.id}")
            except Exception as exc:
                failed += 1
                OcrJob.objects.filter(id=job.id).update(status=OcrJobStatus.FAILED, error=str(exc)[:1000])
                self.stderr.write(f"OCR job FAILED: {job.id} -> {exc}")

        self.stdout.write(
            self.style.SUCCESS(
                f"Processed OCR jobs: {processed} (failed={failed}, done={processed - failed})"
            )
        )

    def _process_one(self, job: OcrJob):
        if not job.asset_id or not job.lot_id:
            raise RuntimeError("ocr_job_missing_asset_or_lot")

        file_name = job.asset.file_name or "capture.jpg"
        mime_type = job.asset.mime_type or "image/jpeg"

        if job.asset.drive_file_id and not job.asset.drive_file_id.startswith("drv_"):
            binary, resolved_mime = download_from_drive(
                job.asset.drive_file_id,
                file_name_hint=file_name,
            )
            mime_type = resolved_mime or mime_type
            ocr_raw = run_label_ocr(file_name=file_name, binary=binary, mime_type=mime_type)
        else:
            ocr_raw = run_label_ocr_stub(file_name=file_name)
            ocr_raw["provider"] = "stub"
            ocr_raw["fallback_reason"] = "asset_not_on_remote_drive"

        ocr = OcrResultSerializer(data=ocr_raw)
        ocr.is_valid(raise_exception=True)
        validated = ocr.validated_data
        warnings = build_ocr_warnings(validated)
        ai_payload = {**validated, "warnings": warnings}

        lot = job.lot
        lot.supplier_lot_code = validated.get("supplier_lot_code", "") or lot.supplier_lot_code
        parsed_dlc = parse_date_or_none(validated.get("dlc_date", ""))
        if parsed_dlc:
            lot.dlc_date = parsed_dlc
        lot.ai_suggested = True
        lot.ai_payload = ai_payload
        lot.save(update_fields=["supplier_lot_code", "dlc_date", "ai_suggested", "ai_payload", "updated_at"])
        lot.schedule_expiry_alerts()

        job.status = OcrJobStatus.DONE
        job.result = validated
        job.error = ""
        job.save(update_fields=["status", "result", "error", "updated_at"])
