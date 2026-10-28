import { useRef, useState, type CSSProperties } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Folder, ChevronDown, Plus, Circle } from "@/lib/icons";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./ui/dialog";
import {
  DropdownMenu,
  DropdownTrigger,
  DropdownContent,
  DropdownSearch,
  DropdownLabel,
  DropdownSeparator,
  DropdownEmpty,
  DropdownSub,
  DropdownSubTrigger,
  DropdownSubContent,
} from "./ui/dropdown";
import { MenuItem } from "./ui/menu-item";
import { InputGroup, InputField } from "./ui/input-group";
import { Button } from "./ui/button";
import { Banner, BannerDescription } from "./ui/banner";
import { projectIcons, projectColors } from "./ProjectIcon";
import { SizeProvider } from "../lib/size-context";
import type { IconComponent } from "../lib/icon-context";
import type { Project } from "../lib/bindings/Project";
import type { Workspace } from "../lib/bindings/Workspace";
import { call, desktop } from "../lib/api";

const label = (value: string) =>
  value
    .split("-")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
const iconChoices = Object.entries(projectIcons).map(([value, icon]) => ({
  value,
  label: label(value),
  icon,
}));
const colorChoices = projectColors.map((value) => {
  const icon: IconComponent = (props) => (
    <Circle
      {...props}
      className={`project-color-glyph project-color-${value} ${props.className ?? ""}`}
    />
  );
  return { value, label: label(value), icon };
});
const modalType = {
  "--fs-title-compact": "1rem",
  "--lh-title-compact": "1.375rem",
  "--fs-body-compact": "0.8125rem",
  "--lh-body-compact": "1.125rem",
} as CSSProperties;

