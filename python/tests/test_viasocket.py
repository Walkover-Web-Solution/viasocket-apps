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
    "actions": [{"name": "Send Message", "description": "Send a message.", "action_id": "rowact1", "action_version_id": "rowver1", "input_schema": SEND_MESSAGE}],
    "triggers": [],
}

# What `GET /embed/services/slack/actions` answers: the keys and versions the readable routes take.
LISTING = {
    "service": "slack",
    "service_id": "rowbu58rc",
    "actions": [
        {
            "key": "Send_Message",
            "name": "Send Message",
            "type": "action",
            "description": "Send a message.",
            "action_id": "rowact1",
            "version": "V3",
            "action_version_id": "rowver1",
            "versions": [{"version": "V3", "action_version_id": "rowver1", "status": "published"}],
        },
        {"key": "New_Message", "name": "New Message", "type": "trigger", "description": "A message arrives.", "action_id": "rowtrg1", "version": "V1", "action_version_id": "rowtrv1", "versions": []},
    ],
}
OPTIONS = [{"label": "#general", "value": "C1"}, {"label": "#random", "value": "C2"}]

ENABLED_SLACK = {"id": "scriSLACK", "status": "active", "service_id": "rowbu58rc", "auth_id": "a1"}
INPUT = {"destination": {"messageto": "channel", "channel_id": ["C1"]}, "text": "hi"}


def make_client(flows=(), listing=LISTING):
    calls = []

    def transport(method, url, headers, body, timeout):
        calls.append({"method": method, "url": url, "headers": headers, "body": json.loads(body) if body else None})
        if url.endswith("/api/v1/plugins/slack"):
            reply = {"data": {"plugins": {"slack": {"rowid": "rowbu58rc"}}}}
        elif url.endswith("/api/v1/plugins/rowbu58rc/actions"):
            reply = CATALOG
        elif "/integrations" in url:
            reply = {"success": True, "data": {"flows": list(flows)}}
        elif "/embed/list-options/" in url:
            reply = {"success": True, "data": OPTIONS}
        elif url.split("?")[0].endswith("/embed/services/slack/actions"):
            reply = {"success": True, "data": listing}
        elif "/embed/services/slack/enable/" in url:
            reply = {"success": True, "data": {"script_id": "scriNEW", "webhook_url": "https://flow.sokt.io/func/scriNEW", "service": "slack", "service_id": "rowbu58rc", "auth_id": "a1"}}
        elif "/embed/enable/" in url:
            reply = {"success": True, "data": {"script_id": "scriOLD"}}
        elif url.endswith("/actions/Send_Message/options"):
            reply = {"success": True, "data": {"options": OPTIONS, "paginate": "page2", "has_more": True}}
        elif url.endswith("/triggers/New_Message/subscribe"):
            reply = {"success": True, "data": {"script_id": "scriSUB", "title": "rowtrv1", "auth_id": "a1", "inputData": {"hookUrl": "https://flow.sokt.io/func/scriSUB"}, "meta": body and json.loads(body).get("meta")}}
        elif url.endswith("/func/scriFAIL"):
            return 400, json.dumps({"success": False, "errorMsg": {"status": 404, "message": "channel_not_found", "data": {"ok": False}}})
        else:
            reply = {"success": True, "data": {"ok": True}}
        return 200, json.dumps(reply)

    return ViaSocket("o", "p", "s", transport=transport), calls


def run_body(calls):
    return next(call["body"] for call in calls if call["url"].endswith("/func/scriSLACK"))


def sent_to(calls, path):
    return next(call for call in calls if path in call["url"])


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


def test_list_actions_reads_the_listing_once_with_the_users_token():
    viasocket, calls = make_client()
    listing = viasocket.list_actions("user_123", "slack")
    assert listing["app"] == "slack"
    assert listing["service_id"] == "rowbu58rc"
    assert [a["key"] for a in listing["actions"]] == ["Send_Message", "New_Message"]
    assert listing["actions"][0]["versions"][0]["action_version_id"] == "rowver1"
    assert viasocket.service_id_of("user_456", "slack") == "rowbu58rc"
    assert viasocket.list_actions("user_123", "slack", type="action")["actions"]
    listing_calls = [call for call in calls if "/embed/services/slack/actions" in call["url"]]
    assert [call["url"].split("/embed")[1] for call in listing_calls] == ["/services/slack/actions", "/services/slack/actions?type=action"]
    assert listing_calls[0]["method"] == "GET"
    assert listing_calls[0]["headers"]["authorization"] == viasocket.token_for("user_123")


