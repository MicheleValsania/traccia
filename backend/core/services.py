import hashlib
import json
import logging
import os
import re
import time
from base64 import b64encode
from datetime import date, datetime
from io import BytesIO, StringIO
from typing import Any

from django.db.models import Max, QuerySet
from google.auth.transport.requests import Request as GoogleAuthRequest
from google.oauth2.credentials import Credentials as UserCredentials
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from .models import AuditLog, FicheProduct, Lot, Site

try:
    from anthropic import Anthropic
except Exception:  # pragma: no cover
    Anthropic = None

logger = logging.getLogger(__name__)

FR_MONTHS = {
    "janvier": 1,
    "fevrier": 2,
    "février": 2,
    "mars": 3,
    "avril": 4,
    "mai": 5,
    "juin": 6,
    "juillet": 7,
    "aout": 8,
    "août": 8,
    "septembre": 9,
    "octobre": 10,
    "novembre": 11,
    "decembre": 12,
    "décembre": 12,
}


def _retry(func, *, attempts: int, base_sleep_s: float):
    last_exc = None
    for idx in range(attempts):
        try:
            return func()
        except Exception as exc:  # pragma: no cover
            last_exc = exc
            if idx < attempts - 1:
                time.sleep(base_sleep_s * (2**idx))
    raise last_exc  # type: ignore[misc]


def _normalize_supplier_lot(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9\-_/\. ]+", "", (value or "").strip().upper())
    cleaned = re.sub(r"\s+", "-", cleaned)
    return cleaned[:64]


def _normalize_weight(value: str) -> str:
    if not value:
        return ""
    src = value.strip().lower().replace(",", ".")
    match = re.search(r"([0-9]+(?:\.[0-9]+)?)\s*(kg|g|gr|grammes|gramme|l|ml|cl)\b", src)
    if not match:
        return value.strip()
    number = match.group(1)
    unit = match.group(2)
    unit_map = {"gr": "g", "grammes": "g", "gramme": "g"}
    normalized_unit = unit_map.get(unit, unit)
    return f"{number} {normalized_unit}"


def _weight_to_grams(value: str) -> float | None:
    if not value:
        return None
    src = value.strip().lower().replace(",", ".")
    match = re.search(r"([0-9]+(?:\.[0-9]+)?)\s*(kg|g|l|ml|cl)\b", src)
    if not match:
        return None
    number = float(match.group(1))
    unit = match.group(2)
    if unit == "kg":
        return number * 1000
    if unit == "g":
        return number
    if unit == "l":
        return number * 1000
    if unit == "ml":
        return number
    if unit == "cl":
        return number * 10
    return None


def _normalize_fr_date(value: str) -> str:
    if not value:
        return ""
    text = value.strip().lower()
    text = text.replace(".", "/").replace("-", "/")

    iso_match = re.match(r"^(20[0-9]{2})/([01]?[0-9])/([0-3]?[0-9])$", text)
    if iso_match:
        yyyy, mm, dd = iso_match.groups()
        try:
            return datetime(int(yyyy), int(mm), int(dd)).strftime("%Y-%m-%d")
        except ValueError:
            return ""

    dmy_match = re.match(r"^([0-3]?[0-9])/([01]?[0-9])/(20[0-9]{2})$", text)
    if dmy_match:
        dd, mm, yyyy = dmy_match.groups()
        try:
            return datetime(int(yyyy), int(mm), int(dd)).strftime("%Y-%m-%d")
        except ValueError:
            return ""

    month_match = re.match(r"^([0-3]?[0-9])\s+([a-zéûôîàèùç]+)\s+(20[0-9]{2})$", text)
    if month_match:
        dd, month_name, yyyy = month_match.groups()
        mm = FR_MONTHS.get(month_name, 0)
        if mm:
            try:
                return datetime(int(yyyy), int(mm), int(dd)).strftime("%Y-%m-%d")
            except ValueError:
                return ""
    return ""


