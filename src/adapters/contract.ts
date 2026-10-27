import type { AdapterDescriptor } from "@/lib/bindings/AdapterDescriptor";
import type { SupportedProviderId } from "@/lib/bindings/SupportedProviderId";
import type { ConfigOption } from "@/lib/protocol";

export type PermissionKind =
  "allow_once" | "allow_always" | "reject_once" | "reject_always";
export type PlanChoice = { id: string; label: string; kind: PermissionKind };
export type PlanReview = {
  text: string;
  implement: PlanChoice;
  revise: PlanChoice;
  extra: PlanChoice[];
};

/** Every frontend adapter must supply all hooks. Metadata/capabilities are
 * generated from the Rust registry; unknown provider wire data is validated. */
export interface Adapter<Id extends SupportedProviderId = SupportedProviderId> {
  readonly id: Id;
  readonly descriptor: Omit<AdapterDescriptor, "id"> & { id: Id };
  readonly icon: string;
  controlLabel(control: ConfigOption): string;
  readPlan(request: unknown): PlanReview | undefined;
}
export type AdapterRegistry = { [Id in SupportedProviderId]: Adapter<Id> };
