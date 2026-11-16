import icon from "@/assets/providers/opencode.svg";
import { adapterDescriptors } from "@/lib/bindings/adapter-descriptors";
import type { Adapter } from "../contract";
import { controlLabel, readAcpPlan } from "../acp";
const descriptor = adapterDescriptors.opencode;
export const opencode = {
  id: "opencode",
  descriptor,
  icon,
  controlLabel: (control) => controlLabel(descriptor, control),
  readPlan: (request) => readAcpPlan(request, descriptor.planApproval),
} satisfies Adapter<"opencode">;
