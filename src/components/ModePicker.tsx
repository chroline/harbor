import { ChevronDown } from "@/lib/icons";
import {
  DropdownMenu,
  DropdownTrigger,
  DropdownContent,
  DropdownLabel,
} from "./ui/dropdown";
import { MenuItem } from "./ui/menu-item";
import { SpinnerIcon } from "./shared";
import { Button } from "./ui/button";
import { Tooltip } from "./ui/tooltip";
import { chatMode, type ChatMode } from "../lib/chat-mode";
import { useStore } from "../lib/store";
import type { SessionRecord } from "../lib/bindings/SessionRecord";
import type { useProviderConfig } from "../lib/provider-config";

export type ModePickerProps = {
  mode?: ChatMode;
  selected?: string;
  nextTurn?: boolean;
  busy?: boolean;
  disabled?: boolean;
  error?: string;
  onChange: (value: string) => void;
  onRetry?: () => void;
  onCancel?: () => void;
};

export function ModePicker({
  mode,
  selected,
  nextTurn,
  busy,
  disabled,
  error,
  onChange,
  onRetry,
  onCancel,
}: ModePickerProps) {
  if (!mode) return null;
  const value = selected ?? mode.current;
  const label = mode.choices.find((c) => c.value === value)?.name ?? value;
  const current =
    mode.choices.find((c) => c.value === mode.current)?.name ?? mode.current;
  return (
    <DropdownMenu disabled={disabled}>
      <Tooltip
        content={`Switch mode · Shift+Tab${nextTurn ? ` · Current mode: ${current}` : ""}`}
      >
        <DropdownTrigger
          render={
            <Button
              variant="ghost"
              className="mode-picker-trigger"
              trailingIcon={busy ? SpinnerIcon : ChevronDown}
              disabled={disabled}
              aria-label={`Mode: ${label}${nextTurn ? " (next turn)" : ""}`}
            >
              <span aria-live="polite">
                {label}
                {nextTurn && (
                  <span className="mode-picker-pending"> · next turn</span>
                )}
              </span>
            </Button>
          }
        />
      </Tooltip>
      <DropdownContent
        className="mode-picker-menu"
        align="end"
        checkedIndex={mode.choices.findIndex(
          (choice) => choice.value === value,
        )}
      >
        <DropdownLabel className="mode-picker-heading">
          Mode <kbd>Shift+Tab</kbd>
        </DropdownLabel>
        {mode.choices.map((choice, index) => (
          <MenuItem
            key={choice.value}
            index={index}
            label={choice.name}
            checked={choice.value === value}
            title={choice.description}
            onSelect={() => onChange(choice.value)}
          />
        ))}
        {error && (
          <div className="mode-picker-error" role="alert">
            {error}
          </div>
        )}
        {error && onRetry && (
          <MenuItem
            index={mode.choices.length}
            label="Retry change"
            onSelect={onRetry}
          />
        )}
        {(error || nextTurn) && onCancel && (
          <MenuItem
            index={mode.choices.length + (error && onRetry ? 1 : 0)}
            label="Cancel change"
            disabled={busy}
            onSelect={onCancel}
          />
        )}
      </DropdownContent>
    </DropdownMenu>
  );
}

export function discoveryMode(
  state: ReturnType<typeof useProviderConfig>,
  disabled = false,
): ModePickerProps {
  const mode = chatMode(state.config?.configOptions, state.config?.modes);
  return {
    mode,
    selected: mode
      ? (state.pending?.[mode.configId] as string | undefined)
      : undefined,
    busy: state.busy,
    disabled: disabled || state.preview,
    error: state.error,
    onChange: (value) => {
      if (mode) state.set(mode.configId, value);
    },
    onRetry: state.retry,
    onCancel: state.cancel,
  };
}

export function useSessionMode(
  session?: SessionRecord,
  disabled = false,
): ModePickerProps {
  const { configuration } = useStore();
  const state = session ? configuration.get(session.id) : undefined;
  const mode = session
    ? chatMode(session.configOptions, session.modes)
    : undefined;
  const pending = state?.pending.find((p) => p.id === mode?.configId);
  return {
    mode,
    selected: pending?.value as string | undefined,
    nextTurn:
      !!pending &&
      !!session &&
      ["working", "needs_input"].includes(session.status),
    busy: state?.busy,
    error: state?.error,
    disabled:
      disabled ||
      !session ||
      session.mode !== "gui" ||
      !["idle", "completed", "working", "needs_input"].includes(session.status),
    onChange: (value) => {
      if (session && mode) configuration.select(session, mode.configId, value);
    },
    onRetry: () => {
      if (session) configuration.retry(session.id);
    },
    onCancel: () => {
      if (session) configuration.cancel(session.id);
    },
  };
}
