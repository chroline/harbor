import { useState } from "react";
import {
  DropdownMenu,
  DropdownTrigger,
  DropdownContent,
  DropdownLabel,
} from "./ui/dropdown";
import { MenuItem } from "./ui/menu-item";
import { TerminalSquare } from "@/lib/icons";
import { Button } from "./ui/button";
import {
  useToolProcesses,
  type ToolProcess,
} from "../hooks/use-tool-processes";
import "./background-processes.css";
export type { ToolProcess } from "../hooks/use-tool-processes";

export function BackgroundProcesses({
  sessionId,
  onOpen,
}: {
  sessionId: string;
  onOpen: (process: ToolProcess) => void;
}) {
  const [open, setOpen] = useState(false);
  const { processes, unavailable } = useToolProcesses(sessionId);
  const running = processes.filter((process) => process.exitCode === null);
  return (
    <div
      className="topbar-process-control"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownTrigger
          render={
            <Button
              variant="ghost"
              size="icon-compact"
              className="topbar-process-button"
              aria-label="Background processes"
              title={
                unavailable
                  ? "Process status unavailable"
                  : `${running.length} background processes running`
              }
            >
              <TerminalSquare aria-hidden="true" />
              {!unavailable && running.length > 0 && (
                <span className="process-count" aria-hidden="true">
                  {running.length}
                </span>
              )}
            </Button>
          }
        />
        <DropdownContent align="end" className="background-processes">
          <DropdownLabel>Background processes</DropdownLabel>
          <p className="process-menu-status" role="status">
            {unavailable
              ? "Process status unavailable"
              : running.length
                ? `${running.length} ${running.length === 1 ? "process" : "processes"} running`
                : "No background processes."}
          </p>
          {!unavailable &&
            running.map((process, index) => (
              <MenuItem
                key={process.id}
                index={index}
                icon={TerminalSquare}
                label={process.command}
                title={process.command}
                onSelect={() => {
                  onOpen(process);
                  setOpen(false);
                }}
              />
            ))}
        </DropdownContent>
      </DropdownMenu>
    </div>
  );
}
