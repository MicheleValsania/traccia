from datetime import date
import uuid

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from core.models import (
    Asset,
    AssetType,
    ColdPoint,
    ColdSector,
    HaccpSchedule,
    HaccpScheduleStatus,
    Lot,
    LotEvent,
    LotEventType,
    LotStatus,
    OcrJob,
    OcrJobStatus,
    OcrValidationStatus,
    Site,
    TemperatureDeviceType,
)

User = get_user_model()


@override_settings(INTERNAL_API_KEY="test-haccp-key")
class HaccpApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.credentials(HTTP_X_API_KEY="test-haccp-key")
        self.external_site_id = uuid.uuid4()
        self.site = Site.objects.create(external_id=self.external_site_id, code="MAIN", name="Main Site")

    def test_sync_endpoints_and_schedule_crud(self):
        sector_external_id = uuid.uuid4()
        point_external_id = uuid.uuid4()

        resp = self.client.post(
            "/api/v1/haccp/sectors/sync/",
            {
                "sectors": [
                    {
                        "external_id": str(sector_external_id),
                        "external_code": "restaurant",
                        "site": str(self.external_site_id),
                        "name": "Restaurant",
                        "sort_order": 1,
                        "is_active": True,
                    }
                ]
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        sector = ColdSector.objects.get(external_id=sector_external_id)
        self.assertEqual(sector.name, "Restaurant")

        resp = self.client.post(
            "/api/v1/haccp/cold-points/sync/",
            {
                "cold_points": [
                    {
                        "external_id": str(point_external_id),
                        "external_code": "frigo-1",
                        "site": str(self.external_site_id),
                        "sector": str(sector_external_id),
                        "name": "Frigo 1",
                        "equipment_type": "FRIDGE",
                        "sort_order": 1,
                        "min_temp_celsius": "0.00",
                        "max_temp_celsius": "4.00",
                        "is_active": True,
                    }
                ]
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        point = ColdPoint.objects.get(external_id=point_external_id)
        self.assertEqual(point.name, "Frigo 1")

        schedule_id = uuid.uuid4()
        starts_at = timezone.now().replace(microsecond=0)
        resp = self.client.post(
            "/api/v1/haccp/schedules/",
            {
                "id": str(schedule_id),
                "site": str(self.external_site_id),
                "task_type": "temperature_register",
                "title": "Controllo celle mattino",
                "sector": str(sector_external_id),
                "cold_point": str(point_external_id),
                "starts_at": starts_at.isoformat(),
                "status": "planned",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        row = HaccpSchedule.objects.get(id=schedule_id)
        self.assertEqual(row.cold_point_id, point.id)

        resp = self.client.get(f"/api/v1/haccp/schedules/?site={self.external_site_id}&task_type=temperature_register")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.json()["results"]), 1)

        resp = self.client.patch(
            f"/api/v1/haccp/schedules/{schedule_id}/",
            {"status": "done"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        row.refresh_from_db()
        self.assertEqual(row.status, HaccpScheduleStatus.DONE)
        self.assertIsNotNone(row.completed_at)

        resp = self.client.delete(f"/api/v1/haccp/schedules/{schedule_id}/")
        self.assertEqual(resp.status_code, 204)
        self.assertFalse(HaccpSchedule.objects.filter(id=schedule_id).exists())

    def test_ocr_queue_and_validate(self):
        lot = Lot.objects.create(
            site=self.site,
            internal_lot_code="MAIN-20260312-0001",
            supplier_name="Supplier",
            received_date=date(2026, 3, 12),
            status=LotStatus.DRAFT,
            ai_payload={"product_guess": "Fish Burger"},
        )
        asset = Asset.objects.create(
            site=self.site,
            lot=lot,
            asset_type=AssetType.PHOTO_LABEL,
            file_name="ocr_doc.pdf",
            drive_file_id="drive-1",
            drive_link="https://example.com/doc.pdf",
            mime_type="application/pdf",
            sha256="abc",
        )
        job = OcrJob.objects.create(
            site=self.site,
            asset=asset,
            lot=lot,
            status=OcrJobStatus.DONE,
            result={"product_guess": "Fish Burger", "confidence": 0.91},
        )

        resp = self.client.get(f"/api/v1/haccp/ocr-results/?site={self.external_site_id}&limit=20")
        self.assertEqual(resp.status_code, 200)
        payload = resp.json()["results"]
        self.assertEqual(len(payload), 1)
        self.assertEqual(payload[0]["document_id"], str(lot.id))
        self.assertEqual(payload[0]["validation_status"], OcrValidationStatus.PENDING)

        resp = self.client.post(
            f"/api/v1/haccp/ocr-results/{lot.id}/validate/",
            {"status": "validated", "corrected_payload": {"product_guess": "Burger Fishcake"}, "notes": "checked"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        job.refresh_from_db()
        lot.refresh_from_db()
        self.assertEqual(job.validation_status, OcrValidationStatus.VALIDATED)
        self.assertEqual(job.corrected_payload["product_guess"], "Burger Fishcake")
        self.assertEqual(lot.ai_payload["validation_status"], "validated")

    def test_lifecycle_events_adapter(self):
        lot = Lot.objects.create(
            site=self.site,
            internal_lot_code="MAIN-20260312-0002",
            supplier_name="Supplier",
            supplier_lot_code="SUP-LOT-1",
            quantity_value="4.000",
            quantity_unit="kg",
            received_date=date(2026, 3, 12),
            status=LotStatus.ACTIVE,
            ai_payload={"product_guess": "Canard"},
        )
        event = LotEvent.objects.create(
            lot=lot,
            event_type=LotEventType.CREATED,
            event_time=timezone.now(),
            quantity_delta="4.000",
            data={},
        )

        resp = self.client.get(f"/api/v1/haccp/lifecycle-events/?site={self.external_site_id}&limit=20")
        self.assertEqual(resp.status_code, 200)
        rows = resp.json()["results"]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["event_id"], str(event.id))
        self.assertEqual(rows[0]["lot"]["supplier_lot_code"], "SUP-LOT-1")
        self.assertEqual(rows[0]["qty_unit"], "kg")

    def test_me_returns_all_sites_for_superuser(self):
        Site.objects.create(code="SECOND", name="Second Site")
        user = User.objects.create_user(username="super", password="test123")
        user.is_staff = True
        user.is_superuser = True
        user.save()
        self.client.force_authenticate(user=user)

        resp = self.client.get("/api/auth/me")

        self.assertEqual(resp.status_code, 200)
        memberships = resp.json()["memberships"]
        site_codes = {row["site_code"] for row in memberships}
        self.assertIn("MAIN", site_codes)
        self.assertIn("SECOND", site_codes)
