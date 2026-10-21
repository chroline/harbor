import type { Root, RootContent, Text } from "mdast";
import type { CommandRange } from "./commands";

/** Decorate parsed prose only. Code, links and their destinations stay untouched. */
export function remarkCommandReferences({
  ranges,
}: {
  ranges: CommandRange[];
}) {
  return (tree: Root) => {
    function walk(parent: { children: RootContent[] }) {
      parent.children = parent.children.flatMap((node) => {
        if (
          [
            "code",
            "inlineCode",
            "link",
            "linkReference",
            "image",
            "html",
          ].includes(node.type)
        )
          return [node];
        if (node.type === "text") {
          const offset = node.position?.start.offset;
          if (offset === undefined) return [node];
          // Escapes/entities may change source lengths; avoid decorating a wrong span.
          if (node.position?.end.offset !== offset + node.value.length)
            return [node];
          const applicable = ranges.filter(
            (r) => r.start >= offset && r.end <= offset + node.value.length,
          );
          const parts: RootContent[] = [];
          let cursor = 0;
          for (const range of applicable) {
            const start = range.start - offset;
            const end = range.end - offset;
            if (start > cursor)
              parts.push({
                type: "text",
                value: node.value.slice(cursor, start),
              } as Text);
            parts.push({
              type: "strong",
              children: [{ type: "text", value: node.value.slice(start, end) }],
              data: { hProperties: { className: ["command-reference"] } },
            });
            cursor = end;
          }
          if (!parts.length) return [node];
          if (cursor < node.value.length)
            parts.push({ type: "text", value: node.value.slice(cursor) });
          return parts;
        }
        if ("children" in node) walk(node as { children: RootContent[] });
        return [node];
      });
    }
    walk(tree);
  };
}
