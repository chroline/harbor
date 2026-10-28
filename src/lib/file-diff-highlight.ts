// Ported from Kobra's public code-block-CAebJ4Tj.js, used by its FileDiff demo.
import { parser } from "@lezer/javascript";
import { tagHighlighter, highlightTree, tags } from "@lezer/highlight";

type Token = { text: string; token?: string };

const parsers: Record<string, typeof parser | null> = {
  ts: parser.configure({ dialect: "ts" }),
  tsx: parser.configure({ dialect: "ts jsx" }),
  js: parser,
  json: parser.configure({ top: "SingleExpression" }),
  jsx: parser.configure({ dialect: "jsx" }),
  sh: null,
};

const style = tagHighlighter([
  {
    tag: [tags.comment, tags.lineComment, tags.blockComment],
    class: "comment",
  },
  {
    tag: [
      tags.keyword,
      tags.modifier,
      tags.controlKeyword,
      tags.operatorKeyword,
      tags.self,
    ],
    class: "keyword",
  },
  {
    tag: [tags.string, tags.special(tags.string), tags.regexp],
    class: "string",
  },
  { tag: [tags.number, tags.bool, tags.null, tags.escape], class: "number" },
]);

export const INK: Record<string, string> = {
  comment: "text-muted-foreground",
  keyword: "text-info",
  string: "text-success",
  number: "text-warning",
};

function splitLines(tokens: Token[]) {
  const lines: Token[][] = [[]];
  for (const token of tokens) {
    for (const [index, text] of token.text.split("\n").entries()) {
      if (index > 0) lines.push([]);
      if (text !== "") lines.at(-1)!.push({ text, token: token.token });
    }
  }
  return lines;
}

export function highlightCode(code: string, language: string) {
  const languageParser = parsers[language];
  if (!languageParser) return splitLines([{ text: code }]);
  const tree = languageParser.parse(code);
  const tokens: Token[] = [];
  let position = 0;
  highlightTree(tree, style, (from, to, token) => {
    if (from > position) tokens.push({ text: code.slice(position, from) });
    tokens.push({ text: code.slice(from, to), token });
    position = to;
  });
  if (position < code.length) tokens.push({ text: code.slice(position) });
  return splitLines(tokens);
}