def _extract_first_json(text: str) -> dict[str, Any]:
    text = text.strip()
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
    except Exception:
        pass

    match = re.search(r"\{.*\}", text, flags=re.DOTALL)
    if not match:
        return {}
    try:
        parsed = json.loads(match.group(0))
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def build_ocr_warnings(ocr_result: dict[str, Any]) -> list[dict[str, str]]:
    warnings: list[dict[str, str]] = []
    supplier_lot_code = str(ocr_result.get("supplier_lot_code", "")).strip()
    dlc_date_raw = str(ocr_result.get("dlc_date", "")).strip()
    weight = str(ocr_result.get("weight", "")).strip()
    product_guess = str(ocr_result.get("product_guess", "")).strip()

    if not supplier_lot_code:
        warnings.append(
            {"code": "MISSING_SUPPLIER_LOT", "severity": "warning", "message": "Codice lotto fornitore non rilevato."}
        )

    if not dlc_date_raw:
        warnings.append({"code": "MISSING_DLC", "severity": "warning", "message": "DLC non rilevata dall'etichetta."})
    else:
        dlc_date = parse_date_or_none(dlc_date_raw)
        if not dlc_date:
            warnings.append({"code": "INVALID_DLC", "severity": "warning", "message": "Formato DLC non valido."})
        else:
            today = date.today()
            if dlc_date < today:
                warnings.append(
                    {"code": "DLC_IN_PAST", "severity": "critical", "message": "DLC nel passato: verificare prima della convalida."}
                )
            if (dlc_date - today).days > 730:
                warnings.append(
                    {"code": "DLC_TOO_FAR", "severity": "warning", "message": "DLC molto distante: possibile errore OCR."}
                )

    if not weight:
        warnings.append({"code": "MISSING_WEIGHT", "severity": "warning", "message": "Peso non rilevato."})
    else:
        grams = _weight_to_grams(weight)
        if grams is None:
            warnings.append(
                {"code": "UNPARSABLE_WEIGHT", "severity": "warning", "message": "Peso non interpretabile automaticamente."}
            )
        elif grams <= 0 or grams > 200000:
            warnings.append(
                {"code": "IMPLAUSIBLE_WEIGHT", "severity": "warning", "message": "Peso fuori range plausibile: verificare."}
            )

    if not product_guess:
        warnings.append(
            {"code": "MISSING_PRODUCT_GUESS", "severity": "warning", "message": "Prodotto suggerito non disponibile."}
        )
    return warnings


def upload_to_drive_stub(file_name: str, binary: bytes, fallback_reason: str = "stub") -> dict[str, str]:
    digest = hashlib.sha256(binary).hexdigest()
    drive_file_id = f"drv_{digest[:16]}"
    link = f"https://drive.google.com/file/d/{drive_file_id}/view"
    return {
        "drive_file_id": drive_file_id,
        "drive_link": link,
        "sha256": digest,
        "file_name": file_name,
        "provider": "stub",
        "fallback_reason": fallback_reason,
    }


def upload_to_drive(file_name: str, binary: bytes, mime_type: str = "image/jpeg") -> dict[str, str]:
    if os.getenv("GOOGLE_DRIVE_ENABLED", "0") != "1":
        return upload_to_drive_stub(file_name=file_name, binary=binary, fallback_reason="drive_disabled")

    oauth_client_id = os.getenv("GOOGLE_DRIVE_OAUTH_CLIENT_ID", "")
    oauth_client_secret = os.getenv("GOOGLE_DRIVE_OAUTH_CLIENT_SECRET", "")
    oauth_refresh_token = os.getenv("GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN", "")
    oauth_token_uri = os.getenv("GOOGLE_DRIVE_OAUTH_TOKEN_URI", "https://oauth2.googleapis.com/token")

    service_account_path = os.getenv("GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE", "")
    service_account_json = os.getenv("GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON", "")
    folder_id = os.getenv("GOOGLE_DRIVE_FOLDER_ID", "")
    has_oauth = bool(oauth_client_id and oauth_client_secret and oauth_refresh_token)
    has_service_account = bool(service_account_path or service_account_json)
    if (not has_oauth and not has_service_account) or not folder_id:
        return upload_to_drive_stub(file_name=file_name, binary=binary, fallback_reason="missing_drive_config")

    attempts = int(os.getenv("GOOGLE_DRIVE_RETRY_ATTEMPTS", "3"))
    backoff = float(os.getenv("GOOGLE_DRIVE_RETRY_BASE_SLEEP_S", "0.6"))

    def _op():
        if has_oauth:
            creds = UserCredentials(
                token=None,
                refresh_token=oauth_refresh_token,
                token_uri=oauth_token_uri,
                client_id=oauth_client_id,
                client_secret=oauth_client_secret,
                scopes=["https://www.googleapis.com/auth/drive.file"],
            )
            creds.refresh(GoogleAuthRequest())
            provider = "oauth_user"
        elif service_account_json:
            creds_info = json.loads(service_account_json)
            creds = service_account.Credentials.from_service_account_info(
                creds_info, scopes=["https://www.googleapis.com/auth/drive.file"]
            )
            provider = "service_account"
        else:
            creds = service_account.Credentials.from_service_account_file(
                service_account_path, scopes=["https://www.googleapis.com/auth/drive.file"]
            )
            provider = "service_account"
        drive = build("drive", "v3", credentials=creds)
        media = MediaIoBaseUpload(BytesIO(binary), mimetype=mime_type, resumable=False)
        metadata = {"name": file_name, "parents": [folder_id]}
        created = (
            drive.files()
            .create(
                body=metadata,
                media_body=media,
                fields="id,webViewLink",
                supportsAllDrives=True,
            )
            .execute()
        )
        return created, provider

    try:
        created, provider = _retry(_op, attempts=attempts, base_sleep_s=backoff)
    except Exception as exc:
        logger.exception("Drive upload fallback to stub. file_name=%s error=%s", file_name, exc)
        return upload_to_drive_stub(file_name=file_name, binary=binary, fallback_reason=str(exc)[:400])

    digest = hashlib.sha256(binary).hexdigest()
    return {
        "drive_file_id": created["id"],
        "drive_link": created.get("webViewLink", f"https://drive.google.com/file/d/{created['id']}/view"),
        "sha256": digest,
        "file_name": file_name,
        "provider": provider,
        "fallback_reason": "",
    }


