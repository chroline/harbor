import type { Interaction } from "../../src/lib/protocol";
export const reviewText =
  "# Update the greeting\n\n## Summary\nChange `greeting.txt` from hello to ahoy.\n\n## Steps\n1. Read the existing greeting.\n2. Update the single line.\n3. Check the result.\n\n## Verification\nConfirm that no other project files changed.";
export const planRequests: Record<string, Interaction> = Object.fromEntries(
  ["codex", "claude", "grok"].map((provider) => [
    provider,
    {
      id: 0,
      method: "session/request_permission",
      params: {
        sessionId: "wire-root",
        toolCall: {
          toolCallId: "plan-review",
          kind: "switch_mode",
          title:
            provider === "codex"
              ? "Implement this plan?"
              : provider === "claude"
                ? "Approve Plan"
                : "Approve Grok plan",
          ...(provider === "grok" ? {} : { rawInput: { plan: reviewText } }),
          ...(provider === "codex"
            ? {}
            : {
                content: [
                  {
                    type: "content",
                    content: { type: "text", text: reviewText },
                  },
                ],
              }),
        },
        options:
          provider === "codex"
            ? [
                {
                  optionId: "implement_plan",
                  kind: "allow_once",
                  name: "Yes, implement this plan",
                },
                {
                  optionId: "revise_plan",
                  kind: "reject_once",
                  name: "No, and tell Codex what to do differently",
                },
              ]
            : provider === "claude"
              ? [
                  {
                    optionId: "exit-plan-default",
                    kind: "allow_once",
                    name: "Yes, manually approve edits",
                  },
                  {
                    optionId: "exit-plan-clear-auto",
                    kind: "allow_always",
                    name: "Yes, clear context (3% used) and use auto mode",
                  },
                  {
                    optionId: "exit-plan-auto",
                    kind: "allow_always",
                    name: "Yes, and use auto mode",
                  },
                  {
                    optionId: "exit-plan-bypass",
                    kind: "allow_always",
                    name: "Yes, and bypass permissions",
                  },
                  {
                    optionId: "reject",
                    kind: "reject_once",
                    name: "No, keep planning",
                  },
                ]
              : [
                  {
                    optionId: "approved",
                    kind: "allow_once",
                    name: "Approve and implement",
                  },
                  {
                    optionId: "cancelled",
                    kind: "reject_once",
                    name: "Keep planning",
                  },
                  {
                    optionId: "abandoned",
                    kind: "reject_once",
                    name: "Leave Plan without executing",
                  },
                ],
      },
    },
  ]),
);
