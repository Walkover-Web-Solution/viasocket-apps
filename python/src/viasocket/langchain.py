"""
viasocket.langchain — the apps a user connected, as LangChain tools.

    from viasocket import ViaSocket
    from viasocket.langchain import viasocket_tools

    tools = viasocket_tools(viasocket, user="user_123", apps=["slack"], actions={"slack": ["send-message"]})
    agent = create_agent(model, tools)

Needs `langchain-core` 0.3 or later: `pip install "viasocket[langchain]"`.
"""

from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional

from langchain_core.tools import StructuredTool

from ._agent_tools import agent_tools
from ._client import ViaSocket


def viasocket_tools(viasocket: ViaSocket, user: str, apps: List[str], actions: Optional[Dict[str, List[str]]] = None) -> List[StructuredTool]:
    """One LangChain tool per chosen action; each runs on the user's own connection to the app."""
    return [
        StructuredTool(
            name=t.name,
            description=t.description,
            args_schema=t.parameters,
            func=_caller(t.invoke),
        )
        for t in agent_tools(viasocket, user, apps, actions)
    ]


def _caller(invoke: Callable[[Dict[str, Any]], str]) -> Callable[..., str]:
    """The tool's function: keyword arguments in, as LangChain calls it, one dict to viaSocket."""
    return lambda **kwargs: invoke(kwargs)
