import { isAdapterId, DEFAULT_ADAPTER_ID } from "../adapters";
import type { SupportedProviderId } from "./bindings/SupportedProviderId";
export function isSupportedProvider(id: string): id is SupportedProviderId {
  return isAdapterId(id);
}
export function supportedProviderId(id: string): SupportedProviderId {
  if (!isSupportedProvider(id)) throw new Error(`Unsupported provider: ${id}`);
  return id;
}
export function defaultProvider(id?: string): SupportedProviderId {
  return id && isSupportedProvider(id) ? id : DEFAULT_ADAPTER_ID;
}
