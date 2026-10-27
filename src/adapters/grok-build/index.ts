import icon from "@/assets/providers/grok.svg";
import { adapterDescriptors } from "@/lib/bindings/adapter-descriptors";
import type { Adapter } from "../contract";
import { controlLabel, readAcpPlan } from "../acp";
const descriptor = adapterDescriptors.grok;
export const grokBuild = {
  id: "grok",
  descriptor,
  icon,
  controlLabel: (control) => controlLabel(descriptor, control),
  readPlan: (request) => readAcpPlan(request, descriptor.planApproval),
} satisfies Adapter<"grok">;
