# Personal DFS MCP transport

Set `ARTHA_CONNECTOR_MCP_URL` to the exact HTTPS Artha MCP endpoint and
`PERSONAL_MCP_CHEWIE_CONTEXT_KEY` to a dedicated random secret of at least 32 bytes.
Configure the same key in the DFS backend. Keep this key in host-only environment
configuration, never in tool connection headers, assistant prompts, or browser settings.
Run the normal Alembic migrations before starting this version.

The Artha production deployment injects the exact MCP URL and reads the key from
the `production` GitHub Environment secret `PERSONAL_MCP_CHEWIE_CONTEXT_KEY`.
Configure the same high-entropy secret in the DFS production environment before
deploying either service; both production workflows reject missing or undersized keys.

Only the exact configured destination receives `X-Artha-Connector-Context`. Each
outgoing HTTP request resolves the current OAuth bearer. Only `tools/call` requests
for the four personal connector broker tools and Microsoft 365 tools (email,
calendar, transcripts and Outlook workflows) are attested; initialization, discovery,
and ordinary DFS tools never lock a chat. These requests check the saved chat and
message ownership, checks that the chat is not shared/internal/timed, atomically
marks the chat private, and signs a 60-second attestation bound to that bearer.
Redirects and token-rotation replay are disabled for this destination. The signed
payload uses canonical authenticated email as `user_id`, `channel=chewie`,
`identity_mode=per-requester`, `session_kind=interactive`, and `chat_kind=private`.
The wire format is base64url compact sorted JSON, a period, and hex HMAC-SHA256
of the encoded payload. The persisted inbound user message ID is also the stable request ID.
The assistant output ID is never signed: when no explicit user source is available,
the backend walks its saved parent chain to an owned user message. Regenerated
assistant outputs therefore share one operation deduplication source.

Generic MCP authentication continues without a connector attestation when host
configuration is absent or a conversation is ineligible. DFS fails closed for
personal connector and Chewie Microsoft 365 tools without a valid attestation.
Microsoft 365 uses the same host-only signing key and envelope, independently of
the Personal MCP feature toggle. DFS verifies the attested email against the
authenticated MCP caller, then applies live mailbox ownership, action permissions
and Microsoft consent checks. OpenClaw retains its existing gateway-context path.
The immutable chat column prevents later built-in sharing even if metadata changes.