def run_label_ocr_stub(file_name: str) -> dict[str, Any]:
    base = file_name.lower()
    lot_match = re.search(r"(lot[_-]?[a-z0-9]+)", base)
    dlc_match = re.search(r"(20[0-9]{2}[-_][01][0-9][-_][0-3][0-9])", base)
    supplier_lot_code = lot_match.group(1).replace("_", "-").upper() if lot_match else ""
    dlc_date = ""
    if dlc_match:
        dlc_date = dlc_match.group(1).replace("_", "-")
    return {
        "supplier_lot_code": supplier_lot_code,
        "dlc_date": dlc_date,
        "weight": "",
        "product_guess": "",
        "confidence": 0.42,
        "ai_suggested": True,
    }


def run_label_ocr(file_name: str, binary: bytes, mime_type: str = "image/jpeg") -> dict[str, Any]:
    if os.getenv("CLAUDE_ENABLED", "0") != "1" or Anthropic is None:
        result = run_label_ocr_stub(file_name=file_name)
        result["provider"] = "stub"
        result["fallback_reason"] = "claude_disabled_or_missing_sdk"
        return result

    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    model = os.getenv("ANTHROPIC_MODEL", "claude-3-5-sonnet-latest")
    if not api_key:
        result = run_label_ocr_stub(file_name=file_name)
        result["provider"] = "stub"
        result["fallback_reason"] = "missing_api_key"
        return result

    attempts = int(os.getenv("CLAUDE_RETRY_ATTEMPTS", "3"))
    backoff = float(os.getenv("CLAUDE_RETRY_BASE_SLEEP_S", "0.8"))

    try:
        client = Anthropic(api_key=api_key)
        encoded = b64encode(binary).decode("utf-8")
        prompt = (
            "You are extracting data from a French food label. "
            "Return strict JSON only with these keys: "
            '{"supplier_lot_code":"","dlc_date":"","weight":"","product_guess":""}. '
            "Rules: "
            "1) dlc_date must be normalized to YYYY-MM-DD. "
            "Accepted sources can be FR formats like DD/MM/YYYY, DD-MM-YYYY, or DD month YYYY. "
            "2) weight should include numeric value + unit, prefer kg/g/l/ml when possible. "
            "3) supplier_lot_code should be the exact lot/batch code if visible. "
            "4) If a field is missing, return empty string. "
            "5) Do not add commentary or markdown."
        )
        def _op():
            return client.messages.create(
                model=model,
                max_tokens=300,
                temperature=0.0,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {
                                "type": "image",
                                "source": {"type": "base64", "media_type": mime_type, "data": encoded},
                            },
                        ],
                    }
                ],
            )

        message = _retry(_op, attempts=attempts, base_sleep_s=backoff)
        text_parts = [block.text for block in message.content if getattr(block, "type", "") == "text"]
        parsed = _extract_first_json("".join(text_parts))

        raw_lot = str(parsed.get("supplier_lot_code", ""))
        raw_date = str(parsed.get("dlc_date", ""))
        raw_weight = str(parsed.get("weight", ""))
        raw_guess = str(parsed.get("product_guess", "")).strip()

        return {
            "supplier_lot_code": _normalize_supplier_lot(raw_lot),
            "dlc_date": _normalize_fr_date(raw_date),
            "weight": _normalize_weight(raw_weight),
            "product_guess": raw_guess[:120],
            "confidence": 0.8,
            "ai_suggested": True,
            "provider": "claude",
        }
    except Exception as exc:
        logger.exception(
            "OCR fallback to stub. file_name=%s mime_type=%s model=%s error=%s",
            file_name,
            mime_type,
            model,
            exc,
        )
        result = run_label_ocr_stub(file_name=file_name)
        result["provider"] = "stub"
        result["fallback_reason"] = str(exc)[:400]
        return result


