from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandParser

from core.models import Membership, MembershipRole, Site

User = get_user_model()


class Command(BaseCommand):
    help = "Create/update admin user and grant ADMIN membership on a site."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("--username", required=True)
        parser.add_argument("--password", required=True)
        parser.add_argument("--site-code", required=True)
        parser.add_argument("--site-name", default="Main Site")

    def handle(self, *args, **options):
        username = options["username"]
        password = options["password"]
        site_code = options["site_code"]
        site_name = options["site_name"]

        site, _ = Site.objects.get_or_create(code=site_code, defaults={"name": site_name})
        user, created = User.objects.get_or_create(username=username, defaults={"is_staff": True, "is_superuser": True})
        user.is_staff = True
        user.is_superuser = True
        user.set_password(password)
        user.save()

        Membership.objects.update_or_create(
            user=user,
            site=site,
            defaults={"role": MembershipRole.ADMIN},
        )

        self.stdout.write(
            self.style.SUCCESS(
                f"Bootstrap completed: user={username} site={site.code} created_user={created}"
            )
        )
