import { useEffect, useState } from "react";

export const PINNED_CHATS_KEY = "harbor.pinned-chats.v1";

function readPinnedChats(): string[] {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(PINNED_CHATS_KEY) ?? "[]",
    );
    return Array.isArray(value)
      ? [...new Set(value.filter((id): id is string => typeof id === "string"))]
      : [];
  } catch {
    return [];
  }
}

export function usePinnedChats(sessionIds?: ReadonlySet<string>) {
  const [pinnedChatIds, setPinnedChatIds] = useState(readPinnedChats);
  useEffect(() => {
    if (!sessionIds) return;
    setPinnedChatIds((ids) => {
      const valid = ids.filter((id) => sessionIds.has(id));
      return valid.length === ids.length ? ids : valid;
    });
  }, [sessionIds]);
  useEffect(() => {
    try {
      localStorage.setItem(PINNED_CHATS_KEY, JSON.stringify(pinnedChatIds));
    } catch {
      /* Keep pinning usable when local storage is unavailable. */
    }
  }, [pinnedChatIds]);

  const togglePinnedChat = (id: string) => {
    setPinnedChatIds((current) =>
      current.includes(id)
        ? current.filter((pinnedId) => pinnedId !== id)
        : [...current, id],
    );
  };

  return { pinnedChatIds, togglePinnedChat };
}
