import json
from urllib import error as urllib_error
from urllib import parse as urllib_parse
from urllib import request as urllib_request

from django.conf import settings
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Site
from .views import SITE_READ_ROLES, SITE_WRITE_ROLES, _ensure_site_role


def _cookops_base_url() -> str:
    raw = str(getattr(settings, "COOKOPS_API_BASE_URL", "") or "").strip().rstrip("/")
    if not raw:
        raise RuntimeError("COOKOPS_API_BASE_URL is not configured.")
    return raw


def _cookops_headers() -> dict[str, str]:
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    api_key = str(getattr(settings, "COOKOPS_API_KEY", "") or "").strip()
    if api_key:
        headers["X-API-Key"] = api_key
    return headers


def _cookops_request_json(method: str, path: str, *, query: dict[str, str] | None = None, payload: dict | None = None):
    base = _cookops_base_url()
    url = f"{base}{path}"
    if query:
        filtered = {key: value for key, value in query.items() if str(value or "").strip() != ""}
        if filtered:
            url = f"{url}?{urllib_parse.urlencode(filtered)}"
    body = None
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
    request = urllib_request.Request(url, data=body, method=method.upper(), headers=_cookops_headers())
    timeout = int(getattr(settings, "COOKOPS_TIMEOUT_SECONDS", 12) or 12)
    try:
        with urllib_request.urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8") or ""
            return response.getcode(), json.loads(raw) if raw else {}
    except urllib_error.HTTPError as exc:
        raw = exc.read().decode("utf-8") if exc.fp else ""
        try:
            payload = json.loads(raw) if raw else {"detail": exc.reason}
        except json.JSONDecodeError:
            payload = {"detail": raw or exc.reason}
        return exc.code, payload
    except urllib_error.URLError as exc:
        raise RuntimeError(f"CookOps request failed: {exc.reason}") from exc


def _resolve_site_for_request(request, site_code: str, *, write: bool) -> tuple[Site | None, Response | None]:
    if not site_code:
        return None, Response({"detail": "site_code is required."}, status=status.HTTP_400_BAD_REQUEST)
    site = Site.objects.filter(code=site_code).first()
    if not site:
        return None, Response({"detail": "Unknown site_code."}, status=status.HTTP_400_BAD_REQUEST)
    auth_error = _ensure_site_role(request, site, SITE_WRITE_ROLES if write else SITE_READ_ROLES)
    if auth_error:
        return None, auth_error
    return site, None


def _resolve_cookops_site_id(site_code: str) -> tuple[str | None, Response | None]:
    code, payload = _cookops_request_json("GET", "/api/v1/sites/")
    if code >= 400:
        return None, Response(payload, status=code)
    if not isinstance(payload, list):
        return None, Response({"detail": "Invalid CookOps sites payload."}, status=status.HTTP_502_BAD_GATEWAY)
    for row in payload:
        if str(row.get("code") or "").strip().upper() == site_code.strip().upper():
            return str(row.get("id") or ""), None
    return None, Response({"detail": f"CookOps site not found for site_code {site_code}."}, status=status.HTTP_404_NOT_FOUND)


class InventorySupplierListView(APIView):
    def get(self, request):
        site_code = request.query_params.get("site_code", "").strip()
        _, error = _resolve_site_for_request(request, site_code, write=False)
        if error:
            return error
        code, payload = _cookops_request_json("GET", "/api/v1/suppliers/")
        return Response(payload, status=code)


class InventorySectorListView(APIView):
    def get(self, request):
        site_code = request.query_params.get("site_code", "").strip()
        _, error = _resolve_site_for_request(request, site_code, write=False)
        if error:
            return error
        cookops_site_id, site_error = _resolve_cookops_site_id(site_code)
        if site_error:
            return site_error
        code, payload = _cookops_request_json("GET", "/api/v1/inventory/sectors/", query={"site": cookops_site_id})
        return Response(payload, status=code)


