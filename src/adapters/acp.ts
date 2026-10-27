import type { PlanApprovalContract } from "@/lib/bindings/PlanApprovalContract";
import type { AdapterDescriptor } from "@/lib/bindings/AdapterDescriptor";
import type { ConfigOption } from "@/lib/protocol";
import type { PermissionKind, PlanChoice, PlanReview } from "./contract";
const kinds = {
  allow_once: true,
  allow_always: true,
  reject_once: true,
  reject_always: true,
} satisfies Record<PermissionKind, true>;
function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function choice(value: unknown): PlanChoice | undefined {
  const item = object(value);
  if (
    typeof item.optionId !== "string" ||
    typeof item.name !== "string" ||
    typeof item.kind !== "string" ||
    !Object.hasOwn(kinds, item.kind)
  )
    return;
  return {
    id: item.optionId,
    label: item.name,
    kind: item.kind as PermissionKind,
  };
}
export function controlLabel(
  descriptor: AdapterDescriptor,
  control: ConfigOption,
): string {
  return (
    descriptor.controlLabels.find((label) => label.id === control.id)?.label ??
    control.name
  );
}
/** The wire is untrusted. A provider's declared option IDs and one-shot permission
 * kinds must both match before Harbor promotes an execution action. */
export function readAcpPlan(
  request: unknown,
  contract: PlanApprovalContract,
): PlanReview | undefined {
  if (contract.status !== "implemented") return;
  const frame = object(request),
    params = object(frame.params),
    tool = object(params.toolCall);
  if (
    frame.method !== "session/request_permission" ||
    tool.kind !== "switch_mode" ||
    !Array.isArray(params.options)
  )
    return;
  const choices = params.options.map(choice);
  if (choices.some((option) => !option)) return;
  const valid = choices.filter((option): option is PlanChoice => !!option);
  const implement = valid.find(
    (option) =>
      option.id === contract.implementOptionId && option.kind === "allow_once",
  );
  const revise = valid.find(
    (option) =>
      option.id === contract.reviseOptionId && option.kind === "reject_once",
  );
  if (!implement || !revise) return;
  const input = object(tool.rawInput);
  const text =
    typeof input.plan === "string" && input.plan
      ? input.plan
      : (Array.isArray(tool.content) ? tool.content : [])
          .flatMap((item) => {
            const content = object(object(item).content);
            return content.type === "text" && typeof content.text === "string"
              ? [content.text]
              : [];
          })
          .join("\n\n");
  return {
    text,
    implement,
    revise,
    extra: valid.filter((option) => option !== implement && option !== revise),
  };
}
