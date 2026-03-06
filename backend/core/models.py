import uuid
import hashlib
import json
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

User = get_user_model()


class Site(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=24, unique=True)
    name = models.CharField(max_length=255)
    timezone = models.CharField(max_length=64, default="Europe/Paris")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"{self.code} - {self.name}"


class MembershipRole(models.TextChoices):
    ADMIN = "ADMIN", "ADMIN"
    MANAGER = "MANAGER", "MANAGER"
    CHEF = "CHEF", "CHEF"
    OPERATOR = "OPERATOR", "OPERATOR"
    AUDITOR = "AUDITOR", "AUDITOR"


class Membership(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="site_memberships")
    site = models.ForeignKey(Site, on_delete=models.CASCADE, related_name="memberships")
    role = models.CharField(max_length=16, choices=MembershipRole.choices, default=MembershipRole.OPERATOR)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("user", "site")


class FicheProduct(models.Model):
    id = models.UUIDField(primary_key=True)
    title = models.CharField(max_length=255)
    language = models.CharField(max_length=12, default="fr")
    category = models.CharField(max_length=120, blank=True, default="")
    allergens = models.JSONField(default=list, blank=True)
    storage_profiles = models.JSONField(default=list, blank=True)
    label_hints = models.JSONField(null=True, blank=True)
    source_app = models.CharField(max_length=64, default="fiches-recettes")
    export_version = models.CharField(max_length=16, default="1.1")
    updated_at_source = models.DateTimeField(null=True, blank=True)
    imported_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return self.title


