"""
viasocket.adk — the apps a user connected, as Google ADK tools.

    from viasocket import ViaSocket
    from viasocket.adk import viasocket_tools

    tools = viasocket_tools(viasocket, user="user_123", apps=["slack"], actions={"slack": ["send-message"]})
    root_agent = Agent(model="gemini-flash-latest", name="ops_agent", instruction="...", tools=tools)

Needs `google-adk` 1.0 or later: `pip install "viasocket[adk]"`.
"""

from __future__ import annotations

import asyncio
from typing import Any, Dict, List, Optional

from google.adk.tools import BaseTool
from google.genai import types

from ._agent_tools import AgentTool, agent_tools
from ._client import ViaSocket


class ViaSocketTool(BaseTool):
    """One viaSocket action. The model sees its JSON Schema as is; the call runs off the event loop."""

    def __init__(self, tool: AgentTool):
        super().__init__(name=tool.name, description=tool.description)
        self._tool = tool

    def _get_declaration(self) -> types.FunctionDeclaration:
        return types.FunctionDeclaration(name=self.name, description=self.description, parameters_json_schema=self._tool.parameters)

    async def run_async(self, *, args: Dict[str, Any], tool_context: Any) -> str:
        # The client is blocking (urllib); a thread keeps the agent's event loop free.
        return await asyncio.to_thread(self._tool.invoke, args or {})


def viasocket_tools(viasocket: ViaSocket, user: str, apps: List[str], actions: Optional[Dict[str, List[str]]] = None) -> List[ViaSocketTool]:
    """One ADK tool per chosen action; each runs on the user's own connection to the app."""
    return [ViaSocketTool(t) for t in agent_tools(viasocket, user, apps, actions)]
