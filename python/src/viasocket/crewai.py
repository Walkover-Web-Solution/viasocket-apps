"""
viasocket.crewai — the apps a user connected, as CrewAI tools.

    from viasocket import ViaSocket
    from viasocket.crewai import viasocket_tools

    tools = viasocket_tools(viasocket, user="user_123", apps=["slack"], actions={"slack": ["send-message"]})
    agent = Agent(role="Ops assistant", goal="...", backstory="...", tools=tools)

Needs `crewai`: `pip install "viasocket[crewai]"`.
"""

from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional, Type

from crewai.tools import BaseTool
from pydantic import BaseModel

from ._agent_tools import agent_tools
from ._client import ViaSocket
from ._pydantic import model_from_schema, to_plain


class ViaSocketTool(BaseTool):
    """One viaSocket action; `_run` hands the validated input to viaSocket as it takes it."""

    name: str
    description: str
    args_schema: Type[BaseModel]
    invoke: Callable[[Dict[str, Any]], str]

    def _run(self, **kwargs: Any) -> str:
        return self.invoke(to_plain(kwargs))


def viasocket_tools(viasocket: ViaSocket, user: str, apps: List[str], actions: Optional[Dict[str, List[str]]] = None) -> List[ViaSocketTool]:
    """One CrewAI tool per chosen action; each runs on the user's own connection to the app."""
    return [
        ViaSocketTool(name=t.name, description=t.description, args_schema=model_from_schema(t.name, t.parameters), invoke=t.invoke)
        for t in agent_tools(viasocket, user, apps, actions)
    ]
