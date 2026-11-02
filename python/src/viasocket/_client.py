"""
The part of the viaSocket Apps API an agent needs, with no dependencies: the public catalog, the
signed embed token, a user's flows and field values, and running an action. Mirrors the calls of
the `viasocket-apps` npm package, so both read the same responses the same way.

Apps, actions and versions are named the way the catalog shows them: the app by its slug (`slack`),
an action by its key (`Send_Message`), a version by its number (`v55`). The row ids the older
routes took still work everywhere a key does.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Callable, Dict, List, Optional

DEFAULT_API_BASE_URL = "https://flow-api.viasocket.com"
DEFAULT_RUN_BASE_URL = "https://flow.sokt.io"
# `/<slug or service_id>` is the app, `/<slug or service_id>/actions` the app with its published actions and triggers.
CATALOG_PLUGINS = "https://plug-service.viasocket.com/api/v1/plugins"
REQUEST_TIMEOUT = 120
VERSIONS_TTL = 10 * 60
# A row id (`rowbu58rc`), as opposed to a slug or an action key.
ROW_ID = re.compile(r"^row[a-z0-9]+$")

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
        self._actions: Dict[str, "tuple[float, dict]"] = {}

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
            # A failed action run puts the app's own failure in `errorMsg`; other refusals in `error` or `message`.
            nested = raw.get("errorMsg") if isinstance(raw.get("errorMsg"), dict) else raw.get("error")
            message = (
                raw.get("message")
                or (nested.get("message") if isinstance(nested, dict) else None)
                or f"viaSocket responded {status} for {method} {url}"
            )
            raise ViaSocketError(message, status=status, body=payload)
        return envelope["data"] if envelope is not None else payload

    # The catalog: public, nothing per user.

    def service_id_for(self, slug: str) -> str:
        """
        The `service_id` of the app with this slug (`slack`, `google-sheets`), from the plug-service
        catalog. Exact and case-sensitive. Prefer `service_id_of`, which reads viaSocket itself:
        plug-service does not know some slugs (`gmail` among them).
        """
        key = _required("slug", slug)
        if key not in self._service_ids:
            try:
                data = self._request("GET", f"{CATALOG_PLUGINS}/{urllib.parse.quote(key)}")
            except ViaSocketError as error:
                if error.status != 404:
                    raise
                data = None
            service = data.get("service") if isinstance(data, dict) else None
            service_id = (service or {}).get("service_id")
            if not service_id:
                raise ViaSocketError(f'No viaSocket app has the slug "{key}" (slugs are exact and case-sensitive)')
            self._service_ids[key] = service_id
        return self._service_ids[key]

    def versions(self, service_id: str) -> Optional[dict]:
        """One app with its published actions and triggers, or None for an unknown service id. Cached 10 minutes."""
        cached = self._versions.get(service_id)
        if cached and time.time() - cached[0] < VERSIONS_TTL:
            return cached[1]
        try:
            data = self._request("GET", f"{CATALOG_PLUGINS}/{urllib.parse.quote(_required('service_id', service_id))}/actions")
        except ViaSocketError as error:
            if error.status == 404:  # an unknown app: nothing to list
                return None
            raise
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

    def list_actions(self, unique_identifier: str, app: str, type: Optional[str] = None) -> dict:
        """
        The app's actions and triggers as viaSocket names them: `{ app, service_id, actions }`, each
        action with `key`, `name`, `type`, `description`, `action_id`, `version` (the published one),
        `action_version_id` and `versions`. `type` narrows to `action` or `trigger`. Cached 10 minutes.
        """
        slug = _required("app", app)
        cache_key = f"{slug}?{type or ''}"
        cached = self._actions.get(cache_key)
        if cached and time.time() - cached[0] < VERSIONS_TTL:
            return cached[1]
        url = f"{self.api_base_url}/embed/services/{urllib.parse.quote(slug)}/actions"
        if type:
            url += f"?type={urllib.parse.quote(type)}"
        data = self._request("GET", url, token=self.token_for(unique_identifier)) or {}
        listing = {
            "app": slug,
            "service_id": data.get("service_id"),
            "actions": data.get("actions") if isinstance(data.get("actions"), list) else [],
        }
        self._actions[cache_key] = (time.time(), listing)
        return listing

    def service_id_of(self, unique_identifier: str, app: str) -> str:
        """The `service_id` of the app with this slug, read from viaSocket. Cached with `list_actions`."""
        service_id = self.list_actions(unique_identifier, app)["service_id"]
        if not service_id:
            raise ViaSocketError(f'No viaSocket app has the slug "{app}"')
        return service_id

    def enable(self, unique_identifier: str, app: str, auth_id: str) -> dict:
        """
        Enables the app for the user on this connection, so its actions run on `webhook_url`:
        `{ script_id, webhook_url, service, service_id, auth_id }`. Once per user and app: check
        `find_enabled` first. `app` is a slug, or a service id for the older route.
        """
        name = _required("app", app)
        connection = _required("auth_id", auth_id)
        if ROW_ID.match(name):
            url = f"{self.api_base_url}/embed/enable/{name}/{connection}"
        else:
            url = f"{self.api_base_url}/embed/services/{urllib.parse.quote(name)}/enable/{connection}"
        return self._request("POST", url, {}, token=self.token_for(unique_identifier)) or {}

    def find_enabled(self, unique_identifier: str, app: str) -> Optional[str]:
        """The script_id of the user's enabled flow for this app (active or paused), or None. `app` is a slug or a service id."""
        name = _required("app", app)
        service_id = name if ROW_ID.match(name) else self.service_id_of(unique_identifier, name)
        return next(
            (flow["id"] for flow in self.list_flows(unique_identifier) if flow["service_id"] == service_id and flow["status"] in ("active", "paused")),
            None,
        )

    def field_options(
        self,
        unique_identifier: str,
        app: str,
        action: str,
        field_key: str,
        auth_id: str,
        existing_fields: Optional[dict] = None,
        version: Optional[str] = None,
        search: Optional[str] = None,
        paginate: Any = None,
        custom_code: Optional[str] = None,
    ) -> dict:
        """
        The values one field of an action accepts, read from the user's own account:
        `{ options, paginate, has_more, message }`. Send `paginate` back, with the same `search` and
        `existing_fields`, for the next page; a new `search` starts over without it.
        """
        body: Dict[str, Any] = {
            "auth_id": _required("auth_id", auth_id),
            "fieldKey": _required("field_key", field_key),
            "existingFields": existing_fields or {},
        }
        for key, value in (("version", version), ("search", search), ("paginate", paginate), ("custom_code", custom_code)):
            if value is not None:
                body[key] = value
        data = self._request(
            "POST",
            f"{self.api_base_url}/embed/services/{urllib.parse.quote(_required('app', app))}/actions/{urllib.parse.quote(_required('action', action))}/options",
            body,
            token=self.token_for(unique_identifier),
        )
        data = data if isinstance(data, dict) else {}
        options = data.get("options")
        return {
            "options": options if isinstance(options, list) else [],
            "paginate": data.get("paginate"),
            "has_more": bool(data.get("has_more")),
            "message": data.get("message"),
        }

    def subscribe(
        self,
        unique_identifier: str,
        app: str,
        trigger: str,
        auth_id: Optional[str] = None,
        input_data: Optional[dict] = None,
        code: Optional[str] = None,
        webhook: Optional[str] = None,
        version: Optional[str] = None,
        meta: Any = None,
        description: Optional[str] = None,
    ) -> dict:
        """
        Subscribes the user to a trigger: every event calls `webhook` or runs `code` (exactly one).
        Answers `{ script_id, title, auth_id, inputData, meta }`; keep the script_id to pause or change it.
        """
        if bool(code) == bool(webhook):
            raise ViaSocketError("subscribe: pass exactly one of `code` (JavaScript run per event) or `webhook`")
        body: Dict[str, Any] = {"code": code} if code else {"webhook": webhook}
        for key, value in (("auth_id", auth_id), ("inputData", input_data), ("version", version), ("meta", meta), ("description", description)):
            if value is not None:
                body[key] = value
        return (
            self._request(
                "POST",
                f"{self.api_base_url}/embed/services/{urllib.parse.quote(_required('app', app))}/triggers/{urllib.parse.quote(_required('trigger', trigger))}/subscribe",
                body,
                token=self.token_for(unique_identifier),
            )
            or {}
        )

    def list_options(self, unique_identifier: str, action_version_id: str, field_key: str, auth_id: str, existing_fields: Optional[dict] = None) -> dict:
        """
        Deprecated: use `field_options`, which names the action by key and searches and pages.
        The values one field accepts, read from the user's own account: `{ options, offset }`.
        """
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

    def run_action(self, script_id: str, action: str, input_data: Optional[dict] = None, version: Optional[str] = None) -> Any:
        """
        Runs one action on the user's enabled flow and answers what the app returned. `action` is its
        key (`Send_Message`; `version` picks a version, the published one when left out) or a version's
        row id. The script_id is the credential: server only.
        """
        name = _required("action", action)
        body: Dict[str, Any] = {"action_version_id": name} if ROW_ID.match(name) else {"action": name}
        if version is not None and "action" in body:
            body["version"] = version
        body["inputData"] = input_data or {}
        return self._request("POST", f"{self.run_base_url}/func/{_required('script_id', script_id)}", body)

    def run_code(self, script_id: str, code: str, input_data: Optional[dict] = None, action: Optional[str] = None, version: Optional[str] = None) -> Any:
        """
        Runs your JavaScript with the user's connection, where an action would run: `context.inputData`,
        `context.authData`, and `axios`/`fetch` that carry the credentials. Name an `action` and the
        code can call that action's helpers.
        """
        body: Dict[str, Any] = {"custom_code": _required("code", code), "inputData": input_data or {}}
        if action is not None:
            body["action"] = action
        if version is not None:
            body["version"] = version
        return self._request("POST", f"{self.run_base_url}/func/{_required('script_id', script_id)}", body)
