import { remarkCommandReferences } from "../lib/command-markdown";
import type { CommandRange } from "../lib/commands";
import { rem } from "@/lib/units";
import { Picker } from "./fluid";
import { Switch } from "./ui/switch";
import { Badge } from "./ui/badge";
import type { IconComponent } from "../lib/icon-context";
import {
  Children,
  createContext,
  createElement,
  memo,
  useContext,
  useState,
  type ComponentProps,
  type ReactNode,
  type ReactElement,
} from "react";
import { StreamingText } from "./ui/streaming-text";
import { Terminal, Copy, Check, LoaderCircle, ChevronDown } from "@/lib/icons";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { MarkdownCodeBlock } from "./CodeBlock";
export { CodeBlock } from "./CodeBlock";
import { Button } from "./ui/button";
import { Tooltip } from "./ui/tooltip";
import { call } from "../lib/api";
import {
  options,
  values,
  record,
  array,
  str,
  statusLabel,
} from "../lib/protocol";
import { useStore } from "../lib/store";
import type { SessionRecord } from "../lib/bindings/SessionRecord";
import { findAdapter } from "../adapters";

export function Mark({ size = 25 }: { size?: number | string }) {
  return (
    <svg
      width={rem(size)}
      height={rem(size)}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5 20V11l5-3v9l6 3.5 6-3.5V8l5 3v9l-11 6.5L5 20Z"
        fill="currentColor"
      />
      <path
        d="m10 5 6-3.5L22 5l-6 3.5L10 5Z"
        fill="currentColor"
        opacity=".55"
      />
    </svg>
  );
}
export function ProviderIcon({
  id,
  size = 18,
}: {
  id: string;
  size?: number | string;
}) {
  const icon = findAdapter(id)?.icon;
  return (
    <span className={`provider-icon ${id}`} aria-hidden="true">
      {icon ? (
        <span
          className="provider-brand-mark"
          style={{
            width: rem(size),
            height: rem(size),
            maskImage: `url("${icon}")`,
            WebkitMaskImage: `url("${icon}")`,
          }}
        />
      ) : (
        <Terminal size={rem(size)} />
      )}
    </span>
  );
}
export const SpinnerIcon: IconComponent = ({ className, ...props }) => (
  <LoaderCircle {...props} className={`spin ${className ?? ""}`} />
);

const glyphs = new Map<string, IconComponent>();
export function providerGlyph(id: string): IconComponent {
  if (!glyphs.has(id))
    glyphs.set(id, ({ size = 16 }) => <ProviderIcon id={id} size={size} />);
  return glyphs.get(id)!;
}
export function Tip({ text, children }: { text: string; children: ReactNode }) {
  return <Tooltip content={text}>{children as ReactElement}</Tooltip>;
}
export function IconButton({
  label,
  children,
  onClick,
  disabled = false,
  className = "",
  size = "icon",
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  size?: "icon" | "icon-compact";
}) {
  return (
    <Tip text={label}>
      <Button
        size={size}
        variant="ghost"
        aria-label={label}
        onClick={onClick}
        disabled={disabled}
        className={`icon-button ${className}`}
      >
        {children}
      </Button>
    </Tip>
  );
}
export function Status({ status }: { status: string }) {
  return (
    <Badge className={`status status-${status}`}>
      <i />
      {statusLabel(status)}
    </Badge>
  );
}
export function CopyButton({ text }: { text: string | (() => string) }) {
  const [copied, setCopied] = useState(false);
  const { setError } = useStore();
  return (
    <IconButton
      label={copied ? "Copied" : "Copy"}
      onClick={() => {
        navigator.clipboard
          .writeText(typeof text === "function" ? text() : text)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          })
          .catch((e) => setError(`Could not copy: ${String(e)}`));
      }}
    >
      {copied ? <Check size={rem(14)} /> : <Copy size={rem(14)} />}
    </IconButton>
  );
}
// React uses these functions as component identities. Keep them stable so a
// composer update or streamed token doesn't remount code blocks and reset wrap.
const MarkdownStreaming = createContext(false);

function streamLeaves(children: ReactNode, streaming: boolean) {
  if (!streaming) return children;
  return Children.map(children, (child) =>
    typeof child === "string" && /\S/.test(child) ? (
      <StreamingText>{child}</StreamingText>
    ) : (
      child
    ),
  );
}

