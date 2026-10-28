import { RichText } from "./shared";
import { ToolCode, ToolJson } from "./ToolJson";

export function ToolResult({
  text,
  code = false,
}: {
  text: string;
  code?: boolean;
}) {
  try {
    const value: unknown = JSON.parse(text);
    if (value !== null && typeof value === "object")
      return <ToolJson value={value} />;
  } catch {
    // Truncated JSON is still source, not prose or Markdown.
    if (/^\s*[\[{]/.test(text)) return <ToolJson text={text} />;
  }
  return code ? <ToolCode text={text} /> : <RichText text={text} />;
}
