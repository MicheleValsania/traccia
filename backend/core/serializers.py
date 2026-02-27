from rest_framework import serializers

from .models import Alert, AlertStatus, Asset, FicheProduct, Lot, Site
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