function streamed(
  tag:
    | "p"
    | "li"
    | "em"
    | "strong"
    | "del"
    | "blockquote"
    | "td"
    | "th"
    | "h1"
    | "h2"
    | "h3"
    | "h4"
    | "h5"
    | "h6",
) {
  return function StreamedMarkdown({
    node: _node,
    children,
    ...props
  }: ComponentProps<typeof tag> & { node?: unknown }) {
    const streaming = useContext(MarkdownStreaming);
    return createElement(tag, props, streamLeaves(children, streaming));
  };
}

const markdownComponents: Components = {
  a: ({ children, href }) => {
    const streaming = useContext(MarkdownStreaming);
    return (
      <a href={href} target="_blank" rel="noreferrer">
        {streamLeaves(children, streaming)}
      </a>
    );
  },
  pre: ({ node, children }) => (
    <MarkdownCodeBlock node={node}>{children}</MarkdownCodeBlock>
  ),
  p: streamed("p"),
  li: streamed("li"),
  em: streamed("em"),
  strong: streamed("strong"),
  del: streamed("del"),
  blockquote: streamed("blockquote"),
  td: streamed("td"),
  th: streamed("th"),
  h1: streamed("h1"),
  h2: streamed("h2"),
  h3: streamed("h3"),
  h4: streamed("h4"),
  h5: streamed("h5"),
  h6: streamed("h6"),
};

// Parsing the bounded transcript is expensive. Drafts and unrelated session
// updates must not parse every unchanged message on each keystroke.
export const RichText = memo(function RichText({
  text,
  commandRanges = [],
  streaming = false,
}: {
  text: string;
  commandRanges?: CommandRange[];
  /** Reveal words that arrive while this reply is still streaming. */
  streaming?: boolean;
}) {
  return (
    <MarkdownStreaming.Provider value={streaming}>
      <div className="markdown typeset">
        <Markdown
          remarkPlugins={[
            remarkGfm,
            [remarkCommandReferences, { ranges: commandRanges }],
          ]}
          components={markdownComponents}
        >
          {text}
        </Markdown>
      </div>
    </MarkdownStreaming.Provider>
  );
});
export function ConfigControls({ session }: { session: SessionRecord }) {
  const { updateSession, setError } = useStore();
  const [busy, setBusy] = useState(false);
  const opts = options(session.configOptions);
  const set = async (id: string, value: string | boolean) => {
    setBusy(true);
    try {
      updateSession(
        await call<SessionRecord>("set_config", {
          sessionId: session.id,
          configId: id,
          value,
        }),
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="config-controls">
      {opts.map((o) => (
        <div key={o.id} className="config-field">
          <span>{o.name}</span>
          {o.type === "boolean" ? (
            <Switch
              label={o.name}
              checked={o.currentValue === true}
              disabled={busy}
              onToggle={() => void set(o.id, o.currentValue !== true)}
            />
          ) : (
            <Picker
              label={o.name}
              value={String(o.currentValue)}
              disabled={busy}
              searchable={o.category === "model"}
              onValueChange={(v) => void set(o.id, v)}
              items={values(o).map((v) => ({ value: v.value, label: v.name }))}
            />
          )}
        </div>
      ))}
      {!opts.length && (
        <>
          {array(record(session.models).availableModels).length > 0 && (
            <div className="config-field">
              <span>Model</span>
              <Picker
                label="Model"
                searchable
                disabled={busy}
                value={str(record(session.models).currentModelId)}
                onValueChange={(v) => void set("__legacy_model", v)}
                items={array(record(session.models).availableModels).map(
                  (v) => ({
                    value: str(record(v).modelId),
                    label: str(record(v).name),
                  }),
                )}
              />
            </div>
          )}
          {array(record(session.modes).availableModes).length > 0 && (
            <div className="config-field">
              <span>Mode</span>
              <Picker
                label="Mode"
                disabled={busy}
                value={str(record(session.modes).currentModeId)}
                onValueChange={(v) => void set("__legacy_mode", v)}
                items={array(record(session.modes).availableModes).map((v) => ({
                  value: str(record(v).id),
                  label: str(record(v).name),
                }))}
              />
            </div>
          )}
          <p className="muted text-xs">
            {record(session.models).availableModels
              ? "This session returned no separate reasoning control."
              : "This session returned no model or reasoning controls. Check the executable version and provider sign-in."}
          </p>
        </>
      )}
      {busy && <LoaderCircle size={rem(14)} className="spin" />}
      {opts.length > 0 &&
        !opts.some(
          (o) => o.category === "thought_level" || o.id.includes("effort"),
        ) && (
          <p className="muted text-xs">
            This session returned no separate reasoning control. Some providers
            include effort in their model variants.
          </p>
        )}
    </div>
  );
}
