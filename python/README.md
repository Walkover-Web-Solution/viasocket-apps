# viasocket (Python)

Your own agent, acting in the apps each of your users connected through viaSocket: every action of
an app is a tool, run on that user's own connection. Slack's Send Message, Google Sheets' Add New
Row, HubSpot's Create Deal — any of 2,300+ apps, with no connector code and no OAuth on your side.
Works with LangChain, CrewAI, LlamaIndex, Google ADK and the OpenAI Agents SDK.

It is the Python side of the [`viasocket-apps`](https://www.npmjs.com/package/viasocket-apps) npm
package, and builds the same tools from the same catalog. No dependencies of its own; Python 3.10+.

```sh
pip install "viasocket[langchain]"     # pick your framework: [langchain], [crewai], [llamaindex], [adk] or [openai-agents]
```

The part in brackets installs that framework with the package. Plain `pip install viasocket` is enough when the
framework is already installed, or for any other framework (`viasocket.agent_tools`, below).

## For coding agents

Working with Claude Code, Cursor, Codex, Copilot or another coding agent? Give it the viaSocket skill: it walks
the agent through the whole integration (the three keys, connecting a user's apps, the calls, testing) on the
live catalog.

```sh
npx skills add Walkover-Web-Solution/viasocket-apps
```

No Node.js? Paste this into your agent: `Read https://viasocket.com/docs/skill.md?format=http and follow it.`

You need three values: `VIASOCKET_ORG_ID`, `VIASOCKET_PROJECT_ID` and `VIASOCKET_EMBED_SECRET`. With Node.js,
`npx viasocket-apps setup` writes them to `.env` after one click in the browser; without it, copy them from the
viaSocket dashboard (**Integrations → Create embed → Install Code**). The secret stays on your server.

To try it before your product has a connect button, connect an app for yourself from the terminal:
`npx viasocket-apps connect slack --user me`, then build the tools with `user="me"`.

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

## Google ADK

```python
from google.adk.agents import Agent
from viasocket.adk import viasocket_tools

root_agent = Agent(
    model="gemini-flash-latest",
    name="ops_agent",
    instruction="Keep the team updated in Slack.",
    tools=viasocket_tools(viasocket, user="user_123", apps=["slack"], actions={"slack": ["send-message"]}),
)
```

Each tool hands the model the action's JSON Schema as its declaration and runs the call off the event loop.

## OpenAI Agents SDK

```python
from agents import Agent, Runner
from viasocket.openai_agents import viasocket_tools

agent = Agent(
    name="Ops agent",
    instructions="Keep the team updated in Slack.",
    tools=viasocket_tools(viasocket, user="user_123", apps=["slack"], actions={"slack": ["send-message"]}),
)
result = Runner.run_sync(agent, "Post our Q3 numbers in #finance")
```

The tools are function tools with the action's JSON Schema, not strict (an action's form has optional fields), and
each call runs off the event loop.

## How the tools behave

- **The user connects the app first**, in your product, through viaSocket's connect popup (see the
  [`viasocket-apps` README](https://github.com/Walkover-Web-Solution/viasocket-apps#browser)). A tool for
  an app they have not connected answers the model "Slack is not connected for this user", so the agent
  can ask them to; it starts working on the next call after they do.
- **Pick the actions.** An app left out of `actions` gives every published action as a tool — fine for a
  small app, too many for a large one (Notion has 57). Actions are named by their key (`Send_Message`,
  any case), by `action_id`, or by their path on the app's page (`send-message`).
- **Tool names** are `<app>_<action>` (`slack_send-message`); the input schema is built from the action's
  form, so the model sees the same fields, choices and help text a person would.
- **Fields that hold an id** (a channel, a spreadsheet) come from the user's own account. Each app with
  such a field also gets a `<app>_list-options` tool, which lists the real values on the user's connection,
  narrows a long list with `search` and pages it with `paginate` when it answers `"more": true`.
- An error from the app comes back to the model as text, not as an exception, so one bad call does not
  end the run.

The same tools without a framework — a name, a description, a JSON Schema and `invoke` — are
`viasocket.agent_tools(viasocket, user, apps, actions)`.

## Calls without a framework

The client underneath names things the way the catalog does: the app by its slug, an action or trigger by
its key, a version by its number. `user` is the unique identifier the user connected their apps under.

```python
listing = viasocket.list_actions("user_123", "slack")          # {"app", "service_id", "actions": [{"key", "name", "version", "pauses", ...}]}

# Once per user and app: the flow that runs its actions on their connection.
script_id = viasocket.find_enabled("user_123", "slack")
if not script_id:
    script_id = viasocket.enable("user_123", "slack", auth_id="auth8f3a9c2d")["script_id"]

# Run an action by key; pin a version when your code fills the input.
viasocket.run_action(script_id, "Send_Message", {"text": "hi", "channel": "C1"}, version="v3")

# The values a field accepts, with search and paging.
page = viasocket.field_options("user_123", "slack", "Send_Message", "channel", "auth8f3a9c2d", search="gen")
while page["has_more"]:
    page = viasocket.field_options("user_123", "slack", "Send_Message", "channel", "auth8f3a9c2d", search="gen", paginate=page["paginate"])

# Your webhook (or `code=` JavaScript) on every event of a trigger.
viasocket.subscribe("user_123", "slack", "New_Message", auth_id="auth8f3a9c2d", webhook="https://example.com/hooks/slack")

# An automation of the user's own, for an action known before it runs (an action whose "pauses" is set always
# goes here): the product posts {"orders": [...]} to its URL and it runs once per order.
flow = viasocket.create_flow("user_123", "Thank-you note per order")
trigger = viasocket.set_trigger("user_123", flow["script_id"], {"triggerType": "webhook", "runOncePerItem": True, "arrayKey": "orders"})
viasocket.save_steps("user_123", flow["script_id"], [{
    "stepname": "note",
    "code": "return await askAi({ inputData: { query: `One-line thank-you for ${context.req.body.item}` } })",
    "service_action_functions": [{"name": "askAi", "auth_id": "NoAuth", "action_id": "rowskkqydb6f"}],  # Run AI Model
}])
# trigger["webhook_url"] is where the product posts; read_flow() and run_history() read it back.
```

The `script_id` is the credential for `run_action` and `run_code`: keep it on your server.

## License

MIT
