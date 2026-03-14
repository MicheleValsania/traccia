from __future__ import annotations

from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .haccp_serializers import (
    HaccpColdPointSyncSerializer,
    HaccpLabelProfilePatchSerializer,
    HaccpLabelProfileWriteSerializer,
    HaccpLabelSessionWriteSerializer,
    HaccpOcrValidationSerializer,
    HaccpSchedulePatchSerializer,
    HaccpScheduleWriteSerializer,
    HaccpSectorSyncSerializer,
    HaccpSiteSyncSerializer,
    serialize_cold_point,
    serialize_label_profile,
    serialize_label_session,
    serialize_schedule,
    serialize_sector,
    serialize_site,
)
from .models import (
    ColdPoint,
    ColdSector,
    HaccpSchedule,
    HaccpScheduleStatus,
    LabelPrintJob,
    LabelProfile,
    Lot,
    LotEvent,
    Membership,
    MembershipRole,
    OcrJob,
    OcrValidationStatus,
    Site,
    TemperatureRegister,
)
from .services import log_audit_event

SITE_READ_ROLES = {
    MembershipRole.ADMIN,
    MembershipRole.MANAGER,
    MembershipRole.CHEF,
    MembershipRole.OPERATOR,
    MembershipRole.AUDITOR,
}
SITE_WRITE_ROLES = {
    MembershipRole.ADMIN,
    MembershipRole.MANAGER,
    MembershipRole.CHEF,
    MembershipRole.OPERATOR,
}


def _membership_role(user, site: Site) -> str | None:
    if not user or not getattr(user, "is_authenticated", False):
        return None
    if user.is_superuser:
        return MembershipRole.ADMIN
    membership = Membership.objects.filter(user=user, site=site).first()
    return membership.role if membership else None


def _api_key_is_valid(request) -> bool:
    configured = getattr(settings, "INTERNAL_API_KEY", "") or ""
    if not configured:
        return False
    return request.headers.get("X-API-Key", "") == configured


def _ensure_access(request, site: Site | None = None, *, write: bool = False):
    if _api_key_is_valid(request):
        return None
    if not getattr(request, "user", None) or not request.user.is_authenticated:
        return Response({"detail": "Authentication required."}, status=status.HTTP_401_UNAUTHORIZED)
    if site is None:
        return None
    role = _membership_role(request.user, site)
    allowed = SITE_WRITE_ROLES if write else SITE_READ_ROLES
    if role not in allowed:
        return Response({"detail": "Insufficient role for this site."}, status=status.HTTP_403_FORBIDDEN)
    return None


def _resolve_site(identifier) -> Site | None:
    ident = str(identifier or "").strip()
    if not ident:
        return None
    return Site.objects.filter(Q(id=ident) | Q(external_id=ident) | Q(code=ident)).first()


def _resolve_sector(site: Site, identifier: str | None = None, *, external_code: str = "", name: str = "") -> ColdSector | None:
    ident = str(identifier or "").strip()
    code = str(external_code or "").strip()
    title = str(name or "").strip()
    query = ColdSector.objects.filter(site=site)
    if ident:
        hit = query.filter(Q(id=ident) | Q(external_id=ident)).first()
        if hit:
            return hit
    if code:
        hit = query.filter(external_code=code).first()
        if hit:
            return hit
    if title:
        return query.filter(name=title).first()
    return None


def _resolve_cold_point(site: Site, identifier: str | None = None, *, external_code: str = "", name: str = "") -> ColdPoint | None:
    ident = str(identifier or "").strip()
    code = str(external_code or "").strip()
    title = str(name or "").strip()
    query = ColdPoint.objects.select_related("sector").filter(site=site)
    if ident:
        hit = query.filter(Q(id=ident) | Q(external_id=ident)).first()
        if hit:
            return hit
    if code:
        hit = query.filter(external_code=code).first()
        if hit:
            return hit
    if title:
        return query.filter(name=title).first()
    return None


