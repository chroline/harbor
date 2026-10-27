// Generated from Rust adapters::providers(); do not edit.
import type { ProviderDefinition } from './ProviderDefinition';
import type { SupportedProviderId } from './SupportedProviderId';
export const supportedProviders = [
  {
    "id": "codex",
    "name": "OpenAI Codex",
    "command": "codex-acp",
    "args": [],
    "nativeCommand": "codex",
    "installHint": "npm install -g @agentclientprotocol/codex-acp@2.3.0",
    "color": "mint"
  },
  {
    "id": "claude",
    "name": "Claude Code",
    "command": "claude-agent-acp",
    "args": [],
    "nativeCommand": "claude",
    "installHint": "npm install -g @agentclientprotocol/claude-agent-acp@0.97.0",
    "color": "peach"
  },
  {
    "id": "grok",
    "name": "Grok Build",
    "command": "grok",
    "args": [
      "--no-auto-update",
      "agent",
      "stdio"
    ],
    "nativeCommand": "grok",
    "installHint": "Install Grok Build: curl -fsSL https://x.ai/cli/install.sh | bash; then run grok login",
    "color": "sand"
  }
] satisfies (ProviderDefinition & { id: SupportedProviderId })[];
