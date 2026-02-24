import base64

from django.db import transaction
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
    FicheProduct,
    Lot,
    LotStatus,
    Membership,
    MembershipRole,
    OcrJob,
    OcrJobStatus,
    Site,
    LotEvent,
    LotEventType,
    LotTransformation,
)
from .serializers import (
    AlertSerializer,
    DraftFromPhotoSerializer,
    DraftReviewSerializer,
    DraftValidationSerializer,
    FicheImportSerializer,
    LotReportFilterSerializer,
    LotTransformSerializer,
    OcrResultSerializer,
    SiteSerializer,
)
from .services import (
    build_ocr_warnings,
    log_audit_event,
    lots_to_csv,
    lots_to_pdf,
    next_internal_code,
    parse_date_or_none,
    run_label_ocr,
    suggest_products,
    upload_to_drive,
)


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
        auth_error = _ensure_site_role(
            request, site, {MembershipRole.ADMIN, MembershipRole.MANAGER, MembershipRole.CHEF, MembershipRole.OPERATOR}
        )
        if auth_error:
            return auth_error

        try:
            binary = base64.b64decode(data["file_b64"])
        except Exception:
            return Response({"detail": "file_b64 is not valid base64."}, status=status.HTTP_400_BAD_REQUEST)

        mime_type = data.get("file_mime_type", "image/jpeg") or "image/jpeg"
        drive = upload_to_drive(file_name=data["file_name"], binary=binary, mime_type=mime_type)
        ocr_raw = run_label_ocr(file_name=data["file_name"], binary=binary, mime_type=mime_type)
        ocr = OcrResultSerializer(data=ocr_raw)
        ocr.is_valid(raise_exception=True)
        warnings = build_ocr_warnings(ocr.validated_data)
        ai_payload = {**ocr.validated_data, "warnings": warnings}

        lot = Lot.objects.create(
            site=site,
            internal_lot_code=next_internal_code(site.code),
            supplier_name=data.get("supplier_name", ""),
            supplier_lot_code=ocr.validated_data.get("supplier_lot_code", ""),
            dlc_date=parse_date_or_none(ocr.validated_data.get("dlc_date", "")),
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
            site=site, asset=asset, lot=lot, status=OcrJobStatus.DONE, result=ocr.validated_data
        )
        log_audit_event(
            action="LOT_DRAFT_CREATED_FROM_CAPTURE",
            request=request,
            site=site,
            object_type="Lot",
            object_id=str(lot.id),
            payload={"internal_lot_code": lot.internal_lot_code, "drive_file_id": asset.drive_file_id},
        )

        suggestions = suggest_products(site_id=str(site.id), product_guess=ocr.validated_data.get("product_guess", ""))
        return Response(
            {
                "lot_id": str(lot.id),
                "internal_lot_code": lot.internal_lot_code,
                "draft_status": lot.status,
                "ocr_result": ocr.validated_data,
                "ocr_provider": ocr.validated_data.get("provider", "unknown"),
                "ocr_warnings": warnings,
                "product_suggestions": suggestions,
                "asset": {"drive_file_id": asset.drive_file_id, "drive_link": asset.drive_link},
            },
            status=status.HTTP_201_CREATED,
        )


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
        if site_code:
            site = Site.objects.filter(code=site_code).first()
            if not site:
                return Alert.objects.none()
            role = _membership_role(self.request.user, site)
            if role not in {MembershipRole.ADMIN, MembershipRole.MANAGER, MembershipRole.CHEF, MembershipRole.OPERATOR}:
                return Alert.objects.none()
            qs = qs.filter(lot__site=site)
        return qs


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
