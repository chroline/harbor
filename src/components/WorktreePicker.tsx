import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { popupMotionClass } from "@/lib/popup";
import { exitFallbackMs, spring } from "@/lib/springs";
import * as Popover from "@radix-ui/react-popover";
import { ArrowLeft, ChevronDown, ChevronRight, GitBranch } from "@/lib/icons";
import { SizeProvider, typeClass } from "@/lib/size-context";
import { Button } from "./ui/button";
import { InputGroup, InputField } from "./ui/input-group";
import { Dropdown } from "./ui/dropdown";
import { MenuItem } from "./ui/menu-item";
import { PickerViews } from "./ui/picker-views";
import { BaseBranchPicker } from "./BaseBranchPicker";
import { Elevated } from "@/lib/elevated";

export function WorktreePicker({
  workspaceId,
  tree,
  onTreeChange,
  branch,
  onBranchChange,
  base,
  onBaseChange,
  disabled,
}: {
  workspaceId: string;
  tree: boolean;
  onTreeChange: (value: boolean) => void;
  branch: string;
  onBranchChange: (value: string) => void;
  base: string;
  onBaseChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  if (open && !mounted) setMounted(true);
  useEffect(() => {
    if (open) return;
    const timer = setTimeout(
      () => setMounted(false),
      exitFallbackMs(spring.fast),
    );
    return () => clearTimeout(timer);
  }, [open]);
  const [view, setView] = useState<"choices" | "branch">("choices");
  return (
    <SizeProvider size="compact">
      <Popover.Root
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) setView("choices");
        }}
      >
        <Popover.Trigger asChild>
          <Button
            type="button"
            variant="ghost"
            leadingIcon={GitBranch}
            trailingIcon={ChevronDown}
            disabled={disabled}
            aria-label="Working directory"
          >
            {tree ? "New worktree" : "Current checkout"}
          </Button>
        </Popover.Trigger>
        {mounted && (
          <Popover.Portal forceMount>
            <Popover.Content
              forceMount
              asChild
              align="start"
              sideOffset={6}
              collisionPadding={12}
              aria-label="Working directory settings"
              onEscapeKeyDown={(event) => {
                if (view === "branch") {
                  event.preventDefault();
                  setView("choices");
                }
              }}
              onKeyDownCapture={(event) => {
                if (
                  event.key === "Enter" &&
                  event.target instanceof HTMLInputElement &&
                  event.target.name === "worktree-branch" &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  event.stopPropagation();
                  setOpen(false);
                }
              }}
            >
              <motion.div
                className={`worktree-picker-motion z-50 outline-none ${popupMotionClass}`}
                initial={{
                  opacity: 0,
                  y: "var(--popup-enter-y)",
                  scaleY: 0.96,
                }}
                animate={
                  open
                    ? { opacity: 1, y: 0, scaleY: 1 }
                    : { opacity: 0, y: "var(--popup-enter-y)", scaleY: 0.96 }
                }
                transition={open ? spring.fast : spring.fast.exit}
                inert={!open}
                aria-hidden={!open || undefined}
                style={{ pointerEvents: open ? undefined : "none" }}
                onAnimationComplete={() => {
                  if (!open) setMounted(false);
                }}
              >
                <Elevated
                  offset={2}
                  shadowLevel={3}
                  className="worktree-picker-menu z-50 w-[min(18rem,calc(100vw-1.5rem))] rounded-xl p-1 outline-none"
                >
                  <PickerViews
                    focusGutter
                    view={view}
                    classPrefix="worktree-picker"
                    panes={[
                      {
                        id: "choices",
                        focusSelector: '[role="menuitemradio"]',
                        content: (
                          <Dropdown
                            embedded
                            checkedIndex={tree ? 0 : 1}
                            className="w-full max-w-none"
                          >
                            <div
                              role="menu"
                              aria-label="Working directory choice"
                            >
                              <MenuItem
                                index={0}
                                label="New worktree"
                                checked={tree}
                                trailingIcon={ChevronRight}
                                onSelect={() => {
                                  onTreeChange(true);
                                  setView("branch");
                                }}
                              />
                              <MenuItem
                                index={1}
                                label="Current checkout"
                                checked={!tree}
                                onSelect={() => {
                                  onTreeChange(false);
                                  setOpen(false);
                                }}
                              />
                            </div>
                          </Dropdown>
                        ),
                      },
                      {
                        id: "branch",
                        focusSelector: "input",
                        content: (
                          <div>
                            <div className="flex h-7 items-center gap-1 border-b border-border pb-1 mb-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-compact"
                                aria-label="Back to working directory choices"
                                onClick={() => setView("choices")}
                              >
                                <ArrowLeft size={14} aria-hidden="true" />
                              </Button>
                              <span className={typeClass("body", "compact")}>
                                New worktree
                              </span>
                            </div>
                            <div className="px-2 pb-1">
                              <InputGroup className="w-full gap-1">
                                <div className="grid grid-cols-[3.25rem_minmax(0,1fr)] items-center gap-2">
                                  <span
                                    className={`${typeClass("body", "compact")} text-muted-foreground`}
                                    aria-hidden="true"
                                  >
                                    Branch
                                  </span>
                                  <InputField
                                    index={0}
                                    label="Branch name"
                                    name="worktree-branch"
                                    labelHidden
                                    value={branch}
                                    onChange={onBranchChange}
                                    placeholder="Automatic"
                                    disabled={disabled}
                                  />
                                </div>
                                <div className="grid grid-cols-[3.25rem_minmax(0,1fr)] items-center gap-2">
                                  <span
                                    className={`${typeClass("body", "compact")} text-muted-foreground`}
                                    aria-hidden="true"
                                  >
                                    Base
                                  </span>
                                  <BaseBranchPicker
                                    workspaceId={workspaceId}
                                    value={base}
                                    onValueChange={onBaseChange}
                                    disabled={disabled}
                                  />
                                </div>
                              </InputGroup>
                            </div>
                          </div>
                        ),
                      },
                    ]}
                  />
                </Elevated>
              </motion.div>
            </Popover.Content>
          </Popover.Portal>
        )}
      </Popover.Root>
    </SizeProvider>
  );
}