def _ensure_admin_memberships(site: Site) -> None:
    admin_users = (
        Membership.objects.filter(role=MembershipRole.ADMIN)
        .select_related("user")
        .values_list("user_id", flat=True)
        .distinct()
    )
    for user_id in admin_users:
        Membership.objects.get_or_create(user_id=user_id, site=site, defaults={"role": MembershipRole.ADMIN})


class HaccpSiteListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        auth_error = _ensure_access(request)
        if auth_error:
            return auth_error
        qs = Site.objects.all().order_by("code")
        if getattr(request, "user", None) and request.user.is_authenticated and not _api_key_is_valid(request):
            qs = qs.filter(memberships__user=request.user).distinct()
        return Response({"results": [serialize_site(site) for site in qs]}, status=status.HTTP_200_OK)


class HaccpSiteSyncView(APIView):
    permission_classes = [AllowAny]

    @transaction.atomic
    def post(self, request):
        auth_error = _ensure_access(request, write=True)
        if auth_error:
            return auth_error
        serializer = HaccpSiteSyncSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        created = 0
        updated = 0
        rows = []
        for item in serializer.validated_data["sites"]:
            site = None
            if item.get("external_id"):
                site = Site.objects.filter(external_id=item["external_id"]).first()
            if not site:
                site = Site.objects.filter(code=item["code"]).first()
            if site:
                updated += 1
                site.external_id = item.get("external_id") or site.external_id
                site.code = item["code"]
                site.name = item["name"].strip()
                site.timezone = item.get("timezone") or site.timezone or "Europe/Paris"
                site.save()
            else:
                created += 1
                site = Site.objects.create(
                    external_id=item.get("external_id"),
                    code=item["code"],
                    name=item["name"].strip(),
                    timezone=item.get("timezone") or "Europe/Paris",
                )
            _ensure_admin_memberships(site)
            rows.append(serialize_site(site))
        return Response({"created": created, "updated": updated, "results": rows}, status=status.HTTP_200_OK)


class HaccpSectorListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        site = _resolve_site(request.query_params.get("site"))
        if not site:
            return Response({"detail": "site query parameter is required."}, status=status.HTTP_400_BAD_REQUEST)
        auth_error = _ensure_access(request, site)
        if auth_error:
            return auth_error
        qs = ColdSector.objects.select_related("site").filter(site=site).order_by("sort_order", "name")
        return Response({"results": [serialize_sector(row) for row in qs]}, status=status.HTTP_200_OK)


class HaccpSectorSyncView(APIView):
    permission_classes = [AllowAny]

    @transaction.atomic
    def post(self, request):
        auth_error = _ensure_access(request, write=True)
        if auth_error:
            return auth_error
        serializer = HaccpSectorSyncSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        created = 0
        updated = 0
        rows = []
        for item in serializer.validated_data["sectors"]:
            site = _resolve_site(item["site"])
            if not site:
                return Response({"detail": f"Unknown site for sector {item['name']}."}, status=status.HTTP_400_BAD_REQUEST)
            sector = _resolve_sector(site, str(item.get("external_id") or ""), external_code=item.get("external_code", ""), name=item["name"])
            if sector:
                updated += 1
                sector.external_id = item.get("external_id") or sector.external_id
                sector.external_code = item.get("external_code", "")
                sector.name = item["name"].strip()
                sector.sort_order = item.get("sort_order", 0)
                sector.is_active = item.get("is_active", True)
                sector.save()
                register = TemperatureRegister.objects.filter(sector=sector).first()
                if register:
                    register.name = sector.name
                    register.save(update_fields=["name", "updated_at"])
            else:
                created += 1
                sector = ColdSector.objects.create(
                    site=site,
                    external_id=item.get("external_id"),
                    external_code=item.get("external_code", ""),
                    name=item["name"].strip(),
                    sort_order=item.get("sort_order", 0),
                    is_active=item.get("is_active", True),
                )
                TemperatureRegister.objects.get_or_create(site=site, sector=sector, defaults={"name": sector.name})
            rows.append(serialize_sector(sector))
        return Response({"created": created, "updated": updated, "results": rows}, status=status.HTTP_200_OK)


class HaccpColdPointListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        site = _resolve_site(request.query_params.get("site"))
        if not site:
            return Response({"detail": "site query parameter is required."}, status=status.HTTP_400_BAD_REQUEST)
        auth_error = _ensure_access(request, site)
        if auth_error:
            return auth_error
        qs = ColdPoint.objects.select_related("site", "sector").filter(site=site)
        sector = _resolve_sector(site, request.query_params.get("sector"), external_code=request.query_params.get("sector_code", ""))
        if sector:
            qs = qs.filter(sector=sector)
        qs = qs.order_by("sector__sort_order", "sort_order", "name")
        return Response({"results": [serialize_cold_point(row) for row in qs]}, status=status.HTTP_200_OK)


class HaccpColdPointSyncView(APIView):
    permission_classes = [AllowAny]

    @transaction.atomic
    def post(self, request):
        auth_error = _ensure_access(request, write=True)
        if auth_error:
            return auth_error
        serializer = HaccpColdPointSyncSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        created = 0
        updated = 0
        rows = []
        for item in serializer.validated_data["cold_points"]:
            site = _resolve_site(item["site"])
            if not site:
                return Response({"detail": f"Unknown site for cold point {item['name']}."}, status=status.HTTP_400_BAD_REQUEST)
            sector = _resolve_sector(site, str(item["sector"]))
            if not sector:
                return Response({"detail": f"Unknown sector for cold point {item['name']}."}, status=status.HTTP_400_BAD_REQUEST)
            point = _resolve_cold_point(site, str(item.get("external_id") or ""), external_code=item.get("external_code", ""), name=item["name"])
            if point:
                updated += 1
                point.external_id = item.get("external_id") or point.external_id
                point.external_code = item.get("external_code", "")
                point.sector = sector
                point.name = item["name"].strip()
                point.device_type = item.get("equipment_type") or point.device_type
                point.sort_order = item.get("sort_order", 0)
                point.min_temp_celsius = item.get("min_temp_celsius")
                point.max_temp_celsius = item.get("max_temp_celsius")
                point.is_active = item.get("is_active", True)
                point.save()
            else:
                created += 1
                point = ColdPoint.objects.create(
                    site=site,
                    sector=sector,
                    external_id=item.get("external_id"),
                    external_code=item.get("external_code", ""),
                    name=item["name"].strip(),
                    device_type=item.get("equipment_type"),
                    sort_order=item.get("sort_order", 0),
                    min_temp_celsius=item.get("min_temp_celsius"),
                    max_temp_celsius=item.get("max_temp_celsius"),
                    is_active=item.get("is_active", True),
                )
            rows.append(serialize_cold_point(point))
        return Response({"created": created, "updated": updated, "results": rows}, status=status.HTTP_200_OK)


def _schedule_queryset():
    return HaccpSchedule.objects.select_related("site", "sector", "cold_point")


def _compute_label_dlc_date(*, production_date, shelf_life_value: int, shelf_life_unit: str):
    if shelf_life_unit == "hours":
        from datetime import timedelta
        return production_date + timedelta(days=1 if shelf_life_value > 0 else 0)
    if shelf_life_unit == "months":
        from datetime import timedelta
        return production_date + timedelta(days=30 * shelf_life_value)
    from datetime import timedelta
    return production_date + timedelta(days=shelf_life_value)


def _label_profile_queryset():
    return LabelProfile.objects.select_related("site").order_by("category", "name")


def _label_session_queryset():
    return LabelPrintJob.objects.select_related("site", "profile", "lot").order_by("-created_at")


def _apply_schedule_fields(row: HaccpSchedule, data: dict):
    row.title = data.get("title", row.title)
    if "area" in data:
        row.area = data.get("area") or ""
    if "starts_at" in data:
        row.starts_at = data["starts_at"]
    if "ends_at" in data:
        row.ends_at = data.get("ends_at")
    if "recurrence_rule" in data:
        row.recurrence_rule = data.get("recurrence_rule") or {}
    if "metadata" in data:
        row.metadata = data.get("metadata") or {}
    if "equipment_type" in data:
        row.equipment_type = data.get("equipment_type") or ""
    if "status" in data:
        row.status = data["status"]
        row.completed_at = timezone.now() if data["status"] == HaccpScheduleStatus.DONE else None


