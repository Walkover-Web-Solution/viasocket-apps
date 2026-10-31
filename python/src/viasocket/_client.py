"""
The part of the viaSocket Apps API an agent needs, with no dependencies: the public catalog, the
signed embed token, a user's flows and field values, and running an action. Mirrors the calls of
the `viasocket-apps` npm package, so both read the same responses the same way.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Callable, Dict, List, Optional

DEFAULT_API_BASE_URL = "https://flow-api.viasocket.com"
DEFAULT_RUN_BASE_URL = "https://flow.sokt.io"
CATALOG_VERSIONS = "https://flow.sokt.io/func/scriK4LFg2kc"
CATALOG_SLUG = "https://plug-service.viasocket.com/api/v1/plugins/recommend/services"
# An unknown slug is answered by nothing, slowly; a known one in well under a second.
SLUG_TIMEOUT = 30
REQUEST_TIMEOUT = 120
VERSIONS_TTL = 10 * 60

# (method, url, headers, body) -> (status, text). Swapped in tests; urllib otherwise.
Transport = Callable[[str, str, Dict[str, str], Optional[bytes], float], "tuple[int, str]"]


class ViaSocketError(Exception):
    """A refusal from viaSocket, with the API's own message; `status` is None for a local check."""

    def __init__(self, message: str, status: Optional[int] = None, body: Any = None):
        super().__init__(message)
        self.status = status
        self.body = body


def _urllib_transport(method: str, url: str, headers: Dict[str, str], body: Optional[bytes], timeout: float):
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return response.status, response.read().decode("utf-8")
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode("utf-8", "replace")
    except (urllib.error.URLError, TimeoutError) as error:
        raise ViaSocketError(f"Request to {url} failed: {getattr(error, 'reason', error)}") from error


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def sign_embed_token(org_id: str, project_id: str, unique_identifier: str, secret: str) -> str:
    """The embed token: an HS256 JWT of exactly { org_id, project_id, unique_identifier }."""
    for name, value in (("org_id", org_id), ("project_id", project_id), ("unique_identifier", unique_identifier), ("secret", secret)):
        if not isinstance(value, str) or not value:
            raise ViaSocketError(f"sign_embed_token: {name} is required")
    compact = {"separators": (",", ":"), "ensure_ascii": False}
    header = _b64url(json.dumps({"alg": "HS256", "typ": "JWT"}, **compact).encode())
    payload = _b64url(
        json.dumps({"org_id": org_id, "project_id": project_id, "unique_identifier": unique_identifier}, **compact).encode()
    )
    signing_input = f"{header}.{payload}"
    signature = hmac.new(secret.encode(), signing_input.encode(), hashlib.sha256).digest()
    return f"{signing_input}.{_b64url(signature)}"


def _required(name: str, value: Any) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ViaSocketError(f"{name} is required")
    return value


