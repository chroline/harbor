import { useSyncExternalStore } from "react";
import type { PromptAttachment } from "./bindings/PromptAttachment";

export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const MAX_ATTACHMENTS = 10;
const drafts = new Map<string, File[]>();
const listeners = new Set<() => void>();
const empty: File[] = [];
export function getDraftFiles(key: string) {
  return drafts.get(key) ?? empty;
}

export function setDraftFiles(key: string, files: File[]) {
  if (files.length) drafts.set(key, files);
  else drafts.delete(key);
  listeners.forEach((listener) => listener());
}

export function restoreDraftFiles(key: string, files: File[]) {
  if (!files.length) return;
  const fingerprint = (file: File) =>
    `${file.name}:${file.size}:${file.lastModified}`;
  const combined = new Map(
    (drafts.get(key) ?? []).map((file) => [fingerprint(file), file]),
  );
  files.forEach((file) => combined.set(fingerprint(file), file));
  setDraftFiles(key, [...combined.values()]);
}

/** Keep unsent files with their conversation when navigating between chats. */
export function useDraftFiles(key: string) {
  const files = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => drafts.get(key) ?? empty,
  );
  return [files, (next: File[]) => setDraftFiles(key, next)] as const;
}

export function validateAttachments(files: File[]) {
  if (files.length > MAX_ATTACHMENTS)
    throw new Error(`Attach up to ${MAX_ATTACHMENTS} files per message.`);
  if (
    files.reduce((bytes, file) => bytes + file.size, 0) > MAX_ATTACHMENT_BYTES
  )
    throw new Error("Attachments must total 20 MB or less per message.");
}

export async function prepareAttachments(
  files: File[],
): Promise<PromptAttachment[]> {
  validateAttachments(files);
  return Promise.all(
    files.map(
      (file) =>
        new Promise<PromptAttachment>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () =>
            reject(new Error(`Could not read ${file.name}. Attach it again.`));
          reader.onload = () =>
            resolve({
              name: file.name,
              mimeType: file.type || "application/octet-stream",
              data: String(reader.result).split(",")[1] ?? "",
            });
          reader.readAsDataURL(file);
        }),
    ),
  );
}
