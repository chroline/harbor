import type { AvailableCommand } from "./bindings/AvailableCommand";
export type { AvailableCommand };
export type CommandRange = { start: number; end: number };

export function invocation(command: AvailableCommand): string {
  return /^[/$]/.test(command.name) ? command.name : `/${command.name}`;
}
export function commandList(value: unknown): AvailableCommand[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.filter((c): c is AvailableCommand => {
    if (
      !c ||
      typeof c.name !== "string" ||
      !/^[^\s]+$/.test(c.name) ||
      typeof c.description !== "string" ||
      (c.input != null && typeof c.input.hint !== "string")
    )
      return false;
    const key = invocation(c);
    if (key.length < 2 || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function protectedRanges(text: string): CommandRange[] {
  return [
    ...text.matchAll(
      /```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]*`|\[[^\]\n]*\]\([^\n)]*\)/g,
    ),
  ].map((m) => ({ start: m.index!, end: m.index! + m[0].length }));
}
export function commandRanges(
  text: string,
  commands: AvailableCommand[],
): CommandRange[] {
  const protectedText = protectedRanges(text);
  const ranges: CommandRange[] = [];
  for (const m of text.matchAll(/(?:^|[\s(])([/$][^\s]+)/g)) {
    const token = m[1].trim().replace(/[.,!?;)]+$/, "");
    const start = m.index! + m[0].indexOf(token);
    if (
      resolveCommand(token, commands) &&
      !protectedText.some((r) => start >= r.start && start < r.end)
    )
      ranges.push({ start, end: start + token.length });
  }
  return ranges;
}
export type CommandQuery = { start: number; end: number; query: string };
export function commandQuery(text: string, caret: number): CommandQuery | null {
  const before = text.slice(0, caret);
  const match = before.match(/(?:^|[\s(])([/$][^\s]*)$/);
  if (!match) return null;
  const query = match[1];
  const start = caret - query.length;
  if (protectedRanges(text).some((r) => start >= r.start && start < r.end))
    return null;
  // Complete the entire word even when editing its middle.
  const suffix = text.slice(caret).match(/^[^\s]*/)?.[0] ?? "";
  return { start, end: caret + suffix.length, query };
}
export function matchingCommands(
  commands: AvailableCommand[],
  query: string,
): AvailableCommand[] {
  const lower = query.slice(1).toLowerCase();
  return commands
    .filter((c) => invocation(c).slice(1).toLowerCase().includes(lower))
    .sort(
      (a, b) =>
        Number(isSkill(a)) - Number(isSkill(b)) ||
        Number(!invocation(a).slice(1).toLowerCase().startsWith(lower)) -
          Number(!invocation(b).slice(1).toLowerCase().startsWith(lower)) ||
        invocation(a).slice(1).localeCompare(invocation(b).slice(1)),
    );
}
export function completeCommand(
  text: string,
  query: CommandQuery,
  command: AvailableCommand,
) {
  const suffix = text.slice(query.end);
  const insert = invocation(command) + (suffix.startsWith(" ") ? "" : " ");
  return {
    text: text.slice(0, query.start) + insert + suffix,
    caret: query.start + invocation(command).length + 1,
  };
}

/** Both triggers share a catalog; the advertised spelling wins collisions. */
export function resolveCommand(token: string, commands: AvailableCommand[]) {
  return (
    commands.find((command) => invocation(command) === token) ??
    commands.find((command) => invocation(command).slice(1) === token.slice(1))
  );
}
export function normalizeCommandAliases(
  text: string,
  commands: AvailableCommand[],
) {
  let result = text;
  for (const range of commandRanges(text, commands).reverse()) {
    const command = resolveCommand(
      text.slice(range.start, range.end),
      commands,
    )!;
    result =
      result.slice(0, range.start) +
      invocation(command) +
      result.slice(range.end);
  }
  return result;
}
export function isSkill(command: AvailableCommand) {
  return /^\$|^\/?skill:/.test(command.name);
}
export function commandLabel(command: AvailableCommand) {
  return invocation(command)
    .slice(1)
    .replace(/^skill:/, "")
    .replace(/[-_]+/g, " ")
    .replace(/:/g, ": ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
