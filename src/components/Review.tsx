import { rem } from "@/lib/units";
import { ActionList } from "./fluid";
import { TabsSubtle, TabsSubtleItem } from "./ui/tabs-subtle";
import { ScrollArea } from "./ui/scroll-area";
import { useEffect, useState, useRef } from "react";
import {
  RefreshCw,
  FileCode2,
  ExternalLink,
  Columns2,
  Rows3,
  X,
} from "@/lib/icons";
import { call } from "../lib/api";
import { CodeBlock, IconButton } from "./shared";
import { useStore } from "../lib/store";
type ReviewData = { diff: string; files: string[]; status: string };
export function Review({
  sessionId,
  onClose,
}: {
  sessionId: string;
  onClose: () => void;
}) {
  const { setError } = useStore();
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const query = matchMedia("(max-width: 68.75rem)");
    const focusReview = () => {
      if (query.matches)
        panel.current
          ?.querySelector<HTMLButtonElement>(
            'button[aria-label="Close review"]',
          )
          ?.focus();
    };
    focusReview();
    query.addEventListener("change", focusReview);
    return () => query.removeEventListener("change", focusReview);
  }, []);
  const [data, setData] = useState<ReviewData | null>(null);
  const [file, setFile] = useState("");
  const [text, setText] = useState("");
  const [split, setSplit] = useState(false);
  const [busy, setBusy] = useState(false);
  const refresh = async () => {
    setBusy(true);
    try {
      setData(await call<ReviewData>("get_review", { sessionId }));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void refresh();
  }, [sessionId]);
  const select = async (path: string) => {
    setFile(path);
    try {
      setText(await call<string>("read_file", { sessionId, path }));
    } catch (e) {
      setText(String(e));
    }
  };
  return (
    <aside ref={panel} className="review-pane">
      <div className="panel-heading">
        <span>
          <FileCode2 size={rem(15)} /> Changes
        </span>
        <div>
          <IconButton label="Refresh changes" onClick={() => void refresh()}>
            <RefreshCw size={rem(14)} className={busy ? "spin" : ""} />
          </IconButton>
          <TabsSubtle
            selectedIndex={split ? 1 : 0}
            onSelect={(index) => {
              setFile("");
              setSplit(index === 1);
            }}
            aria-label="Diff layout"
          >
            <TabsSubtleItem index={0} label="Unified" icon={Rows3} />
            <TabsSubtleItem index={1} label="Split" icon={Columns2} />
          </TabsSubtle>
          <IconButton label="Close review" onClick={onClose}>
            <X size={rem(14)} />
          </IconButton>
        </div>
      </div>
      <ScrollArea className="review-file-scroll">
        <ActionList
          className="review-file-list"
          items={[
            {
              id: "all",
              content: (
                <>
                  All changes <span>{data?.files.length ?? 0}</span>
                </>
              ),
              selected: !file,
              onClick: () => setFile(""),
            },
            ...(data?.files ?? []).map((path) => ({
              id: path,
              content: (
                <>
                  <FileCode2 size={rem(14)} />
                  <span>{path}</span>
                </>
              ),
              selected: file === path,
              onClick: () => void select(path),
            })),
          ]}
        />
      </ScrollArea>
      {file ? (
        <div className="file-preview">
          <div className="file-toolbar">
            <span>{file}</span>
            <IconButton
              label="Open in external editor"
              onClick={() =>
                void call("open_in_editor", { sessionId, path: file }).catch(
                  (e) => setError(String(e)),
                )
              }
            >
              <ExternalLink size={rem(14)} />
            </IconButton>
          </div>
          <CodeBlock text={text} language={language(file)} />
        </div>
      ) : data?.diff ? (
        <div className="diff-view">
          {split ? (
            <SplitDiff text={data.diff} />
          ) : (
            <CodeBlock text={data.diff} language="diff" />
          )}
        </div>
      ) : (
        <div className="empty-panel">
          <FileCode2 size={rem(28)} />
          <h3>
            {data?.files.length
              ? "New files in this worktree"
              : "A clean starting point"}
          </h3>
          <p>
            {data?.files.length
              ? "Select a file to preview its contents."
              : "File changes will appear here as your agent works."}
          </p>
        </div>
      )}
    </aside>
  );
}
function language(path: string) {
  const ext = path.split(".").at(-1);
  return (
    (
      {
        ts: "typescript",
        tsx: "typescript",
        js: "javascript",
        jsx: "javascript",
        rs: "rust",
        py: "python",
        json: "json",
        css: "css",
        html: "xml",
        md: "markdown",
        sh: "bash",
        toml: "ini",
      } as Record<string, string>
    )[ext ?? ""] ?? "text"
  );
}
function SplitDiff({ text }: { text: string }) {
  const rows: { left: string; right: string; kind: string }[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith("-") && !l.startsWith("---")) {
      const removed: string[] = [];
      const added: string[] = [];
      while (
        i < lines.length &&
        lines[i].startsWith("-") &&
        !lines[i].startsWith("---")
      )
        removed.push(lines[i++].slice(1));
      while (
        i < lines.length &&
        lines[i].startsWith("+") &&
        !lines[i].startsWith("+++")
      )
        added.push(lines[i++].slice(1));
      i--;
      for (let j = 0; j < Math.max(removed.length, added.length); j++)
        rows.push({
          left: removed[j] ?? "",
          right: added[j] ?? "",
          kind: "change",
        });
    } else if (l.startsWith("+") && !l.startsWith("+++"))
      rows.push({ left: "", right: l.slice(1), kind: "change" });
    else
      rows.push({
        left: l,
        right: l,
        kind: l.startsWith("@@") ? "hunk" : "context",
      });
  }
  return (
    <div className="split-diff">
      <div className="split-title">
        <span>Before</span>
        <span>After</span>
      </div>
      {rows.map((r, i) => (
        <div className={`split-line ${r.kind}`} key={i}>
          <code>{r.left || " "}</code>
          <code>{r.right || " "}</code>
        </div>
      ))}
    </div>
  );
}
