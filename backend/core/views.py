import base64
import os
from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import Q
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.authtoken.models import Token
from rest_framework.authtoken.views import ObtainAuthToken
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    Alert,
    Asset,
    AssetType,
    ColdPoint,
    ColdSector,
    FicheProduct,
    Lot,
    LotStatus,
    Membership,
    MembershipRole,
    OcrJob,
    OcrJobStatus,
    Site,
    TemperatureDeviceType,
    LotEvent,
    LotEventType,
    LotTransformation,
    LotDocumentMatch,
    TemperatureReading,
    TemperatureRegister,
    TemperatureRoute,
    TemperatureRouteStep,
    LabelProfile,
    LabelPrintJob,
)
from .serializers import (
    AlertSerializer,
    AlertStatusUpdateSerializer,
    DraftFromPhotoSerializer,
    DraftReviewSerializer,
    DraftValidationSerializer,
    FicheImportSerializer,
    LotReportFilterSerializer,
    ActiveLotSearchFilterSerializer,
    ActiveLotSearchResultSerializer,
    LotTransformSerializer,
    LabelProfileSerializer,
    LabelProfileWriteSerializer,
    LabelProfileUpdateSerializer,
    LabelPrintRequestSerializer,
    LabelPrintJobSerializer,
    OcrResultSerializer,
    ReconcileIdenticalLotsSerializer,
    SiteSerializer,
    ColdSectorSerializer,
    ColdSectorWriteSerializer,
    ColdSectorUpdateSerializer,
    ColdPointSerializer,
    ColdPointWriteSerializer,
    ColdPointUpdateSerializer,
    TemperatureCaptureSerializer,
    TemperatureConfirmSerializer,
    TemperatureListFilterSerializer,
    TemperatureRegisterReportFilterSerializer,
    TemperatureReadingSerializer,
    TemperatureRouteSerializer,
    TemperatureRouteWriteSerializer,
    TemperatureRouteStepSerializer,
    TemperatureRouteStepWriteSerializer,
)
from .services import (
    build_ocr_warnings,
    log_audit_event,
    lots_to_csv,
    lots_to_pdf,
    temperatures_register_to_csv,
    next_internal_code,
    parse_date_or_none,
    run_label_ocr,
    run_temperature_ocr,
    suggest_products,
    upload_to_drive,
)

# In core/views.py, aggiungi questa view temporanea
from django.http import JsonResponse

def debug_env(request):
    return JsonResponse({
        "CLAUDE_ENABLED": os.getenv("CLAUDE_ENABLED", "NOT SET"),
        "ANTHROPIC_API_KEY": "SET" if os.getenv("ANTHROPIC_API_KEY") else "NOT SET",
        "ANTHROPIC_MODEL": os.getenv("ANTHROPIC_MODEL", "NOT SET"),
        "GOOGLE_DRIVE_ENABLED": os.getenv("GOOGLE_DRIVE_ENABLED", "NOT SET"),
        "GOOGLE_DRIVE_STRICT": os.getenv("GOOGLE_DRIVE_STRICT", "NOT SET"),
        "GOOGLE_DRIVE_FOLDER_ID": os.getenv("GOOGLE_DRIVE_FOLDER_ID", "NOT SET"),
        "GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON": "SET" if os.getenv("GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON") else "NOT SET",
        "GOOGLE_DRIVE_OAUTH_CLIENT_ID": "SET" if os.getenv("GOOGLE_DRIVE_OAUTH_CLIENT_ID") else "NOT SET",
        "GOOGLE_DRIVE_OAUTH_CLIENT_SECRET": "SET" if os.getenv("GOOGLE_DRIVE_OAUTH_CLIENT_SECRET") else "NOT SET",
        "GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN": "SET" if os.getenv("GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN") else "NOT SET",
    })
    
class SiteListCreateView(generics.ListCreateAPIView):
    queryset = Site.objects.all().order_by("code")
    serializer_class = SiteSerializer
    permission_classes = [AllowAny]


def _membership_role(user, site: Site) -> str | None:
    if user.is_superuser:
        return MembershipRole.ADMIN
    membership = Membership.objects.filter(user=user, site=site).first()
    return membership.role if membership else None


def _resolve_user(request):
    if getattr(request, "user", None) and request.user.is_authenticated:
        return request.user
    token_key = request.query_params.get("token", "")
    if token_key:
        token = Token.objects.select_related("user").filter(key=token_key).first()
        if token:
            return token.user
    return None


def _ensure_site_role(request, site: Site, allowed_roles: set[str], user=None) -> Response | None:
    actor = user or _resolve_user(request)
    if not actor:
        return Response({"detail": "Authentication required."}, status=status.HTTP_401_UNAUTHORIZED)
    role = _membership_role(actor, site)
    if role not in allowed_roles:
        return Response({"detail": "Insufficient role for this site."}, status=status.HTTP_403_FORBIDDEN)
    return None


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

TEMP_DEFAULT_RANGES = {
    TemperatureDeviceType.FRIDGE: (0.0, 8.0),
    TemperatureDeviceType.FREEZER: (-30.0, -15.0),
    TemperatureDeviceType.COLD_ROOM: (0.0, 6.0),
}


def _temperature_warnings(*, value_celsius: float, device_type: str, cold_point: ColdPoint | None) -> list[str]:
    warnings: list[str] = []
    if device_type in TEMP_DEFAULT_RANGES:
        min_t, max_t = TEMP_DEFAULT_RANGES[device_type]
        if value_celsius < min_t or value_celsius > max_t:
            warnings.append(f"Temperature out of default range for {device_type}: {min_t}..{max_t} C")
    if cold_point:
        if cold_point.min_temp_celsius is not None and value_celsius < float(cold_point.min_temp_celsius):
            warnings.append(f"Below configured min for point: {cold_point.min_temp_celsius} C")
        if cold_point.max_temp_celsius is not None and value_celsius > float(cold_point.max_temp_celsius):
            warnings.append(f"Above configured max for point: {cold_point.max_temp_celsius} C")
    return warnings


def _reference_temperature_celsius(*, device_type: str, cold_point: ColdPoint | None) -> Decimal | None:
    if cold_point:
        min_t = cold_point.min_temp_celsius
        max_t = cold_point.max_temp_celsius
        if min_t is not None and max_t is not None:
            return (Decimal(min_t) + Decimal(max_t)) / Decimal("2")
        if min_t is not None:
            return Decimal(min_t)
        if max_t is not None:
            return Decimal(max_t)
    defaults = {
        TemperatureDeviceType.FRIDGE: Decimal("4.00"),
        TemperatureDeviceType.FREEZER: Decimal("-18.00"),
        TemperatureDeviceType.COLD_ROOM: Decimal("3.00"),
    }
    return defaults.get(device_type)


