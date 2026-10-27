import { expect, it } from "vitest";
import { adapters, findAdapter, getAdapter, isAdapterId, readPlan } from ".";
import type { Adapter } from "./contract";
import { readAcpPlan } from "./acp";
import { planRequests, reviewText } from "../../tests/providers/plan-reviews";

it("implements every generated adapter with correlated IDs, icons and explicit capability states", () => {
  for (const [id, adapter] of Object.entries(adapters)) {
    expect(adapter.id).toBe(id);
    expect(adapter.descriptor.id).toBe(id);
    expect(adapter.icon).toBeTruthy();
    expect(adapter.descriptor.transport).toBe("acp_v1");
    expect(adapter.descriptor.nativePlanExtension.status).toMatch(
      /implemented|unsupported|unverified/,
    );
    if (adapter.descriptor.nativePlanExtension.status !== "implemented")
      expect(adapter.descriptor.nativePlanExtension.reason).toBeTruthy();
    expect(adapter.descriptor.planApproval.status).toBe("implemented");
    expect(adapter.readPlan(planRequests[id])?.text).toBe(reviewText);
    expect(
      adapter.controlLabel({
        id: "model",
        name: "Advertised model",
        type: "select",
        currentValue: "current",
      }),
    ).toBe("Advertised model");
  }
  expect(
    getAdapter("codex").controlLabel({
      id: "mode",
      name: "Mode",
      type: "select",
      currentValue: "agent",
    }),
  ).toBe("Permissions");
  for (const id of ["custom", "", "cursor", "__proto__", "constructor"]) {
    expect(isAdapterId(id)).toBe(false);
    expect(findAdapter(id)).toBeUndefined();
  }
});
it("does not accept another adapter's plan contract or malformed wire data", () => {
  for (const [id, adapter] of Object.entries(adapters)) {
    for (const [other, request] of Object.entries(planRequests))
      if (other !== id) expect(adapter.readPlan(request)).toBeUndefined();
    const contract = adapter.descriptor.planApproval;
    if (contract.status !== "implemented")
      throw new Error("Fixture requires plan approvals");
    for (const input of [
      null,
      [],
      12,
      {
        method: "session/request_permission",
        params: {
          toolCall: { kind: "switch_mode" },
          options: [
            {
              optionId: contract.implementOptionId,
              kind: "allow_always",
              name: "Approve",
            },
          ],
        },
      },
    ])
      expect(adapter.readPlan(input)).toBeUndefined();
    expect(readPlan(planRequests[id])?.implement.id).toBe(
      contract.implementOptionId,
    );
  }
});

it("keeps unsupported and unverified plan approvals disabled", () => {
  for (const status of ["unsupported", "unverified"] as const) {
    expect(
      readAcpPlan(planRequests.codex, {
        status,
        reason: "No provider acceptance evidence",
      }),
    ).toBeUndefined();
  }
});

// tsc checks these negative assertions as part of the production build. If a
// required hook/ID check becomes optional, an unused @ts-expect-error fails tsc.
function compileTimeContract() {
  // @ts-expect-error Unregistered provider IDs cannot reach a live adapter.
  getAdapter("custom");
  // @ts-expect-error Every hook and descriptor is required.
  const incomplete: Adapter<"codex"> = { id: "codex" };
  // @ts-expect-error Descriptor and implementation IDs must match the registry key.
  const wrong: Adapter<"claude"> = getAdapter("codex");
  return [incomplete, wrong];
}
void compileTimeContract;
