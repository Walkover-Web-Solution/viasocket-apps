"""
CrewAI and LlamaIndex take a tool's input as a Pydantic model, not a JSON Schema: this builds one
from the schema `agent_tools` makes, keeping every description, enum and required field, and turns a
model's validated input back into the plain dict viaSocket takes.
"""

from __future__ import annotations

import keyword
import re
from typing import Any, Dict, List, Literal, Optional, Type

from pydantic import BaseModel, ConfigDict, Field, create_model


class _Input(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")


def _identifier(key: str, taken: set) -> str:
    """A Python name for a field key (`blockit-kit-ai`, `_searchText`); the key stays its alias."""
    name = re.sub(r"\W", "_", key).lstrip("_") or "field"
    if name[0].isdigit() or keyword.iskeyword(name) or hasattr(BaseModel, name):
        name = f"f_{name}"
    while name in taken:
        name += "_"
    taken.add(name)
    return name


def _type_of(schema: Dict[str, Any], name: str) -> Any:
    if "enum" in schema:
        values = schema["enum"]
        return Literal[tuple(values)] if values and all(isinstance(v, (str, int, bool)) for v in values) else Any
    kind = schema.get("type")
    if kind == "string":
        return str
    if kind == "number":
        return float
    if kind == "boolean":
        return bool
    if kind == "array":
        return List[_type_of(schema.get("items") or {}, f"{name}Item")]
    if kind == "object" and schema.get("properties"):
        return model_from_schema(name, schema)
    if kind == "object":
        return Dict[str, Any]
    return Any


def model_from_schema(name: str, schema: Dict[str, Any]) -> Type[BaseModel]:
    """A Pydantic model for an object schema; nested objects become nested models."""
    required = set(schema.get("required") or [])
    taken: set = set()
    fields: Dict[str, Any] = {}
    for key, prop in (schema.get("properties") or {}).items():
        field_type = _type_of(prop, f"{name}_{_identifier(key, set())}")
        description = prop.get("description")
        if key in required:
            fields[_identifier(key, taken)] = (field_type, Field(..., alias=key, description=description))
        else:
            fields[_identifier(key, taken)] = (Optional[field_type], Field(None, alias=key, description=description))
    model_name = re.sub(r"\W", "_", name) or "Input"
    return create_model(model_name, __base__=_Input, **fields)


def to_plain(value: Any) -> Any:
    """A model's input as viaSocket takes it: original keys, fields left out not sent."""
    if isinstance(value, BaseModel):
        return to_plain(value.model_dump(by_alias=True, exclude_none=True))
    if isinstance(value, dict):
        return {k: to_plain(v) for k, v in value.items() if v is not None}
    if isinstance(value, list):
        return [to_plain(v) for v in value]
    return value