def _compute_label_dlc_date(*, production_date, shelf_life_value: int, shelf_life_unit: str):
    if shelf_life_unit == "hours":
        return production_date + timedelta(days=1 if shelf_life_value > 0 else 0)
    if shelf_life_unit == "months":
        return production_date + timedelta(days=30 * shelf_life_value)
    return production_date + timedelta(days=shelf_life_value)


class FicheImportView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = FicheImportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data
        imported = 0
        for fiche in payload.get("fiches", []):
            fiche_id = fiche.get("fiche_id")
            if not fiche_id:
                continue
            FicheProduct.objects.update_or_create(
                id=fiche_id,
                defaults={
                    "title": fiche.get("title", ""),
                    "language": fiche.get("language", "fr"),
                    "category": fiche.get("category") or "",
                    "allergens": fiche.get("allergens") or [],
                    "storage_profiles": fiche.get("storage_profiles") or [],
                    "label_hints": fiche.get("label_hints"),
                    "source_app": payload.get("source_app", "fiches-recettes"),
                    "export_version": payload["export_version"],
                },
            )
            imported += 1
        log_audit_event(action="FICHE_IMPORT", request=request, payload={"imported": imported})
        return Response({"imported": imported}, status=status.HTTP_201_CREATED)


class CaptureLabelView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        serializer = DraftFromPhotoSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            site = Site.objects.get(code=data["site_code"])
        except Site.DoesNotExist:
            return Response({"detail": "Unknown site_code."}, status=status.HTTP_400_BAD_REQUEST)
        auth_error = _ensure_site_role(request, site, SITE_WRITE_ROLES)
        if auth_error:
            return auth_error

        try:
            binary = base64.b64decode(data["file_b64"])
        except Exception:
            return Response({"detail": "file_b64 is not valid base64."}, status=status.HTTP_400_BAD_REQUEST)

        mime_type = data.get("file_mime_type", "image/jpeg") or "image/jpeg"
        try:
            drive = upload_to_drive(file_name=data["file_name"], binary=binary, mime_type=mime_type)
        except Exception as exc:
            return Response(
                {"detail": "Drive upload failed.", "error": str(exc)[:300]},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        async_ocr = os.getenv("OCR_LABEL_ASYNC_ENABLED", "0") == "1"
        warnings = []
        ai_payload = {"warnings": warnings}
        ocr_validated = {
            "supplier_lot_code": "",
            "dlc_date": "",
            "weight": "",
            "product_guess": "",
            "provider": "pending_worker",
        }
        if not async_ocr:
            ocr_raw = run_label_ocr(file_name=data["file_name"], binary=binary, mime_type=mime_type)
            ocr = OcrResultSerializer(data=ocr_raw)
            ocr.is_valid(raise_exception=True)
            ocr_validated = ocr.validated_data
            warnings = build_ocr_warnings(ocr_validated)
            ai_payload = {**ocr_validated, "warnings": warnings}

        lot = Lot.objects.create(
            site=site,
            internal_lot_code=next_internal_code(site.code),
            supplier_name=data.get("supplier_name", ""),
            supplier_lot_code=ocr_validated.get("supplier_lot_code", ""),
            dlc_date=parse_date_or_none(ocr_validated.get("dlc_date", "")),
            status=LotStatus.DRAFT,
            ai_suggested=True,
            ai_payload=ai_payload,
        )
        asset = Asset.objects.create(
            site=site,
            lot=lot,
            asset_type=AssetType.PHOTO_LABEL,
            file_name=drive["file_name"],
            drive_file_id=drive["drive_file_id"],
            drive_link=drive["drive_link"],
            sha256=drive["sha256"],
            mime_type=mime_type,
        )
        OcrJob.objects.create(
            site=site,
            asset=asset,
            lot=lot,
            status=OcrJobStatus.PENDING if async_ocr else OcrJobStatus.DONE,
            result=ocr_validated if not async_ocr else {},
            error="",
        )
        log_audit_event(
            action="LOT_DRAFT_CREATED_FROM_CAPTURE",
            request=request,
            site=site,
            object_type="Lot",
            object_id=str(lot.id),
            payload={"internal_lot_code": lot.internal_lot_code, "drive_file_id": asset.drive_file_id},
        )

        suggestions = suggest_products(site_id=str(site.id), product_guess=ocr_validated.get("product_guess", ""))
        return Response(
            {
                "lot_id": str(lot.id),
                "internal_lot_code": lot.internal_lot_code,
                "draft_status": lot.status,
                "ocr_pending": async_ocr,
                "ocr_result": ocr_validated,
                "ocr_provider": ocr_validated.get("provider", "unknown"),
                "ocr_warnings": warnings,
                "product_suggestions": suggestions,
                "asset": {
                    "drive_file_id": asset.drive_file_id,
                    "drive_link": asset.drive_link,
                    "drive_provider": drive.get("provider", "unknown"),
                    "drive_fallback_reason": drive.get("fallback_reason", ""),
                },
            },
            status=status.HTTP_201_CREATED,
        )


class ColdSectorListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        site_code = request.query_params.get("site_code", "").strip()
        if not site_code:
            return Response({"detail": "site_code is required."}, status=status.HTTP_400_BAD_REQUEST)
        site = Site.objects.filter(code=site_code).first()
        if not site:
            return Response({"detail": "Unknown site_code."}, status=status.HTTP_400_BAD_REQUEST)
        auth_error = _ensure_site_role(request, site, SITE_READ_ROLES)
        if auth_error:
            return auth_error
        qs = ColdSector.objects.filter(site=site).order_by("sort_order", "name")
        return Response(ColdSectorSerializer(qs, many=True).data, status=status.HTTP_200_OK)

    def post(self, request):
        payload = ColdSectorWriteSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        site = Site.objects.filter(code=data["site_code"]).first()
        if not site:
            return Response({"detail": "Unknown site_code."}, status=status.HTTP_400_BAD_REQUEST)
        auth_error = _ensure_site_role(request, site, SITE_WRITE_ROLES)
        if auth_error:
            return auth_error
        sector = ColdSector.objects.create(
            site=site,
            name=data["name"].strip(),
            sort_order=data.get("sort_order", 0),
            is_active=data.get("is_active", True),
        )
        TemperatureRegister.objects.create(site=site, sector=sector, name=sector.name)
        log_audit_event(
            action="COLD_SECTOR_CREATED",
            request=request,
            site=site,
            object_type="ColdSector",
            object_id=str(sector.id),
            payload={"name": sector.name, "sort_order": sector.sort_order},
        )
        return Response(ColdSectorSerializer(sector).data, status=status.HTTP_201_CREATED)


class ColdSectorDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, sector_id):
        sector = ColdSector.objects.select_related("site").filter(id=sector_id).first()
        if not sector:
            return Response({"detail": "Sector not found."}, status=status.HTTP_404_NOT_FOUND)
        auth_error = _ensure_site_role(request, sector.site, SITE_WRITE_ROLES)
        if auth_error:
            return auth_error
        payload = ColdSectorUpdateSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        if "name" in data:
            sector.name = data["name"].strip()
        if "sort_order" in data:
            sector.sort_order = data["sort_order"]
        if "is_active" in data:
            sector.is_active = data["is_active"]
        sector.save()
        register = TemperatureRegister.objects.filter(sector=sector).first()
        if register:
            register.name = sector.name
            register.save(update_fields=["name", "updated_at"])
        log_audit_event(
            action="COLD_SECTOR_UPDATED",
            request=request,
            site=sector.site,
            object_type="ColdSector",
            object_id=str(sector.id),
            payload={"name": sector.name, "sort_order": sector.sort_order, "is_active": sector.is_active},
        )
        return Response(ColdSectorSerializer(sector).data, status=status.HTTP_200_OK)


class ColdPointListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        site_code = request.query_params.get("site_code", "").strip()
        if not site_code:
            return Response({"detail": "site_code is required."}, status=status.HTTP_400_BAD_REQUEST)
        site = Site.objects.filter(code=site_code).first()
        if not site:
            return Response({"detail": "Unknown site_code."}, status=status.HTTP_400_BAD_REQUEST)
        auth_error = _ensure_site_role(request, site, SITE_READ_ROLES)
        if auth_error:
            return auth_error
        qs = ColdPoint.objects.select_related("sector").filter(site=site)
        sector_id = request.query_params.get("sector_id", "").strip()
        if sector_id:
            qs = qs.filter(sector_id=sector_id)
        qs = qs.order_by("sector__sort_order", "sort_order", "name")
        return Response(ColdPointSerializer(qs, many=True).data, status=status.HTTP_200_OK)

    def post(self, request):
        payload = ColdPointWriteSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        site = Site.objects.filter(code=data["site_code"]).first()
        if not site:
            return Response({"detail": "Unknown site_code."}, status=status.HTTP_400_BAD_REQUEST)
        auth_error = _ensure_site_role(request, site, SITE_WRITE_ROLES)
        if auth_error:
            return auth_error
        sector = ColdSector.objects.filter(id=data["sector_id"], site=site).first()
        if not sector:
            return Response({"detail": "Unknown sector_id for site."}, status=status.HTTP_400_BAD_REQUEST)
        point = ColdPoint.objects.create(
            site=site,
            sector=sector,
            name=data["name"].strip(),
            device_type=data.get("device_type", TemperatureDeviceType.OTHER),
            sort_order=data.get("sort_order", 0),
            min_temp_celsius=data.get("min_temp_celsius"),
            max_temp_celsius=data.get("max_temp_celsius"),
            is_active=data.get("is_active", True),
        )
        log_audit_event(
            action="COLD_POINT_CREATED",
            request=request,
            site=site,
            object_type="ColdPoint",
            object_id=str(point.id),
            payload={"name": point.name, "sector_id": str(sector.id), "device_type": point.device_type},
        )
        return Response(ColdPointSerializer(point).data, status=status.HTTP_201_CREATED)


class ColdPointDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, point_id):
        point = ColdPoint.objects.select_related("site", "sector").filter(id=point_id).first()
        if not point:
            return Response({"detail": "Cold point not found."}, status=status.HTTP_404_NOT_FOUND)
        auth_error = _ensure_site_role(request, point.site, SITE_WRITE_ROLES)
        if auth_error:
            return auth_error
        payload = ColdPointUpdateSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        if "sector_id" in data:
            sector = ColdSector.objects.filter(id=data["sector_id"], site=point.site).first()
            if not sector:
                return Response({"detail": "Unknown sector_id for site."}, status=status.HTTP_400_BAD_REQUEST)
            point.sector = sector
        if "name" in data:
            point.name = data["name"].strip()
        if "device_type" in data:
            point.device_type = data["device_type"]
        if "sort_order" in data:
            point.sort_order = data["sort_order"]
        if "min_temp_celsius" in data:
            point.min_temp_celsius = data.get("min_temp_celsius")
        if "max_temp_celsius" in data:
            point.max_temp_celsius = data.get("max_temp_celsius")
        if "is_active" in data:
            point.is_active = data["is_active"]
        point.save()
        log_audit_event(
            action="COLD_POINT_UPDATED",
            request=request,
            site=point.site,
            object_type="ColdPoint",
            object_id=str(point.id),
            payload={
                "name": point.name,
                "sector_id": str(point.sector_id),
                "device_type": point.device_type,
                "sort_order": point.sort_order,
            },
        )
        return Response(ColdPointSerializer(point).data, status=status.HTTP_200_OK)

    def delete(self, request, point_id):
        point = ColdPoint.objects.select_related("site", "sector").filter(id=point_id).first()
        if not point:
            return Response({"detail": "Cold point not found."}, status=status.HTTP_404_NOT_FOUND)
        auth_error = _ensure_site_role(request, point.site, SITE_WRITE_ROLES)
        if auth_error:
            return auth_error
        point_snapshot = {"id": str(point.id), "name": point.name, "sector_id": str(point.sector_id)}
        point.delete()
        log_audit_event(
            action="COLD_POINT_DELETED",
            request=request,
            site=point.site,
            object_type="ColdPoint",
            object_id=point_snapshot["id"],
            payload=point_snapshot,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class TemperatureRouteListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        site_code = request.query_params.get("site_code", "").strip()
        if not site_code:
            return Response({"detail": "site_code is required."}, status=status.HTTP_400_BAD_REQUEST)
        site = Site.objects.filter(code=site_code).first()
        if not site:
            return Response({"detail": "Unknown site_code."}, status=status.HTTP_400_BAD_REQUEST)
        auth_error = _ensure_site_role(request, site, SITE_READ_ROLES)
        if auth_error:
            return auth_error
        qs = TemperatureRoute.objects.select_related("site", "sector").prefetch_related("steps__cold_point__sector").filter(site=site)
        sector_id = request.query_params.get("sector_id", "").strip()
        if sector_id:
            qs = qs.filter(sector_id=sector_id)
        qs = qs.order_by("sort_order", "name")
        return Response(TemperatureRouteSerializer(qs, many=True).data, status=status.HTTP_200_OK)

    def post(self, request):
        payload = TemperatureRouteWriteSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        site = Site.objects.filter(code=data["site_code"]).first()
        if not site:
            return Response({"detail": "Unknown site_code."}, status=status.HTTP_400_BAD_REQUEST)
        auth_error = _ensure_site_role(request, site, SITE_WRITE_ROLES)
        if auth_error:
            return auth_error
        sector = None
        if data.get("sector_id"):
            sector = ColdSector.objects.filter(id=data["sector_id"], site=site).first()
            if not sector:
                return Response({"detail": "Unknown sector_id for site."}, status=status.HTTP_400_BAD_REQUEST)
        route = TemperatureRoute.objects.create(
            site=site,
            sector=sector,
            name=data["name"].strip(),
            sort_order=data.get("sort_order", 0),
            is_active=data.get("is_active", True),
            created_by=request.user if request.user.is_authenticated else None,
        )
        log_audit_event(
            action="TEMPERATURE_ROUTE_CREATED",
            request=request,
            site=site,
            object_type="TemperatureRoute",
            object_id=str(route.id),
            payload={"name": route.name, "sector_id": str(sector.id) if sector else ""},
        )
        route = TemperatureRoute.objects.select_related("site", "sector").prefetch_related("steps__cold_point__sector").get(id=route.id)
        return Response(TemperatureRouteSerializer(route).data, status=status.HTTP_201_CREATED)


class TemperatureRouteStepListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        route_id = request.query_params.get("route_id", "").strip()
        if not route_id:
            return Response({"detail": "route_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        route = TemperatureRoute.objects.select_related("site", "sector").filter(id=route_id).first()
        if not route:
            return Response([], status=status.HTTP_200_OK)
        auth_error = _ensure_site_role(request, route.site, SITE_READ_ROLES)
        if auth_error:
            return auth_error
        qs = TemperatureRouteStep.objects.select_related("cold_point__sector", "route").filter(route=route).order_by("step_order", "created_at")
        return Response(TemperatureRouteStepSerializer(qs, many=True).data, status=status.HTTP_200_OK)

    def post(self, request):
        payload = TemperatureRouteStepWriteSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        route = TemperatureRoute.objects.select_related("site", "sector").filter(id=data["route_id"]).first()
        if not route:
            return Response({"detail": "Unknown route_id."}, status=status.HTTP_400_BAD_REQUEST)
        auth_error = _ensure_site_role(request, route.site, SITE_WRITE_ROLES)
        if auth_error:
            return auth_error
        cold_point = ColdPoint.objects.select_related("sector").filter(id=data["cold_point_id"], site=route.site).first()
        if not cold_point:
            return Response({"detail": "Unknown cold_point_id for route site."}, status=status.HTTP_400_BAD_REQUEST)
        if route.sector_id and cold_point.sector_id != route.sector_id:
            return Response({"detail": "cold_point sector does not match route sector."}, status=status.HTTP_400_BAD_REQUEST)
        step = TemperatureRouteStep.objects.create(
            route=route,
            cold_point=cold_point,
            step_order=data["step_order"],
            is_required=data.get("is_required", True),
        )
        log_audit_event(
            action="TEMPERATURE_ROUTE_STEP_CREATED",
            request=request,
            site=route.site,
            object_type="TemperatureRouteStep",
            object_id=str(step.id),
            payload={"route_id": str(route.id), "cold_point_id": str(cold_point.id), "step_order": step.step_order},
        )
        step = TemperatureRouteStep.objects.select_related("cold_point__sector", "route").get(id=step.id)
        return Response(TemperatureRouteStepSerializer(step).data, status=status.HTTP_201_CREATED)


class TemperatureRouteSequenceView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, route_id):
        route = (
            TemperatureRoute.objects.select_related("site", "sector")
            .prefetch_related("steps__cold_point__sector")
            .filter(id=route_id)
            .first()
        )
        if not route:
            return Response({"detail": "Route not found."}, status=status.HTTP_404_NOT_FOUND)
        auth_error = _ensure_site_role(request, route.site, SITE_READ_ROLES)
        if auth_error:
            return auth_error
        return Response(TemperatureRouteSerializer(route).data, status=status.HTTP_200_OK)


class TemperatureCaptureView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = TemperatureCaptureSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            site = Site.objects.get(code=data["site_code"])
        except Site.DoesNotExist:
            return Response({"detail": "Unknown site_code."}, status=status.HTTP_400_BAD_REQUEST)

        auth_error = _ensure_site_role(request, site, SITE_WRITE_ROLES)
        if auth_error:
            return auth_error

        try:
            binary = base64.b64decode(data["file_b64"])
        except Exception:
            return Response({"detail": "file_b64 is not valid base64."}, status=status.HTTP_400_BAD_REQUEST)

        mime_type = data.get("file_mime_type", "image/jpeg") or "image/jpeg"
        ocr = run_temperature_ocr(file_name=data["file_name"], binary=binary, mime_type=mime_type)
        if ocr.get("temperature_celsius") is None:
            return Response({"detail": "Temperature unreadable from image."}, status=status.HTTP_422_UNPROCESSABLE_ENTITY)

        cold_point = None
        register = None
        if data.get("cold_point_id"):
            cold_point = ColdPoint.objects.select_related("sector").filter(id=data["cold_point_id"], site=site).first()
            if not cold_point:
                return Response({"detail": "Unknown cold_point_id for site."}, status=status.HTTP_400_BAD_REQUEST)
            register = TemperatureRegister.objects.filter(sector=cold_point.sector).first()

        ocr_device_type = str(ocr.get("device_type", "") or "").upper() or TemperatureDeviceType.OTHER
        explicit_device_type = data.get("device_type")
        device_type = explicit_device_type or (cold_point.device_type if cold_point else "") or ocr_device_type or TemperatureDeviceType.OTHER
        if device_type not in TemperatureDeviceType.values:
            device_type = TemperatureDeviceType.OTHER
        device_label = (data.get("device_label") or (cold_point.name if cold_point else "") or ocr.get("device_label") or "").strip()[:120]
        temperature_celsius = float(ocr["temperature_celsius"])
        warnings = _temperature_warnings(
            value_celsius=temperature_celsius,
            device_type=device_type,
            cold_point=cold_point,
        )

        log_audit_event(
            action="TEMPERATURE_OCR_PREVIEW_GENERATED",
            request=request,
            site=site,
            object_type="ColdPoint",
            object_id=str(cold_point.id) if cold_point else "",
            payload={
                "device_type": device_type,
                "device_label": device_label,
                "cold_point_id": str(cold_point.id) if cold_point else "",
                "ocr_suggested_temperature_celsius": temperature_celsius,
                "ocr_provider": str(ocr.get("provider", "") or ""),
                "ocr_confidence": ocr.get("confidence"),
                "warnings": warnings,
                "photo_persisted": False,
            },
        )
        return Response(
            {
                "requires_confirmation": True,
                "preview": {
                    "site_code": site.code,
                    "cold_point_id": str(cold_point.id) if cold_point else "",
                    "device_type": device_type,
                    "device_label": device_label,
                    "suggested_temperature_celsius": temperature_celsius,
                    "ocr_provider": str(ocr.get("provider", "") or ""),
                    "ocr_confidence": ocr.get("confidence"),
                    "warnings": warnings,
                    "observed_at": (data.get("observed_at") or timezone.now()).isoformat(),
                },
                "privacy": {"photo_persisted": False},
            },
            status=status.HTTP_200_OK,
        )


class TemperatureConfirmView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        serializer = TemperatureConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        site = Site.objects.filter(code=data["site_code"]).first()
        if not site:
            return Response({"detail": "Unknown site_code."}, status=status.HTTP_400_BAD_REQUEST)
        auth_error = _ensure_site_role(request, site, SITE_WRITE_ROLES)
        if auth_error:
            return auth_error

        cold_point = None
        register = None
        if data.get("cold_point_id"):
            cold_point = ColdPoint.objects.select_related("sector").filter(id=data["cold_point_id"], site=site).first()
            if not cold_point:
                return Response({"detail": "Unknown cold_point_id for site."}, status=status.HTTP_400_BAD_REQUEST)
            register = TemperatureRegister.objects.filter(sector=cold_point.sector).first()

        device_type = data.get("device_type") or (cold_point.device_type if cold_point else TemperatureDeviceType.OTHER)
        if device_type not in TemperatureDeviceType.values:
            device_type = TemperatureDeviceType.OTHER
        device_label = (data.get("device_label") or (cold_point.name if cold_point else "")).strip()[:120]
        confirmed_temp = Decimal(str(data["confirmed_temperature_celsius"]))
        reference_temp = _reference_temperature_celsius(device_type=device_type, cold_point=cold_point)
        warnings = _temperature_warnings(
            value_celsius=float(confirmed_temp),
            device_type=device_type,
            cold_point=cold_point,
        )

        reading = TemperatureReading.objects.create(
            site=site,
            register=register,
            cold_point=cold_point,
            device_type=device_type,
            device_label=device_label,
            reference_temperature_celsius=reference_temp,
            temperature_celsius=confirmed_temp,
            unit="C",
            observed_at=data.get("observed_at") or timezone.now(),
            source=data.get("source", "OCR_PHOTO_CONFIRMED"),
            ocr_provider=str(data.get("ocr_provider", "") or ""),
            confidence=data.get("ocr_confidence"),
            ocr_payload={
                "ocr_suggested_temperature_celsius": str(data.get("ocr_suggested_temperature_celsius", "")),
                "operator_confirmed_temperature_celsius": str(confirmed_temp),
                "warnings": data.get("ocr_warnings", []),
                "post_confirm_warnings": warnings,
                "manual_deviation_reason": str(data.get("manual_deviation_reason", "") or ""),
                "corrective_action": str(data.get("corrective_action", "") or ""),
            },
            created_by=request.user if request.user.is_authenticated else None,
        )

        log_audit_event(
            action="TEMPERATURE_READING_CONFIRMED",
            request=request,
            site=site,
            object_type="TemperatureReading",
            object_id=str(reading.id),
            payload={
                "cold_point_id": str(reading.cold_point_id) if reading.cold_point_id else "",
                "register_id": str(reading.register_id) if reading.register_id else "",
                "reference_temperature_celsius": str(reading.reference_temperature_celsius or ""),
                "temperature_celsius": str(reading.temperature_celsius),
                "device_type": reading.device_type,
                "source": reading.source,
                "warnings": warnings,
                "manual_deviation_reason": str(data.get("manual_deviation_reason", "") or ""),
                "corrective_action": str(data.get("corrective_action", "") or ""),
                "photo_persisted": False,
            },
        )
        return Response(
            {
                "reading": TemperatureReadingSerializer(reading).data,
                "privacy": {"photo_persisted": False},
            },
            status=status.HTTP_201_CREATED,
        )


class TemperatureReadingListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        filters = TemperatureListFilterSerializer(data=request.query_params)
        filters.is_valid(raise_exception=True)
        params = filters.validated_data
        site = Site.objects.filter(code=params["site_code"]).first()
        if not site:
            return Response({"detail": "Unknown site_code."}, status=status.HTTP_400_BAD_REQUEST)
        auth_error = _ensure_site_role(request, site, SITE_READ_ROLES)
        if auth_error:
            return auth_error
        qs = TemperatureReading.objects.select_related("cold_point__sector").filter(site=site)
        if params.get("sector_id"):
            qs = qs.filter(cold_point__sector_id=params["sector_id"])
        if params.get("cold_point_id"):
            qs = qs.filter(cold_point_id=params["cold_point_id"])
        qs = qs.order_by("-observed_at", "-created_at")[: params["limit"]]
        return Response(TemperatureReadingSerializer(qs, many=True).data, status=status.HTTP_200_OK)


class DraftLotListView(generics.ListAPIView):
    serializer_class = DraftReviewSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Lot.objects.filter(status=LotStatus.DRAFT).order_by("-created_at")
        site_code = self.request.query_params.get("site_code")
        if site_code:
            site = Site.objects.filter(code=site_code).first()
            if not site:
                return Lot.objects.none()
            role = _membership_role(self.request.user, site)
            if role not in {MembershipRole.ADMIN, MembershipRole.MANAGER, MembershipRole.CHEF, MembershipRole.OPERATOR}:
                return Lot.objects.none()
            qs = qs.filter(site=site)
        return qs


class ActiveLotSearchView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        filters = ActiveLotSearchFilterSerializer(data=request.query_params)
        filters.is_valid(raise_exception=True)
        params = filters.validated_data

        site = Site.objects.filter(code=params["site_code"]).first()
        if not site:
            return Response({"detail": "Unknown site_code."}, status=status.HTTP_400_BAD_REQUEST)
        auth_error = _ensure_site_role(request, site, SITE_READ_ROLES)
        if auth_error:
            return auth_error

        qs = Lot.objects.select_related("fiche_product").filter(site=site, status=LotStatus.ACTIVE)

        if params.get("from_date"):
            qs = qs.filter(received_date__gte=params["from_date"])
        if params.get("to_date"):
            qs = qs.filter(received_date__lte=params["to_date"])
        if params.get("category"):
            qs = qs.filter(category_snapshot__icontains=params["category"])
        q_text = str(params.get("q", "") or "").strip()
        if q_text:
            qs = qs.filter(
                Q(internal_lot_code__icontains=q_text)
                | Q(supplier_name__icontains=q_text)
                | Q(supplier_lot_code__icontains=q_text)
                | Q(category_snapshot__icontains=q_text)
                | Q(fiche_product__title__icontains=q_text)
            )

        qs = qs.order_by("-received_date", "-updated_at")[: params["limit"]]
        return Response(ActiveLotSearchResultSerializer(qs, many=True).data, status=status.HTTP_200_OK)


class LabelProfileListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        site_code = request.query_params.get("site_code", "").strip()
        if not site_code:
            return Response({"detail": "site_code is required."}, status=status.HTTP_400_BAD_REQUEST)
        site = Site.objects.filter(code=site_code).first()
        if not site:
            return Response({"detail": "Unknown site_code."}, status=status.HTTP_400_BAD_REQUEST)
        auth_error = _ensure_site_role(request, site, SITE_READ_ROLES)
        if auth_error:
            return auth_error
        qs = LabelProfile.objects.filter(site=site).order_by("name")
        return Response(LabelProfileSerializer(qs, many=True).data, status=status.HTTP_200_OK)

    def post(self, request):
        payload = LabelProfileWriteSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        site = Site.objects.filter(code=data["site_code"]).first()
        if not site:
            return Response({"detail": "Unknown site_code."}, status=status.HTTP_400_BAD_REQUEST)
        auth_error = _ensure_site_role(request, site, SITE_WRITE_ROLES)
        if auth_error:
            return auth_error
        profile = LabelProfile.objects.create(
            site=site,
            name=data["name"].strip(),
            template_type=data.get("template_type"),
            shelf_life_value=data.get("shelf_life_value", 1),
            shelf_life_unit=data.get("shelf_life_unit", "days"),
            packaging=data.get("packaging", "").strip(),
            storage_instructions=data.get("storage_instructions", "").strip(),
            show_internal_lot=data.get("show_internal_lot", True),
            show_supplier_lot=data.get("show_supplier_lot", False),
            allergen_text=data.get("allergen_text", "").strip(),
            is_active=data.get("is_active", True),
        )
        log_audit_event(
            action="LABEL_PROFILE_CREATED",
            request=request,
            site=site,
            object_type="LabelProfile",
            object_id=str(profile.id),
            payload={"name": profile.name, "template_type": profile.template_type},
        )
        return Response(LabelProfileSerializer(profile).data, status=status.HTTP_201_CREATED)


class LabelProfileDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, profile_id):
        profile = LabelProfile.objects.select_related("site").filter(id=profile_id).first()
        if not profile:
            return Response({"detail": "Label profile not found."}, status=status.HTTP_404_NOT_FOUND)
        auth_error = _ensure_site_role(request, profile.site, SITE_WRITE_ROLES)
        if auth_error:
            return auth_error
        payload = LabelProfileUpdateSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        for field in [
            "name",
            "template_type",
            "shelf_life_value",
            "shelf_life_unit",
            "packaging",
            "storage_instructions",
            "show_internal_lot",
            "show_supplier_lot",
            "allergen_text",
            "is_active",
        ]:
            if field in data:
                value = data[field]
                if isinstance(value, str):
                    value = value.strip()
                setattr(profile, field, value)
        profile.save()
        log_audit_event(
            action="LABEL_PROFILE_UPDATED",
            request=request,
            site=profile.site,
            object_type="LabelProfile",
            object_id=str(profile.id),
            payload={"name": profile.name, "template_type": profile.template_type, "is_active": profile.is_active},
        )
        return Response(LabelProfileSerializer(profile).data, status=status.HTTP_200_OK)


class LabelPrintView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        payload = LabelPrintRequestSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data

        site = Site.objects.filter(code=data["site_code"]).first()
        if not site:
            return Response({"detail": "Unknown site_code."}, status=status.HTTP_400_BAD_REQUEST)
        auth_error = _ensure_site_role(request, site, SITE_WRITE_ROLES)
        if auth_error:
            return auth_error

        profile = LabelProfile.objects.filter(id=data["profile_id"], site=site).first()
        if not profile:
            return Response({"detail": "Unknown profile_id for site."}, status=status.HTTP_400_BAD_REQUEST)

        lot = None
        if data.get("lot_id"):
            lot = Lot.objects.filter(id=data["lot_id"], site=site).first()
            if not lot:
                return Response({"detail": "Unknown lot_id for site."}, status=status.HTTP_400_BAD_REQUEST)

        production_date = timezone.localdate()
        dlc_date = _compute_label_dlc_date(
            production_date=production_date,
            shelf_life_value=profile.shelf_life_value,
            shelf_life_unit=profile.shelf_life_unit,
        )
        lot_code = lot.internal_lot_code if lot else ""
        payload_data = {
            "profile_name": profile.name,
            "template_type": profile.template_type,
            "production_date": production_date.isoformat(),
            "dlc_date": dlc_date.isoformat(),
            "lot_internal_code": lot_code,
            "packaging": profile.packaging,
            "storage_instructions": profile.storage_instructions,
            "allergen_text": profile.allergen_text,
        }
        job = LabelPrintJob.objects.create(
            site=site,
            profile=profile,
            lot=lot,
            lot_internal_code=lot_code,
            production_date=production_date,
            dlc_date=dlc_date,
            copies=data.get("copies", 1),
            payload=payload_data,
            created_by=request.user if request.user.is_authenticated else None,
        )
        log_audit_event(
            action="LABEL_PRINT_REQUESTED",
            request=request,
            site=site,
            object_type="LabelPrintJob",
            object_id=str(job.id),
            payload={
                "profile_id": str(profile.id),
                "lot_id": str(lot.id) if lot else "",
                "copies": job.copies,
                "production_date": payload_data["production_date"],
                "dlc_date": payload_data["dlc_date"],
            },
        )
        return Response({"print_job": LabelPrintJobSerializer(job).data}, status=status.HTTP_201_CREATED)


class LotValidateView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, lot_id):
        serializer = DraftValidationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            lot = Lot.objects.select_for_update().get(id=lot_id, status=LotStatus.DRAFT)
        except Lot.DoesNotExist:
            return Response({"detail": "Draft lot not found."}, status=status.HTTP_404_NOT_FOUND)

        auth_error = _ensure_site_role(
            request, lot.site, {MembershipRole.ADMIN, MembershipRole.MANAGER, MembershipRole.CHEF, MembershipRole.OPERATOR}
        )
        if auth_error:
            return auth_error

        fiche_product_id = data.get("fiche_product_id")
        if fiche_product_id:
            lot.fiche_product_id = fiche_product_id

        lot.supplier_lot_code = data.get("supplier_lot_code", lot.supplier_lot_code)
        lot.dlc_date = data.get("dlc_date", lot.dlc_date)
        lot.quantity_value = data.get("quantity_value", lot.quantity_value)
        lot.quantity_unit = data.get("quantity_unit", lot.quantity_unit)
        lot.category_snapshot = data.get(
            "category",
            lot.fiche_product.category if lot.fiche_product else lot.category_snapshot,
        )
        lot.status = LotStatus.ACTIVE
        lot.validated_by = data.get("validated_by", "")
        lot.validated_at = timezone.now()
        lot.save()
        lot.schedule_expiry_alerts()
        log_audit_event(
            action="LOT_VALIDATED",
            request=request,
            site=lot.site,
            object_type="Lot",
            object_id=str(lot.id),
            payload={"status": lot.status, "alerts_created": lot.alerts.count()},
        )

        return Response(
            {"lot_id": str(lot.id), "status": lot.status, "alerts_created": lot.alerts.count()},
            status=status.HTTP_200_OK,
        )


