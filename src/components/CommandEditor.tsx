import { ThinkingIndicator } from "./ui/thinking-indicator";
import {
  CommandMenu,
  CommandMenuList,
  CommandMenuItem,
  CommandMenuEmpty,
  useCommandMenu,
} from "./ui/command-menu";
import { Elevated } from "../lib/elevated";
import { shapeMap } from "../lib/shape-context";
import { Button } from "./ui/button";
import { Command, Cube, Gauge } from "../lib/icons";
import {
  useEffect,
  useMemo,
  useImperativeHandle,
  useSyncExternalStore,
  type RefObject,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type TextareaHTMLAttributes,
} from "react";
import * as Popover from "@radix-ui/react-popover";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createParagraphNode,
  $createRangeSelection,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  RootNode,
  type LexicalEditor,
} from "lexical";
import {
  commandLabel,
  isSkill,
  commandQuery,
  commandRanges,
  completeCommand,
  invocation,
  matchingCommands,
  type AvailableCommand,
} from "../lib/commands";
import type { CommandCatalog } from "../lib/command-catalog";

type PickerControls = { move: (direction: 1 | -1) => void; select: () => void };
type PickerState = { listId: string; activeId?: string };
/** Connect the existing Fluid palette to the Lexical field without moving focus. */
function PickerBridge({
  controls,
  onState,
}: {
  controls: RefObject<PickerControls | null>;
  onState: (state: PickerState) => void;
}) {
  const menu = useCommandMenu();
  const active = useSyncExternalStore(
    menu.highlight.subscribe,
    menu.highlight.get,
    () => null,
  );
  useImperativeHandle(
    controls,
    () => ({
      move: menu.move,
      select: () => {
        const row = menu.rows[menu.highlight.get() ?? 0];
        if (row) menu.select(row);
      },
    }),
    [menu.move, menu.rows, menu.select, menu.highlight],
  );
  useLayoutEffect(() => {
    onState({
      listId: menu.listId,
      activeId: active === null ? undefined : `${menu.listId}-${active}`,
    });
  }, [menu.listId, active, onState]);
  return null;
}

