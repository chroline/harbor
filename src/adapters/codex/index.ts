import icon from "@/assets/providers/codex.svg";
import { adapterDescriptors } from "@/lib/bindings/adapter-descriptors";
import type { Adapter } from "../contract";
import { controlLabel, readAcpPlan } from "../acp";
const descriptor = adapterDescriptors.codex;
export const codex = {
  id: "codex",
  descriptor,
  icon,
  controlLabel: (control) => controlLabel(descriptor, control),
  readPlan: (request) => readAcpPlan(request, descriptor.planApproval),
} satisfies Adapter<"codex">;
