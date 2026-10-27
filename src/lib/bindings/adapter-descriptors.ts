// Generated from Rust adapters::descriptors(); do not edit.
import type { AdapterDescriptor } from './AdapterDescriptor';
import type { SupportedProviderId } from './SupportedProviderId';
export const adapterDescriptors = {
  "claude": {
    "args": [],
    "color": "peach",
    "command": "claude-agent-acp",
    "controlLabels": [],
    "id": "claude",
    "installHint": "npm install -g @agentclientprotocol/claude-agent-acp@0.97.0",
    "name": "Claude Code",
    "nativeCommand": "claude",
    "nativeHandoff": {
      "reason": "Claude Code native handoff is unverified: the tested CLI did not complete the ACP-to-terminal-to-ACP acceptance check. Continue in Chat or use a separate shell tab.",
      "status": "unsupported"
    },
    "nativePlanExtension": {
      "reason": "Uses advertised ACP modes and approvals; no native plan extension required",
      "status": "unsupported"
    },
    "planApproval": {
      "implementOptionId": "exit-plan-default",
      "reviseOptionId": "reject",
      "status": "implemented"
    },
    "transport": "acp_v1",
    "workers": {
      "instructions": "Use Claude SendMessage or Agent resume with the existing worker ID.",
      "kind": "parent_relay"
    }
  },
  "codex": {
    "args": [],
    "color": "mint",
    "command": "codex-acp",
    "controlLabels": [
      {
        "id": "mode",
        "label": "Permissions"
      }
    ],
    "id": "codex",
    "installHint": "npm install -g @agentclientprotocol/codex-acp@2.3.0",
    "name": "OpenAI Codex",
    "nativeCommand": "codex",
    "nativeHandoff": {
      "reason": "Only exact provider/version round trips in this adapter may enable handoff",
      "status": "unverified"
    },
    "nativePlanExtension": {
      "reason": "Uses advertised ACP modes and approvals; no native plan extension required",
      "status": "unsupported"
    },
    "planApproval": {
      "implementOptionId": "implement_plan",
      "reviseOptionId": "revise_plan",
      "status": "implemented"
    },
    "transport": "acp_v1",
    "workers": {
      "instructions": "Use Codex send_message/followup_task with the existing worker ID.",
      "kind": "parent_relay"
    }
  },
  "grok": {
    "args": [
      "--no-auto-update",
      "agent",
      "stdio"
    ],
    "color": "sand",
    "command": "grok",
    "controlLabels": [],
    "id": "grok",
    "installHint": "Install Grok Build: curl -fsSL https://x.ai/cli/install.sh | bash; then run grok login",
    "name": "Grok Build",
    "nativeCommand": "grok",
    "nativeHandoff": {
      "reason": "Only exact provider/version round trips in this adapter may enable handoff",
      "status": "unverified"
    },
    "nativePlanExtension": {
      "status": "implemented"
    },
    "planApproval": {
      "implementOptionId": "approved",
      "reviseOptionId": "cancelled",
      "status": "implemented"
    },
    "transport": "acp_v1",
    "workers": {
      "kind": "direct_attachment"
    }
  }
} satisfies { [Id in SupportedProviderId]: AdapterDescriptor & { id: Id } };
