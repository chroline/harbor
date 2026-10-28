import { Tooltip } from "./ui/tooltip";
import { useEffect, useState, type CSSProperties } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { call } from "../lib/api";
import { useStore } from "../lib/store";
import { record, str } from "../lib/protocol";
import { WINDOW_GUTTER } from "../lib/shell-layout";
import { rem } from "../lib/units";
import { setDraftFiles } from "../lib/attachments";
import { NativeTerminal, type TerminalStatus } from "./NativeTerminal";
import { Chat } from "./Chat";
import { AppNotifications } from "./AppNotifications";
import type { PromptAttachment } from "../lib/bindings/PromptAttachment";

type DetachedTab = {
  sessionId: string;
  tabId: string;
  draft: string | null;
  attachments: PromptAttachment[];
};
export function StandaloneTab() {
  const { data, transcripts, error, setError, ready } = useStore();
  const [tab, setTab] = useState<DetachedTab | null>(null);
  const [status, setStatus] = useState<TerminalStatus | null>(null);
  const theme = str(record(data.settings).theme, "dark");
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const light = theme === "light" || (theme === "system" && !media.matches);
      document.documentElement.classList.toggle("light", light);
      document.documentElement.classList.toggle("dark", !light);
    };
    media.addEventListener("change", apply);
    void getCurrentWindow()
      .setTheme(
        theme === "system" ? null : theme === "light" ? "light" : "dark",
      )
      .then(apply)
      .catch(apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
  useEffect(() => {
    let disposed = false;
    void call<DetachedTab>("get_detached_tab")
      .then((context) => {
        if (disposed) return;
        const child = context.tabId.startsWith("worker:")
          ? context.tabId.slice(7)
          : "root";
        setDraftFiles(
          `${context.sessionId}:${child}`,
          (context.attachments ?? []).map((attachment) => {
            const bytes = Uint8Array.from(atob(attachment.data), (char) =>
              char.charCodeAt(0),
            );
            return new File([bytes], attachment.name, {
              type: attachment.mimeType,
            });
          }),
        );
        setTab(context);
      })
      .catch((error) => setError(String(error)));
    const close = (event: KeyboardEvent) => {
      if (
        (event.metaKey || (event.ctrlKey && !/Mac/.test(navigator.platform))) &&
        !event.shiftKey &&
        event.key.toLowerCase() === "w"
      ) {
        event.preventDefault();
        void getCurrentWindow()
          .close()
          .catch((error) => setError(String(error)));
      }
    };
    window.addEventListener("keydown", close);
    return () => {
      disposed = true;
      window.removeEventListener("keydown", close);
    };
  }, []);
  const session = data.sessions.find(
    (session) => session.id === tab?.sessionId,
  );
  const workerTitle = tab?.tabId.startsWith("worker:")
    ? transcripts[tab.sessionId]?.children[tab.tabId.slice(7)]?.title
    : undefined;
  const title = status?.title ?? workerTitle ?? session?.title ?? "Harbor";
  useEffect(() => {
    document.title = title;
    void getCurrentWindow()
      .setTitle(title)
      .catch(() => {});
  }, [title]);
  return (
    <div
      className="app-shell standalone-tab-window"
      style={{ "--window-gutter": rem(WINDOW_GUTTER) } as CSSProperties}
    >
      <header className="topbar standalone-titlebar" data-tauri-drag-region>
        <Tooltip content={title}><span className="standalone-title">
          {title}
        </span></Tooltip>
      </header>
      <main className="workspace-frame main-shell standalone-content">
        {tab?.tabId.startsWith("shell:") ? (
          <>
            <NativeTerminal
              sessionId={tab.tabId.slice(6)}
              visible
              onStatus={setStatus}
            />
            {status?.alive === false && (
              <div className="terminal-caption">Shell exited.</div>
            )}
          </>
        ) : tab && session ? (
          <Chat
            key={session.id}
            session={session}
            standaloneTab={tab.tabId}
            initialDraft={tab.draft ?? undefined}
          />
        ) : ready && tab ? (
          <div className="large-empty">
            This conversation is no longer available.
          </div>
        ) : null}
      </main>
      <AppNotifications
        error={error}
        onDismissError={() => setError(null)}
        sessions={[]}
        ready={ready}
        activeSessionId={tab?.sessionId}
      />
    </div>
  );
}
