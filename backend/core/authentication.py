from __future__ import annotations

import hashlib
import json
import uuid
from urllib import error, request as urlrequest

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db import transaction
from django.utils.text import slugify
from rest_framework import authentication, exceptions

from .models import MembershipRole, Organization


ROLE_MAP = {
    "owner": MembershipRole.ADMIN,
    "admin": MembershipRole.ADMIN,
    "manager": MembershipRole.MANAGER,
    "chef": MembershipRole.CHEF,
    "operator": MembershipRole.OPERATOR,
    "auditor": MembershipRole.AUDITOR,
    "viewer": MembershipRole.AUDITOR,
}


def _fetch_cookops_identity(token: str) -> dict:
    cache_key = f"cookops-session:{hashlib.sha256(token.encode('utf-8')).hexdigest()}"
    cached = cache.get(cache_key)
    if isinstance(cached, dict):
        return cached

    base_url = settings.COOKOPS_AUTH_BASE_URL.rstrip("/")
    if not base_url:
        raise exceptions.AuthenticationFailed("CookOps authentication is not configured.")
    req = urlrequest.Request(
        f"{base_url}/auth/status",
        method="GET",
        headers={"Accept": "application/json", "Authorization": f"Bearer {token}"},
    )
    try:
        with urlrequest.urlopen(req, timeout=settings.COOKOPS_AUTH_TIMEOUT_SECONDS) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (error.HTTPError, error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise exceptions.AuthenticationFailed("Invalid or unavailable CookOps session.") from exc
    if not isinstance(payload, dict) or payload.get("authenticated") is not True:
        raise exceptions.AuthenticationFailed("Invalid CookOps session.")
    cache.set(cache_key, payload, timeout=settings.COOKOPS_AUTH_CACHE_SECONDS)
    return payload


def _organization_for_identity(payload: dict) -> Organization:
    organization_payload = payload.get("organization") or {}
    try:
        cookops_id = uuid.UUID(str(organization_payload.get("id") or ""))
    except (TypeError, ValueError, AttributeError) as exc:
        raise exceptions.AuthenticationFailed("CookOps session has no valid organization.") from exc

    name = str(organization_payload.get("name") or "Organization").strip() or "Organization"
    source_slug = str(organization_payload.get("slug") or "").strip()
    with transaction.atomic():
        organization = Organization.objects.select_for_update().filter(cookops_id=cookops_id).first()
        if not organization and payload.get("kind") == "legacy":
            organization = (
                Organization.objects.select_for_update()
                .filter(slug="chefside-history", cookops_id__isnull=True)
                .first()
            )
            if organization:
                organization.cookops_id = cookops_id
        if not organization:
            slug_base = slugify(source_slug or name)[:100] or "organization"
            slug = slug_base
            suffix = 1
            while Organization.objects.filter(slug=slug).exists():
                suffix += 1
                slug = f"{slug_base[:110]}-{suffix}"
            organization = Organization(cookops_id=cookops_id, name=name, slug=slug)
        organization.name = name
        organization.is_active = True
        organization.save()
    return organization


def _shadow_user(payload: dict, organization: Organization):
    user_payload = payload.get("user") or {}
    external_user_id = user_payload.get("id")
    identity = str(external_user_id or f"legacy-{organization.cookops_id}")
    username = f"cookops:{identity}"[:150]
    email = str(user_payload.get("email") or "").strip().lower()
    display_name = str(user_payload.get("name") or "").strip()
    defaults = {"email": email, "is_active": True}
    user, created = get_user_model().objects.get_or_create(username=username, defaults=defaults)
    changed_fields = []
    if created:
        user.set_unusable_password()
        changed_fields.append("password")
    if email and user.email != email:
        user.email = email
        changed_fields.append("email")
    if not user.is_active:
        user.is_active = True
        changed_fields.append("is_active")
    if display_name:
        first_name, _, last_name = display_name.partition(" ")
        if user.first_name != first_name:
            user.first_name = first_name
            changed_fields.append("first_name")
        if user.last_name != last_name:
            user.last_name = last_name
            changed_fields.append("last_name")
    if changed_fields:
        user.save(update_fields=changed_fields)
    return user


class CookOpsAuthentication(authentication.BaseAuthentication):
    """Authenticate Traccia requests with a centrally issued CookOps session."""

    def authenticate_header(self, request):
        return "Bearer"

    def authenticate(self, request):
        authorization = request.META.get("HTTP_AUTHORIZATION", "")
        if not authorization.startswith("Bearer "):
            return None
        token = authorization[7:].strip()
        if not token:
            raise exceptions.AuthenticationFailed("Missing CookOps session.")

        payload = _fetch_cookops_identity(token)
        organization = _organization_for_identity(payload)
        if not organization.is_active:
            raise exceptions.AuthenticationFailed("Organization is inactive.")
        user = _shadow_user(payload, organization)
        user._traccia_organization_id = organization.id
        user._traccia_role = ROLE_MAP.get(str(payload.get("role") or "").lower(), MembershipRole.AUDITOR)
        user._traccia_auth_kind = "cookops"
        return user, payload
