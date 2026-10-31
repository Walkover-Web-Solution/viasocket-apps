# viasocket (Python)

Your own agent, acting in the apps each of your users connected through viaSocket: every action of
an app is a tool, run on that user's own connection. Slack's Send Message, Google Sheets' Add New
Row, HubSpot's Create Deal — any of 2,300+ apps, with no connector code and no OAuth on your side.
Works with LangChain, CrewAI and LlamaIndex.

It is the Python side of the [`viasocket-apps`](https://www.npmjs.com/package/viasocket-apps) npm
package, and builds the same tools from the same catalog. No dependencies of its own; Python 3.9+.

```sh
pip install "viasocket[langchain]"     # or [crewai], [llamaindex]
```

You need three values: `VIASOCKET_ORG_ID`, `VIASOCKET_PROJECT_ID` and `VIASOCKET_EMBED_SECRET`. With Node.js,
`npx viasocket-apps setup` writes them to `.env` after one click in the browser; without it, copy them from the
viaSocket dashboard (**Integrations → Create embed → Install Code**). The secret stays on your server.

```python
import os
from viasocket import ViaSocket

viasocket = ViaSocket(
    org_id=os.environ["VIASOCKET_ORG_ID"],
    project_id=os.environ["VIASOCKET_PROJECT_ID"],
    secret=os.environ["VIASOCKET_EMBED_SECRET"],
)
```

## LangChain

```python
from langchain.agents import create_agent
from viasocket.langchain import viasocket_tools

tools = viasocket_tools(
    viasocket,
    user="user_123",  # the unique identifier the user connected their apps under
    apps=["slack", "google-sheets"],
    actions={"slack": ["send-message"], "google-sheets": ["add-new-row-to-sheet", "lookup-spreadsheet-rows"]},
)

agent = create_agent("anthropic:claude-sonnet-5-5", tools)
agent.invoke({"messages": [{"role": "user", "content": "Post our Q3 numbers in #finance"}]})
```

## CrewAI

```python
from crewai import Agent
from viasocket.crewai import viasocket_tools

agent = Agent(
    role="Operations assistant",
    goal="Keep the team updated in Slack",
    backstory="You post updates where the team reads them.",
    tools=viasocket_tools(viasocket, user="user_123", apps=["slack"], actions={"slack": ["send-message"]}),
)
```

## LlamaIndex

```python
from llama_index.core.agent.workflow import FunctionAgent
from viasocket.llamaindex import viasocket_tools

agent = FunctionAgent(
    tools=viasocket_tools(viasocket, user="user_123", apps=["slack"], actions={"slack": ["send-message"]}),
    llm=llm,
)
```

## How the tools behave

- **The user connects the app first**, in your product, through viaSocket's connect popup (see the
  [`viasocket-apps` README](https://github.com/Walkover-Web-Solution/viasocket-apps#browser)). A tool for
  an app they have not connected answers the model "Slack is not connected for this user", so the agent
  can ask them to; it starts working on the next call after they do.
- **Pick the actions.** An app left out of `actions` gives every published action as a tool — fine for a
  small app, too many for a large one (Notion has 57). Actions are named by `action_id` or by their path
  on the app's page (`send-message`).
- **Tool names** are `<app>_<action>` (`slack_send-message`); the input schema is built from the action's
  form, so the model sees the same fields, choices and help text a person would.
- **Fields that hold an id** (a channel, a spreadsheet) come from the user's own account. Each app with
  such a field also gets a `<app>_list-options` tool, which lists the real values on the user's connection.
- An error from the app comes back to the model as text, not as an exception, so one bad call does not
  end the run.

The same tools without a framework — a name, a description, a JSON Schema and `invoke` — are
`viasocket.agent_tools(viasocket, user, apps, actions)`.

## License

MIT