class ProductAlias(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    site = models.ForeignKey(Site, on_delete=models.CASCADE, related_name="aliases")
    fiche_product = models.ForeignKey(
        FicheProduct, on_delete=models.CASCADE, related_name="aliases"
    )
    alias_text = models.CharField(max_length=255)
    supplier_name = models.CharField(max_length=255, blank=True, default="")
    supplier_sku = models.CharField(max_length=128, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("site", "fiche_product", "alias_text", "supplier_name")


class LotStatus(models.TextChoices):
    DRAFT = "DRAFT", "DRAFT"
    ACTIVE = "ACTIVE", "ACTIVE"
    TRANSFORMED = "TRANSFORMED", "TRANSFORMED"
    CONSUMED = "CONSUMED", "CONSUMED"
    DISCARDED = "DISCARDED", "DISCARDED"


class Lot(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    site = models.ForeignKey(Site, on_delete=models.CASCADE, related_name="lots")
    fiche_product = models.ForeignKey(
        FicheProduct, on_delete=models.PROTECT, related_name="lots", null=True, blank=True
    )
    internal_lot_code = models.CharField(max_length=64, unique=True)
    supplier_name = models.CharField(max_length=255, blank=True, default="")
    supplier_lot_code = models.CharField(max_length=128, blank=True, default="")
    quantity_value = models.DecimalField(max_digits=12, decimal_places=3, null=True, blank=True)
    quantity_unit = models.CharField(max_length=32, blank=True, default="")
    received_date = models.DateField(default=date.today)
    production_date = models.DateField(null=True, blank=True)
    dlc_date = models.DateField(null=True, blank=True)
    category_snapshot = models.CharField(max_length=120, blank=True, default="")
    status = models.CharField(max_length=24, choices=LotStatus.choices, default=LotStatus.DRAFT)
    ai_payload = models.JSONField(default=dict, blank=True)
    ai_suggested = models.BooleanField(default=False)
    validated_by = models.CharField(max_length=64, blank=True, default="")
    validated_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"{self.internal_lot_code} ({self.status})"

    @staticmethod
    def generate_internal_code(site_code: str, today: date, progressive: int) -> str:
        return f"{site_code}-{today.strftime('%Y%m%d')}-{progressive:04d}"

    def schedule_expiry_alerts(self) -> None:
        if not self.dlc_date:
            return
        Alert.objects.filter(lot=self).delete()
        offsets = [
            (3, AlertType.EXPIRY_D3),
            (2, AlertType.EXPIRY_D2),
            (1, AlertType.EXPIRY_D1),
            (0, AlertType.EXPIRED),
        ]
        for days_before, alert_type in offsets:
            trigger_day = self.dlc_date - timedelta(days=days_before)
            trigger_at = timezone.make_aware(
                timezone.datetime.combine(trigger_day, timezone.datetime.min.time())
            )
            Alert.objects.create(lot=self, alert_type=alert_type, trigger_at=trigger_at)


class AssetType(models.TextChoices):
    PHOTO_LABEL = "PHOTO_LABEL", "PHOTO_LABEL"
    PHOTO_PRODUCT = "PHOTO_PRODUCT", "PHOTO_PRODUCT"
    DELIVERY_NOTE = "DELIVERY_NOTE", "DELIVERY_NOTE"
    INVOICE = "INVOICE", "INVOICE"


class Asset(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    site = models.ForeignKey(Site, on_delete=models.CASCADE, related_name="assets")
    lot = models.ForeignKey(
        Lot, null=True, blank=True, on_delete=models.SET_NULL, related_name="assets"
    )
    asset_type = models.CharField(max_length=32, choices=AssetType.choices)
    file_name = models.CharField(max_length=255)
    drive_file_id = models.CharField(max_length=255, blank=True, default="")
    drive_link = models.URLField(blank=True, default="")
    mime_type = models.CharField(max_length=100, blank=True, default="")
    sha256 = models.CharField(max_length=64, blank=True, default="")
    captured_at = models.DateTimeField(default=timezone.now)
    uploaded_at = models.DateTimeField(default=timezone.now)
    metadata = models.JSONField(default=dict, blank=True)


class AlertType(models.TextChoices):
    EXPIRY_D3 = "EXPIRY_D3", "EXPIRY_D3"
    EXPIRY_D2 = "EXPIRY_D2", "EXPIRY_D2"
    EXPIRY_D1 = "EXPIRY_D1", "EXPIRY_D1"
    EXPIRED = "EXPIRED", "EXPIRED"


class AlertStatus(models.TextChoices):
    PENDING = "PENDING", "PENDING"
    SENT = "SENT", "SENT"
    ACKED = "ACKED", "ACKED"
    RESOLVED = "RESOLVED", "RESOLVED"


class Alert(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    lot = models.ForeignKey(Lot, on_delete=models.CASCADE, related_name="alerts")
    alert_type = models.CharField(max_length=32, choices=AlertType.choices)
    trigger_at = models.DateTimeField()
    status = models.CharField(max_length=16, choices=AlertStatus.choices, default=AlertStatus.PENDING)
    sent_at = models.DateTimeField(null=True, blank=True)
    acked_at = models.DateTimeField(null=True, blank=True)


class OcrJobStatus(models.TextChoices):
    PENDING = "PENDING", "PENDING"
    DONE = "DONE", "DONE"
    FAILED = "FAILED", "FAILED"


class OcrJob(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    site = models.ForeignKey(Site, on_delete=models.CASCADE, related_name="ocr_jobs")
    asset = models.ForeignKey(Asset, on_delete=models.CASCADE, related_name="ocr_jobs")
    lot = models.ForeignKey(
        Lot, null=True, blank=True, on_delete=models.SET_NULL, related_name="ocr_jobs"
    )
    status = models.CharField(max_length=16, choices=OcrJobStatus.choices, default=OcrJobStatus.PENDING)
    provider = models.CharField(max_length=32, default="claude")
    result = models.JSONField(default=dict, blank=True)
    error = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class TemperatureDeviceType(models.TextChoices):
    FRIDGE = "FRIDGE", "FRIDGE"
    FREEZER = "FREEZER", "FREEZER"
    COLD_ROOM = "COLD_ROOM", "COLD_ROOM"
    OTHER = "OTHER", "OTHER"


class TemperatureReading(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    site = models.ForeignKey(Site, on_delete=models.CASCADE, related_name="temperature_readings")
    register = models.ForeignKey(
        "TemperatureRegister", null=True, blank=True, on_delete=models.SET_NULL, related_name="temperature_readings"
    )
    cold_point = models.ForeignKey(
        "ColdPoint", null=True, blank=True, on_delete=models.SET_NULL, related_name="temperature_readings"
    )
    device_type = models.CharField(max_length=24, choices=TemperatureDeviceType.choices, default=TemperatureDeviceType.OTHER)
    device_label = models.CharField(max_length=120, blank=True, default="")
    reference_temperature_celsius = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    temperature_celsius = models.DecimalField(max_digits=6, decimal_places=2)
    unit = models.CharField(max_length=4, default="C")
    observed_at = models.DateTimeField(default=timezone.now)
    source = models.CharField(max_length=24, default="OCR_PHOTO")
    ocr_provider = models.CharField(max_length=32, blank=True, default="")
    confidence = models.FloatField(null=True, blank=True)
    ocr_payload = models.JSONField(default=dict, blank=True)
    created_by = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name="temperature_readings"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-observed_at", "-created_at"]


class ColdSector(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    site = models.ForeignKey(Site, on_delete=models.CASCADE, related_name="cold_sectors")
    name = models.CharField(max_length=120)
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["sort_order", "name"]
        unique_together = ("site", "name")


class TemperatureRegister(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    site = models.ForeignKey(Site, on_delete=models.CASCADE, related_name="temperature_registers")
    sector = models.OneToOneField(ColdSector, on_delete=models.CASCADE, related_name="temperature_register")
    name = models.CharField(max_length=120)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        unique_together = ("site", "name")


class ColdPoint(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    site = models.ForeignKey(Site, on_delete=models.CASCADE, related_name="cold_points")
    sector = models.ForeignKey(ColdSector, on_delete=models.CASCADE, related_name="cold_points")
    name = models.CharField(max_length=120)
    device_type = models.CharField(max_length=24, choices=TemperatureDeviceType.choices, default=TemperatureDeviceType.OTHER)
    sort_order = models.PositiveIntegerField(default=0)
    min_temp_celsius = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    max_temp_celsius = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["sort_order", "name"]
        unique_together = ("sector", "name")

    def save(self, *args, **kwargs):
        if self.sector_id and self.site_id != self.sector.site_id:
            self.site_id = self.sector.site_id
        super().save(*args, **kwargs)


class TemperatureRoute(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    site = models.ForeignKey(Site, on_delete=models.CASCADE, related_name="temperature_routes")
    sector = models.ForeignKey(ColdSector, null=True, blank=True, on_delete=models.SET_NULL, related_name="temperature_routes")
    name = models.CharField(max_length=120)
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name="created_temperature_routes"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["sort_order", "name"]
        unique_together = ("site", "name")


class TemperatureRouteStep(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    route = models.ForeignKey(TemperatureRoute, on_delete=models.CASCADE, related_name="steps")
    cold_point = models.ForeignKey(ColdPoint, on_delete=models.CASCADE, related_name="route_steps")
    step_order = models.PositiveIntegerField()
    is_required = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["step_order", "created_at"]
        unique_together = (("route", "step_order"), ("route", "cold_point"))


class LotEventType(models.TextChoices):
    CREATED = "CREATED", "CREATED"
    TRANSFORMED = "TRANSFORMED", "TRANSFORMED"
    FREEZING = "FREEZING", "FREEZING"
    THAWING = "THAWING", "THAWING"
    OPENED = "OPENED", "OPENED"
    VACUUM_PACKING = "VACUUM_PACKING", "VACUUM_PACKING"
    SOUS_VIDE_COOK = "SOUS_VIDE_COOK", "SOUS_VIDE_COOK"


class LotEvent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    lot = models.ForeignKey(Lot, on_delete=models.CASCADE, related_name="events")
    event_type = models.CharField(max_length=32, choices=LotEventType.choices)
    event_time = models.DateTimeField(default=timezone.now)
    quantity_delta = models.DecimalField(max_digits=12, decimal_places=3, null=True, blank=True)
    data = models.JSONField(default=dict, blank=True)
    created_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="lot_events")
    created_at = models.DateTimeField(auto_now_add=True)


class LotTransformation(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    event = models.OneToOneField(LotEvent, on_delete=models.CASCADE, related_name="transformation")
    from_lot = models.ForeignKey(Lot, on_delete=models.CASCADE, related_name="transformations_from")
    to_lot = models.ForeignKey(Lot, on_delete=models.CASCADE, related_name="transformations_to")
    action = models.CharField(max_length=32, choices=LotEventType.choices)
    input_qty = models.DecimalField(max_digits=12, decimal_places=3, null=True, blank=True)
    output_qty = models.DecimalField(max_digits=12, decimal_places=3, null=True, blank=True)
    new_dlc_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class LabelTemplateType(models.TextChoices):
    RAW_MATERIAL = "RAW_MATERIAL", "RAW_MATERIAL"
    PREPARATION = "PREPARATION", "PREPARATION"
    TRANSFORMATION = "TRANSFORMATION", "TRANSFORMATION"


class LabelShelfLifeUnit(models.TextChoices):
    HOURS = "hours", "hours"
    DAYS = "days", "days"
    MONTHS = "months", "months"


class LabelProfile(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    site = models.ForeignKey(Site, on_delete=models.CASCADE, related_name="label_profiles")
    name = models.CharField(max_length=120)
    template_type = models.CharField(max_length=24, choices=LabelTemplateType.choices, default=LabelTemplateType.PREPARATION)
    shelf_life_value = models.PositiveIntegerField(default=1)
    shelf_life_unit = models.CharField(max_length=12, choices=LabelShelfLifeUnit.choices, default=LabelShelfLifeUnit.DAYS)
    packaging = models.CharField(max_length=64, blank=True, default="")
    storage_instructions = models.CharField(max_length=255, blank=True, default="")
    show_internal_lot = models.BooleanField(default=True)
    show_supplier_lot = models.BooleanField(default=False)
    allergen_text = models.CharField(max_length=255, blank=True, default="")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        unique_together = ("site", "name")


class LabelPrintJob(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    site = models.ForeignKey(Site, on_delete=models.CASCADE, related_name="label_print_jobs")
    profile = models.ForeignKey(LabelProfile, on_delete=models.PROTECT, related_name="print_jobs")
    lot = models.ForeignKey(Lot, null=True, blank=True, on_delete=models.SET_NULL, related_name="label_print_jobs")
    lot_internal_code = models.CharField(max_length=64, blank=True, default="")
    production_date = models.DateField()
    dlc_date = models.DateField()
    copies = models.PositiveIntegerField(default=1)
    payload = models.JSONField(default=dict, blank=True)
    created_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="label_print_jobs")
    created_at = models.DateTimeField(auto_now_add=True)


class LotDocumentMatchStatus(models.TextChoices):
    CONFIRMED = "CONFIRMED", "CONFIRMED"
    REJECTED = "REJECTED", "REJECTED"


class LotDocumentMatch(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    lot = models.ForeignKey(Lot, on_delete=models.CASCADE, related_name="document_matches")
    document_type = models.CharField(max_length=24, help_text="DELIVERY_NOTE|INVOICE|GOODS_RECEIPT")
    document_number = models.CharField(max_length=128)
    line_ref = models.CharField(max_length=128, blank=True, default="")
    supplier_product_id = models.CharField(max_length=128, blank=True, default="")
    qty_value = models.DecimalField(max_digits=12, decimal_places=3, null=True, blank=True)
    qty_unit = models.CharField(max_length=16, blank=True, default="")
    status = models.CharField(
        max_length=16,
        choices=LotDocumentMatchStatus.choices,
        default=LotDocumentMatchStatus.CONFIRMED,
    )
    rationale = models.JSONField(default=dict, blank=True)
    confirmed_by = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name="lot_document_matches"
    )
    confirmed_at = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("lot", "document_type", "document_number", "line_ref")


class AuditLog(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    happened_at = models.DateTimeField(default=timezone.now, db_index=True)
    actor = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="audit_logs")
    actor_identifier = models.CharField(max_length=255, blank=True, default="")
    site = models.ForeignKey(Site, null=True, blank=True, on_delete=models.SET_NULL, related_name="audit_logs")
    action = models.CharField(max_length=64, db_index=True)
    object_type = models.CharField(max_length=64, blank=True, default="")
    object_id = models.CharField(max_length=64, blank=True, default="")
    request_id = models.CharField(max_length=128, blank=True, default="")
    payload = models.JSONField(default=dict, blank=True)
    previous_hash = models.CharField(max_length=64, blank=True, default="")
    record_hash = models.CharField(max_length=64, blank=True, default="")

    class Meta:
        ordering = ["happened_at", "id"]

    def save(self, *args, **kwargs):
        # UUID primary keys are populated before first save, so checking only
        # self.pk would incorrectly reject inserts. Reject only real updates.
        if not self._state.adding and self.pk:
            raise ValidationError("AuditLog is immutable and cannot be updated.")
        if self._state.adding and self.pk and AuditLog.objects.filter(pk=self.pk).exists():
            raise ValidationError("AuditLog is immutable and cannot be updated.")

        previous = AuditLog.objects.order_by("-happened_at", "-id").first()
        self.previous_hash = previous.record_hash if previous else ""
        canonical = {
            "happened_at": self.happened_at.isoformat(),
            "actor_identifier": self.actor_identifier,
            "site_id": str(self.site_id) if self.site_id else "",
            "action": self.action,
            "object_type": self.object_type,
            "object_id": self.object_id,
            "request_id": self.request_id,
            "payload": self.payload,
            "previous_hash": self.previous_hash,
        }
        self.record_hash = hashlib.sha256(
            json.dumps(canonical, sort_keys=True, ensure_ascii=True).encode("utf-8")
        ).hexdigest()
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("AuditLog is immutable and cannot be deleted.")
