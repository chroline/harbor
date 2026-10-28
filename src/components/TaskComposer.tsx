import { CommandEditor } from "./CommandEditor";
import type { CommandCatalog } from "../lib/command-catalog";
import { rem } from "@/lib/units";
import { SizeProvider } from "@/lib/size-context";
import { useState, type ReactNode } from "react";
import { ArrowUp, Paperclip, Square } from "@/lib/icons";
import { validateAttachments } from "../lib/attachments";
import { InputMessage, type InputMessageProps } from "./ui/input-message";
import { Button } from "./ui/button";
import { Tooltip } from "./ui/tooltip";
import { ModePicker, type ModePickerProps } from "./ModePicker";
import { nextMode } from "../lib/chat-mode";

type TaskComposerProps = Pick<
  InputMessageProps,
  | "value"
  | "onValueChange"
  | "placeholder"
  | "disabled"
  | "textareaProps"
  | "files"
  | "onFilesChange"
> & {
  catalog?: CommandCatalog;
  context?: ReactNode;
  modelMenu: ReactNode;
  modePicker?: ModePickerProps;
  configurationAction?: ReactNode;
  onSubmit: (intent?: "send" | "steer") => void;
  actionLabel: string;
  actionDisabled?: boolean;
  busy?: boolean;
  onStop?: () => void;
};

/** Shared input, context, model picker, and action layout for every conversation entry point. */
export function TaskComposer({
  catalog,
  context,
  modelMenu,
  modePicker,
  configurationAction,
  onSubmit,
  actionLabel,
  actionDisabled,
  busy,
  onStop,
  files,
  onFilesChange,
  ...input
}: TaskComposerProps) {
  const [fileError, setFileError] = useState<string | null>(null);
  const showStopOnly =
    !!onStop && ((!input.value.trim() && !files?.length) || !!actionDisabled);
  const label = showStopOnly ? "Stop response" : actionLabel;
  return (
    <div className="task-composer-layout" aria-busy={busy || undefined}>
      <SizeProvider size="compact">
        {context && (
          <div className="task-composer-context">
            <div className="task-location">{context}</div>
          </div>
        )}
      </SizeProvider>
      <InputMessage
        {...input}
        files={files}
        accept=""
        filePreviewSize={80}
        onFilesChange={
          onFilesChange
            ? (next) => {
                if (busy || input.disabled) return;
                try {
                  validateAttachments(next);
                  setFileError(null);
                  onFilesChange(next);
                } catch (error) {
                  setFileError(
                    String(error instanceof Error ? error.message : error),
                  );
                }
              }
            : undefined
        }
        editor={
          <CommandEditor
            {...input}
            catalog={catalog}
            onSubmit={(intent) => {
              if (
                !input.disabled &&
                !input.textareaProps?.readOnly &&
                !actionDisabled &&
                !busy
              )
                onSubmit(intent);
            }}
          />
        }
        className="task-composer"
        size="default"
        minRows={2}
        onKeyDownCapture={(e) => {
          if (
            e.target instanceof HTMLElement &&
            (e.target instanceof HTMLTextAreaElement ||
              e.target.isContentEditable ||
              e.target.getAttribute("role") === "textbox") &&
            e.key === "Tab" &&
            e.shiftKey &&
            !e.metaKey &&
            !e.ctrlKey &&
            !e.altKey &&
            !e.nativeEvent.isComposing &&
            !input.disabled &&
            !modePicker?.disabled &&
            modePicker?.mode &&
            modePicker.mode.choices.length > 1
          ) {
            e.preventDefault();
            e.stopPropagation();
            if (!e.repeat)
              modePicker.onChange(
                nextMode(modePicker.mode, modePicker.selected)!,
              );
          }
        }}
        onSend={() => {
          if (!input.disabled && !actionDisabled && !busy) onSubmit();
        }}
        leftSlot={({ openFilePicker }) => (
          <SizeProvider size="compact">
            <div className="task-composer-model">
              {onFilesChange && (
                <Tooltip content="Attach files">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-compact"
                    aria-label="Attach files"
                    disabled={
                      input.disabled || busy || input.textareaProps?.readOnly
                    }
                    onClick={() => openFilePicker()}
                  >
                    <Paperclip size={rem(14)} />
                  </Button>
                </Tooltip>
              )}
              {modelMenu}
              {modePicker && <ModePicker {...modePicker} />}
            </div>
          </SizeProvider>
        )}
        sendControl={
          <div className="task-composer-actions">
            {onStop && !showStopOnly && (
              <>
                <span className="task-composer-steer-hint">⌘↵ to steer</span>
                <Tooltip content="Stop response and pause queue">
                  <Button
                    size="icon-compact"
                    variant="ghost"
                    aria-label="Stop response"
                    disabled={input.disabled}
                    onClick={onStop}
                  >
                    <Square size={rem(12)} />
                  </Button>
                </Tooltip>
              </>
            )}
            <Tooltip content={label}>
              <Button
                className="task-composer-action"
                size="icon-compact"
                aria-label={label}
                aria-busy={busy || undefined}
                disabled={
                  showStopOnly
                    ? input.disabled
                    : input.disabled || actionDisabled || busy
                }
                loading={busy}
                onClick={() => (showStopOnly ? onStop?.() : onSubmit("send"))}
              >
                {showStopOnly ? (
                  <Square size={rem(12)} />
                ) : (
                  <ArrowUp size={rem(14)} />
                )}
              </Button>
            </Tooltip>
          </div>
        }
      />
      {fileError && (
        <div className="composer-configuration-error" role="alert">
          {fileError}
        </div>
      )}
      {/* Keep a configuration dialog mounted when saving clears the error. */}
      {(modePicker?.error || configurationAction) && (
        <div
          className="composer-configuration-error"
          role={modePicker?.error ? "alert" : undefined}
          style={modePicker?.error ? undefined : { display: "none" }}
        >
          <span>{modePicker?.error}</span>
          {configurationAction}
          {modePicker?.onRetry && (
            <Button
              variant="ghost"
              size="sm"
              disabled={modePicker.busy || modePicker.disabled}
              onClick={modePicker.onRetry}
            >
              Retry change
            </Button>
          )}
          {modePicker?.onCancel && (
            <Button
              variant="ghost"
              size="sm"
              disabled={modePicker.busy}
              onClick={modePicker.onCancel}
            >
              Cancel change
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
