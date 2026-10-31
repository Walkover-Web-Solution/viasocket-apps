"""
viasocket — the 2,300+ apps each of your users connected through viaSocket, as tools for your agent.

    from viasocket import ViaSocket
    from viasocket.langchain import viasocket_tools     # or viasocket.crewai / viasocket.llamaindex

    viasocket = ViaSocket(org_id, project_id, secret=os.environ["VIASOCKET_EMBED_SECRET"])
    tools = viasocket_tools(viasocket, user="user_123", apps=["slack"], actions={"slack": ["send-message"]})
"""

from ._agent_tools import AgentTool, action_input_schema, agent_tools
from ._client import ViaSocket, ViaSocketError, sign_embed_token

__all__ = ["ViaSocket", "ViaSocketError", "sign_embed_token", "AgentTool", "agent_tools", "action_input_schema"]
__version__ = "0.1.0"
