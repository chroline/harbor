import { Tooltip } from "./ui/tooltip";
import { rem } from "@/lib/units";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "./ui/table";
import { Tabs, TabsList, TabItem, TabPanel } from "./ui/tabs";
import { Badge } from "./ui/badge";
import { InputCopy } from "./ui/input-copy";
import { Banner, BannerDescription } from "./ui/banner";
import { useEffect, useRef, useState } from "react";
import {
  GitBranch,
  Archive,
  Folder,
  RotateCcw,
  RefreshCw,
  ArrowUpRight,
} from "@/lib/icons";
import { Button } from "./ui/button";
import { useStore } from "../lib/store";
import { call } from "../lib/api";
import { array, record, str, elapsed } from "../lib/protocol";
export function Worktrees({
  onSession,
  onNew,
}: {
  onSession: (id: string) => void;
  onNew: () => void;
}) {
  const { data, refresh, setError } = useStore();
  const [tab, setTab] = useState<"active" | "archives">("active");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadGeneration = useRef(0);
  const load = async () => {
    const generation = ++loadGeneration.current;
    setBusy(true);
    setLoadError(null);
    try {
      const lists = await Promise.all(
        data.workspaces
          .filter((w) => w.available && w.isGitRoot)
          .map(async (w) => {
            const rows = await call("list_worktrees", { workspaceId: w.id });
            return array(rows).map((v) => ({
              ...record(v),
              workspace: w.name,
            }));
          }),
      );
      if (generation !== loadGeneration.current) return;
      setRows(lists.flat());
      await refresh();
    } catch (e) {
      if (generation === loadGeneration.current)
        setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      if (generation === loadGeneration.current) setBusy(false);
    }
  };
  useEffect(() => {
    void load();
    return () => {
      loadGeneration.current++;
    };
  }, [
    data.workspaces
      .map((w) => `${w.id}:${w.name}:${w.path}:${w.available}:${w.isGitRoot}`)
      .join("|"),
  ]);
  const restore = async (id: string) => {
    setBusy(true);
    try {
      await call("restore_archive", { archiveId: id });
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const archivedChats = data.sessions.filter(
    (s) =>
      s.archived &&
      !data.archives.some((a) => a.sessionId === s.id && !a.restored),
  );
  const archives = data.archives.filter((a) => !a.restored);
  const archiveCount = archives.length + archivedChats.length;
  const projectLabel = (projectId: string | null, path: string) =>
    data.projects.find((p) => p.id === projectId)?.name ??
    path.split(/[\\/]/).filter(Boolean).at(-1) ??
    "Existing checkout";
  return (
    <Tabs
      className="worktrees-page page-width"
      value={tab}
      onValueChange={(value) => setTab(value as "active" | "archives")}
    >
      <div className="page-intro">
        <h1>Worktrees</h1>
      </div>
      <div className="section-title worktrees-toolbar">
        <TabsList aria-label="Worktree views">
          <TabItem value="active" icon={GitBranch} label="Active worktrees" />
          <TabItem value="archives" icon={Archive} label="Archives" />
        </TabsList>

        <Button
          variant="ghost"
          size="sm"
          aria-label="Refresh worktrees and archives"
          disabled={busy}
          onClick={() => void load()}
        >
          <span className="inline-flex items-center gap-2">
            <RefreshCw size={rem(14)} className={busy ? "spin" : ""} />
            <span className="worktrees-refresh-label">Refresh</span>
          </span>
        </Button>
      </div>
      <TabPanel value="active">
        {loadError && (
          <Banner status="error" className="worktrees-load-error">
            <BannerDescription>
              Couldn’t refresh worktrees. {loadError}
              {rows.length > 0 &&
                " Previously loaded worktrees are shown below."}
            </BannerDescription>
          </Banner>
        )}
        {busy && !rows.length ? (
          <div className="large-empty" role="status">
            <RefreshCw size={rem(24)} className="spin" aria-hidden="true" />
            <p>Loading worktrees…</p>
          </div>
        ) : rows.length ? (
          <div className="worktree-table-wrap">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Branch / worktree</TableHead>
                  <TableHead>Workspace</TableHead>
                  <TableHead>Ownership</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const tree = data.worktrees.find(
                    (t) => t.path === row.path && t.state === "active",
                  );
                  const chat = data.sessions.find(
                    (s) => s.worktreeId === tree?.id && !s.archived,
                  );
                  return (
                    <TableRow
                      key={`${str(row.workspace)}:${str(row.path)}`}
                    >
                      <TableCell>
                        <strong>{str(row.branch, "Detached HEAD")}</strong>
                        <InputCopy
                          value={str(row.path)}
                          label="Worktree path"
                          labelHidden
                          wrap
                          size="compact"
                        />
                      </TableCell>
                      <TableCell>{str(row.workspace)}</TableCell>
                      <TableCell>
                        <Badge>
                          {row.is_main
                            ? "Main checkout"
                            : tree
                              ? "Harbor managed"
                              : "External"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {chat && (
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={"Open " + chat.title}
                            onClick={() => onSession(chat.id)}
                          >
                            <ArrowUpRight size={rem(16)} />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : !loadError ? (
          <div className="large-empty">
            <div className="empty-icon">
              <GitBranch size={rem(30)} />
            </div>
            <p>
              Start an agent in a new worktree to keep its changes separate from
              the rest of your work.
            </p>
            <Button className="primary-button" onClick={onNew}>
              <span className="inline-flex items-center gap-2">
                Start a new task
                <ArrowUpRight size={rem(15)} />
              </span>
            </Button>
          </div>
        ) : null}
      </TabPanel>
      <TabPanel value="archives">
        {archiveCount > 0 && (
          <div className="archive-heading">
            <h2>Saved archives</h2>
            <span>
              {archiveCount} {archiveCount === 1 ? "archive" : "archives"}
            </span>
          </div>
        )}
        <div
          className={archiveCount ? "archive-list" : undefined}
          role="list"
          aria-label="Saved archives"
        >
          {archives.map((a) => (
            <div className="archive-row" role="listitem" key={a.id}>
              <Tooltip content={"Working files, ignored files, index, and Git history preserved"}><span
                className="archive-icon"
              >
                <Archive size={rem(16)} aria-hidden="true" />
              </span></Tooltip>
              <div className="archive-details">
                <Tooltip content={
                    data.sessions.find((s) => s.id === a.sessionId)?.title ??
                    a.worktree.branch
                  }><strong
                >
                  {data.sessions.find((s) => s.id === a.sessionId)?.title ??
                    a.worktree.branch}
                </strong></Tooltip>
                <p className="archive-meta">
                  <span>Worktree</span>
                  <Tooltip content={a.worktree.branch}><span className="archive-context">
                    {projectLabel(a.worktree.projectId, a.worktree.repo)} /{" "}
                    {a.worktree.branch}
                  </span></Tooltip>
                  <span className="archive-date">
                    Archived {elapsed(a.createdAt)} ago
                  </span>
                </p>
              </div>
              <Button
                className="archive-restore"
                variant="secondary"
                size="sm"
                leadingIcon={RotateCcw}
                disabled={busy}
                aria-label={"Restore worktree " + a.worktree.branch}
                onClick={() => void restore(a.id)}
              >
                Restore
              </Button>
            </div>
          ))}
          {archivedChats.map((s) => (
            <div className="archive-row" role="listitem" key={s.id}>
              <span className="archive-icon">
                <Folder size={rem(16)} aria-hidden="true" />
              </span>
              <div className="archive-details">
                <Tooltip content={s.title}><strong>{s.title}</strong></Tooltip>
                <p className="archive-meta">
                  <span>Conversation</span>
                  <Tooltip content={s.cwd}><span className="archive-context">
                    {projectLabel(s.projectId, s.cwd)}
                  </span></Tooltip>
                </p>
              </div>
              <Button
                className="archive-restore"
                size="sm"
                variant="secondary"
                leadingIcon={RotateCcw}
                aria-label={"Restore chat " + s.title}
                onClick={() =>
                  void call("restore_chat", { sessionId: s.id })
                    .then(() => refresh())
                    .catch((e) => setError(String(e)))
                }
              >
                Restore chat
              </Button>
            </div>
          ))}
        </div>
        {!archiveCount && (
          <div className="large-empty">
            <div className="empty-icon">
              <Archive size={rem(30)} />
            </div>
            <p>
              Deleting a managed worktree saves a verified archive here. Restore
              the conversation and its files whenever you need them.
            </p>
          </div>
        )}
      </TabPanel>
    </Tabs>
  );
}
