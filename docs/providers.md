# provider compatibility

[← Harbor](../README.md)

## tested providers

live smoke tests were run on this Mac on October 8, 2026, with worker continuation checks expanded on October 14, 2026, using existing logins and isolated test repositories. model names come from the provider, never a hardcoded catalog.

| provider | tested ACP entry point | live prompt | model / reasoning | worker telemetry | native CLI handoff |
| --- | --- | --- | --- | --- | --- |
| Codex | `@agentclientprotocol/codex-acp@2.1.1` | passed | dynamic controls | passed: real child, parent ownership, transcript, completion, existing-worker follow-up through parent relay | passed with `codex-cli 0.154.0` |
| Claude Code | `@agentclientprotocol/claude-agent-acp@0.88.0` | passed | dynamic model and effort | passed: existing-worker follow-up and delayed completion through parent relay | disabled: unverified |
| Cursor | `agent acp`, CLI `2026.08.11-e8db854` | passed | model variants include effort; no separate effort control advertised | passed: worker extension requests, existing-worker follow-up through parent relay | disabled: unverified |
| Pi | `pi-acp@0.0.34`, Pi `0.84.2` | passed | dynamic model and thinking level | passed: pi-subagents workflow identities and existing-worker resume through parent relay | disabled: unverified |
| OpenCode | `opencode acp`, `1.18.31` | passed | dynamic model, effort, mode | passed: task receipt identity, direct worker history and original-context recall | disabled: unverified |
| Prime Agent | `prime-agent --mode acp` | 0.9.8: live Grok 4.7 prompt passed | live model/effort round-trip passed; 0.9.4 returns no controls | passed: real Grok 4.7 child, existing history, direct UI follow-up with original-context recall | disabled: unverified |
| Grok Build | `grok --no-auto-update agent stdio`, CLI `1.0.30` | passed October 14, 2026 | live model switch and restore passed; no separate reasoning control advertised | passed: real child identity, history, direct worker-composer follow-up with original-context recall | disabled: unverified |
| custom | user-specified ACP command | depends on executable | discovered on connection | depends on advertised protocol/extensions | disabled |

install the adapter versions above through your preferred package manager, or point settings at a locally installed copy. for example, a project-local npm installation exposes `node_modules/.bin/codex-acp`; no global install is required.

Grok Build is a bundled provider with its own model discovery, configuration, and saved chats. install it with the [official installer](https://docs.x.ai/build/overview), then run `grok login` in your terminal. Harbor reuses the existing CLI authentication. its [ACP entry point](https://docs.x.ai/build/cli/headless-scripting) uses `--no-auto-update` to avoid background updates during managed sessions. models come from Grok's advertised catalog. Grok Build workers load their existing ACP sessions directly; backend and packaged UI follow-ups verified retained child context. native terminal handoff remains unverified.

Codex handoff is enabled only when both executable version checks match the tested pair. it is checked again before switching. the ACP session identifier is also the verified native session identifier for this pair. unsupported versions remain disabled. **finish or cancel the turn before entering terminal. exit the native CLI with `/exit`, then select chat to reload the same history.** returning while the CLI is running is refused. no replacement conversation is silently created.

## worker verification

on October 14, 2026, actual worker-composer exchanges were verified in the packaged Harbor UI for six agents: Prime, Codex, Claude, Cursor, Pi, and OpenCode. Prime Agent 0.9.8 with Grok 4.7 spawned `sub-864b927e`; its worker history loaded and a fresh message returned `HARBOR_CHILD_ORIGIN_713 HARBOR_UI_REPLY_9472`. the original marker was omitted from the follow-up, demonstrating retained context. see the [six-provider verification record](subagent-verification.md) for tested routes and remaining provider limitations. Cursor answered a practical follow-up after declining synthetic marker prompts. separate live backend context-retention checks passed for all six providers. frontend regression coverage includes bundled and custom provider entries; arbitrary custom ACP executables remain provider-dependent.

## Prime compatibility

version 0.9.8 exposes standard ACP model and reasoning configuration; 0.9.4 does not return those controls. Harbor preserves Prime’s opaque JSON model ids, refreshes dependent reasoning choices, and reports the connected version when controls are absent. configuration discovery reuses a session for subsequent changes and closes it on shutdown or replacement when the agent advertises `session/close`. if an older Prime daemon has busy sessions, a newer executable refuses to replace it. a dedicated `--daemon-socket <path>` can keep Harbor’s Prime service separate while using the existing local authentication. the live configuration test uses `HARBOR_SMOKE_CONNECT_ONLY=1 HARBOR_SMOKE_CONFIG_ROUNDTRIP=1` and restores the original model/effort afterward. it submits no prompt.

see [development](development.md#verification-limits) for the remaining live acceptance limits.
