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
    LabelPrintJob,
    LabelProfile,
    Lot,
    LotEvent,
    LotEventType,
    LotStatus,
    Membership,
    MembershipRole,
    OcrJob,
    OcrJobStatus,
    OcrValidationStatus,
    Site,
    TemperatureRegister,
    TemperatureReading,
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

        resp = self.client.patch(
            f"/api/v1/haccp/sectors/{sector.id}/",
            {"name": "Garage", "is_active": True},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        sector.refresh_from_db()
        self.assertEqual(sector.name, "Garage")

        resp = self.client.patch(
            f"/api/v1/haccp/cold-points/{point.id}/",
            {"name": "Cella centrale", "equipment_type": "COLD_ROOM"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        point.refresh_from_db()
        self.assertEqual(point.name, "Cella centrale")
        self.assertEqual(point.device_type, "COLD_ROOM")

        TemperatureReading.objects.create(
            site=self.site,
            register=TemperatureRegister.objects.get(sector=sector),
            cold_point=point,
            device_type=TemperatureDeviceType.COLD_ROOM,
            device_label="Camera 1",
            reference_temperature_celsius="3.00",
            temperature_celsius="2.40",
            source="camera_upload",
            confidence="0.91",
            observed_at=timezone.now(),
        )

        resp = self.client.get(f"/api/v1/haccp/temperature-readings/?site={self.external_site_id}&limit=10")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.json()["results"]), 1)
        self.assertEqual(resp.json()["results"][0]["cold_point_name"], "Cella centrale")

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

        resp = self.client.delete(f"/api/v1/haccp/cold-points/{point.id}/")
        self.assertEqual(resp.status_code, 204)
        self.assertFalse(ColdPoint.objects.filter(id=point.id).exists())

        resp = self.client.delete(f"/api/v1/haccp/sectors/{sector.id}/")
        self.assertEqual(resp.status_code, 204)
        self.assertFalse(ColdSector.objects.filter(id=sector.id).exists())

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

    def test_haccp_label_profile_and_session_adapter(self):
        resp = self.client.post(
            "/api/v1/haccp/label-profiles/",
            {
                "site": str(self.external_site_id),
                "name": "Supreme poulet",
                "category": "Carni",
                "template_type": "TRANSFORMATION",
                "shelf_life_value": 3,
                "shelf_life_unit": "days",
                "packaging": "sottovuoto",
                "storage_hint": "0/+3 C",
                "allergens_text": "Lait",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        payload = resp.json()
        self.assertEqual(payload["name"], "Supreme poulet")
        self.assertEqual(payload["category"], "Carni")
        profile = LabelProfile.objects.get(name="Supreme poulet")

        resp = self.client.get(f"/api/v1/haccp/label-profiles/?site={self.external_site_id}")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.json()["results"]), 1)

        resp = self.client.post(
            "/api/v1/haccp/label-sessions/",
            {
                "site": str(self.external_site_id),
                "profile_id": str(profile.id),
                "quantity": 12,
                "source_lot_code": "MAIN-LOT-01",
                "status": "planned",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.json()["profile_name"], "Supreme poulet")
        self.assertEqual(resp.json()["quantity"], 12)
        self.assertEqual(LabelPrintJob.objects.count(), 1)

        resp = self.client.get(f"/api/v1/haccp/label-sessions/?site={self.external_site_id}")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.json()["results"]), 1)

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

    def test_label_profile_category_roundtrip(self):
        user = User.objects.create_user(username="manager", password="test123")
        Membership.objects.create(user=user, site=self.site, role=MembershipRole.MANAGER)
        self.client.force_authenticate(user=user)

        resp = self.client.post(
            "/api/labels/profiles",
            {
                "site_code": self.site.code,
                "name": "Sauce vierge",
                "category": "Salse",
                "template_type": "PREPARATION",
                "shelf_life_value": 3,
                "shelf_life_unit": "days",
            },
            format="json",
        )

        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.json()["category"], "Salse")

        resp = self.client.get("/api/labels/profiles", {"site_code": self.site.code})

        self.assertEqual(resp.status_code, 200)
        rows = resp.json()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["name"], "Sauce vierge")
        self.assertEqual(rows[0]["category"], "Salse")

    def test_temperature_list_normalizes_unit_to_celsius(self):
        user = User.objects.create_user(username="operator", password="test123")
        Membership.objects.create(user=user, site=self.site, role=MembershipRole.OPERATOR)
        self.client.force_authenticate(user=user)
        TemperatureReading.objects.create(
            site=self.site,
            device_type=TemperatureDeviceType.FRIDGE,
            device_label="Frigo 1",
            temperature_celsius="4.00",
            unit="celsius",
        )

        resp = self.client.get("/api/temperatures", {"site_code": self.site.code, "limit": 20})

        self.assertEqual(resp.status_code, 200)
        rows = resp.json()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["unit"], "C")
