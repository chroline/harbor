import { array, record, str, type Tool } from "./protocol";

// Only known text envelopes are unwrapped; transport objects are never dumped.
export function resultText(value: unknown): string[] {
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      if (typeof parsed === "object" && parsed !== null)
        return resultText(parsed);
    } catch {
      /* Plain text is already displayable. */
    }
    return value.trim() ? [value] : [];
  }
  if (Array.isArray(value)) return value.flatMap(resultText);
  const block = record(value);
  if (block.type === "text" && typeof block.text === "string")
    return block.text.trim() ? [block.text] : [];
  if (block.type === "tool_reference" && typeof block.tool_name === "string")
    return [block.tool_name];
  if (block.type === "content" || Array.isArray(block.content))
    return resultText(block.content);
  if (typeof block.error === "string") return [block.error];
  if (typeof record(block.error).message === "string")
    return [str(record(block.error).message)];
  if (Object.keys(block).length && !block.type) return [JSON.stringify(block)];
  return [];
}

/** Dedicated receipt view: scheduling mechanics do not belong in the activity UI. */
export function wakeupPresentation(tool: Tool) {
  if (
    (tool.name || tool.title).toLowerCase() !== "schedulewakeup" ||
    !["completed", "pending", "in_progress"].includes(tool.status)
  )
    return undefined;
  const receipt = [
    ...resultText(tool.rawOutput),
    ...resultText(tool.content),
  ].join("\n");
  const time =
    /Next wakeup scheduled for ((?:[01]?\d|2[0-3]):[0-5]\d:[0-5]\d)\b/.exec(
      receipt,
    )?.[1];
  const seconds = record(tool.rawInput).delaySeconds;
  let delay: string | undefined;
  if (typeof seconds === "number" && Number.isFinite(seconds) && seconds >= 0) {
    const total = Math.round(seconds);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const rest = total % 60;
    delay =
      [
        hours && `${hours} hr`,
        minutes && `${minutes} min`,
        (rest || !total) && `${rest} sec`,
      ]
        .filter(Boolean)
        .join(" ") + " delay";
  }
  return {
    title:
      tool.status === "completed"
        ? `Wakeup scheduled${time ? ` for ${time}` : ""}`
        : "Scheduling wakeup",
    delay,
  };
}

const unfence = (text: string) =>
  text.replace(/^```[^\n]*\n([\s\S]*?)\n```\s*$/, "$1").trim();

/** Use explicit tool identity and file operations, never infer an operation from its title. */
export function toolActivityKind(tool: Tool): string {
  const name = tool.name?.toLowerCase();
  if (name === "write") return "write";
  if (name === "edit" || name === "multiedit") return "edit";
  if (
    name === "exec_command" &&
    tool.kind === "read" &&
    tool.locations?.some((location) =>
      /[/\\]skills[/\\][^/\\]+[/\\]SKILL\.md$/.test(location.path),
    )
  )
    return "skill";
  const diffs = tool.content
    .map(record)
    .filter((block) => block.type === "diff");
  if (diffs.length)
    return diffs.every(
      (diff) => diff.oldText === null || record(diff._meta).kind === "add",
    )
      ? "write"
      : "edit";
  return tool.kind;
}

