from rest_framework import serializers

from .models import (
    Alert,
    AlertStatus,
    Asset,
    ColdPoint,
    ColdSector,
    FicheProduct,
    Lot,
    Site,
    TemperatureDeviceType,
    TemperatureReading,
    TemperatureRoute,
    TemperatureRouteStep,
)
from .services import parse_date_or_none, suggest_products


class FicheImportSerializer(serializers.Serializer):
    export_version = serializers.CharField()
    exported_at = serializers.DateTimeField(required=False)
    source_app = serializers.CharField(required=False, default="fiches-recettes")
    fiches = serializers.ListField(child=serializers.DictField(), allow_empty=True)


class DraftFromPhotoSerializer(serializers.Serializer):
    site_code = serializers.CharField()
    supplier_name = serializers.CharField(required=False, allow_blank=True)
    file_name = serializers.CharField()
    file_mime_type = serializers.CharField(required=False, allow_blank=True, default="image/jpeg")
    file_b64 = serializers.CharField(help_text="Base64-encoded image file.")


class TemperatureCaptureSerializer(serializers.Serializer):
    site_code = serializers.CharField()
    file_name = serializers.CharField()
    file_mime_type = serializers.CharField(required=False, allow_blank=True, default="image/jpeg")
    file_b64 = serializers.CharField(help_text="Base64-encoded image file.")
    device_label = serializers.CharField(required=False, allow_blank=True, default="")
    device_type = serializers.ChoiceField(choices=TemperatureDeviceType.choices, required=False)
    cold_point_id = serializers.UUIDField(required=False)
    observed_at = serializers.DateTimeField(required=False)


class TemperatureConfirmSerializer(serializers.Serializer):
    site_code = serializers.CharField()
    cold_point_id = serializers.UUIDField(required=False)
    device_label = serializers.CharField(required=False, allow_blank=True, default="")
    device_type = serializers.ChoiceField(choices=TemperatureDeviceType.choices, required=False)
    confirmed_temperature_celsius = serializers.DecimalField(max_digits=6, decimal_places=2)
    observed_at = serializers.DateTimeField(required=False)
    ocr_provider = serializers.CharField(required=False, allow_blank=True, default="")
    ocr_confidence = serializers.FloatField(required=False)
    ocr_suggested_temperature_celsius = serializers.DecimalField(max_digits=6, decimal_places=2, required=False)
    ocr_warnings = serializers.ListField(child=serializers.CharField(), required=False)


class TemperatureReadingSerializer(serializers.ModelSerializer):
    site_code = serializers.CharField(source="site.code", read_only=True)
    cold_point_id = serializers.UUIDField(source="cold_point.id", read_only=True)
    cold_point_name = serializers.CharField(source="cold_point.name", read_only=True)
    sector_id = serializers.UUIDField(source="cold_point.sector.id", read_only=True)
    sector_name = serializers.CharField(source="cold_point.sector.name", read_only=True)

    class Meta:
        model = TemperatureReading
        fields = [
            "id",
            "site_code",
            "cold_point_id",
            "cold_point_name",
            "sector_id",
            "sector_name",
            "device_type",
            "device_label",
            "temperature_celsius",
            "unit",
            "observed_at",
            "source",
            "ocr_provider",
            "confidence",
            "created_at",
        ]


class ColdSectorSerializer(serializers.ModelSerializer):
    site_code = serializers.CharField(source="site.code", read_only=True)

    class Meta:
        model = ColdSector
        fields = ["id", "site_code", "name", "sort_order", "is_active", "created_at", "updated_at"]


class ColdSectorWriteSerializer(serializers.Serializer):
    site_code = serializers.CharField()
    name = serializers.CharField(max_length=120)
    sort_order = serializers.IntegerField(required=False, min_value=0, default=0)
    is_active = serializers.BooleanField(required=False, default=True)


class ColdSectorUpdateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120, required=False)
    sort_order = serializers.IntegerField(required=False, min_value=0)
    is_active = serializers.BooleanField(required=False)


class ColdPointSerializer(serializers.ModelSerializer):
    site_code = serializers.CharField(source="site.code", read_only=True)
    sector_id = serializers.UUIDField(source="sector.id", read_only=True)
    sector_name = serializers.CharField(source="sector.name", read_only=True)

    class Meta:
        model = ColdPoint
        fields = [
            "id",
            "site_code",
            "sector_id",
            "sector_name",
            "name",
            "device_type",
            "sort_order",
            "min_temp_celsius",
            "max_temp_celsius",
            "is_active",
            "created_at",
            "updated_at",
        ]