class ReconcileIdenticalLotsView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        serializer = ReconcileIdenticalLotsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            site = Site.objects.get(code=data["site_code"])
        except Site.DoesNotExist:
            return Response({"detail": "Unknown site_code."}, status=status.HTTP_400_BAD_REQUEST)

        auth_error = _ensure_site_role(
            request, site, {MembershipRole.ADMIN, MembershipRole.MANAGER, MembershipRole.CHEF, MembershipRole.OPERATOR}
        )
        if auth_error:
            return auth_error

        normalized_lot = str(data["supplier_lot_code"]).strip().upper()
        normalized_supplier = str(data.get("supplier_name", "")).strip()
        qty_value = Decimal(data["quantity_value"])
        qty_unit = str(data["quantity_unit"]).strip().lower()
        critical_attrs = data.get("critical_attributes") or {}
        supplier_product_id = str(critical_attrs.get("supplier_product_id", "")).strip()
        allergen_signature = str(critical_attrs.get("allergen_signature", "")).strip()

        candidate = (
            Lot.objects.select_for_update()
            .filter(
                site=site,
                status=LotStatus.ACTIVE,
                supplier_name=normalized_supplier,
                supplier_lot_code=normalized_lot,
                dlc_date=data["dlc_date"],
                quantity_unit=qty_unit,
            )
            .order_by("-updated_at")
            .first()
        )

        merged = False
        lot = None
        if candidate:
            payload = candidate.ai_payload if isinstance(candidate.ai_payload, dict) else {}
            payload_critical = payload.get("critical_attributes", {})
            same_supplier_product = str(payload_critical.get("supplier_product_id", "")).strip() == supplier_product_id
            same_allergen_signature = str(payload_critical.get("allergen_signature", "")).strip() == allergen_signature
            if same_supplier_product and same_allergen_signature:
                lot = candidate
                lot.quantity_value = (lot.quantity_value or Decimal("0")) + qty_value
                payload["critical_attributes"] = {
                    "supplier_product_id": supplier_product_id,
                    "allergen_signature": allergen_signature,
                }
                payload["package_count"] = int(payload.get("package_count") or 0) + int(data.get("package_count", 1))
                lot.ai_payload = payload
                lot.save(update_fields=["quantity_value", "ai_payload", "updated_at"])
                merged = True

        if not lot:
            lot = Lot.objects.create(
                site=site,
                fiche_product_id=data.get("fiche_product_id"),
                internal_lot_code=next_internal_code(site.code),
                supplier_name=normalized_supplier,
                supplier_lot_code=normalized_lot,
                quantity_value=qty_value,
                quantity_unit=qty_unit,
                dlc_date=data["dlc_date"],
                status=LotStatus.ACTIVE,
                ai_suggested=False,
                ai_payload={
                    "critical_attributes": {
                        "supplier_product_id": supplier_product_id,
                        "allergen_signature": allergen_signature,
                    },
                    "package_count": int(data.get("package_count", 1)),
                },
                validated_by=str(getattr(request.user, "username", "") or ""),
                validated_at=timezone.now(),
            )
            lot.schedule_expiry_alerts()

        created_matches = []
        for line in data["document_lines"]:
            match = LotDocumentMatch.objects.create(
                lot=lot,
                document_type=line["document_type"],
                document_number=line["document_number"],
                line_ref=line.get("line_ref", ""),
                supplier_product_id=line.get("supplier_product_id", ""),
                qty_value=line.get("qty_value"),
                qty_unit=(line.get("qty_unit") or "").strip().lower(),
                rationale=line.get("rationale", {}),
                confirmed_by=request.user if request.user.is_authenticated else None,
            )
            created_matches.append(str(match.id))

        log_audit_event(
            action="LOT_RECONCILED_IDENTICAL",
            request=request,
            site=site,
            object_type="Lot",
            object_id=str(lot.id),
            payload={
                "merged": merged,
                "supplier_lot_code": normalized_lot,
                "document_lines_count": len(data["document_lines"]),
                "created_match_ids": created_matches,
            },
        )

        return Response(
            {
                "lot_id": str(lot.id),
                "internal_lot_code": lot.internal_lot_code,
                "merged": merged,
                "quantity_value": str(lot.quantity_value),
                "quantity_unit": lot.quantity_unit,
                "document_matches_created": len(created_matches),
            },
            status=status.HTTP_200_OK if merged else status.HTTP_201_CREATED,
        )