class ViaSocket:
    """The server-side client. `secret` is the embed secret: keep it on the server."""

    def __init__(
        self,
        org_id: str,
        project_id: str,
        secret: str,
        api_base_url: str = DEFAULT_API_BASE_URL,
        run_base_url: str = DEFAULT_RUN_BASE_URL,
        transport: Optional[Transport] = None,
    ):
        self.org_id = _required("org_id", org_id)
        self.project_id = _required("project_id", project_id)
        self._secret = _required("secret", secret)
        self.api_base_url = api_base_url.rstrip("/")
        self.run_base_url = run_base_url.rstrip("/")
        self._transport = transport or _urllib_transport
        self._service_ids: Dict[str, str] = {}
        self._versions: Dict[str, "tuple[float, Optional[dict]]"] = {}

    def _request(self, method: str, url: str, body: Any = None, token: Optional[str] = None, timeout: float = REQUEST_TIMEOUT) -> Any:
        """
        The envelope `{ success, data }` is unwrapped and a refusal raised. A body is the envelope only
        when it has a boolean `success` and a `data` key (or is `success: false`): many actions answer
        with their own result at the top level, which is returned whole.
        """
        # urllib's default User-Agent is refused (403) by the catalog's firewall.
        headers = {"Content-Type": "application/json", "User-Agent": "viasocket-python"}
        if token:
            headers["authorization"] = token
        data = None if body is None else (body if isinstance(body, bytes) else json.dumps(body).encode())
        status, text = self._transport(method, url, headers, data, timeout)
        try:
            payload = json.loads(text) if text else None
        except ValueError:
            payload = text
        envelope = (
            payload
            if isinstance(payload, dict) and isinstance(payload.get("success"), bool) and ("data" in payload or payload["success"] is False)
            else None
        )
        if not 200 <= status < 300 or (envelope is not None and envelope["success"] is False):
            raw = payload if isinstance(payload, dict) else {}
            error = raw.get("error")
            message = (
                raw.get("message")
                or (error.get("message") if isinstance(error, dict) else None)
                or f"viaSocket responded {status} for {method} {url}"
            )
            raise ViaSocketError(message, status=status, body=payload)
        return envelope["data"] if envelope is not None else payload

    # The catalog: public, nothing per user.

    def service_id_for(self, slug: str) -> str:
        """The `service_id` of the app with this slug (`slack`, `google-sheets`). Exact and case-sensitive."""
        key = _required("slug", slug)
        if key not in self._service_ids:
            url = f"{CATALOG_SLUG}?service={urllib.parse.quote(key)}"
            try:
                data = self._request("GET", url, timeout=SLUG_TIMEOUT)
            except ViaSocketError as error:
                if "timed out" not in str(error):
                    raise
                data = None
            inner = data.get("data") if isinstance(data, dict) else None
            plugins = (inner.get("plugins") if isinstance(inner, dict) else None) or {}
            service_id = (plugins.get(key) or {}).get("rowid")
            if not service_id:
                raise ViaSocketError(f'No viaSocket app has the slug "{key}" (slugs are exact and case-sensitive)')
            self._service_ids[key] = service_id
        return self._service_ids[key]

    def versions(self, service_id: str) -> Optional[dict]:
        """One app with its published actions and triggers, or None for an unknown service id. Cached 10 minutes."""
        cached = self._versions.get(service_id)
        if cached and time.time() - cached[0] < VERSIONS_TTL:
            return cached[1]
        data = self._request("POST", CATALOG_VERSIONS, {"service_id": _required("service_id", service_id)})
        # No `success` key, so the body arrives whole; tolerate an envelope anyway.
        body = data if isinstance(data, dict) else {}
        if "service" not in body:
            body = body.get("data") if isinstance(body.get("data"), dict) else {}
        service = body.get("service") or {}
        if not service.get("name"):
            return None
        app = {
            "service": service,
            "actions": body.get("actions") if isinstance(body.get("actions"), list) else [],
            "triggers": body.get("triggers") if isinstance(body.get("triggers"), list) else [],
        }
        self._versions[service_id] = (time.time(), app)
        return app

    # Calls for one end user.

    def token_for(self, unique_identifier: str) -> str:
        return sign_embed_token(self.org_id, self.project_id, _required("unique_identifier", unique_identifier), self._secret)

    def list_flows(self, unique_identifier: str) -> List[dict]:
        """Every flow the user has: one per enabled app, one per trigger subscription."""
        data = self._request("GET", f"{self.api_base_url}/projects/{self.project_id}/integrations", token=self.token_for(unique_identifier))
        return [
            {
                "id": flow.get("id"),
                "status": flow.get("status"),
                "auth_id": flow.get("auth_id"),
                "service_id": flow.get("service_id"),
                "title": flow.get("title"),
            }
            for flow in ((data or {}).get("flows") or [])
        ]

    def list_options(self, unique_identifier: str, action_version_id: str, field_key: str, auth_id: str, existing_fields: Optional[dict] = None) -> dict:
        """The values one field accepts, read from the user's own account: `{ options, offset }`."""
        data = self._request(
            "POST",
            f"{self.api_base_url}/embed/list-options/{_required('action_version_id', action_version_id)}",
            {"fieldKey": _required("field_key", field_key), "auth_id": _required("auth_id", auth_id), "existingFields": existing_fields or {}},
            token=self.token_for(unique_identifier),
        )
        if isinstance(data, list):
            return {"options": data, "offset": None}
        # A connection that cannot be read answers 200 with the failure nested inside.
        response = (data or {}).get("response") if isinstance(data, dict) else None
        if isinstance(response, dict) and int(response.get("status") or 0) >= 400:
            raise ViaSocketError(((response.get("data") or {}).get("message")) or "list-options failed", status=int(response["status"]), body=data)
        options = (data or {}).get("data") if isinstance(data, dict) else None
        return {"options": options if isinstance(options, list) else [], "offset": (data or {}).get("offset")}

    def run_action(self, script_id: str, action_version_id: str, input_data: Optional[dict] = None) -> Any:
        """Runs one action. The script_id from the user's enabled flow is the credential: server only."""
        return self._request(
            "POST",
            f"{self.run_base_url}/func/{_required('script_id', script_id)}",
            {"action_version_id": _required("action_version_id", action_version_id), "inputData": input_data or {}},
        )
