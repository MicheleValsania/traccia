from rest_framework import serializers

from .models import (
    ColdPoint,
    ColdSector,
    HaccpSchedule,
    HaccpScheduleStatus,
    HaccpTaskType,
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


def serialize_site(site: Site) -> dict:
    return {
        "id": str(site.id),
        "external_id": _uuid_or_none(site.external_id),
        "code": site.code,
        "name": site.name,
        "timezone": site.timezone,
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