const emptyCatalog: CommandCatalog = { commands: [], status: "unavailable" };
type Props = {
  value: string;
  onValueChange: (text: string) => void;
  placeholder?: string;
  disabled?: boolean;
  textareaProps?: Omit<
    TextareaHTMLAttributes<HTMLTextAreaElement>,
    "value" | "onChange" | "onKeyDown" | "disabled" | "placeholder"
  >;
  catalog?: CommandCatalog;
  onSubmit: (intent?: "send" | "steer") => void;
};
function replaceText(editor: LexicalEditor, text: string, caret?: number) {
  editor.update(
    () => {
      const root = $getRoot();
      const node = $createTextNode(text);
      root.clear().append($createParagraphNode().append(node));
      if (caret !== undefined) node.select(caret, caret);
    },
    {
      discrete: true,
      tag:
        caret === undefined
          ? ["external-value", "history-merge"]
          : "history-push",
    },
  );
}
function Editor({
  value,
  onValueChange,
  placeholder,
  disabled,
  textareaProps,
  catalog = emptyCatalog,
  onSubmit,
}: Props) {
  const [editor] = useLexicalComposerContext();
  const wrapper = useRef<HTMLDivElement>(null);
  const pickerControls = useRef<PickerControls | null>(null);
  const [pickerState, setPickerState] = useState<PickerState>({ listId: "" });
  const [caret, setCaret] = useState<number | null>(null);
  const [focused, setFocused] = useState(false);
  const [composing, setComposing] = useState(false);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const readOnly = disabled || textareaProps?.readOnly;
  const query = caret === null ? null : commandQuery(value, caret);
  const queryKey = query ? `${query.start}:${query.query}` : "";
  const matches = useMemo(
    () => (query ? matchingCommands(catalog.commands, query.query) : []),
    [catalog.commands, query?.query],
  );
  const menuItems = useMemo(
    () =>
      matches.map((command) => ({
        value: invocation(command),
        label: commandLabel(command),
        description: command.description,
        group: isSkill(command) ? "Skills" : undefined,
        icon: isSkill(command)
          ? Cube
          : /^(status|usage)$/.test(invocation(command).slice(1))
            ? Gauge
            : Command,
      })),
    [matches],
  );
  const open =
    focused && !readOnly && !composing && !!query && dismissed !== queryKey;
  const latest = useRef({ value, onValueChange, commands: catalog.commands });
  latest.current = { value, onValueChange, commands: catalog.commands };

  useLayoutEffect(() => {
    editor.setEditable(!readOnly);
  }, [editor, readOnly]);
  useLayoutEffect(() => {
    if (
      editor.getEditorState().read(() => $getRoot().getTextContent()) !== value
    )
      replaceText(editor, value);
  }, [editor, value]);
  useEffect(
    () =>
      editor.registerUpdateListener(({ editorState, tags }) => {
        editorState.read(() => {
          const text = $getRoot().getTextContent();
          if (!tags.has("external-value") && text !== latest.current.value)
            latest.current.onValueChange(text);
          const selection = $getSelection();
          if ($isRangeSelection(selection) && selection.isCollapsed()) {
            const before = $createRangeSelection();
            before.anchor.set("root", 0, "element");
            before.focus.set(
              selection.anchor.key,
              selection.anchor.offset,
              selection.anchor.type,
            );
            setCaret(before.getTextContent().length);
          } else setCaret(null);
        });
      }),
    [editor],
  );
  useEffect(() => {
    const unregister = editor.registerNodeTransform(RootNode, (root) => {
      if (editor.isComposing()) return;
      const text = root.getTextContent();
      const ranges = commandRanges(text, latest.current.commands);
      let offset = 0;
      // A change next to a token can invalidate its boundary or code context.
      // Reconcile the whole draft in the same transaction, preserving selection
      // and undo history instead of making another update from a listener.
      for (const node of root.getAllTextNodes()) {
        const start = text.indexOf(node.getTextContent(), offset);
        const end = start + node.getTextContentSize();
        offset = end;
        const cuts = ranges
          .flatMap((r) => [r.start, r.end])
          .filter((n) => n > start && n < end)
          .map((n) => n - start);
        const pieces = cuts.length
          ? node.splitText(...[...new Set(cuts)].sort((a, b) => a - b))
          : [node];
        let cursor = start;
        for (const piece of pieces) {
          const bold = ranges.some(
            (r) =>
              cursor >= r.start && cursor + piece.getTextContentSize() <= r.end,
          );
          if (piece.hasFormat("bold") !== bold)
            piece.setFormat(bold ? "bold" : 0);
          cursor += piece.getTextContentSize();
        }
      }
    });
    editor.update(
      () =>
        $getRoot()
          .getAllTextNodes()
          .forEach((n) => n.markDirty()),
      { tag: "catalog-format" },
    );
    return unregister;
  }, [editor, catalog.commands]);
  useEffect(() => {
    if (textareaProps?.autoFocus) editor.focus();
  }, [editor, textareaProps?.autoFocus]);
  useEffect(() => {
    setDismissed(null);
  }, [queryKey]);
  function accept(command: AvailableCommand) {
    if (!query) return;
    const result = completeCommand(value, query, command);
    replaceText(editor, result.text, result.caret);
    onValueChange(result.text);
    setDismissed(queryKey);
    editor.focus();
  }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (
      event.nativeEvent.isComposing ||
      editor.isComposing() ||
      composing ||
      readOnly
    )
      return;
    const plain =
      !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey;
    if (open && plain) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setDismissed(queryKey);
        return;
      }
      if (
        matches.length &&
        ["ArrowDown", "ArrowUp", "Enter", "Tab"].includes(event.key)
      ) {
        event.preventDefault();
        event.stopPropagation();
        if (event.key === "ArrowDown") pickerControls.current?.move(1);
        else if (event.key === "ArrowUp") pickerControls.current?.move(-1);
        else pickerControls.current?.select();
        return;
      }
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      onSubmit(
        event.metaKey || (event.ctrlKey && !/Mac/.test(navigator.platform))
          ? "steer"
          : "send",
      );
    }
  }
  return (
    <CommandMenu
      items={menuItems}
      size="compact"
      closeOnSelect={false}
      onSelect={(item) => {
        const command = matches.find(
          (command) => invocation(command) === item.value,
        );
        if (command) accept(command);
      }}
    >
      <PickerBridge controls={pickerControls} onState={setPickerState} />
      <Popover.Root
        open={open}
        onOpenChange={(next) => {
          if (!next) setDismissed(queryKey);
        }}
      >
        <Popover.Anchor asChild>
          <div
            ref={wrapper}
            className="command-editor-wrapper"
            // Lexical temporarily sets and then removes autocapitalize on
            // focus. Keep the inherited setting off as well.
            autoCapitalize="off"
            onKeyDownCapture={onKeyDown}
          >
            <PlainTextPlugin
              ErrorBoundary={LexicalErrorBoundary}
              contentEditable={
                <ContentEditable
                  className={`command-editor ${textareaProps?.className ?? ""}`}
                  aria-label={textareaProps?.["aria-label"] ?? "Message"}
                  aria-describedby={textareaProps?.["aria-describedby"]}
                  aria-readonly={!!readOnly}
                  aria-disabled={!!disabled}
                  aria-autocomplete="list"
                  aria-haspopup="listbox"
                  aria-controls={open ? pickerState.listId : undefined}
                  aria-activedescendant={
                    open && matches.length ? pickerState.activeId : undefined
                  }
                  aria-placeholder={placeholder ?? "Message"}
                  placeholder={
                    <div className="command-editor-placeholder">
                      {placeholder}
                    </div>
                  }
                  tabIndex={disabled ? -1 : 0}
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={textareaProps?.spellCheck ?? false}
                  onFocus={() => {
                    setFocused(true);
                    setDismissed(null);
                  }}
                  onBlur={() => {
                    setFocused(false);
                    setDismissed(null);
                  }}
                  onCompositionStart={() => setComposing(true)}
                  onCompositionEnd={() => {
                    setComposing(false);
                    editor.update(() =>
                      $getRoot()
                        .getAllTextNodes()
                        .forEach((n) => n.markDirty()),
                    );
                  }}
                />
              }
            />
            <HistoryPlugin />
          </div>
        </Popover.Anchor>
        {open && (
          <Popover.Portal>
            <Popover.Content
              role="presentation"
              asChild
              side="top"
              align="start"
              sideOffset={6}
              collisionPadding={8}
              onOpenAutoFocus={(e) => e.preventDefault()}
              onCloseAutoFocus={(e) => e.preventDefault()}
              onInteractOutside={(e) => {
                if (wrapper.current?.contains(e.target as Node))
                  e.preventDefault();
              }}
              onMouseDown={(e) => e.preventDefault()}
            >
              <Elevated
                offset={2}
                shadowLevel={3}
                className={`command-menu flex flex-col overflow-hidden ${shapeMap.rounded.container}`}
              >
                <CommandMenuList
                  aria-label="Commands and skills"
                  renderItem={(item) => (
                    <CommandMenuItem title={[
                        item.value,
                        item.description,
                        matches.find(
                          (command) => invocation(command) === item.value,
                        )?.input?.hint,
                      ]
                        .filter(Boolean)
                        .join(" — ")}
                      value={item.value}
                      aria-label={`${item.label} ${item.value}`}
                      aria-description={item.description}
                    />
                  )}
                >
                  <CommandMenuEmpty>
                    {catalog.status === "loading" ? (
                      <ThinkingIndicator
                        size="compact"
                        label="Loading commands and skills…"
                      />
                    ) : catalog.status === "error" ? (
                      "Couldn’t load commands and skills."
                    ) : catalog.status === "unavailable" ? (
                      "This agent has not advertised commands or skills."
                    ) : (
                      "No matching commands or skills."
                    )}
                    {catalog.status === "error" && (
                      <Button variant="ghost" size="sm" onClick={catalog.retry}>
                        Retry
                      </Button>
                    )}
                  </CommandMenuEmpty>
                </CommandMenuList>
              </Elevated>
            </Popover.Content>
          </Popover.Portal>
        )}
      </Popover.Root>
    </CommandMenu>
  );
}
export function CommandEditor(props: Props) {
  return (
    <LexicalComposer
      initialConfig={{
        namespace: "harbor-prompt",
        theme: { text: { bold: "command-reference" } },
        onError: (error) => {
          throw error;
        },
      }}
    >
      <Editor {...props} />
    </LexicalComposer>
  );
}
