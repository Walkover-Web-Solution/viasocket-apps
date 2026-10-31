"""
Offline tests: a fake transport answers from a script, so the assertions are about what was sent —
the URL, the token, the body — which is the whole contract. The framework tests run only where that
framework is installed.
"""

import json

import pytest

from viasocket import ViaSocket, ViaSocketError, action_input_schema, agent_tools, sign_embed_token

# A trimmed copy of Slack's live `Send Message` schema: nested group, picker, static dropdown, conditional field.
SEND_MESSAGE = {
    "steps": {"root": ["destination", "text", "help_note"], "destination": ["destination.messageto", "destination.channel_id"]},
    "blocks": {
        "destination": {"key": "destination", "type": "input groups", "label": "Destination"},
        "destination.messageto": {
            "key": "destination.messageto",
            "type": "dropdown",
            "label": "Send Message To",
            "required": True,
            "placeholder": "type",
            "options": [{"label": "Channel", "value": "channel"}, {"label": "User", "value": "user"}],
        },
        "destination.channel_id": {
            "key": "destination.channel_id",
            "type": "multiselect",
            "label": "Channels",
            "required": True,
            "visibilityCondition": "context?.inputData?.destination?.messageto === 'channel'",
        },
        "text": {"key": "text", "type": "markdown", "label": "Message", "required": True, "placeholder": "Hello"},
        "help_note": {"key": "help_note", "type": "help", "help": "Not an input"},
    },
}

CATALOG = {
    "service": {"name": "Slack", "auth_type": "OAuth2"},
    "actions": [{"name": "Send Message", "description": "Send a message.", "action_id": "act1", "action_version_id": "ver1", "input_schema": SEND_MESSAGE}],
    "triggers": [],
}

ENABLED_SLACK = {"id": "scriSLACK", "status": "active", "service_id": "rowbu58rc", "auth_id": "a1"}
INPUT = {"destination": {"messageto": "channel", "channel_id": ["C1"]}, "text": "hi"}


def make_client(flows=()):
    calls = []

    def transport(method, url, headers, body, timeout):
        calls.append({"method": method, "url": url, "headers": headers, "body": json.loads(body) if body else None})
        if "recommend/services" in url:
            reply = {"data": {"plugins": {"slack": {"rowid": "rowbu58rc"}}}}
        elif url.endswith("/func/scriK4LFg2kc"):
            reply = CATALOG
        elif "/integrations" in url:
            reply = {"success": True, "data": {"flows": list(flows)}}
        elif "/embed/list-options/" in url:
            reply = {"success": True, "data": [{"label": "#general", "value": "C1"}, {"label": "#random", "value": "C2"}]}
        else:
            reply = {"success": True, "data": {"ok": True}}
        return 200, json.dumps(reply)

    return ViaSocket("o", "p", "s", transport=transport), calls


def run_body(calls):
    return next(call["body"] for call in calls if call["url"].endswith("/func/scriSLACK"))


def test_token_matches_the_npm_package():
    # The same inputs, signed by `signEmbedToken` in viasocket-apps.
    assert sign_embed_token("4160", "proj9U0smb62", "user_é", "s3cret") == (
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
        "eyJvcmdfaWQiOiI0MTYwIiwicHJvamVjdF9pZCI6InByb2o5VTBzbWI2MiIsInVuaXF1ZV9pZGVudGlmaWVyIjoidXNlcl_DqSJ9."
        "b_h2GEe5TdcXpzA_EJr1aXWiw0DpmoXO2FQ8BHtKUL0"
    )


def test_refuses_to_construct_without_what_it_needs():
    with pytest.raises(ViaSocketError, match="secret is required"):
        ViaSocket("o", "p", "")


def test_action_input_schema_nests_groups_keeps_choices_and_drops_help():
    schema = action_input_schema(SEND_MESSAGE)
    assert list(schema["properties"]) == ["destination", "text"]
    assert schema["required"] == ["text"]
    destination = schema["properties"]["destination"]
    assert destination["properties"]["messageto"]["enum"] == ["channel", "user"]
    assert "Example" not in destination["properties"]["messageto"]["description"]
    assert destination["required"] == ["messageto"]
    assert destination["properties"]["channel_id"]["type"] == "array"
    assert "Only when: destination?.messageto === 'channel'" in destination["properties"]["channel_id"]["description"]
    assert "Example: Hello" in schema["properties"]["text"]["description"]


def test_agent_tools_run_on_the_script_the_user_enabled_with_their_token():
    viasocket, calls = make_client([ENABLED_SLACK])
    send, options = agent_tools(viasocket, "user_123", ["slack"], {"slack": ["send-message"]})
    assert (send.name, options.name) == ("slack_send-message", "slack_list-options")
    assert send.description == "Slack: Send a message."
    assert "slack_list-options" in send.parameters["properties"]["destination"]["properties"]["channel_id"]["description"]

    assert send.invoke(INPUT) == '{"ok": true}'
    assert run_body(calls) == {"action_version_id": "ver1", "inputData": INPUT}
    flows_call = next(call for call in calls if "/integrations" in call["url"])
    assert flows_call["headers"]["authorization"] == viasocket.token_for("user_123")


def test_list_options_reads_the_users_account():
    viasocket, calls = make_client([ENABLED_SLACK])
    _, options = agent_tools(viasocket, "user_123", ["slack"])
    answer = json.loads(options.invoke({"tool": "slack_send-message", "field": "destination.channel_id", "search": "gen"}))
    assert answer == {"options": [{"label": "#general", "value": "C1"}, {"label": "#random", "value": "C2"}], "more": False}
    sent = next(call["body"] for call in calls if "/embed/list-options/ver1" in call["url"])
    assert sent == {"fieldKey": "destination.channel_id", "auth_id": "a1", "existingFields": {"_searchText": "gen"}}


def test_an_unconnected_app_is_a_sentence_for_the_model():
    viasocket, _ = make_client([])
    send, _ = agent_tools(viasocket, "user_123", ["slack"])
    assert "Slack is not connected for this user" in send.invoke(INPUT)


def test_an_unknown_action_fails_when_the_tools_are_built():
    viasocket, _ = make_client()
    with pytest.raises(ViaSocketError, match='no published action "add-row"'):
        agent_tools(viasocket, "u", ["slack"], {"slack": ["add-row"]})


def test_langchain_tools():
    pytest.importorskip("langchain_core")
    from viasocket.langchain import viasocket_tools

    viasocket, calls = make_client([ENABLED_SLACK])
    send, _ = viasocket_tools(viasocket, "user_123", ["slack"])
    assert send.name == "slack_send-message"
    assert send.invoke(INPUT) == '{"ok": true}'
    assert run_body(calls)["inputData"] == INPUT


def test_llamaindex_tools():
    pytest.importorskip("llama_index.core")
    from viasocket.llamaindex import viasocket_tools

    viasocket, calls = make_client([ENABLED_SLACK])
    send, _ = viasocket_tools(viasocket, "user_123", ["slack"])
    assert send.metadata.name == "slack_send-message"
    assert send.call(**INPUT).content == '{"ok": true}'
    # Fields the model left out are not sent; the original keys are.
    assert run_body(calls)["inputData"] == INPUT


def test_crewai_tools():
    pytest.importorskip("crewai")
    from viasocket.crewai import viasocket_tools

    viasocket, calls = make_client([ENABLED_SLACK])
    send, _ = viasocket_tools(viasocket, "user_123", ["slack"])
    assert send.name == "slack_send-message"
    assert send.run(**INPUT) == '{"ok": true}'
    assert run_body(calls)["inputData"] == INPUT