def _normalize_temperature_celsius(value: str) -> float | None:
    if not value:
        return None
    src = value.strip().lower().replace(",", ".")
    match = re.search(r"(-?[0-9]+(?:\.[0-9]+)?)\s*°?\s*[cf]?", src)
    if not match:
        return None
    temp = float(match.group(1))
    if "f" in src and "c" not in src:
        temp = (temp - 32.0) * 5.0 / 9.0
    if temp < -100 or temp > 100:
        return None
    return round(temp, 2)


def _detect_device_type(text: str) -> str:
    normalized = (text or "").strip().lower()
    if any(token in normalized for token in ["freezer", "congel", "surgel", "negative"]):
        return "FREEZER"
    if any(token in normalized for token in ["cold room", "camera fredda", "chambre froide"]):
        return "COLD_ROOM"
    if any(token in normalized for token in ["frigo", "fridge", "refriger"]):
        return "FRIDGE"
    return "OTHER"


def run_temperature_ocr_stub(file_name: str) -> dict[str, Any]:
    base = file_name.lower()
    temp_match = re.search(r"(-?[0-9]+(?:[._][0-9]+)?)\s*°?\s*c", base)
    normalized = None
    if temp_match:
        normalized = _normalize_temperature_celsius(temp_match.group(1).replace("_", "."))
    return {
        "device_type": _detect_device_type(base),
        "device_label": "",
        "temperature_celsius": normalized,
        "confidence": 0.42,
        "provider": "stub",
        "fallback_reason": "claude_disabled_or_missing_sdk",
    }


def run_temperature_ocr(file_name: str, binary: bytes, mime_type: str = "image/jpeg") -> dict[str, Any]:
    allow_stub = os.getenv("TEMPERATURE_OCR_ALLOW_STUB", "0") == "1"
    if os.getenv("CLAUDE_ENABLED", "0") != "1" or Anthropic is None:
        if allow_stub:
            return run_temperature_ocr_stub(file_name=file_name)
        return {
            "device_type": "OTHER",
            "device_label": "",
            "temperature_celsius": None,
            "confidence": 0.0,
            "provider": "unavailable",
            "fallback_reason": "claude_disabled_or_missing_sdk",
        }

    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    model = os.getenv("ANTHROPIC_MODEL", "claude-3-5-sonnet-latest")
    if not api_key:
        if allow_stub:
            result = run_temperature_ocr_stub(file_name=file_name)
            result["fallback_reason"] = "missing_api_key"
            return result
        return {
            "device_type": "OTHER",
            "device_label": "",
            "temperature_celsius": None,
            "confidence": 0.0,
            "provider": "unavailable",
            "fallback_reason": "missing_api_key",
        }

    attempts = int(os.getenv("CLAUDE_RETRY_ATTEMPTS", "3"))
    backoff = float(os.getenv("CLAUDE_RETRY_BASE_SLEEP_S", "0.8"))

    try:
        client = Anthropic(api_key=api_key)
        encoded = b64encode(binary).decode("utf-8")
        prompt = (
            "You are extracting a cold-chain temperature reading from a fridge/freezer display photo. "
            'Return strict JSON only with keys: {"device_type":"","device_label":"","temperature_celsius":""}. '
            "Rules: "
            "1) device_type must be one of FRIDGE, FREEZER, COLD_ROOM, OTHER. "
            "2) temperature_celsius must be numeric in Celsius, with sign if negative. "
            "3) If unreadable, return empty string for temperature_celsius. "
            "4) Do not add commentary or markdown."
        )

        def _op():
            return client.messages.create(
                model=model,
                max_tokens=250,
                temperature=0.0,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {
                                "type": "image",
                                "source": {"type": "base64", "media_type": mime_type, "data": encoded},
                            },
                        ],
                    }
                ],
            )

        message = _retry(_op, attempts=attempts, base_sleep_s=backoff)
        text_parts = [block.text for block in message.content if getattr(block, "type", "") == "text"]
        parsed = _extract_first_json("".join(text_parts))

        raw_device_type = str(parsed.get("device_type", "")).strip().upper()
        raw_device_label = str(parsed.get("device_label", "")).strip()
        raw_temp = str(parsed.get("temperature_celsius", "")).strip()
        normalized_temp = _normalize_temperature_celsius(raw_temp)

        if raw_device_type not in {"FRIDGE", "FREEZER", "COLD_ROOM", "OTHER"}:
            raw_device_type = _detect_device_type(f"{raw_device_label} {file_name}")

        return {
            "device_type": raw_device_type,
            "device_label": raw_device_label[:120],
            "temperature_celsius": normalized_temp,
            "confidence": 0.8 if normalized_temp is not None else 0.3,
            "provider": "claude",
            "fallback_reason": "",
        }
    except Exception as exc:
        logger.exception(
            "Temperature OCR failed. file_name=%s mime_type=%s model=%s error=%s",
            file_name,
            mime_type,
            model,
            exc,
        )
        if allow_stub:
            result = run_temperature_ocr_stub(file_name=file_name)
            result["fallback_reason"] = str(exc)[:400]
            return result
        return {
            "device_type": "OTHER",
            "device_label": "",
            "temperature_celsius": None,
            "confidence": 0.0,
            "provider": "claude_error",
            "fallback_reason": str(exc)[:400],
        }