def test_enable_takes_a_slug_or_a_service_id():
    viasocket, calls = make_client()
    assert viasocket.enable("user_123", "slack", "a1")["webhook_url"] == "https://flow.sokt.io/func/scriNEW"
    assert viasocket.enable("user_123", "rowbu58rc", "a1") == {"script_id": "scriOLD"}
    new, old = (call for call in calls if "enable" in call["url"])
    assert new["url"].endswith("/embed/services/slack/enable/a1") and new["method"] == "POST" and new["body"] == {}
    assert old["url"].endswith("/embed/enable/rowbu58rc/a1")
    assert new["headers"]["authorization"] == viasocket.token_for("user_123")


def test_find_enabled_matches_the_users_active_or_paused_flow():
    viasocket, _ = make_client([{**ENABLED_SLACK, "status": "deleted"}, {**ENABLED_SLACK, "id": "scriPAUSED", "status": "paused"}])
    assert viasocket.find_enabled("user_123", "slack") == "scriPAUSED"
    assert viasocket.find_enabled("user_123", "rowbu58rc") == "scriPAUSED"
    assert viasocket.find_enabled("user_123", "rowother") is None


def test_run_action_by_key_with_a_version_or_by_row_id():
    viasocket, calls = make_client()
    assert viasocket.run_action("scriSLACK", "Send_Message", INPUT, version="v3") == {"ok": True}
    assert run_body(calls) == {"action": "Send_Message", "version": "v3", "inputData": INPUT}
    calls.clear()
    viasocket.run_action("scriSLACK", "Send_Message")
    assert run_body(calls) == {"action": "Send_Message", "inputData": {}}
    calls.clear()
    viasocket.run_action("scriSLACK", "rowver1", INPUT)
    assert run_body(calls) == {"action_version_id": "rowver1", "inputData": INPUT}
    assert "authorization" not in calls[0]["headers"]


def test_a_failed_run_surfaces_the_apps_message():
    viasocket, _ = make_client()
    with pytest.raises(ViaSocketError, match="channel_not_found") as raised:
        viasocket.run_action("scriFAIL", "Send_Message", INPUT)
    assert raised.value.status == 400
    assert raised.value.body["errorMsg"]["status"] == 404


def test_run_code_sends_custom_code_with_an_optional_action():
    viasocket, calls = make_client()
    viasocket.run_code("scriSLACK", "return 1;", {"a": 1}, action="Send_Message", version="v3")
    assert run_body(calls) == {"custom_code": "return 1;", "inputData": {"a": 1}, "action": "Send_Message", "version": "v3"}
    calls.clear()
    viasocket.run_code("scriSLACK", "return 1;")
    assert run_body(calls) == {"custom_code": "return 1;", "inputData": {}}


def test_field_options_sends_only_what_is_given_and_reads_paging():
    viasocket, calls = make_client()
    page = viasocket.field_options("user_123", "slack", "Send_Message", "destination.channel_id", "a1", search="gen")
    assert page == {"options": OPTIONS, "paginate": "page2", "has_more": True, "message": None}
    sent = sent_to(calls, "/actions/Send_Message/options")
    assert sent["url"].endswith("/embed/services/slack/actions/Send_Message/options")
    assert sent["body"] == {"auth_id": "a1", "fieldKey": "destination.channel_id", "existingFields": {}, "search": "gen"}
    assert sent["headers"]["authorization"] == viasocket.token_for("user_123")
    calls.clear()
    viasocket.field_options("user_123", "slack", "Send_Message", "f", "a1", existing_fields={"x": 1}, version="v3", paginate="page2", custom_code="return []")
    assert sent_to(calls, "/options")["body"] == {"auth_id": "a1", "fieldKey": "f", "existingFields": {"x": 1}, "version": "v3", "paginate": "page2", "custom_code": "return []"}


def test_subscribe_takes_exactly_one_of_code_and_webhook():
    viasocket, calls = make_client()
    with pytest.raises(ViaSocketError, match="exactly one"):
        viasocket.subscribe("user_123", "slack", "New_Message", auth_id="a1")
    with pytest.raises(ViaSocketError, match="exactly one"):
        viasocket.subscribe("user_123", "slack", "New_Message", code="return 1;", webhook="https://x.example")
    result = viasocket.subscribe("user_123", "slack", "New_Message", auth_id="a1", input_data={"channel": "C1"}, webhook="https://x.example/hook", meta={"customer": "acme"})
    assert result["script_id"] == "scriSUB" and result["meta"] == {"customer": "acme"}
    sent = sent_to(calls, "/triggers/New_Message/subscribe")
    assert sent["url"].endswith("/embed/services/slack/triggers/New_Message/subscribe")
    assert sent["body"] == {"webhook": "https://x.example/hook", "auth_id": "a1", "inputData": {"channel": "C1"}, "meta": {"customer": "acme"}}
    calls.clear()
    viasocket.subscribe("user_123", "slack", "New_Message", code="return 1;", version="v1")
    assert sent_to(calls, "/subscribe")["body"] == {"code": "return 1;", "version": "v1"}


