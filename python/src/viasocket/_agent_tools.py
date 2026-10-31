"""
The actions of apps a user connected, as tools an AI agent can call — framework-neutral: a name, a
description, a JSON Schema for the input and an `invoke`. The same tools, built the same way, as
`agentTools` in the `viasocket-apps` npm package; `viasocket.langchain`, `viasocket.crewai` and
`viasocket.llamaindex` wrap them.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional

from ._client import ViaSocket, ViaSocketError

MAX_RESULT = 20_000

JsonSchema = Dict[str, Any]


@dataclass
class AgentTool:
    """`name` is unique and inside the 64 characters model APIs allow (`slack_send-message`)."""

    name: str
    description: str
    parameters: JsonSchema
    # Runs the action and answers what the model reads: the result as JSON, or the error as a sentence
    # it can act on. Never raises for those, so one bad call does not end the agent's run.
    invoke: Callable[[Dict[str, Any]], str]


def _event_path(name: str) -> str:
    """`Send Message` -> `send-message`, as the app's page names an event."""
    return re.sub(r"^-+|-+$", "", re.sub(r"[^a-z0-9]+", "-", (name or "").lower()))


def _tool_name(slug: str, action: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]", "_", f"{slug}_{_event_path(action)}")[:64]


def _static_values(block: dict) -> Optional[list]:
    """The fixed values of a dropdown, or None for a picker whose values come from the user's account."""
    if block.get("enableSearchApi") or block.get("willDynamicFetchOptions"):
        return None
    values = [option.get("value") for option in block.get("options") or [] if isinstance(option, dict)]
    values = [value for value in values if value is not None and value != ""]
    return values or None


def _describe(block: dict, picker: Optional[str]) -> str:
    parts = [block.get("label"), block.get("help") or block.get("customHelp")]
    if picker:
        parts.append(picker)
    if block.get("dateFormat"):
        parts.append(f"Format: {block['dateFormat']}.")
    # A choice field's placeholder is UI copy ("Select Channel"); only a typed value's is an example.
    if block.get("placeholder") and block.get("type") not in ("dropdown", "multiselect", "boolean"):
        parts.append(f"Example: {block['placeholder']}")
    # The condition is JavaScript over the other fields, which a model reads well once the prefix is gone.
    if block.get("visibilityCondition"):
        parts.append("Only when: " + re.sub(r"context\??\.inputData\??\.?", "", block["visibilityCondition"]))
    return " — ".join(part for part in parts if part)


PickerHint = Callable[[str], str]


def _field_schema(block: dict, key: str, steps: dict, blocks: dict, hint: PickerHint) -> Optional[JsonSchema]:
    kind = block.get("type")
    picker = lambda: hint(block.get("key") or key)  # noqa: E731
    if kind in ("string", "markdown", "aifield", "date"):
        return {"type": "string", "description": _describe(block, None)}
    if kind == "number":
        return {"type": "number", "description": _describe(block, None)}
    if kind == "boolean":
        return {"type": "boolean", "description": _describe(block, None)}
    if kind == "dropdown":
        values = _static_values(block)
        if values:
            return {"enum": values, "description": _describe(block, None)}
        return {"type": "string", "description": _describe(block, picker())}
    if kind == "multiselect":
        values = _static_values(block)
        return {
            "type": "array",
            "items": {"enum": values} if values else {"type": "string"},
            "description": _describe(block, None if values else picker()),
        }
    if kind == "dictionary":
        return {"type": "object", "additionalProperties": {"type": "string"}, "description": _describe(block, None)}
    if kind == "input groups":
        return {**_object_schema(key, steps, blocks, hint), "description": _describe(block, None)}
    return None


def _object_schema(parent: str, steps: dict, blocks: dict, hint: PickerHint) -> JsonSchema:
    properties: Dict[str, JsonSchema] = {}
    required: List[str] = []
    for key in steps.get(parent) or []:
        block = blocks.get(key)
        if not isinstance(block, dict):
            continue
        schema = _field_schema(block, key, steps, blocks, hint)
        if schema is None:
            continue
        # `destination.channel_id` is `channel_id` inside `destination`, as inputData nests it.
        name = key[key.rfind(".") + 1 :]
        properties[name] = schema
        # A field shown only under a condition cannot be required of every call.
        if block.get("required") and not block.get("visibilityCondition"):
            required.append(name)
    return {"type": "object", "properties": properties, **({"required": required} if required else {})}


def action_input_schema(input_schema: dict, hint: Optional[PickerHint] = None) -> JsonSchema:
    """An action's `input_schema` — the form viaSocket renders — as the JSON Schema a model fills."""
    hint = hint or (lambda field: "An id from the user's account, not a display name.")
    return _object_schema("root", (input_schema or {}).get("steps") or {}, (input_schema or {}).get("blocks") or {}, hint)


def _clip(text: str) -> str:
    return f"{text[:MAX_RESULT]}… (truncated)" if len(text) > MAX_RESULT else text


