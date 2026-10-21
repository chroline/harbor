import { useState } from "react";
import { ChevronDown, Folder, FolderOpen, SquarePen } from "@/lib/icons";
import type { Workspace } from "../lib/bindings/Workspace";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownTrigger,
  DropdownContent,
  DropdownSearch,
  DropdownLabel,
  DropdownSeparator,
  DropdownEmpty,
} from "./ui/dropdown";
import { MenuItem } from "./ui/menu-item";

export function WorkspacePicker({
  workspaces,
  value,
  onValueChange,
  onAddWorkspace,
  disabled,
  label = "Workspace for new task",
}: {
  workspaces: Workspace[];
  value: string;
  onValueChange: (id: string) => void;
  onAddWorkspace: () => void;
  disabled?: boolean;
  label?: string;
}) {
  const [query, setQuery] = useState("");
  const selected = workspaces.find((workspace) => workspace.id === value);
  const search = query.trim().toLocaleLowerCase();
  const recent = [...workspaces]
    .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
    .filter((workspace) =>
      `${workspace.name} ${workspace.path}`
        .toLocaleLowerCase()
        .includes(search),
    );
  const checkedIndex = value
    ? recent.findIndex((workspace) => workspace.id === value)
    : recent.length;
  return (
    <DropdownMenu
      size="compact"
      disabled={disabled}
      onOpenChange={() => setQuery("")}
    >
      <DropdownTrigger
        render={
          <Button
            variant="ghost"
            className="workspace-picker-trigger"
            leadingIcon={Folder}
            trailingIcon={ChevronDown}
            disabled={disabled}
            aria-label={label}
            title={selected?.path}
          >
            <span className="block truncate">
              {selected?.name ?? "No workspace"}
            </span>
          </Button>
        }
      />
      <DropdownContent
        className="workspace-picker-menu"
        align="start"
        checkedIndex={checkedIndex >= 0 ? checkedIndex : undefined}
      >
        <DropdownSearch
          value={query}
          onValueChange={setQuery}
          placeholder="Search workspaces…"
          aria-label="Search workspaces"
        />
        <DropdownLabel>Recents</DropdownLabel>
        {recent.map((workspace, index) => (
          <MenuItem
            key={workspace.id}
            index={index}
            icon={Folder}
            label={`${workspace.name}${workspace.available ? "" : " · Unavailable"}`}
            title={workspace.path}
            checked={workspace.id === value}
            onSelect={() => onValueChange(workspace.id)}
          />
        ))}
        {!recent.length && (
          <DropdownEmpty>
            {search ? "No matching workspaces" : "No recent workspaces"}
          </DropdownEmpty>
        )}
        <DropdownSeparator />
        <MenuItem
          index={recent.length}
          icon={SquarePen}
          label="No workspace"
          checked={!value}
          onSelect={() => onValueChange("")}
        />
        <DropdownSeparator />
        <MenuItem
          index={recent.length + 1}
          icon={FolderOpen}
          label="Use Existing…"
          onSelect={onAddWorkspace}
        />
      </DropdownContent>
    </DropdownMenu>
  );
}
