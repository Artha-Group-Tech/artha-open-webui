"""Host-only attestation for personal DFS connectors. Never sourced from model arguments."""

import base64
import hashlib
import hmac
import json
import os
import time

from fastapi import HTTPException

HEADER = 'X-Artha-Connector-Context'
BROKER_TOOLS = frozenset(
    {
        'search_connected_tools',
        'describe_connected_tool',
        'call_connected_tool',
        'get_connected_tool_operation',
    }
)


def is_personal_broker_request(request):
    if request is None or request.method != 'POST':
        return False
    try:
        rpc = json.loads(request.content)
        return (
            isinstance(rpc, dict)
            and rpc.get('method') == 'tools/call'
            and isinstance(rpc.get('params'), dict)
            and rpc['params'].get('name') in BROKER_TOOLS
        )
    except (ValueError, TypeError, AttributeError):
        return False


def is_artha_connector_destination(url):
    expected = os.environ.get('ARTHA_CONNECTOR_MCP_URL', '').strip()
    # Exact matching is deliberate: no credential/context forwarding to aliases or redirects.
    return bool(expected and url == expected and expected.startswith('https://'))


def strip_connector_headers(headers):
    return {key: value for key, value in headers.items() if key.lower() != HEADER.lower()}


async def connector_context_headers(url, headers, user, metadata, request=None):
    headers = strip_connector_headers(headers)
    if not is_artha_connector_destination(url) or not is_personal_broker_request(request):
        return headers
    key = os.environ.get('PERSONAL_MCP_CHEWIE_CONTEXT_KEY', '')
    # An unconfigured deployment preserves ordinary Artha and Office365 behavior.
    if not key:
        return headers
    if len(key.encode()) < 32:
        raise HTTPException(503, 'Personal connector signing key is not configured securely')
    if any(metadata.get(field) for field in ('internal', 'automation_id', 'parent_chat_id', 'subagent_id')):
        return headers
    from open_webui.utils.chat_id import is_saved_chat_id

    chat_id, message_id = metadata.get('chat_id'), metadata.get('message_id')
    source_hint = metadata.get('user_message_id')
    if not is_saved_chat_id(chat_id) or not (message_id or source_hint) or not getattr(user, 'email', None):
        return headers
    authorization = next((value for name, value in headers.items() if name.lower() == 'authorization'), '')
    scheme, _, token = authorization.partition(' ')
    if scheme.lower() != 'bearer' or not token.strip():
        return headers
    from open_webui.models.chats import Chats

    # This transaction shares the chat lock with snapshot creation, preventing a share/sign race.
    source_id = await Chats.claim_personal_connector_chat(chat_id, user.id, message_id, user_message_id=source_hint)
    if not isinstance(source_id, str) or not source_id:
        return headers
    now = int(time.time())
    payload = {
        'v': 1,
        'aud': 'artha-personal-mcp',
        'channel': 'chewie',
        'identity_mode': 'per-requester',
        'session_kind': 'interactive',
        'user_id': user.email.strip().lower(),
        'conversation_id': chat_id,
        'message_id': source_id,
        'request_id': source_id,
        'chat_kind': 'private',
        'token_sha256': hashlib.sha256(token.strip().encode()).hexdigest(),
        'iat': now,
        'exp': now + 60,
    }
    encoded = (
        base64.urlsafe_b64encode(json.dumps(payload, sort_keys=True, separators=(',', ':')).encode())
        .rstrip(b'=')
        .decode()
    )
    signature = hmac.new(key.encode(), encoded.encode(), hashlib.sha256).hexdigest()
    return {**headers, HEADER: f'{encoded}.{signature}'}