export function toolPresentation(tool: Tool) {
  const input = record(tool.rawInput);
  const response = record(tool.claudeCode?.toolResponse);
  const name = (tool.name || tool.title).toLowerCase();
  // Codex Guardian reviews have a documented action envelope, separate from tool input.
  const reviewAction =
    tool.title === "Guardian Review" && record(input.action).type === "command"
      ? record(input.action)
      : undefined;
  const command =
    str(input.command) ||
    str(input.cmd) ||
    tool.command ||
    str(reviewAction?.command);
  const cwd = command
    ? str(input.cwd) || str(reviewAction?.cwd) || undefined
    : undefined;
  const action = record(input.action);
  const searchAction = tool.kind === "search" && action.type === "search";
  const openAction = tool.kind === "search" && action.type === "openPage";
  const queries = searchAction
    ? array(action.queries).filter(
        (query): query is string => typeof query === "string",
      )
    : [];
  if (searchAction && !queries.length && str(action.query))
    queries.push(str(action.query));
  const url = openAction ? str(action.url) : undefined;
  const path =
    str(input.file_path) || str(input.path) || tool.locations?.[0]?.path;
  const start =
    typeof input.offset === "number" ? input.offset : tool.locations?.[0]?.line;
  const end =
    start !== undefined && typeof input.limit === "number"
      ? start + input.limit - 1
      : undefined;
  const location = path
    ? `${path}${start !== undefined ? `:${start}${end !== undefined ? `–${end}` : ""}` : ""}`
    : undefined;
  const success = tool.status === "completed";
  // Titles come from the provider. Never maintain a tool-name → UI-label map.
  const suppliedDescription =
    str(input.description) || tool.description || str(response.description);
  const suppliedTitle = suppliedDescription || tool.title || tool.name || "";
  const inlineSkill = name === "skill" ? str(input.skill) : "";
  const readFilename =
    tool.kind === "read" && path ? path.split(/[\\/]/).at(-1) : undefined;
  const inlineContext =
    inlineSkill || (!searchAction && !openAction ? str(input.query) : "");
  let title =
    inlineContext && !suppliedTitle.includes(inlineContext)
      ? `${suppliedTitle} ${inlineContext}`
      : readFilename && !suppliedTitle.includes(readFilename)
        ? `${suppliedDescription || tool.name || suppliedTitle} ${readFilename}`
        : suppliedTitle;
  if (
    name === "exec_command" &&
    tool.kind === "read" &&
    path &&
    !suppliedDescription
  )
    title = tool.title.includes(path)
      ? tool.title.replace(
          path,
          /[/\\]skills[/\\][^/\\]+[/\\]SKILL\.md$/.test(path)
            ? path.split(/[/\\]/).slice(-2).join("/")
            : path.split(/[/\\]/).at(-1)!,
        )
      : title;
  const changedFiles = tool.content
    .map(record)
    .filter((block) => block.type === "diff" && typeof block.path === "string");
  if (
    changedFiles.length &&
    !suppliedDescription &&
    !changedFiles.some((file) =>
      title.includes(str(file.path).split(/[/\\]/).at(-1)!),
    )
  )
    title = `${title}: ${changedFiles.map((file) => str(file.path).split(/[/\\]/).at(-1)).join(", ")}`;
  // Keep the provider's action label; move long search terms/URLs into the disclosure.
  if ((queries.length || url) && title.includes(": "))
    title = title.slice(0, title.indexOf(": "));
  const task =
    str(input.prompt) ||
    str(response.prompt) ||
    (["subagenthandback", "spawn_agent", "send_message"].includes(name)
      ? str(input.message)
      : "") ||
    queries.join("\n\n") ||
    undefined;
  const context = !inlineSkill ? str(input.skill) || undefined : undefined;
  // Hide successful transport receipts rather than replacing them with invented prose.
  const suppressResult =
    success &&
    (["skill", "subagenthandback"].includes(name) ||
      (["agent", "task"].includes(name) && response.isAsync === true));
  const texts = suppressResult ? [] : resultText(tool.content);
  const rawTexts = suppressResult ? [] : resultText(tool.rawOutput);
  const output: string[] = [];
  // Structured content is the provider's preferred representation of the result.
  // Fall back to raw text only when no formatted text exists.
  for (const text of tool.status === "failed"
    ? [...texts, ...rawTexts]
    : texts.length
      ? texts
      : rawTexts) {
    if (reviewAction && text === `Action: exec ${command}`) continue;
    const cleaned = tool.kind === "execute" ? unfence(text) : text;
    if (!output.some((previous) => unfence(previous) === unfence(cleaned)))
      output.push(cleaned);
  }
  if (success && ["write", "edit"].includes(name)) {
    for (let i = output.length - 1; i >= 0; i--) {
      if (
        /^(File (created|updated|written) successfully|Successfully (wrote|updated)|\(file state is current)/i.test(
          output[i].trim(),
        )
      )
        output.splice(i, 1);
    }
  }
  const references = [
    ...new Set(
      array(tool.rawOutput).flatMap((value) => {
        const block = record(value);
        return block.type === "tool_reference" &&
          typeof block.tool_name === "string"
          ? [block.tool_name]
          : [];
      }),
    ),
  ];
  const visibleOutput = output.filter(
    (text) =>
      !references.some(
        (reference) => text === reference || text === `Tool: ${reference}`,
      ),
  );
  const parameters = Object.fromEntries(
    Object.entries(input).filter(([key, value]) => {
      if (key === "description" && value === suppliedTitle) return false;
      if (key === "skill" && inlineSkill) return false;
      if (key === "query" && value === inlineContext) return false;
      if (command && ["command", "cmd"].includes(key)) return false;
      if (cwd && key === "cwd") return false;
      if (reviewAction && key === "action") return false;
      if ((searchAction || openAction) && ["action", "query"].includes(key))
        return false;
      if (path && ["file_path", "path", "offset", "limit"].includes(key))
        return false;
      if (task && ["prompt", "message"].includes(key) && value === task)
        return false;
      if (context && ["skill", "query"].includes(key) && value === context)
        return false;
      return true;
    }),
  );
  const wakeup = wakeupPresentation(tool);
  const unwrappedCommand = command?.match(
    /^(?:\S*\/)?(?:bash|zsh|sh) -[a-z]*c (["'])([\s\S]*)\1$/,
  )?.[2];
  return {
    title: wakeup?.title || title,
    wakeup,
    command,
    commandInTitle: command === title || unwrappedCommand === title,
    cwd,
    url,
    path,
    start,
    location,
    task,
    context,
    output: visibleOutput,
    references,
    parameters,
  };
}