def parse_date_or_none(value: str) -> date | None:
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        return None


def next_internal_code(site_code: str) -> str:
    today = date.today()
    prefix = f"{site_code}-{today.strftime('%Y%m%d')}-"
    last = Lot.objects.filter(internal_lot_code__startswith=prefix).aggregate(Max("internal_lot_code"))
    last_code = last["internal_lot_code__max"]
    progressive = 1
    if last_code:
        progressive = int(last_code.rsplit("-", 1)[-1]) + 1
    return Lot.generate_internal_code(site_code=site_code, today=today, progressive=progressive)


def suggest_products(site_id: str, product_guess: str, top_k: int = 3) -> list[dict[str, str]]:
    if not product_guess:
        products = FicheProduct.objects.all().order_by("title")[:top_k]
    else:
        products = FicheProduct.objects.filter(title__icontains=product_guess).order_by("title")[:top_k]
    return [{"id": str(p.id), "title": p.title, "category": p.category} for p in products]


def log_audit_event(
    *,
    action: str,
    request,
    actor=None,
    site: Site | None = None,
    object_type: str = "",
    object_id: str = "",
    payload: dict[str, Any] | None = None,
) -> None:
    resolved_actor = actor
    if resolved_actor is None:
        resolved_actor = request.user if getattr(request, "user", None) and request.user.is_authenticated else None
    actor_identifier = resolved_actor.username if resolved_actor else request.META.get("REMOTE_ADDR", "")
    AuditLog.objects.create(
        actor=resolved_actor,
        actor_identifier=actor_identifier,
        site=site,
        action=action,
        object_type=object_type,
        object_id=object_id,
        request_id=request.headers.get("X-Request-ID", ""),
        payload=payload or {},
    )


def lots_to_csv(queryset: QuerySet[Lot]) -> str:
    output = StringIO()
    output.write(
        "internal_lot_code,supplier_name,supplier_lot_code,product,category,status,received_date,dlc_date,quantity_value,quantity_unit\n"
    )
    for lot in queryset:
        guessed_product = ""
        if isinstance(lot.ai_payload, dict):
            guessed_product = str(lot.ai_payload.get("product_guess", "") or "")
        product_title = lot.fiche_product.title if lot.fiche_product else guessed_product
        output.write(
            f"{lot.internal_lot_code},{lot.supplier_name},{lot.supplier_lot_code},{product_title},"
            f"{lot.category_snapshot},{lot.status},{lot.received_date},{lot.dlc_date or ''},"
            f"{lot.quantity_value or ''},{lot.quantity_unit}\n"
        )
    return output.getvalue()


def lots_to_pdf(queryset: QuerySet[Lot]) -> bytes:
    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    y = 800
    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(40, y, "Traceability Report")
    y -= 30
    pdf.setFont("Helvetica", 9)
    for lot in queryset:
        guessed_product = ""
        if isinstance(lot.ai_payload, dict):
            guessed_product = str(lot.ai_payload.get("product_guess", "") or "")
        product_title = lot.fiche_product.title if lot.fiche_product else guessed_product or "N/A"
        line = (
            f"{lot.internal_lot_code} | {lot.supplier_name} | "
            f"Lotto: {lot.supplier_lot_code or '-'} | "
            f"{product_title} | "
            f"{lot.status} | DLC: {lot.dlc_date or '-'}"
        )
        pdf.drawString(40, y, line[:120])
        y -= 16
        if y < 40:
            pdf.showPage()
            y = 800
            pdf.setFont("Helvetica", 9)
    pdf.save()
    return buffer.getvalue()
