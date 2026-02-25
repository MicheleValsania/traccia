from django.core.management.base import BaseCommand
from django.utils import timezone

from core.models import Alert, AlertStatus


class Command(BaseCommand):
    help = "Mark due alerts as SENT."

    def handle(self, *args, **options):
        now = timezone.now()
        updated = (
            Alert.objects.filter(status=AlertStatus.PENDING, trigger_at__lte=now)
            .update(status=AlertStatus.SENT, sent_at=now)
        )
        self.stdout.write(self.style.SUCCESS(f"Processed alerts: {updated}"))