class InventoryStockPointListView(APIView):
    def get(self, request):
        site_code = request.query_params.get("site_code", "").strip()
        _, error = _resolve_site_for_request(request, site_code, write=False)
        if error:
            return error
        cookops_site_id, site_error = _resolve_cookops_site_id(site_code)
        if site_error:
            return site_error
        code, payload = _cookops_request_json(
            "GET",
            "/api/v1/inventory/stock-points/",
            query={
                "site": cookops_site_id,
                "sector": request.query_params.get("sector_id", "").strip(),
            },
        )
        return Response(payload, status=code)


class InventoryProductListView(APIView):
    def get(self, request):
        site_code = request.query_params.get("site_code", "").strip()
        _, error = _resolve_site_for_request(request, site_code, write=False)
        if error:
            return error
        cookops_site_id, site_error = _resolve_cookops_site_id(site_code)
        if site_error:
            return site_error
        code, payload = _cookops_request_json(
            "GET",
            "/api/v1/inventory/products/",
            query={
                "site": cookops_site_id,
                "q": request.query_params.get("q", "").strip(),
                "category": request.query_params.get("category", "").strip(),
                "supplier": request.query_params.get("supplier_id", "").strip(),
            },
        )
        return Response(payload, status=code)


class InventorySessionListCreateView(APIView):
    def get(self, request):
        site_code = request.query_params.get("site_code", "").strip()
        _, error = _resolve_site_for_request(request, site_code, write=False)
        if error:
            return error
        cookops_site_id, site_error = _resolve_cookops_site_id(site_code)
        if site_error:
            return site_error
        code, payload = _cookops_request_json("GET", "/api/v1/inventory/sessions/", query={"site": cookops_site_id})
        return Response(payload, status=code)

    def post(self, request):
        payload = request.data if isinstance(request.data, dict) else {}
        site_code = str(payload.get("site_code") or "").strip()
        _, error = _resolve_site_for_request(request, site_code, write=True)
        if error:
            return error
        cookops_site_id, site_error = _resolve_cookops_site_id(site_code)
        if site_error:
            return site_error
        code, body = _cookops_request_json(
            "POST",
            "/api/v1/inventory/sessions/",
            payload={
                "site": cookops_site_id,
                "sector": payload.get("sector_id") or None,
                "label": payload.get("label") or None,
                "count_scope": payload.get("count_scope") or "sector",
                "source_app": "traccia_mobile",
            },
        )
        return Response(body, status=code)


class InventorySessionDetailView(APIView):
    def get(self, request, session_id):
        site_code = request.query_params.get("site_code", "").strip()
        _, error = _resolve_site_for_request(request, site_code, write=False)
        if error:
            return error
        code, payload = _cookops_request_json("GET", f"/api/v1/inventory/sessions/{session_id}/")
        return Response(payload, status=code)


class InventorySessionLinesBulkUpsertView(APIView):
    def post(self, request, session_id):
        payload = request.data if isinstance(request.data, dict) else {}
        site_code = str(payload.get("site_code") or "").strip()
        _, error = _resolve_site_for_request(request, site_code, write=True)
        if error:
            return error
        lines = payload.get("lines") if isinstance(payload.get("lines"), list) else []
        code, body = _cookops_request_json(
            "POST",
            f"/api/v1/inventory/sessions/{session_id}/lines/bulk-upsert/",
            payload={"lines": lines},
        )
        return Response(body, status=code)


class InventorySessionCloseView(APIView):
    def post(self, request, session_id):
        payload = request.data if isinstance(request.data, dict) else {}
        site_code = str(payload.get("site_code") or "").strip()
        _, error = _resolve_site_for_request(request, site_code, write=True)
        if error:
            return error
        code, body = _cookops_request_json("POST", f"/api/v1/inventory/sessions/{session_id}/close/", payload={})
        return Response(body, status=code)
