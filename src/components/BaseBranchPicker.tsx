import { Tooltip } from "./ui/tooltip";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { flushSync } from "react-dom";
import { ChevronDown, GitBranch } from "@/lib/icons";
import { call } from "@/lib/api";
import { rem, scaledSize } from "@/lib/units";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownTrigger,
  DropdownContent,
  DropdownSearch,
  DropdownEmpty,
} from "./ui/dropdown";
import { MenuItem } from "./ui/menu-item";

const ROW_HEIGHT = 28;
const OVERSCAN = 3;

export function BaseBranchPicker({
  workspaceId,
  value,
  onValueChange,
  disabled,
}: {
  workspaceId: string;
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<{
    workspaceId: string;
    branches: string[];
    error?: string;
  }>();
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setResult(undefined);
    void call<string[]>("list_branches", { workspaceId }).then(
      (branches) => {
        if (!cancelled) setResult({ workspaceId, branches });
      },
      (error) => {
        if (!cancelled)
          setResult({ workspaceId, branches: [], error: String(error) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [workspaceId, open, retry]);
  const current = result?.workspaceId === workspaceId ? result : undefined;
  const choices = useMemo(
    () => [...new Set(["HEAD", value || "HEAD", ...(current?.branches ?? [])])],
    [value, current],
  );
  const search = query.trim();
  const filtered = useMemo(
    () =>
      choices.filter((branch) =>
        branch.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
      ),
    [choices, search],
  );
  const custom = !!search && !choices.includes(search);
  const checkedIndex = filtered.indexOf(value || "HEAD");
  const count = filtered.length + Number(custom);
  const contentRef = useRef<HTMLDivElement>(null);
  const [list, setList] = useState<HTMLDivElement | null>(null);
  const [window, setWindow] = useState({ top: 0, height: scaledSize(480) });
  const rowHeight = scaledSize(ROW_HEIGHT);
  const start = Math.min(
    Math.max(0, count - 1),
    Math.max(0, Math.floor(window.top / rowHeight) - OVERSCAN),
  );
  const end = Math.min(
    count,
    Math.ceil((window.top + window.height) / rowHeight) + OVERSCAN,
  );

  useLayoutEffect(() => {
    const viewport = list?.closest<HTMLElement>(
      '[data-slot="scroll-area-viewport"]',
    );
    if (!viewport || !list) return;
    viewport.scrollTop = 0;
    const measure = () => {
      const next = {
        top: Math.max(0, viewport.scrollTop - list.offsetTop),
        height: viewport.clientHeight || scaledSize(480),
      };
      setWindow((previous) =>
        previous.top === next.top && previous.height === next.height
          ? previous
          : next,
      );
    };
    measure();
    viewport.addEventListener("scroll", measure);
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(list);
    return () => {
      viewport.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [list, query, workspaceId, open]);

  const keepSearchFocus = (event: PointerEvent<HTMLDivElement>) => {
    // A row leaving the pointer during filtering must not let Radix move
    // focus from the search field back to the menu's first mounted row.
    if (
      document.activeElement ===
      contentRef.current?.querySelector('[role="searchbox"]')
    ) {
      event.preventDefault();
    }
  };

  const navigate = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target as HTMLElement;
    const inSearch = target.getAttribute("role") === "searchbox";
    const row = target.closest<HTMLElement>("[data-base-branch-index]");
    if (!inSearch && !row) return;
    const index = row ? Number(row.dataset.baseBranchIndex) : -1;
    let next: number;
    if (event.key === "ArrowDown") next = inSearch ? 0 : index + 1;
    else if (event.key === "ArrowUp") next = inSearch ? count - 1 : index - 1;
    else if (!inSearch && event.key === "Home") next = 0;
    else if (!inSearch && event.key === "End") next = count - 1;
    else return;
    event.preventDefault();
    event.stopPropagation();
    const viewport = list?.closest<HTMLElement>(
      '[data-slot="scroll-area-viewport"]',
    );
    if (!viewport || !list) return;
    if (next < 0 || next >= count) {
      viewport.scrollTop = 0;
      setWindow((previous) => ({ ...previous, top: 0 }));
      contentRef.current
        ?.querySelector<HTMLElement>('[role="searchbox"]')
        ?.focus({ preventScroll: true });
      return;
    }
    const height = viewport.clientHeight || scaledSize(480);
    const top = list.offsetTop + next * rowHeight;
    // Leave room for the sticky search field when moving upward.
    const searchHeight =
      contentRef.current?.querySelector<HTMLElement>(
        '[data-slot="dropdown-search"]',
      )?.offsetHeight || rowHeight;
    if (top < viewport.scrollTop + searchHeight)
      viewport.scrollTop = Math.max(0, top - searchHeight);
    else if (top + rowHeight > viewport.scrollTop + height)
      viewport.scrollTop = top + rowHeight - height;
    // Mount the destination before moving DOM focus; Radix only knows about
    // the currently mounted rows and would stop at the edge of the window.
    flushSync(() =>
      setWindow({
        top: Math.max(0, viewport.scrollTop - list.offsetTop),
        height,
      }),
    );
    contentRef.current
      ?.querySelector<HTMLElement>(`[data-base-branch-index="${next}"]`)
      ?.focus({ preventScroll: true });
  };
  return (
    <DropdownMenu
      size="compact"
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setQuery("");
      }}
      disabled={disabled}
    >
      <DropdownTrigger
        render={
          <Button title={value || "HEAD"}
            type="button"
            variant="ghost"
            className="w-full justify-start px-2.5 min-w-0 [&>.relative]:w-full [&>.relative]:min-w-0 [&>.relative]:justify-between [&>.relative>span]:min-w-0 [&>.relative>span]:overflow-hidden"
            trailingIcon={ChevronDown}
            aria-label="Base branch or commit"
            disabled={disabled}
          >
            <span className="block min-w-0 truncate">{value || "HEAD"}</span>
          </Button>
        }
      />
      <DropdownContent
        ref={contentRef}
        onKeyDownCapture={navigate}
        className="base-branch-menu w-[min(18rem,calc(100vw-1.5rem))]"
        align="start"
        checkedIndex={checkedIndex >= 0 ? checkedIndex : undefined}
      >
        <DropdownSearch
          value={query}
          onValueChange={setQuery}
          placeholder="Search branches or enter a commit…"
          aria-label="Search base branches"
        />
        {!current && (
          <div
            role="status"
            className="px-2 py-1 text-[length:var(--fs-body-compact)] text-muted-foreground"
          >
            Loading branches…
          </div>
        )}
        {current?.error && (
          <div className="px-2 py-1">
            <Tooltip content={current.error}><span
              role="alert"
              className="text-[length:var(--fs-body-compact)] text-muted-foreground"
            >
              Couldn’t load branches.
            </span></Tooltip>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setRetry((n) => n + 1)}
            >
              Retry
            </Button>
          </div>
        )}
        <div
          ref={setList}
          className="flex shrink-0 flex-col"
          data-slot="base-branch-list"
        >
          <div
            aria-hidden="true"
            className="shrink-0"
            style={{ height: rem(start * ROW_HEIGHT) }}
          />
          {filtered.slice(start, end).map((branch, offset) => (
            <MenuItem
              key={branch}
              index={start + offset}
              data-base-branch-index={start + offset}
              aria-posinset={start + offset + 1}
              aria-setsize={count}
              icon={GitBranch}
              label={branch}
              checked={branch === (value || "HEAD")}
              onPointerLeave={keepSearchFocus}
              onSelect={() => onValueChange(branch)}
            />
          ))}
          {custom && end > filtered.length && (
            <MenuItem
              index={filtered.length}
              data-base-branch-index={filtered.length}
              aria-posinset={count}
              aria-setsize={count}
              label={`Use “${search}”`}
              onPointerLeave={keepSearchFocus}
              onSelect={() => onValueChange(search)}
            />
          )}
          <div
            aria-hidden="true"
            className="shrink-0"
            style={{ height: rem((count - end) * ROW_HEIGHT) }}
          />
        </div>
        {!filtered.length && !custom && current && !current.error && (
          <DropdownEmpty>No matching branches</DropdownEmpty>
        )}
      </DropdownContent>
    </DropdownMenu>
  );
}
