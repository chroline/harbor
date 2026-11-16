import type { Interaction } from "../../src/lib/protocol";

const options = [
  { const: "Blue", title: "Blue", description: "Calm and classic" },
  { const: "Green", title: "Green", description: "Fresh and natural" },
  { const: "Red", title: "Red", description: "Bold and energetic" },
];
export const questionRequests: Record<string, Interaction> = {
  codex: {
    id: 0,
    method: "elicitation/create",
    params: {
      mode: "form",
      sessionId: "wire-root",
      message: "Codex needs your input to continue.",
      requestedSchema: {
        type: "object",
        required: ["color"],
        properties: {
          color: {
            type: "string",
            title: "What's your favorite color?",
            description: "Color",
            oneOf: options,
            _meta: { codex: { isOther: true } },
          },
          color_note: {
            type: "string",
            title: "Additional answer or note",
            _meta: {
              _askUserQuestionCustomAnswer: true,
              codex: { questionId: "color", role: "user_note" },
            },
          },
        },
      },
    },
  },
  claude: {
    id: 0,
    method: "elicitation/create",
    params: {
      mode: "form",
      sessionId: "wire-root",
      toolCallId: "question-tool",
      message: "What's your favorite color?",
      requestedSchema: {
        type: "object",
        properties: {
          question_0: { type: "string", title: "Color", oneOf: options },
          question_0_custom: {
            type: "string",
            title: "Other",
            description: "Type your own answer, or add a note (optional).",
          },
        },
      },
    },
  },
  // ACP form emitted by the native Grok bridge, tested independently in Rust.
  grok: {
    id: 0,
    method: "elicitation/create",
    params: {
      mode: "form",
      sessionId: "wire-root",
      toolCallId: "question-tool",
      message: "What's your favorite color?",
      requestedSchema: {
        type: "object",
        properties: {
          question_0: {
            type: "string",
            title: "What's your favorite color?",
            oneOf: options,
          },
          question_0_custom: {
            type: "string",
            title: "Other",
            _meta: {
              _askUserQuestionCustomAnswer: {
                questionId: "question_0",
                isCustomAnswer: true,
              },
            },
          },
        },
      },
    },
  },
  // Captured from OpenCode 2.3.0's question tool over ACP.
  opencode: {
    id: 0,
    method: "elicitation/create",
    params: {
      mode: "form",
      sessionId: "wire-root",
      toolCallId: "question-tool",
      message: "Questions",
      requestedSchema: {
        type: "object",
        properties: {
          q0: {
            type: "string",
            title: "Color",
            description: "What's your favorite color?",
            oneOf: options,
          },
          q0_custom: {
            type: "string",
            title: "Color (other)",
            description: "Type your own answer",
          },
        },
        required: [],
      },
    },
  },
};
