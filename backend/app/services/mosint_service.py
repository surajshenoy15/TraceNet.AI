import json
import re
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from fastapi import HTTPException

from app.config import settings

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

SENSITIVE_KEYWORDS = {
    "password", "passwd", "pwd", "hash", "token", "secret", "api_key", "apikey",
    "credential", "cookie", "session", "raw", "dump", "leak_data", "private_key",
}

SUMMARY_ALLOWLIST = {
    "email", "valid", "domain", "mx", "smtp", "social", "profiles", "related",
    "breaches", "breached", "reputation", "sources", "dns", "ip", "exists",
}


def _redact_sensitive(value: Any) -> Any:
    """Remove keys/values that may expose secrets, leaked credentials, or raw dumps."""
    if isinstance(value, dict):
        cleaned: dict[str, Any] = {}
        for key, item in value.items():
            low_key = str(key).lower()
            if any(word in low_key for word in SENSITIVE_KEYWORDS):
                cleaned[key] = "[REDACTED]"
            else:
                cleaned[key] = _redact_sensitive(item)
        return cleaned

    if isinstance(value, list):
        return [_redact_sensitive(item) for item in value]

    if isinstance(value, str):
        low_value = value.lower()
        if any(word in low_value for word in ["password:", "passwd:", "pwd:", "hash:", "token:"]):
            return "[REDACTED]"
        if len(value) > 2000:
            return value[:2000] + "... [TRUNCATED]"

    return value


def _make_safe_summary(data: Any) -> dict[str, Any]:
    """Build a compact dashboard-friendly summary from MOSINT's variable JSON shape."""
    summary = {
        "signals_found": 0,
        "categories": [],
        "breach_presence_only": None,
        "note": "Sanitized OSINT leads only; requires human verification.",
    }

    categories: set[str] = set()

    def walk(obj: Any, path: str = "") -> None:
        if isinstance(obj, dict):
            for key, value in obj.items():
                low_key = str(key).lower()
                if any(allowed in low_key for allowed in SUMMARY_ALLOWLIST):
                    categories.add(str(key))
                    if value not in (None, "", [], {}):
                        summary["signals_found"] += 1
                if "breach" in low_key or "pwn" in low_key or "leak" in low_key:
                    summary["breach_presence_only"] = bool(value)
                walk(value, f"{path}.{key}" if path else str(key))
        elif isinstance(obj, list):
            if obj:
                summary["signals_found"] += min(len(obj), 10)
            for item in obj[:25]:
                walk(item, path)

    walk(data)
    summary["categories"] = sorted(categories)[:20]
    return summary


def run_mosint_email_scan(email: str) -> dict[str, Any]:
    """Run MOSINT as an isolated CLI process and return sanitized JSON."""
    if not settings.enable_mosint:
        raise HTTPException(
            status_code=503,
            detail="MOSINT connector is disabled. Set ENABLE_MOSINT=true in .env to enable it.",
        )

    email = email.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(status_code=422, detail="Invalid email address.")

    config_path = Path(settings.mosint_config_path).expanduser()
    if not config_path.exists():
        raise HTTPException(
            status_code=500,
            detail=f"MOSINT config file not found: {config_path}. Create it from .mosint.example.yaml.",
        )

    with tempfile.TemporaryDirectory(prefix="tracenet_mosint_") as tmpdir:
        output_path = Path(tmpdir) / "mosint_result.json"
        command = [
            settings.mosint_binary,
            email,
            "--config",
            str(config_path),
            "--output",
            str(output_path),
            "--silent",
        ]

        try:
            completed = subprocess.run(
                command,
                capture_output=True,
                text=True,
                timeout=settings.mosint_timeout_seconds,
                shell=False,
                check=False,
            )
        except FileNotFoundError as exc:
            raise HTTPException(
                status_code=500,
                detail="MOSINT binary not found. Install MOSINT and ensure MOSINT_BINARY is in PATH.",
            ) from exc
        except subprocess.TimeoutExpired as exc:
            raise HTTPException(status_code=504, detail="MOSINT scan timed out.") from exc

        if completed.returncode != 0:
            raise HTTPException(
                status_code=500,
                detail={
                    "message": "MOSINT scan failed.",
                    "stderr": completed.stderr[-1500:],
                    "stdout": completed.stdout[-1000:],
                },
            )

        if not output_path.exists():
            return {
                "target": email,
                "raw": {},
                "safe_summary": {
                    "signals_found": 0,
                    "categories": [],
                    "note": "MOSINT completed but did not produce a JSON file.",
                },
                "stdout_tail": completed.stdout[-1000:],
            }

        try:
            raw_data = json.loads(output_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=500, detail="MOSINT output was not valid JSON.") from exc

        sanitized = _redact_sensitive(raw_data)
        return {
            "target": email,
            "raw": sanitized,
            "safe_summary": _make_safe_summary(sanitized),
        }