def agent_tools(viasocket: ViaSocket, user: str, apps: List[str], actions: Optional[Dict[str, List[str]]] = None) -> List[AgentTool]:
    """
    One tool per chosen action of each app, for one end user (`user`, the unique identifier their
    connections were made under). An app left out of `actions` gets every published action. Reads the
    public catalog only; the user's connection is looked up when a tool first runs.
    """
    taken: set = set()

    def unique_name(slug: str, action: str) -> str:
        base = _tool_name(slug, action)
        name, n = base, 2
        while name in taken:
            name, n = f"{base[:60]}_{n}", n + 1
        taken.add(name)
        return name

    tools: List[AgentTool] = []
    for slug in apps or []:
        service_id = viasocket.service_id_for(slug)
        app = viasocket.versions(service_id)
        if not app:
            raise ViaSocketError(f'agent_tools: "{slug}" has nothing published')
        app_name = app["service"]["name"]
        wanted = (actions or {}).get(slug)
        if wanted:
            chosen = []
            for event in wanted:
                match = next((a for a in app["actions"] if a.get("action_id") == event or _event_path(a.get("name", "")) == event), None)
                if not match:
                    raise ViaSocketError(f'agent_tools: {app_name} has no published action "{event}"')
                chosen.append(match)
        else:
            chosen = app["actions"]
        tools.extend(_app_tools(viasocket, user, slug, service_id, app_name, chosen, unique_name, taken))
    return tools


def _app_tools(viasocket, user, slug, service_id, app_name, chosen, unique_name, taken) -> List[AgentTool]:
    not_connected = f"{app_name} is not connected for this user. Ask them to connect it, then try again."
    # The user's enabled flow for this app: its id runs actions, its auth_id reads their account.
    # Only a found one is kept, so an app the user connects mid-conversation works on the next call.
    found: Dict[str, Any] = {}

    def find_flow() -> Optional[dict]:
        if "flow" not in found:
            flow = next(
                (f for f in viasocket.list_flows(user) if f["service_id"] == service_id and f["status"] in ("active", "paused")),
                None,
            )
            if flow is None:
                return None
            found["flow"] = flow
        return found["flow"]

    options_tool = unique_name(slug, "list options")
    with_pickers: Dict[str, dict] = {}
    tools: List[AgentTool] = []

    for action in chosen:
        name = unique_name(slug, action.get("name", ""))

        def hint(field: str, name: str = name, action: dict = action) -> str:
            with_pickers[name] = action
            return (
                f"An id from the user's {app_name} account, never a display name or a guess: "
                f'get it with {options_tool} (tool "{name}", field "{field}").'
            )

        def invoke(input: Dict[str, Any], action: dict = action) -> str:
            try:
                flow = find_flow()
                if not flow:
                    return not_connected
                result = viasocket.run_action(flow["id"], action["action_version_id"], input or {})
                return _clip(result if isinstance(result, str) else json.dumps(result))
            except ViaSocketError as error:
                return f"{app_name} {action.get('name')} failed: {error}"

        tools.append(
            AgentTool(
                name=name,
                description=f"{app_name}: {action.get('description') or action.get('name')}",
                parameters=action_input_schema(action.get("input_schema") or {}, hint),
                invoke=invoke,
            )
        )

    if not with_pickers:
        taken.discard(options_tool)
        return tools

    def list_options(input: Dict[str, Any]) -> str:
        action = with_pickers.get(str((input or {}).get("tool", "")))
        if not action:
            return f'Unknown tool "{(input or {}).get("tool")}": use one of {", ".join(with_pickers)}.'
        try:
            flow = find_flow()
            if not flow:
                return not_connected
            chosen_so_far = input.get("chosen") if isinstance(input.get("chosen"), dict) else {}
            existing = {**chosen_so_far, "_searchText": str(input["search"])} if input.get("search") else chosen_so_far
            result = viasocket.list_options(user, action["action_version_id"], str(input.get("field", "")), flow["auth_id"], existing)
            if not result["options"]:
                return 'No values. If this field depends on another, put that one in "chosen" first, or try other search words.'
            values = [{"label": o.get("label"), "value": o.get("value")} for o in result["options"]]
            return _clip(json.dumps({"options": values, "more": bool(result["offset"])}))
        except ViaSocketError as error:
            return f"{app_name}: listing values failed: {error}"

    tools.append(
        AgentTool(
            name=options_tool,
            description=(
                f"{app_name}: lists the values a field of another {app_name} tool accepts (a channel, a sheet, a list), "
                f"read from the user's own {app_name} account. Call it before filling a field whose description names "
                "this tool; send the value, show the label."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "tool": {"enum": list(with_pickers), "description": "The tool whose field needs values."},
                    "field": {"type": "string", "description": 'The field, exactly as its description names it, such as "destination.channel_id".'},
                    "chosen": {
                        "type": "object",
                        "description": (
                            "What is already chosen for that tool, in the same shape as its input. A field that depends on "
                            "another (a sheet inside a spreadsheet) lists nothing until that one is here."
                        ),
                    },
                    "search": {"type": "string", "description": "Words to narrow a long list, such as part of a channel name."},
                },
                "required": ["tool", "field"],
            },
            invoke=list_options,
        )
    )
    return tools
