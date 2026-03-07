from django.core.management.base import BaseCommand
from django.utils import timezone

from core.models import Alert, AlertStatus, LotStatus


class Command(BaseCommand):
    help = "Mark due alerts as SENT and auto-resolve alerts for non-active lots."

    def handle(self, *args, **options):
        now = timezone.now()
        resolved = (
            Alert.objects.filter(status__in=[AlertStatus.PENDING, AlertStatus.SENT, AlertStatus.ACKED])
            .exclude(lot__status=LotStatus.ACTIVE)
            .update(status=AlertStatus.RESOLVED)
        )
        sent = (
            Alert.objects.filter(status=AlertStatus.PENDING, trigger_at__lte=now)
            .update(status=AlertStatus.SENT, sent_at=now)
        )
        self.stdout.write(
            self.style.SUCCESS(f"Processed alerts: sent={sent}, auto_resolved_non_active={resolved}")
        )