class HaccpScheduleListCreateView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        site = _resolve_site(request.query_params.get("site"))
        if not site:
            return Response({"detail": "site query parameter is required."}, status=status.HTTP_400_BAD_REQUEST)
        auth_error = _ensure_access(request, site)
        if auth_error:
            return auth_error
        qs = _schedule_queryset().filter(site=site)
        task_type = str(request.query_params.get("task_type", "")).strip()
        if task_type:
            qs = qs.filter(task_type=task_type)
        return Response({"results": [serialize_schedule(row) for row in qs]}, status=status.HTTP_200_OK)

    @transaction.atomic
    def post(self, request):
        serializer = HaccpScheduleWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        site = _resolve_site(data["site"])
        if not site:
            return Response({"detail": "Unknown site."}, status=status.HTTP_400_BAD_REQUEST)
        auth_error = _ensure_access(request, site, write=True)
        if auth_error:
            return auth_error
        sector = _resolve_sector(site, data.get("sector"), external_code=data.get("sector_code", ""), name=data.get("sector_label", ""))
        cold_point = _resolve_cold_point(site, data.get("cold_point"), external_code=data.get("cold_point_code", ""), name=data.get("cold_point_label", ""))
        create_kwargs = {
            "site": site,
            "sector": sector,
            "cold_point": cold_point,
            "task_type": data["task_type"],
            "title": data["title"].strip(),
            "area": (data.get("area") or "").strip(),
            "equipment_type": data.get("equipment_type") or (cold_point.device_type if cold_point else ""),
            "starts_at": data["starts_at"],
            "ends_at": data.get("ends_at"),
            "recurrence_rule": data.get("recurrence_rule") or {},
            "status": data.get("status", HaccpScheduleStatus.PLANNED),
            "metadata": data.get("metadata") or {},
            "created_by": request.user if getattr(request, "user", None) and request.user.is_authenticated else None,
        }
        if data.get("id"):
            create_kwargs["id"] = data["id"]
        row = HaccpSchedule.objects.create(**create_kwargs)
        if row.status == HaccpScheduleStatus.DONE:
            row.completed_at = timezone.now()
            row.save(update_fields=["completed_at", "updated_at"])
        log_audit_event(
            action="HACCP_SCHEDULE_CREATED",
            request=request,
            site=site,
            object_type="HaccpSchedule",
            object_id=str(row.id),
            payload={"task_type": row.task_type, "title": row.title, "status": row.status},
        )
        row = _schedule_queryset().get(id=row.id)
        return Response(serialize_schedule(row), status=status.HTTP_201_CREATED)


