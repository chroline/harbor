import {
  Children,
  createElement,
  isValidElement,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { common, createLowlight } from "lowlight";
import { diffLines } from "diff";
import { WrapText } from "@/lib/icons";
import {
  CodeBlock as CodeBlockRoot,
  CodeBlockActions,
  CodeBlockContent,
  CodeBlockHeader,
  CodeBlockLine,
  CodeBlockTitle,
} from "./ui/code-block";
import { Button } from "./ui/button";
import { CopyButton } from "./shared";
import { MermaidBlock } from "./MermaidBlock";
import type { Element, RootContent } from "hast";
import "./code-block.css";

// The same Highlight.js/lowlight engine used by rehype-highlight, shared by
// Markdown fences and tool output instead of highlighting nested Markdown twice.
const highlighter = createLowlight(common);
highlighter.registerAlias({ typescript: ["tsx"], javascript: ["jsx"] });

function textOf(node: RootContent): string {
  return node.type === "text"
    ? node.value
    : "children" in node
      ? node.children.map(textOf).join("")
      : "";
}

function highlightedLines(text: string, language: string): ReactNode[] {
  if (!highlighter.registered(language)) return text.split("\n");
  const tree = highlighter.highlight(language, text);
  const lines: ReactNode[][] = [[]];
  function visit(node: RootContent, classes: string[]) {
    if (node.type === "text") {
      const parts = node.value.split("\n");
      parts.forEach((part, index) => {
        if (index) lines.push([]);
        if (part)
          lines
            .at(-1)!
            .push(
              createElement(
                "span",
                { className: classes.join(" "), key: lines.at(-1)!.length },
                part,
              ),
            );
      });
    } else if (node.type === "element") {
      const names = node.properties.className;
      node.children.forEach((child) =>
        visit(child, [
          ...classes,
          ...(Array.isArray(names) ? names.map(String) : []),
        ]),
      );
    }
  }
  tree.children.forEach((node) => visit(node, []));
  return lines;
}

export function codeLanguage(path: string) {
  const extension = path.split(".").at(-1)?.toLowerCase() ?? "";
  return (
    (
      {
        ts: "typescript",
        tsx: "tsx",
        js: "javascript",
        jsx: "jsx",
        py: "python",
        rs: "rust",
        sh: "bash",
        yml: "yaml",
        md: "markdown",
      } as Record<string, string>
    )[extension] ?? (highlighter.registered(extension) ? extension : "text")
  );
}

export type CodeBlockProps = {
  text: string;
  language?: string;
  title?: string;
  compact?: boolean;
  lineNumbers?: boolean;
  diff?: { before: string; after: string };
};

export function CodeBlock({
  text,
  language = "text",
  title,
  compact = false,
  lineNumbers = !compact &&
    !["text", "plaintext", "log", "console", "bash", "sh", "shell"].includes(
      language,
    ),
  diff,
}: CodeBlockProps) {
  const [wrap, setWrap] = useState(false);
  const lines = useMemo(
    () => highlightedLines(text, language),
    [text, language],
  );
  const changes = useMemo(
    () =>
      diff ? diffLines(diff.before, diff.after, { timeout: 100 }) : undefined,
    [diff?.before, diff?.after],
  );
  return (
    <CodeBlockRoot
      className="harbor-code-block"
      size={compact ? "sm" : "default"}
    >
      <CodeBlockHeader>
        <CodeBlockTitle title={title || language}>
          {title || language}
        </CodeBlockTitle>
        <CodeBlockActions>
          <Button
            variant="ghost"
            size="icon-compact"
            aria-label="Wrap lines"
            aria-pressed={wrap}
            onClick={() => setWrap(!wrap)}
          >
            <WrapText />
          </Button>
          <CopyButton text={diff?.after ?? text} />
        </CodeBlockActions>
      </CodeBlockHeader>
      <CodeBlockContent wrap={wrap} lineNumbers={lineNumbers}>
        {changes
          ? changes.flatMap((change, index) =>
              change.value
                .replace(/\n$/, "")
                .split("\n")
                .map((line, i) => (
                  <CodeBlockLine
                    key={`${index}-${i}`}
                    variant={
                      change.added
                        ? "added"
                        : change.removed
                          ? "removed"
                          : "default"
                    }
                  >
                    {line}
                  </CodeBlockLine>
                )),
            )
          : lineNumbers || highlighter.registered(language)
            ? lines.map((line, index) => (
                <CodeBlockLine key={index}>{line}</CodeBlockLine>
              ))
            : text}
      </CodeBlockContent>
    </CodeBlockRoot>
  );
}

/** react-markdown supplies a code element containing the fence's source text. */
export function MarkdownCodeBlock({
  node,
  children,
}: {
  node?: Element;
  children: ReactNode;
}) {
  const code = node?.children.find(
    (child): child is Element =>
      child.type === "element" && child.tagName === "code",
  );
  const className = code?.properties.className;
  const language =
    (Array.isArray(className)
      ? className.join(" ")
      : String(className ?? "")
    ).match(/language-(\S+)/)?.[1] ?? "text";
  function plain(value: ReactNode): string {
    return Children.toArray(value)
      .map((child): string =>
        typeof child === "string" || typeof child === "number"
          ? String(child)
          : isValidElement<{ children?: ReactNode }>(child)
            ? plain(child.props.children)
            : "",
      )
      .join("");
  }
  // Markdown's code node contributes one terminator, including for open fences.
  const text = (
    code ? code.children.map(textOf).join("") : plain(children)
  ).replace(/\n$/, "");
  return language.toLowerCase() === "mermaid" ? (
    <MermaidBlock text={text} />
  ) : (
    <CodeBlock text={text} language={language} />
  );
}