class ColdPointWriteSerializer(serializers.Serializer):
    site_code = serializers.CharField()
    sector_id = serializers.UUIDField()
    name = serializers.CharField(max_length=120)
    device_type = serializers.ChoiceField(choices=TemperatureDeviceType.choices, required=False, default=TemperatureDeviceType.OTHER)
    sort_order = serializers.IntegerField(required=False, min_value=0, default=0)
    min_temp_celsius = serializers.DecimalField(max_digits=6, decimal_places=2, required=False, allow_null=True)
    max_temp_celsius = serializers.DecimalField(max_digits=6, decimal_places=2, required=False, allow_null=True)
    is_active = serializers.BooleanField(required=False, default=True)


class ColdPointUpdateSerializer(serializers.Serializer):
    sector_id = serializers.UUIDField(required=False)
    name = serializers.CharField(max_length=120, required=False)
    device_type = serializers.ChoiceField(choices=TemperatureDeviceType.choices, required=False)
    sort_order = serializers.IntegerField(required=False, min_value=0)
    min_temp_celsius = serializers.DecimalField(max_digits=6, decimal_places=2, required=False, allow_null=True)
    max_temp_celsius = serializers.DecimalField(max_digits=6, decimal_places=2, required=False, allow_null=True)
    is_active = serializers.BooleanField(required=False)


class TemperatureRouteStepSerializer(serializers.ModelSerializer):
    cold_point_name = serializers.CharField(source="cold_point.name", read_only=True)
    cold_point_device_type = serializers.CharField(source="cold_point.device_type", read_only=True)
    sector_name = serializers.CharField(source="cold_point.sector.name", read_only=True)

    class Meta:
        model = TemperatureRouteStep
        fields = [
            "id",
            "route",
            "cold_point",
            "cold_point_name",
            "cold_point_device_type",
            "sector_name",
            "step_order",
            "is_required",
            "created_at",
            "updated_at",
        ]


class TemperatureRouteSerializer(serializers.ModelSerializer):
    site_code = serializers.CharField(source="site.code", read_only=True)
    sector_id = serializers.UUIDField(source="sector.id", read_only=True)
    sector_name = serializers.CharField(source="sector.name", read_only=True)
    steps = TemperatureRouteStepSerializer(many=True, read_only=True)

    class Meta:
        model = TemperatureRoute
        fields = [
            "id",
            "site_code",
            "sector_id",
            "sector_name",
            "name",
            "sort_order",
            "is_active",
            "steps",
            "created_at",
            "updated_at",
        ]


class TemperatureRouteWriteSerializer(serializers.Serializer):
    site_code = serializers.CharField()
    name = serializers.CharField(max_length=120)
    sector_id = serializers.UUIDField(required=False, allow_null=True)
    sort_order = serializers.IntegerField(required=False, min_value=0, default=0)
    is_active = serializers.BooleanField(required=False, default=True)


class TemperatureRouteStepWriteSerializer(serializers.Serializer):
    route_id = serializers.UUIDField()
    cold_point_id = serializers.UUIDField()
    step_order = serializers.IntegerField(min_value=1)
    is_required = serializers.BooleanField(required=False, default=True)


class LotSerializer(serializers.ModelSerializer):
    fiche_product_title = serializers.CharField(source="fiche_product.title", read_only=True)

    class Meta:
        model = Lot
        fields = [
            "id",
            "internal_lot_code",
            "supplier_name",
            "supplier_lot_code",
            "fiche_product",
            "fiche_product_title",
            "category_snapshot",
            "quantity_value",
            "quantity_unit",
            "received_date",
            "production_date",
            "dlc_date",
            "status",
            "ai_suggested",
            "ai_payload",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["status", "ai_suggested", "ai_payload"]


class DraftValidationSerializer(serializers.Serializer):
    fiche_product_id = serializers.UUIDField(required=False)
    supplier_lot_code = serializers.CharField(required=False, allow_blank=True)
    dlc_date = serializers.DateField(required=False)
    quantity_value = serializers.DecimalField(max_digits=12, decimal_places=3, required=False)
    quantity_unit = serializers.CharField(required=False, allow_blank=True)
    category = serializers.CharField(required=False, allow_blank=True)
    validated_by = serializers.CharField(required=False, allow_blank=True)
    role = serializers.ChoiceField(choices=["MANAGER", "CHEF", "OPERATOR"], required=False)

    def validate(self, attrs):
        if "fiche_product_id" in attrs and not FicheProduct.objects.filter(id=attrs["fiche_product_id"]).exists():
            raise serializers.ValidationError("Unknown fiche_product_id.")
        return attrs


class LotTransformSerializer(serializers.Serializer):
    action = serializers.ChoiceField(
        choices=["VACUUM_PACKING", "FREEZING", "SOUS_VIDE_COOK", "THAWING", "OPENED", "TRANSFORMED"]
    )
    output_dlc_date = serializers.DateField(required=False)
    output_quantity_value = serializers.DecimalField(max_digits=12, decimal_places=3, required=False)
    output_quantity_unit = serializers.CharField(required=False, allow_blank=True)
    note = serializers.CharField(required=False, allow_blank=True)


class AlertSerializer(serializers.ModelSerializer):
    lot_code = serializers.CharField(source="lot.internal_lot_code", read_only=True)
    supplier_name = serializers.CharField(source="lot.supplier_name", read_only=True)
    supplier_lot_code = serializers.CharField(source="lot.supplier_lot_code", read_only=True)
    dlc_date = serializers.DateField(source="lot.dlc_date", read_only=True)

    class Meta:
        model = Alert
        fields = [
            "id",
            "lot",
            "lot_code",
            "supplier_name",
            "supplier_lot_code",
            "dlc_date",
            "alert_type",
            "trigger_at",
            "status",
        ]


class AlertStatusUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=[AlertStatus.ACKED, AlertStatus.RESOLVED])


