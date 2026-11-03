"""
viasocket.openai_agents — the apps a user connected, as OpenAI Agents SDK tools.

    from agents import Agent, Runner
    from viasocket import ViaSocket
    from viasocket.openai_agents import viasocket_tools

    tools = viasocket_tools(viasocket, user="user_123", apps=["slack"], actions={"slack": ["send-message"]})
    result = Runner.run_sync(Agent(name="Ops", instructions="...", tools=tools), "Post our Q3 numbers in #finance")

Needs `openai-agents` 0.1 or later: `pip install "viasocket[openai-agents]"`.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any, Callable, Dict, List, Optional

from agents import FunctionTool

from ._agent_tools import agent_tools
from ._client import ViaSocket


def viasocket_tools(viasocket: ViaSocket, user: str, apps: List[str], actions: Optional[Dict[str, List[str]]] = None) -> List[FunctionTool]:
    """One OpenAI Agents SDK function tool per chosen action; each runs on the user's own connection."""
    return [
        FunctionTool(
            name=t.name,
            description=t.description,
            params_json_schema=t.parameters,
            on_invoke_tool=_caller(t.invoke),
            # The schema is the action's own form: optional fields and open objects, which strict mode refuses.
            strict_json_schema=False,
        )
        for t in agent_tools(viasocket, user, apps, actions)
    ]


def _caller(invoke: Callable[[Dict[str, Any]], str]) -> Callable[[Any, str], Any]:
    """The SDK hands the arguments as a JSON string; the blocking client runs off the event loop."""

    async def on_invoke_tool(_context: Any, arguments: str) -> str:
        return await asyncio.to_thread(invoke, json.loads(arguments or "{}"))

    return on_invoke_tool
