from rest_framework import serializers

from .models import (
    Asset,
    ColdPoint,
    ColdSector,
    HaccpSchedule,
    HaccpScheduleStatus,
    HaccpTaskType,
    LabelPrintJob,
    LabelProfile,
    LabelShelfLifeUnit,
    LabelTemplateType,
    OcrValidationStatus,
    Site,
    TemperatureDeviceType,
)


def _uuid_or_none(value):
    return str(value) if value else None


class HaccpSiteSyncItemSerializer(serializers.Serializer):
    external_id = serializers.UUIDField(required=False)
    code = serializers.CharField(max_length=24)
    name = serializers.CharField(max_length=255)
    timezone = serializers.CharField(required=False, allow_blank=True, default="Europe/Paris")


class HaccpSiteSyncSerializer(serializers.Serializer):
    sites = HaccpSiteSyncItemSerializer(many=True, allow_empty=False)


class HaccpSectorSyncItemSerializer(serializers.Serializer):
    external_id = serializers.UUIDField(required=False)
    external_code = serializers.CharField(required=False, allow_blank=True, default="")
    site = serializers.UUIDField()
    name = serializers.CharField(max_length=120)
    sort_order = serializers.IntegerField(required=False, min_value=0, default=0)
    is_active = serializers.BooleanField(required=False, default=True)


class HaccpSectorSyncSerializer(serializers.Serializer):
    sectors = HaccpSectorSyncItemSerializer(many=True, allow_empty=False)


class HaccpColdPointSyncItemSerializer(serializers.Serializer):
    external_id = serializers.UUIDField(required=False)
    external_code = serializers.CharField(required=False, allow_blank=True, default="")
    site = serializers.UUIDField()
    sector = serializers.UUIDField()
    name = serializers.CharField(max_length=120)
    equipment_type = serializers.ChoiceField(choices=TemperatureDeviceType.choices, required=False, default=TemperatureDeviceType.OTHER)
    sort_order = serializers.IntegerField(required=False, min_value=0, default=0)
    min_temp_celsius = serializers.DecimalField(max_digits=6, decimal_places=2, required=False, allow_null=True)
    max_temp_celsius = serializers.DecimalField(max_digits=6, decimal_places=2, required=False, allow_null=True)
    is_active = serializers.BooleanField(required=False, default=True)


class HaccpColdPointSyncSerializer(serializers.Serializer):
    cold_points = HaccpColdPointSyncItemSerializer(many=True, allow_empty=False)


class HaccpScheduleWriteSerializer(serializers.Serializer):
    id = serializers.UUIDField(required=False)
    site = serializers.UUIDField()
    task_type = serializers.ChoiceField(choices=HaccpTaskType.choices)
    title = serializers.CharField(max_length=255)
    area = serializers.CharField(required=False, allow_blank=True, allow_null=True, max_length=128)
    sector = serializers.UUIDField(required=False, allow_null=True)
    cold_point = serializers.UUIDField(required=False, allow_null=True)
    sector_code = serializers.CharField(required=False, allow_blank=True, default="")
    sector_label = serializers.CharField(required=False, allow_blank=True, default="")
    cold_point_code = serializers.CharField(required=False, allow_blank=True, default="")
    cold_point_label = serializers.CharField(required=False, allow_blank=True, default="")
    equipment_type = serializers.ChoiceField(choices=TemperatureDeviceType.choices, required=False, allow_blank=True)
    starts_at = serializers.DateTimeField()
    ends_at = serializers.DateTimeField(required=False, allow_null=True)
    recurrence_rule = serializers.JSONField(required=False)
    status = serializers.ChoiceField(choices=HaccpScheduleStatus.choices, required=False, default=HaccpScheduleStatus.PLANNED)
    metadata = serializers.JSONField(required=False)


class HaccpSchedulePatchSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=255, required=False)
    area = serializers.CharField(required=False, allow_blank=True, allow_null=True, max_length=128)
    sector = serializers.UUIDField(required=False, allow_null=True)
    cold_point = serializers.UUIDField(required=False, allow_null=True)
    sector_code = serializers.CharField(required=False, allow_blank=True, default="")
    sector_label = serializers.CharField(required=False, allow_blank=True, default="")
    cold_point_code = serializers.CharField(required=False, allow_blank=True, default="")
    cold_point_label = serializers.CharField(required=False, allow_blank=True, default="")
    equipment_type = serializers.ChoiceField(choices=TemperatureDeviceType.choices, required=False, allow_blank=True)
    starts_at = serializers.DateTimeField(required=False)
    ends_at = serializers.DateTimeField(required=False, allow_null=True)
    recurrence_rule = serializers.JSONField(required=False)
    status = serializers.ChoiceField(choices=HaccpScheduleStatus.choices, required=False)
    metadata = serializers.JSONField(required=False)


class HaccpOcrValidationSerializer(serializers.Serializer):
    extraction_id = serializers.UUIDField(required=False)
    corrected_payload = serializers.JSONField(required=False)
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    status = serializers.ChoiceField(choices=OcrValidationStatus.choices, required=False, default=OcrValidationStatus.VALIDATED)


class HaccpLabelProfileWriteSerializer(serializers.Serializer):
    site = serializers.UUIDField()
    name = serializers.CharField(max_length=120)
    category = serializers.CharField(max_length=120, required=False, allow_blank=True, default="")
    template_type = serializers.ChoiceField(choices=LabelTemplateType.choices, required=False, default=LabelTemplateType.PREPARATION)
    shelf_life_value = serializers.IntegerField(required=False, min_value=1, default=1)
    shelf_life_unit = serializers.ChoiceField(choices=LabelShelfLifeUnit.choices, required=False, default=LabelShelfLifeUnit.DAYS)
    packaging = serializers.CharField(required=False, allow_blank=True, default="")
    storage_hint = serializers.CharField(required=False, allow_blank=True, default="")
    allergens_text = serializers.CharField(required=False, allow_blank=True, default="")
    is_active = serializers.BooleanField(required=False, default=True)


class HaccpLabelProfilePatchSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120, required=False)
    category = serializers.CharField(max_length=120, required=False, allow_blank=True)
    template_type = serializers.ChoiceField(choices=LabelTemplateType.choices, required=False)
    shelf_life_value = serializers.IntegerField(required=False, min_value=1)
    shelf_life_unit = serializers.ChoiceField(choices=LabelShelfLifeUnit.choices, required=False)
    packaging = serializers.CharField(required=False, allow_blank=True)
    storage_hint = serializers.CharField(required=False, allow_blank=True)
    allergens_text = serializers.CharField(required=False, allow_blank=True)
    is_active = serializers.BooleanField(required=False)


class HaccpLabelSessionWriteSerializer(serializers.Serializer):
    site = serializers.UUIDField()
    profile_id = serializers.UUIDField()
    planned_schedule_id = serializers.UUIDField(required=False, allow_null=True)
    source_lot_code = serializers.CharField(required=False, allow_blank=True, default="", max_length=128)
    quantity = serializers.IntegerField(min_value=1, max_value=200)
    status = serializers.ChoiceField(choices=("planned", "done", "cancelled"), required=False, default="planned")


def serialize_site(site: Site) -> dict:
    return {
        "id": str(site.id),
        "external_id": _uuid_or_none(site.external_id),
        "code": site.code,
        "name": site.name,
        "timezone": site.timezone,
    }


def serialize_asset(asset: Asset) -> dict:
    return {
        "id": str(asset.id),
        "site": str(asset.site.external_id or asset.site_id),
        "site_code": asset.site.code,
        "asset_type": asset.asset_type,
        "file_name": asset.file_name,
        "drive_file_id": asset.drive_file_id,
        "drive_link": asset.drive_link,
        "mime_type": asset.mime_type,
        "sha256": asset.sha256,
        "captured_at": asset.captured_at.isoformat(),
        "uploaded_at": asset.uploaded_at.isoformat(),
        "metadata": asset.metadata or {},
    }