class LotTransformView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, lot_id):
        serializer = LotTransformSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            source_lot = Lot.objects.select_for_update().get(id=lot_id, status=LotStatus.ACTIVE)
        except Lot.DoesNotExist:
            return Response({"detail": "Active lot not found."}, status=status.HTTP_404_NOT_FOUND)

        auth_error = _ensure_site_role(
            request, source_lot.site, {MembershipRole.ADMIN, MembershipRole.MANAGER, MembershipRole.CHEF, MembershipRole.OPERATOR}
        )
        if auth_error:
            return auth_error

        derived_lot = Lot.objects.create(
            site=source_lot.site,
            fiche_product=source_lot.fiche_product,
            internal_lot_code=next_internal_code(source_lot.site.code),
            supplier_name=source_lot.supplier_name,
            supplier_lot_code=source_lot.supplier_lot_code,
            quantity_value=data.get("output_quantity_value", source_lot.quantity_value),
            quantity_unit=data.get("output_quantity_unit", source_lot.quantity_unit),
            received_date=source_lot.received_date,
            production_date=timezone.localdate(),
            dlc_date=data.get("output_dlc_date", source_lot.dlc_date),
            category_snapshot=source_lot.category_snapshot,
            status=LotStatus.ACTIVE,
            ai_payload={"derived_from": str(source_lot.id), "action": data["action"]},
        )
        derived_lot.schedule_expiry_alerts()

        event = LotEvent.objects.create(
            lot=source_lot,
            event_type=LotEventType.TRANSFORMED,
            data={"action": data["action"], "to_lot_id": str(derived_lot.id), "note": data.get("note", "")},
            created_by=request.user if request.user.is_authenticated else None,
        )
        LotTransformation.objects.create(
            event=event,
            from_lot=source_lot,
            to_lot=derived_lot,
            action=data["action"],
            input_qty=source_lot.quantity_value,
            output_qty=derived_lot.quantity_value,
            new_dlc_date=derived_lot.dlc_date,
        )

        source_lot.status = LotStatus.TRANSFORMED
        source_lot.save(update_fields=["status", "updated_at"])

        log_audit_event(
            action="LOT_TRANSFORMED",
            request=request,
            site=source_lot.site,
            object_type="Lot",
            object_id=str(source_lot.id),
            payload={"to_lot_id": str(derived_lot.id), "action": data["action"]},
        )
        return Response(
            {
                "source_lot_id": str(source_lot.id),
                "source_status": source_lot.status,
                "derived_lot_id": str(derived_lot.id),
                "derived_internal_lot_code": derived_lot.internal_lot_code,
                "action": data["action"],
            },
            status=status.HTTP_201_CREATED,
        )


