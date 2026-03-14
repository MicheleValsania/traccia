from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0008_coldpoint_external_code_coldpoint_external_id_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="labelprofile",
            name="category",
            field=models.CharField(blank=True, default="", max_length=120),
        ),
    ]
