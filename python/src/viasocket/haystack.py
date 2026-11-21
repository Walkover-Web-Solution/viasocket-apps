"""
viasocket.haystack — the apps a user connected, as Haystack tools.

    from haystack.components.agents import Agent
    from haystack.components.generators.chat import OpenAIChatGenerator
    from viasocket import ViaSocket
    from viasocket.haystack import viasocket_toolset

    tools = viasocket_toolset(viasocket, user="user_123", apps=["slack"], actions={"slack": ["send-message"]})
    agent = Agent(chat_generator=OpenAIChatGenerator(model="gpt-6-luna"), tools=tools)

Needs `haystack-ai` 2.14 or later: `pip install "viasocket[haystack]"`.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from haystack.tools import Tool, Toolset

from ._agent_tools import AgentTool, agent_tools
from ._client import ViaSocket


def _tool(t: AgentTool) -> Tool:
    def run(**kwargs: Any) -> str:
        return t.invoke(kwargs)

    return Tool(name=t.name, description=t.description, parameters=t.parameters, function=run)


def viasocket_tools(viasocket: ViaSocket, user: str, apps: List[str], actions: Optional[Dict[str, List[str]]] = None) -> List[Tool]:
    """One Haystack tool per chosen action; each runs on the user's own connection to the app."""
    return [_tool(t) for t in agent_tools(viasocket, user, apps, actions)]


def viasocket_toolset(viasocket: ViaSocket, user: str, apps: List[str], actions: Optional[Dict[str, List[str]]] = None) -> Toolset:
    """The same tools as one `Toolset`, for an `Agent` or a `ToolInvoker`."""
    return Toolset(viasocket_tools(viasocket, user, apps, actions))