export function ProjectDialog({
  project,
  workspaces,
  onClose,
  onSaved,
}: {
  project?: Project;
  workspaces: Workspace[];
  onClose: () => void;
  onSaved: (project: Project) => Promise<void>;
}) {
  const initialWorkspace = workspaces.find(
    (w) => w.id === project?.workspaceId,
  );
  const [name, setName] = useState(project?.name ?? "");
  const [icon, setIcon] = useState(project?.icon ?? "folder");
  const [color, setColor] = useState(project?.color ?? "gray");
  const [path, setPath] = useState(initialWorkspace?.path ?? "");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const workspaceTrigger = useRef<HTMLButtonElement>(null);
  const nameField = useRef<HTMLDivElement>(null);
  const saving = useRef(false);
  const savedId = useRef(project?.id ?? null);
  const [error, setError] = useState("");
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const Icon = projectIcons[icon as keyof typeof projectIcons];
  const selected = workspaces.find((w) => w.path === path);
  const workspaceName =
    selected?.name ?? path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
  const filtered = [...workspaces]
    .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
    .filter((w) =>
      `${w.name} ${w.path}`.toLowerCase().includes(query.toLowerCase().trim()),
    );
  const browse = async () => {
    if (browsing || busy) return;
    setWorkspaceOpen(false);
    setBrowsing(true);
    setError("");
    try {
      if (!desktop)
        throw new Error("Open Harbor on your Mac to choose a local folder.");
      const result = await open({
        directory: true,
        multiple: false,
        title: "Choose a workspace folder",
      });
      if (typeof result === "string") setPath(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setBrowsing(false);
      requestAnimationFrame(() => workspaceTrigger.current?.focus());
    }
  };
  const save = async () => {
    if (saving.current || browsing || !name.trim() || !path) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      const saved = await call<Project>("save_project", {
        projectId: savedId.current,
        name: name.trim(),
        icon,
        color,
        workspacePath: path,
      });
      savedId.current = saved.id;
      await onSaved(saved);
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  return (
    <SizeProvider size="compact">
      <Dialog
        open
        onOpenChange={(value) => {
          if (!value && !busy && !browsing) onClose();
        }}
      >
        <DialogContent
          size="lg"
          className="max-w-[26.25rem] p-5 text-[length:var(--fs-body-compact)] leading-[var(--lh-body-compact)]"
          style={modalType}
          showCloseButton={!busy && !browsing}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            nameField.current?.querySelector("input")?.focus();
          }}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <DialogHeader>
              <DialogTitle>
                {project ? "Edit project" : "Create project"}
              </DialogTitle>
              <DialogDescription>
                Chats connected to a local folder.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col items-center gap-3 py-3">
                <DropdownMenu
                  open={appearanceOpen}
                  onOpenChange={setAppearanceOpen}
                >
                  <DropdownTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10"
                        aria-label="Choose project icon and color"
                        disabled={busy}
                      >
                        <Icon
                          className={`!h-7 !w-7 project-color-glyph project-color-${color}`}
                        />
                      </Button>
                    }
                  />
                  <DropdownContent
                    align="center"
                    className="w-48 [--fs-body-compact:0.8125rem] [--lh-body-compact:1.125rem]"
                  >
                    <DropdownLabel>Project appearance</DropdownLabel>
                    <DropdownSub>
                      <DropdownSubTrigger
                        index={0}
                        label={`Icon · ${label(icon)}`}
                        icon={Icon}
                      />
                      <DropdownSubContent
                        className="w-48 [--fs-body-compact:0.8125rem] [--lh-body-compact:1.125rem]"
                        checkedIndex={iconChoices.findIndex(
                          (choice) => choice.value === icon,
                        )}
                      >
                        {iconChoices.map((choice, index) => (
                          <MenuItem
                            key={choice.value}
                            index={index}
                            label={choice.label}
                            icon={choice.icon}
                            checked={icon === choice.value}
                            closeOnClick={false}
                            onSelect={() => setIcon(choice.value)}
                          />
                        ))}
                      </DropdownSubContent>
                    </DropdownSub>
                    <DropdownSub>
                      <DropdownSubTrigger
                        index={1}
                        label={`Color · ${label(color)}`}
                        icon={
                          colorChoices.find((choice) => choice.value === color)
                            ?.icon
                        }
                      />
                      <DropdownSubContent
                        className="w-48 [--fs-body-compact:0.8125rem] [--lh-body-compact:1.125rem]"
                        checkedIndex={colorChoices.findIndex(
                          (choice) => choice.value === color,
                        )}
                      >
                        {colorChoices.map((choice, index) => (
                          <MenuItem
                            key={choice.value}
                            index={index}
                            label={choice.label}
                            icon={choice.icon}
                            checked={color === choice.value}
                            closeOnClick={false}
                            onSelect={() => setColor(choice.value)}
                          />
                        ))}
                      </DropdownSubContent>
                    </DropdownSub>
                    <DropdownSeparator />
                    <MenuItem
                      index={2}
                      label="Done"
                      onSelect={() => setAppearanceOpen(false)}
                    />
                  </DropdownContent>
                </DropdownMenu>
                <InputGroup
                  ref={nameField}
                  className="w-full max-w-[15rem]"
                  style={
                    {
                      "--fs-body-compact": "1.125rem",
                      "--lh-body-compact": "1.625rem",
                    } as CSSProperties
                  }
                >
                  <InputField
                    index={0}
                    label="Project name"
                    labelHidden
                    placeholder="New Project"
                    value={name}
                    onChange={setName}
                    disabled={busy}
                    autoComplete="off"
                    className="[&>div]:h-8 [&>div]:bg-transparent [&>div]:ring-0 [&_input]:text-center [&_input:focus-visible]:underline [&_input:focus-visible]:decoration-border [&_input:focus-visible]:underline-offset-8"
                  />
                </InputGroup>
              </div>
              <div className="flex flex-col gap-1 py-2">
                <div className="flex items-center justify-between gap-4">
                  <span>Workspace</span>
                  <DropdownMenu
                    size="default"
                    open={workspaceOpen}
                    onOpenChange={setWorkspaceOpen}
                  >
                    <DropdownTrigger
                      render={
                        <Button title={path || undefined}
                          type="button"
                          variant="ghost"
                          ref={workspaceTrigger}
                          trailingIcon={ChevronDown}
                          disabled={busy || browsing}
                          aria-label="Choose workspace"
                        >
                          {browsing
                            ? "Choosing folder…"
                            : workspaceName || "Choose a folder"}
                        </Button>
                      }
                    />
                    <DropdownContent
                      align="end"
                      className="w-[min(30rem,calc(100vw-2rem))]"
                    >
                      <DropdownSearch
                        value={query}
                        onValueChange={setQuery}
                        placeholder="Search folders…"
                        aria-label="Search local folders"
                      />
                      <DropdownLabel>Recent workspaces</DropdownLabel>
                      {filtered.map((w, index) => (
                        <MenuItem title={w.path} key={w.id}
                          index={index}
                          icon={Folder}
                          label={`${w.name} — ${w.path}${w.available ? "" : " · Unavailable"}`}
                          checked={path === w.path}
                          onSelect={() => setPath(w.path)}
                        />
                      ))}
                      {!filtered.length && (
                        <DropdownEmpty>
                          {workspaces.length
                            ? "No matching folders"
                            : "No recent folders"}
                        </DropdownEmpty>
                      )}
                      <DropdownSeparator />
                      <MenuItem
                        index={filtered.length}
                        icon={Plus}
                        label="Browse folders…"
                        onSelect={() => void browse()}
                      />
                    </DropdownContent>
                  </DropdownMenu>
                </div>
                {path && (
                  <span className="text-xs text-muted-foreground break-all text-right">
                    {path}
                    {selected && !selected.available && " · Unavailable"}
                  </span>
                )}
              </div>
              {project && (
                <p className="text-muted-foreground">
                  Workspace changes apply to new chats. Existing chats keep
                  their working folder.
                </p>
              )}
              {error && (
                <Banner status="error" size="compact">
                  <BannerDescription>{error}</BannerDescription>
                </Banner>
              )}
            </div>
            <DialogFooter className="-mx-5 -mb-5 mt-4 border-t-[0.0625rem] border-border px-5 py-3">
              <Button
                type="button"
                variant="ghost"
                disabled={busy || browsing}
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                loading={busy}
                disabled={busy || browsing || !name.trim() || !path}
              >
                {busy ? "Saving…" : project ? "Save changes" : "Create project"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </SizeProvider>
  );
}
