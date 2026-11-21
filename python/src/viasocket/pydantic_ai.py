"""
viasocket.pydantic_ai — the apps a user connected, as Pydantic AI tools.

    from pydantic_ai import Agent
    from viasocket import ViaSocket
    from viasocket.pydantic_ai import viasocket_toolset

    toolset = viasocket_toolset(viasocket, user="user_123", apps=["slack"], actions={"slack": ["send-message"]})
    agent = Agent("openai:gpt-6-luna", toolsets=[toolset])

Needs `pydantic-ai-slim` 1.0 or later: `pip install "viasocket[pydantic-ai]"`.
"""

from __future__ import annotations

import asyncio
from typing import Any, Dict, List, Optional

from pydantic_ai import Tool
from pydantic_ai.toolsets import FunctionToolset

from ._agent_tools import AgentTool, agent_tools
from ._client import ViaSocket


def _tool(t: AgentTool) -> Tool:
    async def run(**kwargs: Any) -> str:
        # The client is blocking (urllib); a thread keeps the agent's event loop free.
        return await asyncio.to_thread(t.invoke, kwargs)

    # The model sees the action's own JSON Schema; Pydantic AI checks the arguments against it.
    return Tool.from_schema(run, name=t.name, description=t.description, json_schema=t.parameters)


def viasocket_tools(viasocket: ViaSocket, user: str, apps: List[str], actions: Optional[Dict[str, List[str]]] = None) -> List[Tool]:
    """One Pydantic AI tool per chosen action; each runs on the user's own connection to the app."""
    return [_tool(t) for t in agent_tools(viasocket, user, apps, actions)]


def viasocket_toolset(viasocket: ViaSocket, user: str, apps: List[str], actions: Optional[Dict[str, List[str]]] = None) -> FunctionToolset:
    """The same tools as one toolset: `Agent(..., toolsets=[viasocket_toolset(...)])`."""
    return FunctionToolset(viasocket_tools(viasocket, user, apps, actions))