def test_agent_tools_run_on_the_script_the_user_enabled_with_their_token():
    viasocket, calls = make_client([ENABLED_SLACK])
    send, options = agent_tools(viasocket, "user_123", ["slack"], {"slack": ["send-message"]})
    assert (send.name, options.name) == ("slack_send-message", "slack_list-options")
    assert send.description == "Slack: Send a message."
    assert "slack_list-options" in send.parameters["properties"]["destination"]["properties"]["channel_id"]["description"]
    # The app is resolved through viaSocket's own listing, not plug-service; the catalog gives the schema.
    assert sent_to(calls, "/embed/services/slack/actions")["headers"]["authorization"] == viasocket.token_for("user_123")
    assert not any("recommend/services" in call["url"] for call in calls)

    assert send.invoke(INPUT) == '{"ok": true}'
    assert run_body(calls) == {"action_version_id": "rowver1", "inputData": INPUT}
    flows_call = next(call for call in calls if "/integrations" in call["url"])
    assert flows_call["headers"]["authorization"] == viasocket.token_for("user_123")


def test_actions_are_named_by_key_id_or_path():
    viasocket, _ = make_client()
    for event in ("send_message", "Send_Message", "rowact1", "send-message"):
        assert agent_tools(viasocket, "u", ["slack"], {"slack": [event]})[0].name == "slack_send-message"


def test_list_options_reads_the_users_account():
    viasocket, calls = make_client([ENABLED_SLACK])
    _, options = agent_tools(viasocket, "user_123", ["slack"])
    assert "paginate" in options.parameters["properties"]
    answer = json.loads(options.invoke({"tool": "slack_send-message", "field": "destination.channel_id", "search": "gen"}))
    assert answer == {"options": OPTIONS, "more": True, "paginate": "page2"}
    sent = sent_to(calls, "/embed/services/slack/actions/Send_Message/options")["body"]
    assert sent == {"fieldKey": "destination.channel_id", "auth_id": "a1", "existingFields": {}, "search": "gen"}
    calls.clear()
    options.invoke({"tool": "slack_send-message", "field": "destination.channel_id", "search": "gen", "paginate": "page2", "chosen": {"text": "x"}})
    assert sent_to(calls, "/options")["body"] == {"fieldKey": "destination.channel_id", "auth_id": "a1", "existingFields": {"text": "x"}, "search": "gen", "paginate": "page2"}


def test_list_options_falls_back_to_the_old_route_for_an_action_without_a_key():
    viasocket, calls = make_client([ENABLED_SLACK], listing={**LISTING, "actions": []})
    _, options = agent_tools(viasocket, "user_123", ["slack"])
    answer = json.loads(options.invoke({"tool": "slack_send-message", "field": "destination.channel_id", "search": "gen"}))
    assert answer == {"options": OPTIONS, "more": False}
    sent = sent_to(calls, "/embed/list-options/rowver1")["body"]
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


def test_adk_tools():
    pytest.importorskip("google.adk")
    import asyncio

    from viasocket.adk import viasocket_tools

    viasocket, calls = make_client([ENABLED_SLACK])
    send, _ = viasocket_tools(viasocket, "user_123", ["slack"])
    declaration = send._get_declaration()
    assert declaration.name == "slack_send-message"
    assert declaration.parameters_json_schema["required"] == ["text"]
    assert asyncio.run(send.run_async(args=INPUT, tool_context=None)) == '{"ok": true}'
    assert run_body(calls)["inputData"] == INPUT


def test_crewai_tools():
    pytest.importorskip("crewai")
    from viasocket.crewai import viasocket_tools

    viasocket, calls = make_client([ENABLED_SLACK])
    send, _ = viasocket_tools(viasocket, "user_123", ["slack"])
    assert send.name == "slack_send-message"
    assert send.run(**INPUT) == '{"ok": true}'
    assert run_body(calls)["inputData"] == INPUT


def test_a_failed_run_never_shows_the_script_id():
    # The script_id is the credential that runs actions; an error reaches the model as tool text.
    from viasocket._client import _shown_url

    viasocket = ViaSocket("o", "p", "s", transport=lambda method, url, headers, body, timeout: (502, ""))
    with pytest.raises(ViaSocketError) as error:
        viasocket.run_action("scriSECRET123", "row5dxvkb0mr", {})
    assert "scriSECRET123" not in str(error.value)
    assert "/func/<script_id>" in str(error.value)
    assert _shown_url("https://flow.sokt.io/func/scriSECRET123?x=1") == "https://flow.sokt.io/func/<script_id>?x=1"