def serialize_sector(sector: ColdSector) -> dict:
    return {
        "id": str(sector.id),
        "external_id": _uuid_or_none(sector.external_id),
        "external_code": sector.external_code,
        "site": str(sector.site.external_id or sector.site_id),
        "site_code": sector.site.code,
        "name": sector.name,
        "sort_order": sector.sort_order,
        "is_active": sector.is_active,
    }


def serialize_cold_point(point: ColdPoint) -> dict:
    return {
        "id": str(point.id),
        "external_id": _uuid_or_none(point.external_id),
        "external_code": point.external_code,
        "site": str(point.site.external_id or point.site_id),
        "site_code": point.site.code,
        "sector": str(point.sector.external_id or point.sector_id),
        "sector_code": point.sector.external_code,
        "sector_label": point.sector.name,
        "name": point.name,
        "cold_point_label": point.name,
        "equipment_type": point.device_type,
        "sort_order": point.sort_order,
        "min_temp_celsius": str(point.min_temp_celsius) if point.min_temp_celsius is not None else None,
        "max_temp_celsius": str(point.max_temp_celsius) if point.max_temp_celsius is not None else None,
        "is_active": point.is_active,
    }


def serialize_schedule(row: HaccpSchedule) -> dict:
    return {
        "id": str(row.id),
        "site": str(row.site.external_id or row.site_id),
        "site_code": row.site.code,
        "task_type": row.task_type,
        "title": row.title,
        "area": row.area or None,
        "sector": _uuid_or_none(row.sector.external_id if row.sector else None) or _uuid_or_none(row.sector_id),
        "sector_code": row.sector.external_code if row.sector else "",
        "sector_label": row.sector.name if row.sector else "",
        "cold_point": _uuid_or_none(row.cold_point.external_id if row.cold_point else None) or _uuid_or_none(row.cold_point_id),
        "cold_point_code": row.cold_point.external_code if row.cold_point else "",
        "cold_point_label": row.cold_point.name if row.cold_point else "",
        "equipment_type": row.equipment_type or (row.cold_point.device_type if row.cold_point else ""),
        "starts_at": row.starts_at.isoformat(),
        "ends_at": row.ends_at.isoformat() if row.ends_at else None,
        "recurrence_rule": row.recurrence_rule or {},
        "status": row.status,
        "metadata": row.metadata or {},
    }


def serialize_label_profile(profile: LabelProfile) -> dict:
    return {
        "id": str(profile.id),
        "site": str(profile.site.external_id or profile.site_id),
        "site_code": profile.site.code,
        "name": profile.name,
        "category": profile.category or "",
        "template_type": profile.template_type,
        "shelf_life_value": profile.shelf_life_value,
        "shelf_life_unit": profile.shelf_life_unit,
        "packaging": profile.packaging or "",
        "storage_hint": profile.storage_instructions or "",
        "allergens_text": profile.allergen_text or "",
        "is_active": profile.is_active,
        "created_at": profile.created_at.isoformat(),
        "updated_at": profile.updated_at.isoformat(),
    }


def serialize_label_session(job: LabelPrintJob) -> dict:
    payload = job.payload if isinstance(job.payload, dict) else {}
    planned_schedule_id = payload.get("planned_schedule_id")
    session_status = payload.get("session_status") or "done"
    return {
        "id": str(job.id),
        "site": str(job.site.external_id or job.site_id),
        "site_code": job.site.code,
        "profile_id": str(job.profile_id),
        "profile_name": job.profile.name,
        "planned_schedule_id": str(planned_schedule_id) if planned_schedule_id else None,
        "source_lot_code": job.lot_internal_code or payload.get("source_lot_code") or "",
        "quantity": job.copies,
        "status": session_status,
        "created_at": job.created_at.isoformat(),
        "production_date": job.production_date.isoformat(),
        "dlc_date": job.dlc_date.isoformat(),
    }
