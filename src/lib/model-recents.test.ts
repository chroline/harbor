import { expect, it } from "vitest";
import { workspaceRecentModels } from "./model-recents";
import type { SessionRecord } from "./bindings/SessionRecord";

const session = (
  id: string,
  workspaceId: string | null,
  providerId: string,
  model: string,
  updatedAt: number,
  extra: Partial<SessionRecord> = {},
) =>
  ({
    id,
    workspaceId,
    providerId,
    updatedAt,
    isOrchestrator: false,
    configOptions: [
      {
        id: "model",
        name: "Model",
        category: "model",
        type: "select",
        currentValue: model,
        options: [
          { value: "m1", name: "Model 1" },
          { value: "m2", name: "Model 2" },
        ],
      },
    ],
    models: null,
    ...extra,
  }) as unknown as SessionRecord;

it("lists distinct agent + model pairs per workspace, newest first", () => {
  const sessions = [
    session("a", "A", "x", "m1", 1),
    session("b", "A", "y", "m2", 3),
    session("c", "A", "x", "m1", 4),
    session("d", "B", "z", "m2", 5),
    session("e", "A", "gone", "m1", 6),
    session("f", "A", "x", "m2", 7, { isOrchestrator: true }),
  ];
  const providers = ["x", "y", "z"];
  expect(
    workspaceRecentModels(sessions, "A", providers).map((r) => [
      r.providerId,
      r.value,
      r.name,
    ]),
  ).toEqual([
    ["x", "m1", "Model 1"],
    ["y", "m2", "Model 2"],
  ]);
  expect(
    workspaceRecentModels(sessions, "B", providers).map((r) => r.providerId),
  ).toEqual(["z"]);
  expect(workspaceRecentModels(sessions, null, providers)).toEqual([]);
});

it("reads legacy model state", () => {
  const legacy = session("a", "A", "x", "", 1, {
    configOptions: [],
    models: {
      currentModelId: "old",
      availableModels: [{ modelId: "old", name: "Old Model" }],
    },
  });
  expect(workspaceRecentModels([legacy], "A", ["x"])).toEqual([
    { providerId: "x", optionId: "__legacy_model", value: "old", name: "Old Model" },
  ]);
});
