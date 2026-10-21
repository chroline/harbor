import { expect, it } from "vitest";
import {
  commandList,
  commandQuery,
  commandRanges,
  completeCommand,
  invocation,
  matchingCommands,
  normalizeCommandAliases,
  commandLabel,
} from "./commands";
const commands = commandList([
  { name: "review", description: "Review", input: { hint: "branch" } },
  { name: "$build", description: "Build" },
  { name: "skill:check", description: "Check" },
  { name: "/preview", description: "Preview" },
]);
it("preserves native prefixes, namespaces and hints while removing invalid and duplicate entries", () => {
  expect(commands.map(invocation)).toEqual([
    "/review",
    "$build",
    "/skill:check",
    "/preview",
  ]);
  expect(commands[0].input?.hint).toBe("branch");
  expect(
    commandList([
      null,
      { name: "bad name", description: "bad" },
      ...commands,
      commands[0],
    ]),
  ).toEqual(commands);
});
it("recognizes native invocations and leaves unknown names, code, paths and links alone", () => {
  const text =
    "/review check $build, `$build` https://site/$build [x]($build) $building";
  expect(
    commandRanges(text, commands).map((r) => text.slice(r.start, r.end)),
  ).toEqual(["/review", "$build"]);
  expect(commandRanges("/review/file", commands)).toEqual([]);
  expect(commandRanges("/review.txt", commands)).toEqual([]);
  expect(commandRanges("```\n$build\n```", commands)).toEqual([]);
  expect(commandRanges("look /review", commands)).toEqual([
    { start: 5, end: 12 },
  ]);
});
it("queries at the caret, ranks prefix matches and completes only the active word", () => {
  expect(commandQuery("look /rev", 9)).toEqual({
    start: 5,
    end: 9,
    query: "/rev",
  });
  expect(commandQuery("run $bu please", 7)).toEqual({
    start: 4,
    end: 7,
    query: "$bu",
  });
  expect(commandQuery("`$build`", 5)).toBeNull();
  const query = commandQuery("/review arguments", 4)!;
  expect(completeCommand("/review arguments", query, commands[0])).toEqual({
    text: "/review arguments",
    caret: 8,
  });
  expect(matchingCommands(commands, "/rev").map(invocation)).toEqual([
    "/review",
    "/preview",
  ]);
  expect(matchingCommands(commands, "$bu").map(invocation)).toEqual(["$build"]);
});

it("treats slash and dollar as equivalent for discovery, exact highlighting and native execution", () => {
  expect(matchingCommands(commands, "/")).toEqual(
    matchingCommands(commands, "$"),
  );
  expect(matchingCommands(commands, "/bu")).toEqual(
    matchingCommands(commands, "$bu"),
  );
  expect(matchingCommands(commands, "$rev").map(invocation)).toEqual([
    "/review",
    "/preview",
  ]);
  const text = "$review use /build, then `$review` and https://host/build";
  expect(
    commandRanges(text, commands).map((r) => text.slice(r.start, r.end)),
  ).toEqual(["$review", "/build"]);
  expect(normalizeCommandAliases(text, commands)).toBe(
    "/review use $build, then `$review` and https://host/build",
  );
  expect(
    completeCommand("/bu", commandQuery("/bu", 3)!, commands[1]).text,
  ).toBe("$build ");
  expect(
    completeCommand("$rev", commandQuery("$rev", 4)!, commands[0]).text,
  ).toBe("/review ");
});
it("preserves exact native names on collisions and creates readable menu labels", () => {
  const collision = [
    { name: "review", description: "Command" },
    { name: "$review", description: "Skill" },
  ];
  expect(normalizeCommandAliases("/review $review", collision)).toBe(
    "/review $review",
  );
  expect(commandLabel({ name: "$ai-elements", description: "UI" })).toBe(
    "Ai Elements",
  );
  expect(commandLabel({ name: "skill:check", description: "Check" })).toBe(
    "Check",
  );
});