class AlertListView(generics.ListAPIView):
    serializer_class = AlertSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Alert.objects.select_related("lot").order_by("trigger_at")
        site_code = self.request.query_params.get("site_code")
        due_only = self.request.query_params.get("due_only", "1") == "1"
        include_resolved = self.request.query_params.get("include_resolved", "0") == "1"
        if site_code:
            site = Site.objects.filter(code=site_code).first()
            if not site:
                return Alert.objects.none()
            role = _membership_role(self.request.user, site)
            if role not in {MembershipRole.ADMIN, MembershipRole.MANAGER, MembershipRole.CHEF, MembershipRole.OPERATOR}:
                return Alert.objects.none()
            qs = qs.filter(lot__site=site)
        if due_only:
            qs = qs.filter(trigger_at__lte=timezone.now())
        if not include_resolved:
            qs = qs.exclude(status="RESOLVED")
        return qs


class AlertStatusUpdateView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, alert_id):
        serializer = AlertStatusUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        next_status = serializer.validated_data["status"]
        try:
            alert = Alert.objects.select_for_update().select_related("lot__site").get(id=alert_id)
        except Alert.DoesNotExist:
            return Response({"detail": "Alert not found."}, status=status.HTTP_404_NOT_FOUND)

        auth_error = _ensure_site_role(
            request,
            alert.lot.site,
            {MembershipRole.ADMIN, MembershipRole.MANAGER, MembershipRole.CHEF, MembershipRole.OPERATOR},
        )
        if auth_error:
            return auth_error

        alert.status = next_status
        if next_status == "ACKED":
            alert.acked_at = timezone.now()
        alert.save(update_fields=["status", "acked_at"])

        log_audit_event(
            action="ALERT_STATUS_UPDATED",
            request=request,
            site=alert.lot.site,
            object_type="Alert",
            object_id=str(alert.id),
            payload={"status": next_status, "lot_code": alert.lot.internal_lot_code},
        )
        return Response({"alert_id": str(alert.id), "status": alert.status}, status=status.HTTP_200_OK)


