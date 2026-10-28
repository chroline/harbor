import { FileDiff } from "./ui/file-diff";

/** Structured tool data uses the shared file renderer. */
export function ToolJson({
  value,
  text,
  heading = "Output",
}: {
  value?: unknown;
  text?: string;
  heading?: "Input" | "Output";
}) {
  const source = text ?? JSON.stringify(value, null, 2);
  if (source === undefined) return null;
  return <ToolCode text={source} heading={heading} language="json" />;
}

export function ToolCode({
  text,
  heading = "Output",
  language = "text",
}: {
  text: string;
  heading?: "Input" | "Output";
  language?: string;
}) {
  const lines =
    text === ""
      ? []
      : text
          .replace(/\n$/, "")
          .split("\n")
          .map((text) => ({ kind: "context" as const, text }));
  return (
    <div className="tool-json">
      <FileDiff
        filename={heading}
        language={language}
        mode="read"
        lines={lines}
      />
    </div>
  );
}
