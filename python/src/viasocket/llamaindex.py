"""
viasocket.llamaindex — the apps a user connected, as LlamaIndex tools.

    from viasocket import ViaSocket
    from viasocket.llamaindex import viasocket_tools

    tools = viasocket_tools(viasocket, user="user_123", apps=["slack"], actions={"slack": ["send-message"]})
    agent = FunctionAgent(tools=tools, llm=llm)

Needs `llama-index-core` 0.12 or later: `pip install "viasocket[llamaindex]"`.
"""

from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional

from llama_index.core.tools import FunctionTool

from ._agent_tools import agent_tools
from ._client import ViaSocket
from ._pydantic import model_from_schema, to_plain


def viasocket_tools(viasocket: ViaSocket, user: str, apps: List[str], actions: Optional[Dict[str, List[str]]] = None) -> List[FunctionTool]:
    """One LlamaIndex tool per chosen action; each runs on the user's own connection to the app."""
    return [
        FunctionTool.from_defaults(
            fn=_caller(t.invoke),
            name=t.name,
            description=t.description,
            fn_schema=model_from_schema(t.name, t.parameters),
        )
        for t in agent_tools(viasocket, user, apps, actions)
    ]


def _caller(invoke: Callable[[Dict[str, Any]], str]) -> Callable[..., str]:
    """The tool's function: validated keyword arguments in, one plain dict to viaSocket."""
    return lambda **kwargs: invoke(to_plain(kwargs))