class LotReportCsvView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        filters = LotReportFilterSerializer(data=request.query_params)
        filters.is_valid(raise_exception=True)
        params = filters.validated_data
        try:
            site = Site.objects.get(code=params["site_code"])
        except Site.DoesNotExist:
            return Response({"detail": "Unknown site_code."}, status=status.HTTP_400_BAD_REQUEST)
        user = _resolve_user(request)
        auth_error = _ensure_site_role(
            request, site, {MembershipRole.ADMIN, MembershipRole.MANAGER, MembershipRole.CHEF, MembershipRole.OPERATOR}, user=user
        )
        if auth_error:
            return auth_error
        qs = Lot.objects.filter(site=site).select_related("fiche_product").order_by("-created_at")
        if params.get("from_date"):
            qs = qs.filter(received_date__gte=params["from_date"])
        if params.get("to_date"):
            qs = qs.filter(received_date__lte=params["to_date"])
        if params.get("supplier_name"):
            qs = qs.filter(supplier_name__icontains=params["supplier_name"])
        if params.get("category"):
            qs = qs.filter(category_snapshot__icontains=params["category"])

        csv_data = lots_to_csv(qs)
        response = HttpResponse(csv_data, content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="lots_report.csv"'
        log_audit_event(action="REPORT_CSV_EXPORTED", request=request, actor=user, site=site, payload=params)
        return response


class LotReportPdfView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        filters = LotReportFilterSerializer(data=request.query_params)
        filters.is_valid(raise_exception=True)
        params = filters.validated_data
        try:
            site = Site.objects.get(code=params["site_code"])
        except Site.DoesNotExist:
            return Response({"detail": "Unknown site_code."}, status=status.HTTP_400_BAD_REQUEST)
        user = _resolve_user(request)
        auth_error = _ensure_site_role(
            request, site, {MembershipRole.ADMIN, MembershipRole.MANAGER, MembershipRole.CHEF, MembershipRole.OPERATOR}, user=user
        )
        if auth_error:
            return auth_error
        qs = Lot.objects.filter(site=site).select_related("fiche_product").order_by("-created_at")
        if params.get("from_date"):
            qs = qs.filter(received_date__gte=params["from_date"])
        if params.get("to_date"):
            qs = qs.filter(received_date__lte=params["to_date"])
        if params.get("supplier_name"):
            qs = qs.filter(supplier_name__icontains=params["supplier_name"])
        if params.get("category"):
            qs = qs.filter(category_snapshot__icontains=params["category"])

        pdf = lots_to_pdf(qs)
        response = HttpResponse(pdf, content_type="application/pdf")
        response["Content-Disposition"] = 'attachment; filename="lots_report.pdf"'
        log_audit_event(action="REPORT_PDF_EXPORTED", request=request, actor=user, site=site, payload=params)
        return response


class TemperatureRegisterCsvView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        filters = TemperatureRegisterReportFilterSerializer(data=request.query_params)
        filters.is_valid(raise_exception=True)
        params = filters.validated_data
        site = Site.objects.filter(code=params["site_code"]).first()
        if not site:
            return Response({"detail": "Unknown site_code."}, status=status.HTTP_400_BAD_REQUEST)
        user = _resolve_user(request)
        auth_error = _ensure_site_role(request, site, SITE_READ_ROLES, user=user)
        if auth_error:
            return auth_error

        qs = TemperatureReading.objects.select_related("register", "cold_point__sector").filter(site=site)
        if params.get("sector_id"):
            qs = qs.filter(cold_point__sector_id=params["sector_id"])
        if params.get("from_date"):
            qs = qs.filter(observed_at__date__gte=params["from_date"])
        if params.get("to_date"):
            qs = qs.filter(observed_at__date__lte=params["to_date"])
        qs = qs.order_by("-observed_at", "-created_at")

        csv_data = temperatures_register_to_csv(qs)
        response = HttpResponse(csv_data, content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="temperature_register.csv"'
        log_audit_event(action="TEMPERATURE_REGISTER_CSV_EXPORTED", request=request, actor=user, site=site, payload=params)
        return response


class TokenLoginView(ObtainAuthToken):
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = self.serializer_class(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        token, _ = Token.objects.get_or_create(user=user)
        return Response({"token": token.key, "username": user.username, "is_superuser": user.is_superuser})


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        memberships = Membership.objects.filter(user=request.user).select_related("site")
        return Response(
            {
                "username": request.user.username,
                "is_superuser": request.user.is_superuser,
                "memberships": [
                    {"site_code": m.site.code, "site_name": m.site.name, "role": m.role}
                    for m in memberships
                ],
            }
        )
