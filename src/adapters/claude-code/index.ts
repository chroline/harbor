import icon from "@/assets/providers/claude.svg";
import { adapterDescriptors } from "@/lib/bindings/adapter-descriptors";
import type { Adapter } from "../contract";
import { controlLabel, readAcpPlan } from "../acp";
const descriptor = adapterDescriptors.claude;
export const claudeCode = {
  id: "claude",
  descriptor,
  icon,
  controlLabel: (control) => controlLabel(descriptor, control),
  readPlan: (request) => readAcpPlan(request, descriptor.planApproval),
} satisfies Adapter<"claude">;
