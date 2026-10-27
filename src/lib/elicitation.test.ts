import { expect, it } from "vitest";
import { elicitationQuestions, questionError } from "./elicitation";
import { questionRequests } from "../../tests/providers/questions";

it("recognizes current Codex and Claude companion metadata without renaming fields", () => {
  const codex = structuredClone(questionRequests.codex.params);
  const schema = codex.requestedSchema as any;
  schema.properties.color_note._meta = {
    codex: { questionId: "color", isOtherAnswer: true },
  };
  const { questions } = elicitationQuestions(codex);
  expect(questions.map((q) => q.id)).toEqual(["color"]);
  expect(questions[0].customId).toBe("color_note");
  expect(questionError(questions[0], { color_note: "Purple" })).toBeUndefined();
  schema.properties.color_note._meta = {
    _askUserQuestionCustomAnswer: { questionId: "color", isCustomAnswer: true },
  };
  expect(elicitationQuestions(codex).questions[0].customId).toBe("color_note");
});

it("does not merge unrelated form fields named Other", () => {
  const { questions } = elicitationQuestions({
    requestedSchema: {
      type: "object",
      properties: {
        scope: { type: "string", enum: ["UI"] },
        other: { type: "string", title: "Other" },
      },
    },
  });
  expect(questions).toHaveLength(2);
  expect(questions[0].customId).toBeUndefined();
});

it("keeps full Codex prompts that are phrased as instructions and validates companion fields", () => {
  const params = structuredClone(questionRequests.codex.params);
  const schema = params.requestedSchema as any;
  schema.properties.color.title = "Pick a color.";
  schema.properties.color.description = "Color";
  schema.properties.color_note.minLength = 3;
  const question = elicitationQuestions(params).questions[0];
  expect(question.title).toBe("Pick a color.");
  expect(questionError(question, { color_note: "AB" })).toContain("length");
  expect(questionError(question, { color_note: "Navy" })).toBeUndefined();
});

it("retains native question order even when JSON object keys were alphabetized", () => {
  const ids = Array.from({ length: 12 }, (_, i) => `question_${i}`);
  const { questions } = elicitationQuestions({
    _meta: { _harborQuestionOrder: ids },
    requestedSchema: {
      type: "object",
      properties: Object.fromEntries(
        [...ids].sort().map((id) => [id, { type: "string", title: id }]),
      ),
    },
  });
  expect(questions.map((q) => q.id)).toEqual(ids);
});

it("preserves false/zero defaults and validates typed values and selection limits", () => {
  const { questions, defaults } = elicitationQuestions({
    requestedSchema: {
      type: "object",
      required: ["agree", "count", "checks"],
      properties: {
        agree: { type: "boolean", default: false },
        count: { type: "integer", minimum: 0, maximum: 3, default: 0 },
        checks: {
          type: "array",
          minItems: 1,
          maxItems: 1,
          items: { enum: ["Unit", "Browser"] },
        },
      },
    },
  });
  expect(defaults).toEqual({ agree: false, count: 0 });
  expect(questionError(questions[0], defaults)).toBeUndefined();
  expect(questionError(questions[1], { count: 1.5 })).toContain("valid number");
  expect(questionError(questions[1], { count: 4 })).toContain("valid number");
  expect(
    questionError(questions[2], { checks: ["Unit", "Browser"] }),
  ).toContain("number of choices");
  expect(questionError(questions[2], { checks: ["Invented"] })).toContain(
    "listed answer",
  );
});
