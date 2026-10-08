import uuid

from django.db import migrations, models
import django.db.models.deletion


LEGACY_ORGANIZATION_ID = uuid.UUID("4cc78f73-b05d-46c7-b75d-41d2a5cb30ec")


def assign_legacy_organization(apps, schema_editor):
    Organization = apps.get_model("core", "Organization")
    Site = apps.get_model("core", "Site")
    organization, _ = Organization.objects.get_or_create(
        id=LEGACY_ORGANIZATION_ID,
        defaults={
            "name": "ChefSide historique",
            "slug": "chefside-history",
            "is_active": True,
        },
    )
    Site.objects.filter(organization__isnull=True).update(organization=organization)


def unassign_legacy_organization(apps, schema_editor):
    Site = apps.get_model("core", "Site")
    Site.objects.filter(organization_id=LEGACY_ORGANIZATION_ID).update(organization=None)


class Migration(migrations.Migration):
    dependencies = [("core", "0010_alert_resolved_at_alert_resolved_reason")]

    operations = [
        migrations.CreateModel(
            name="Organization",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("cookops_id", models.UUIDField(blank=True, null=True, unique=True)),
                ("name", models.CharField(max_length=255)),
                ("slug", models.SlugField(max_length=120, unique=True)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
        ),
        migrations.AddField(
            model_name="site",
            name="organization",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="sites",
                to="core.organization",
            ),
        ),
        migrations.RunPython(assign_legacy_organization, unassign_legacy_organization),
    ]