class HaccpScheduleDetailView(APIView):
    permission_classes = [AllowAny]

    @transaction.atomic
    def patch(self, request, schedule_id):
        row = _schedule_queryset().filter(id=schedule_id).first()
        if not row:
            return Response({"detail": "Schedule not found."}, status=status.HTTP_404_NOT_FOUND)
        auth_error = _ensure_access(request, row.site, write=True)
        if auth_error:
            return auth_error
        serializer = HaccpSchedulePatchSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        if any(key in data for key in ("sector", "sector_code", "sector_label")):
            row.sector = _resolve_sector(row.site, data.get("sector"), external_code=data.get("sector_code", ""), name=data.get("sector_label", ""))
        if any(key in data for key in ("cold_point", "cold_point_code", "cold_point_label")):
            row.cold_point = _resolve_cold_point(row.site, data.get("cold_point"), external_code=data.get("cold_point_code", ""), name=data.get("cold_point_label", ""))
        _apply_schedule_fields(row, data)
        row.save()
        log_audit_event(
            action="HACCP_SCHEDULE_UPDATED",
            request=request,
            site=row.site,
            object_type="HaccpSchedule",
            object_id=str(row.id),
            payload={"task_type": row.task_type, "status": row.status},
        )
        row = _schedule_queryset().get(id=row.id)
        return Response(serialize_schedule(row), status=status.HTTP_200_OK)

    @transaction.atomic
    def delete(self, request, schedule_id):
        row = HaccpSchedule.objects.select_related("site").filter(id=schedule_id).first()
        if not row:
            return Response({"detail": "Schedule not found."}, status=status.HTTP_404_NOT_FOUND)
        auth_error = _ensure_access(request, row.site, write=True)
        if auth_error:
            return auth_error
        site = row.site
        snapshot = {"id": str(row.id), "task_type": row.task_type, "title": row.title}
        row.delete()
        log_audit_event(
            action="HACCP_SCHEDULE_DELETED",
            request=request,
            site=site,
            object_type="HaccpSchedule",
            object_id=snapshot["id"],
            payload=snapshot,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class HaccpOcrResultListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        site = _resolve_site(request.query_params.get("site"))
        if not site:
            return Response({"detail": "site query parameter is required."}, status=status.HTTP_400_BAD_REQUEST)
        auth_error = _ensure_access(request, site)
        if auth_error:
            return auth_error
        limit = int(request.query_params.get("limit") or 100)
        jobs = OcrJob.objects.select_related("lot", "asset").filter(site=site).order_by("-created_at")[:limit]
        rows = []
        for job in jobs:
            payload = job.corrected_payload or job.result or {}
            rows.append(
                {
                    "document_id": str(job.lot_id or job.id),
                    "ocr_job_id": str(job.id),
                    "filename": job.asset.file_name,
                    "document_type": "goods_receipt",
                    "document_status": job.status.lower(),
                    "validation_status": job.validation_status,
                    "extraction": {
                        "confidence": payload.get("confidence"),
                        "status": job.status.lower(),
                        "normalized_payload": payload,
                    },
                }
            )
        return Response({"results": rows}, status=status.HTTP_200_OK)


class HaccpOcrResultValidateView(APIView):
    permission_classes = [AllowAny]

    @transaction.atomic
    def post(self, request, document_id):
        job = OcrJob.objects.select_related("site", "lot").filter(Q(lot_id=document_id) | Q(id=document_id)).order_by("-created_at").first()
        if not job:
            return Response({"detail": "OCR document not found."}, status=status.HTTP_404_NOT_FOUND)
        auth_error = _ensure_access(request, job.site, write=True)
        if auth_error:
            return auth_error
        serializer = HaccpOcrValidationSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        corrected_payload = data.get("corrected_payload") or job.corrected_payload or job.result or {}
        if data.get("notes"):
            corrected_payload = {**corrected_payload, "validation_notes": data["notes"]}
        job.corrected_payload = corrected_payload
        job.validation_status = data.get("status", OcrValidationStatus.VALIDATED)
        job.validated_at = timezone.now()
        job.save(update_fields=["corrected_payload", "validation_status", "validated_at", "updated_at"])
        if job.lot:
            payload = job.lot.ai_payload if isinstance(job.lot.ai_payload, dict) else {}
            payload.update({
                "validation_status": job.validation_status,
                "validated_at": job.validated_at.isoformat(),
                "corrected_payload": corrected_payload,
            })
            job.lot.ai_payload = payload
            if job.validation_status == OcrValidationStatus.VALIDATED:
                job.lot.validated_at = job.validated_at
            job.lot.save(update_fields=["ai_payload", "validated_at", "updated_at"])
        log_audit_event(
            action="HACCP_OCR_VALIDATED",
            request=request,
            site=job.site,
            object_type="OcrJob",
            object_id=str(job.id),
            payload={"document_id": str(document_id), "status": job.validation_status},
        )
        return Response({"document_id": str(document_id), "status": job.validation_status, "corrected_payload": corrected_payload}, status=status.HTTP_200_OK)


class HaccpLifecycleEventListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        site = _resolve_site(request.query_params.get("site"))
        if not site:
            return Response({"detail": "site query parameter is required."}, status=status.HTTP_400_BAD_REQUEST)
        auth_error = _ensure_access(request, site)
        if auth_error:
            return auth_error
        limit = int(request.query_params.get("limit") or 200)
        rows = []
        for event in LotEvent.objects.select_related("lot__fiche_product").filter(lot__site=site).order_by("-event_time")[:limit]:
            lot = event.lot
            payload = lot.ai_payload if isinstance(lot.ai_payload, dict) else {}
            product_label = lot.fiche_product.title if lot.fiche_product_id else lot.category_snapshot or payload.get("product_guess", "") or lot.internal_lot_code
            rows.append(
                {
                    "event_id": str(event.id),
                    "event_type": event.event_type,
                    "happened_at": event.event_time.isoformat(),
                    "qty_value": str(event.quantity_delta or "0"),
                    "qty_unit": lot.quantity_unit or "",
                    "product_label": product_label,
                    "supplier_code": "",
                    "lot": {
                        "internal_lot_code": lot.internal_lot_code,
                        "supplier_lot_code": lot.supplier_lot_code,
                        "status": lot.status,
                        "dlc_date": lot.dlc_date.isoformat() if lot.dlc_date else "",
                    },
                }
            )
        return Response({"results": rows}, status=status.HTTP_200_OK)


class HaccpLabelProfileListCreateView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        site = _resolve_site(request.query_params.get("site"))
        if not site:
            return Response({"detail": "site query parameter is required."}, status=status.HTTP_400_BAD_REQUEST)
        auth_error = _ensure_access(request, site)
        if auth_error:
            return auth_error
        qs = _label_profile_queryset().filter(site=site)
        return Response({"results": [serialize_label_profile(row) for row in qs]}, status=status.HTTP_200_OK)

    @transaction.atomic
    def post(self, request):
        serializer = HaccpLabelProfileWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        site = _resolve_site(data["site"])
        if not site:
            return Response({"detail": "Unknown site."}, status=status.HTTP_400_BAD_REQUEST)
        auth_error = _ensure_access(request, site, write=True)
        if auth_error:
            return auth_error
        profile = LabelProfile.objects.create(
            site=site,
            name=data["name"].strip(),
            category=(data.get("category") or "").strip(),
            template_type=data.get("template_type"),
            shelf_life_value=data.get("shelf_life_value", 1),
            shelf_life_unit=data.get("shelf_life_unit", "days"),
            packaging=(data.get("packaging") or "").strip(),
            storage_instructions=(data.get("storage_hint") or "").strip(),
            allergen_text=(data.get("allergens_text") or "").strip(),
            is_active=data.get("is_active", True),
        )
        log_audit_event(
            action="HACCP_LABEL_PROFILE_CREATED",
            request=request,
            site=site,
            object_type="LabelProfile",
            object_id=str(profile.id),
            payload={"name": profile.name, "category": profile.category, "template_type": profile.template_type},
        )
        return Response(serialize_label_profile(profile), status=status.HTTP_201_CREATED)


class HaccpLabelProfileDetailView(APIView):
    permission_classes = [AllowAny]

    @transaction.atomic
    def patch(self, request, profile_id):
        profile = _label_profile_queryset().filter(id=profile_id).first()
        if not profile:
            return Response({"detail": "Label profile not found."}, status=status.HTTP_404_NOT_FOUND)
        auth_error = _ensure_access(request, profile.site, write=True)
        if auth_error:
            return auth_error
        serializer = HaccpLabelProfilePatchSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        for field, source in [("name", "name"), ("category", "category"), ("template_type", "template_type"), ("shelf_life_value", "shelf_life_value"), ("shelf_life_unit", "shelf_life_unit"), ("packaging", "packaging"), ("is_active", "is_active")]:
            if source in data:
                value = data[source]
                if isinstance(value, str):
                    value = value.strip()
                setattr(profile, field, value)
        if "storage_hint" in data:
            profile.storage_instructions = (data.get("storage_hint") or "").strip()
        if "allergens_text" in data:
            profile.allergen_text = (data.get("allergens_text") or "").strip()
        profile.save()
        log_audit_event(
            action="HACCP_LABEL_PROFILE_UPDATED",
            request=request,
            site=profile.site,
            object_type="LabelProfile",
            object_id=str(profile.id),
            payload={"name": profile.name, "category": profile.category, "template_type": profile.template_type, "is_active": profile.is_active},
        )
        return Response(serialize_label_profile(profile), status=status.HTTP_200_OK)

    @transaction.atomic
    def delete(self, request, profile_id):
        profile = _label_profile_queryset().filter(id=profile_id).first()
        if not profile:
            return Response({"detail": "Label profile not found."}, status=status.HTTP_404_NOT_FOUND)
        auth_error = _ensure_access(request, profile.site, write=True)
        if auth_error:
            return auth_error
        site = profile.site
        name = profile.name
        category = profile.category
        object_id = str(profile.id)
        profile.delete()
        log_audit_event(
            action="HACCP_LABEL_PROFILE_DELETED",
            request=request,
            site=site,
            object_type="LabelProfile",
            object_id=object_id,
            payload={"name": name, "category": category},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class HaccpLabelSessionListCreateView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        site = _resolve_site(request.query_params.get("site"))
        if not site:
            return Response({"detail": "site query parameter is required."}, status=status.HTTP_400_BAD_REQUEST)
        auth_error = _ensure_access(request, site)
        if auth_error:
            return auth_error
        qs = _label_session_queryset().filter(site=site)
        return Response({"results": [serialize_label_session(row) for row in qs]}, status=status.HTTP_200_OK)

    @transaction.atomic
    def post(self, request):
        serializer = HaccpLabelSessionWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        site = _resolve_site(data["site"])
        if not site:
            return Response({"detail": "Unknown site."}, status=status.HTTP_400_BAD_REQUEST)
        auth_error = _ensure_access(request, site, write=True)
        if auth_error:
            return auth_error
        profile = LabelProfile.objects.filter(id=data["profile_id"], site=site).first()
        if not profile:
            return Response({"detail": "Unknown profile for site."}, status=status.HTTP_400_BAD_REQUEST)
        lot = None
        source_lot_code = (data.get("source_lot_code") or "").strip()
        if source_lot_code:
            lot = Lot.objects.filter(site=site, internal_lot_code=source_lot_code).first()
        production_date = timezone.localdate()
        dlc_date = _compute_label_dlc_date(
            production_date=production_date,
            shelf_life_value=profile.shelf_life_value,
            shelf_life_unit=profile.shelf_life_unit,
        )
        payload = {
            "profile_name": profile.name,
            "template_type": profile.template_type,
            "planned_schedule_id": str(data.get("planned_schedule_id")) if data.get("planned_schedule_id") else None,
            "source_lot_code": source_lot_code,
            "session_status": data.get("status", "planned"),
            "production_date": production_date.isoformat(),
            "dlc_date": dlc_date.isoformat(),
            "packaging": profile.packaging,
            "storage_instructions": profile.storage_instructions,
            "allergen_text": profile.allergen_text,
        }
        job = LabelPrintJob.objects.create(
            site=site,
            profile=profile,
            lot=lot,
            lot_internal_code=lot.internal_lot_code if lot else source_lot_code,
            production_date=production_date,
            dlc_date=dlc_date,
            copies=data.get("quantity", 1),
            payload=payload,
            created_by=request.user if getattr(request, "user", None) and request.user.is_authenticated else None,
        )
        log_audit_event(
            action="HACCP_LABEL_SESSION_CREATED",
            request=request,
            site=site,
            object_type="LabelPrintJob",
            object_id=str(job.id),
            payload={"profile_id": str(profile.id), "quantity": job.copies, "status": payload["session_status"]},
        )
        return Response(serialize_label_session(job), status=status.HTTP_201_CREATED)
