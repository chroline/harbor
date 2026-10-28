// Frozen pre-change renderer, used only by the comparison fixture.
import { FileChange } from "../src/components/FileDiff";
import { RichText } from "../src/components/shared";
import { Disclosure } from "../src/components/fluid";
import { Check, LoaderCircle, TerminalSquare } from "../src/lib/icons";
import { rem } from "../src/lib/units";
import {
  record,
  str,
  toolImageSource,
  type Tool,
  type ToolTerminalOutput,
} from "../src/lib/protocol";
export function ToolCardBefore({
  tool,
  detailsOnly = false,
  terminals = {},
}: {
  tool: Tool;
  detailsOnly?: boolean;
  terminals?: Record<string, ToolTerminalOutput>;
}) {
  const hasImages = tool.content.some((block) => toolImageSource(block));
  const diffs = tool.content
    .map(record)
    .filter(
      (c) =>
        c.type === "diff" &&
        (typeof c.newText === "string" ||
          typeof c.oldText === "string" ||
          c.newText === null),
    );
  const input = record(tool.rawInput);
  const files =
    tool.status !== "completed"
      ? []
      : diffs.length
        ? diffs
        : tool.title === "write" &&
            typeof input.path === "string" &&
            typeof input.content === "string"
          ? [{ path: input.path, newText: input.content }]
          : [];
  const details = (
    <div className="tool-detail">
      {files.length ? (
        files.map((file, i) => (
          <FileChange
            key={i}
            filename={str(file.path)}
            before={
              typeof file.oldText === "string" || file.oldText === null
                ? file.oldText
                : undefined
            }
            after={
              typeof file.newText === "string" || file.newText === null
                ? file.newText
                : undefined
            }
          />
        ))
      ) : (
        <>
          {tool.content.map((c, i) => {
            const v = record(c);
            const imageSource = toolImageSource(c);
            if (imageSource) {
              return (
                <img
                  key={i}
                  src={imageSource}
                  alt={tool.title}
                  className="block h-auto max-h-[32rem] max-w-full rounded-lg object-contain object-left"
                />
              );
            }
            if (v.type === "terminal") {
              const terminal = terminals[str(v.terminalId)];
              return (
                <div key={i}>
                  <pre
                    className="tool-output"
                    aria-label="Output"
                    dir="ltr"
                    tabIndex={0}
                  >
                    {terminal?.output ||
                      (["pending", "in_progress"].includes(tool.status) &&
                      terminal?.exitCode === undefined
                        ? "Waiting for terminal output…"
                        : terminal
                          ? "No terminal output was recorded."
                          : "Terminal output was not captured for this call.")}
                  </pre>
                  {terminal?.exitCode !== undefined && (
                    <p className="text-xs text-muted-foreground">
                      Exit code {terminal.exitCode}
                    </p>
                  )}
                  {terminal?.truncated && (
                    <p className="text-xs text-muted-foreground">
                      Earlier terminal output was truncated.
                    </p>
                  )}
                </div>
              );
            }
            if (v.type === "content") {
              const content = record(v.content);
              return tool.kind === "execute" ? (
                <pre
                  key={i}
                  className="tool-output"
                  aria-label="Output"
                  dir="ltr"
                  tabIndex={0}
                >
                  {str(content.text)}
                </pre>
              ) : (
                <RichText key={i} text={str(content.text)} />
              );
            }
            if (v.type === "diff")
              return (
                <FileChange
                  key={i}
                  filename={str(v.path)}
                  before={
                    typeof v.oldText === "string" || v.oldText === null
                      ? v.oldText
                      : undefined
                  }
                  after={
                    typeof v.newText === "string" || v.newText === null
                      ? v.newText
                      : undefined
                  }
                />
              );
            return (
              <pre key={i} className="tool-output" dir="ltr" tabIndex={0}>
                {JSON.stringify(c, null, 2)}
              </pre>
            );
          })}
          {tool.rawInput != null && (
            <pre
              className="tool-output"
              aria-label="Input"
              dir="ltr"
              tabIndex={0}
            >
              {typeof tool.rawInput === "string"
                ? tool.rawInput
                : JSON.stringify(tool.rawInput, null, 2)}
            </pre>
          )}
          {tool.rawOutput != null && !hasImages && (
            <pre
              className="tool-output"
              aria-label="Output"
              dir="ltr"
              tabIndex={0}
            >
              {typeof tool.rawOutput === "string"
                ? tool.rawOutput
                : JSON.stringify(tool.rawOutput, null, 2)}
            </pre>
          )}
        </>
      )}
    </div>
  );
  if (detailsOnly) return details;
  return (
    <Disclosure
      className="agent-tool"
      title={
        <span className="tool-summary" data-status={tool.status}>
          {tool.status === "completed" ? (
            <Check size={rem(14)} />
          ) : tool.status === "in_progress" ? (
            <LoaderCircle className="spin" size={rem(14)} />
          ) : (
            <TerminalSquare size={rem(14)} />
          )}
          <span className="tool-summary-title">
            {tool.title.replaceAll("_", " ")}
          </span>
          <span className="tool-summary-status">
            {tool.status.replaceAll("_", " ")}
          </span>
        </span>
      }
    >
      {details}
    </Disclosure>
  );
}