class DraftReviewSerializer(serializers.ModelSerializer):
    suggestions = serializers.SerializerMethodField()
    asset_count = serializers.IntegerField(source="assets.count", read_only=True)
    ocr_warnings = serializers.SerializerMethodField()

    class Meta:
        model = Lot
        fields = [
            "id",
            "internal_lot_code",
            "supplier_name",
            "supplier_lot_code",
            "dlc_date",
            "quantity_value",
            "quantity_unit",
            "status",
            "ai_payload",
            "ocr_warnings",
            "suggestions",
            "asset_count",
        ]

    def get_suggestions(self, obj):
        guess = obj.ai_payload.get("product_guess", "") if obj.ai_payload else ""
        return suggest_products(site_id=str(obj.site_id), product_guess=guess)

    def get_ocr_warnings(self, obj):
        if not obj.ai_payload:
            return []
        return obj.ai_payload.get("warnings", [])


class AssetSerializer(serializers.ModelSerializer):
    class Meta:
        model = Asset
        fields = ["id", "asset_type", "file_name", "drive_file_id", "drive_link", "uploaded_at"]


class SiteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Site
        fields = ["id", "code", "name", "timezone"]


class LotReportFilterSerializer(serializers.Serializer):
    site_code = serializers.CharField()
    from_date = serializers.DateField(required=False)
    to_date = serializers.DateField(required=False)
    supplier_name = serializers.CharField(required=False, allow_blank=True)
    category = serializers.CharField(required=False, allow_blank=True)


class OcrResultSerializer(serializers.Serializer):
    supplier_lot_code = serializers.CharField(required=False, allow_blank=True)
    dlc_date = serializers.CharField(required=False, allow_blank=True)
    weight = serializers.CharField(required=False, allow_blank=True)
    product_guess = serializers.CharField(required=False, allow_blank=True)
    confidence = serializers.FloatField(required=False)
    ai_suggested = serializers.BooleanField(required=False)
    provider = serializers.CharField(required=False, allow_blank=True)
    fallback_reason = serializers.CharField(required=False, allow_blank=True)

    def validated_dlc_date(self):
        return parse_date_or_none(self.validated_data.get("dlc_date", ""))


class TemperatureListFilterSerializer(serializers.Serializer):
    site_code = serializers.CharField()
    limit = serializers.IntegerField(required=False, min_value=1, max_value=200, default=50)
    sector_id = serializers.UUIDField(required=False)
    cold_point_id = serializers.UUIDField(required=False)


class ReconcileDocumentLineSerializer(serializers.Serializer):
    document_type = serializers.ChoiceField(choices=["DELIVERY_NOTE", "INVOICE", "GOODS_RECEIPT"])
    document_number = serializers.CharField()
    line_ref = serializers.CharField(required=False, allow_blank=True)
    supplier_product_id = serializers.CharField(required=False, allow_blank=True)
    qty_value = serializers.DecimalField(max_digits=12, decimal_places=3, required=False)
    qty_unit = serializers.CharField(required=False, allow_blank=True)
    rationale = serializers.DictField(required=False)


class ReconcileIdenticalLotsSerializer(serializers.Serializer):
    site_code = serializers.CharField()
    fiche_product_id = serializers.UUIDField(required=False)
    supplier_name = serializers.CharField(required=False, allow_blank=True, default="")
    supplier_lot_code = serializers.CharField()
    dlc_date = serializers.DateField()
    quantity_value = serializers.DecimalField(max_digits=12, decimal_places=3)
    quantity_unit = serializers.CharField()
    package_count = serializers.IntegerField(min_value=1, required=False, default=1)
    critical_attributes = serializers.DictField(required=False)
    document_lines = ReconcileDocumentLineSerializer(many=True, allow_empty=False)

    def validate(self, attrs):
        fiche_product_id = attrs.get("fiche_product_id")
        if fiche_product_id and not FicheProduct.objects.filter(id=fiche_product_id).exists():
            raise serializers.ValidationError("Unknown fiche_product_id.")
        return attrs
