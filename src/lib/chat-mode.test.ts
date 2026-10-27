import { expect, it } from "vitest";
import { chatMode, nextMode } from "./chat-mode";

export const codexModes = [
  {
    id: "collaboration_mode",
    category: "collaboration_mode",
    type: "select",
    name: "Collaboration mode",
    currentValue: "default",
    options: [
      { value: "default", name: "Default" },
      { value: "plan", name: "Plan" },
    ],
  },
];
export const claudeModes = [
  {
    id: "mode",
    category: "mode",
    type: "select",
    name: "Mode",
    currentValue: "default",
    options: ["default", "plan", "acceptEdits"].map((value) => ({
      value,
      name: value[0].toUpperCase() + value.slice(1),
    })),
  },
];

it("recognizes advertised session modes and cycles provider-defined agents", () => {
  const choices = ["build", "plan", "review"].map((value) => ({
    value,
    name: value,
  }));
  const mode = chatMode([
    {
      id: "mode",
      category: "mode",
      type: "select",
      name: "Session Mode",
      currentValue: "build",
      options: choices,
    },
  ]);
  expect(mode).toEqual({ configId: "mode", current: "build", choices });
  expect(nextMode(mode!)).toBe("plan");
  expect(nextMode(mode!, "plan")).toBe("review");
  expect(nextMode(mode!, "review")).toBe("build");
});

it("cycles Codex collaboration and Claude modes without touching permissions or effort", () => {
  const codex = chatMode([...claudeModes, ...codexModes])!;
  expect(codex.configId).toBe("collaboration_mode");
  expect(nextMode(codex)).toBe("plan");
  expect(nextMode(codex, "plan")).toBe("default");
  const claude = chatMode(claudeModes)!;
  expect(nextMode(claude)).toBe("plan");
  expect(nextMode(claude, "plan")).toBe("acceptEdits");
  expect(nextMode(claude, "acceptEdits")).toBe("default");
  expect(chatMode(claudeModes)?.configId).toBe("mode");
});

it("prefers modern configuration and supports legacy modes regardless of provider", () => {
  const legacy = {
    currentModeId: "acceptEdits",
    availableModes: claudeModes[0].options.map((v) => ({
      id: v.value,
      name: v.name,
    })),
  };
  expect(chatMode(claudeModes, legacy)?.current).toBe("default");
  expect(chatMode([], legacy)?.configId).toBe("__legacy_mode");
  expect(chatMode([], legacy)?.current).toBe("acceptEdits");

  expect(chatMode(null, null)).toBeUndefined();
});

it("uses advertised categories with arbitrary IDs and grouped choices", () => {
  const mode = chatMode([
    {
      id: "workflow-selection-42",
      name: "Workflow",
      category: "mode",
      type: "select",
      currentValue: "inspect",
      options: [
        {
          group: "work",
          name: "Work",
          options: [
            { value: "inspect", name: "Inspect" },
            { value: "implement", name: "Implement" },
          ],
        },
      ],
    },
  ]);
  expect(mode?.configId).toBe("workflow-selection-42");
  expect(nextMode(mode!)).toBe("implement");
});

it("does not promote model, reasoning, empty, or unsupported controls to modes", () => {
  const effort = {
    id: "effort",
    category: "thought_level",
    type: "select",
    currentValue: "low",
    options: [{ value: "low", name: "Low" }],
  };
  expect(
    chatMode([effort], {
      currentModeId: "low",
      availableModes: [{ id: "low", name: "Low" }],
    }),
  ).toBeUndefined();
  expect(
    chatMode([{ ...effort, id: "mode", category: "model" }]),
  ).toBeUndefined();
  expect(
    chatMode([{ ...effort, category: "mode", options: [] }]),
  ).toBeUndefined();
  expect(
    chatMode([{ ...effort, category: "mode", type: "boolean" }]),
  ).toBeUndefined();
  expect(chatMode(null, null)).toBeUndefined();
});

it("omits modes for an unverified Grok version with only a model control", () => {
  expect(chatMode([{id:"model", category:"model", type:"select", currentValue:"grok", options:[{value:"grok",name:"Grok"}]}], null)).toBeUndefined();
});
