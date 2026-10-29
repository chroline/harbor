import {
  ThinkingIndicator,
  ThinkingIndicatorGlyph,
} from "./ui/thinking-indicator";
import { rem } from "@/lib/units";
import { ActionList } from "./fluid";
import { TabsSubtle, TabsSubtleItem } from "./ui/tabs-subtle";
import { ScrollArea } from "./ui/scroll-area";
import { useEffect, useState, useRef, useMemo } from "react";
import { filePatches } from "@/lib/file-diff";
import { FileChange, FilePatchDiff } from "./FileDiff";
import {
  RefreshCw,
  FileCode2,
  ExternalLink,
  Columns2,
  Rows3,
  X,
} from "@/lib/icons";
import { call } from "../lib/api";
import { IconButton } from "./shared";
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
  const [text, setText] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [split, setSplit] = useState(false);
  const [busy, setBusy] = useState(false);
  const patches = useMemo(() => filePatches(data?.diff ?? ""), [data?.diff]);
  const selectedPatch = patches.find((patch) => patch.filename === file);
  const selectedFile = useRef("");
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
    selectedFile.current = path;
    setFile(path);
    setText(null);
    setPreviewError("");
    if (patches.some((patch) => patch.filename === path)) return;
    try {
      const contents = await call<string>("read_file", { sessionId, path });
      if (selectedFile.current === path) setText(contents);
    } catch (e) {
      if (selectedFile.current === path) setPreviewError(String(e));
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
            {busy ? (
              <ThinkingIndicatorGlyph size={14} />
            ) : (
              <RefreshCw size={rem(14)} />
            )}
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
          {selectedPatch ? (
            <FilePatchDiff patch={selectedPatch} split={split} />
          ) : previewError ? (
            <p className="file-change-note" role="status">
              {previewError}
            </p>
          ) : text !== null ? (
            <FileChange
              filename={file}
              before={
                data?.status.split(/[\0\n]/).includes(`?? ${file}`)
                  ? null
                  : undefined
              }
              after={text}
            />
          ) : (
            <ThinkingIndicator
              className="file-change-note"
              label="Loading file…"
            />
          )}
        </div>
      ) : data?.diff ? (
        <div className="diff-view">
          {patches.length ? (
            patches.map((patch) => (
              <FilePatchDiff key={patch.filename} patch={patch} split={split} />
            ))
          ) : (
            <pre className="review-diff-source" dir="ltr" tabIndex={0}>
              {data.diff}
            </pre>
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
