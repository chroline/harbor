import { array, record, str } from "./protocol";

export type FormValue = string | number | boolean | string[];
export type FormAnswers = Record<string, FormValue>;
export type FormOption = {
  value: string | number | boolean;
  title: string;
  description: string;
  preview: string;
};
export type FormQuestion = {
  id: string;
  title: string;
  description: string;
  field: Record<string, unknown>;
  required: boolean;
  options: FormOption[];
  customId?: string;
  customField?: Record<string, unknown>;
  customRequired?: boolean;
};

function options(field: Record<string, unknown>): FormOption[] {
  if (field.type === "boolean")
    return [true, false].map((value) => ({
      value,
      title: value ? "Yes" : "No",
      description: "",
      preview: "",
    }));
  const source = field.type === "array" ? record(field.items) : field;
  const titled = array(source.oneOf ?? source.anyOf);
  return (
    titled.length
      ? titled
      : array(source.enum).map((value, index) => ({
          const: value,
          title: array(source.enumNames)[index],
        }))
  ).map((raw) => {
    const option = record(raw);
    const value = option.const as FormOption["value"];
    return {
      value,
      title: str(option.title, String(value)),
      description: str(option.description),
      preview: str(
        record(record(option._meta)["_claude/askUserQuestionOption"]).preview,
        str(record(record(option._meta)["_harbor/questionOption"]).preview),
      ),
    };
  });
}

/** Normalize ACP schemas, including current and legacy provider companion markers.
 * Keep field IDs and values untouched: they are part of the provider's contract. */
export function elicitationQuestions(params: Record<string, unknown>) {
  const schema = record(params.requestedSchema);
  const fields = Object.entries(record(schema.properties)).map(
    ([id, value]) => ({ id, field: record(value) }),
  );
  const companions = new Map<string, (typeof fields)[number]>();
  for (const entry of fields) {
    const meta = record(entry.field._meta);
    const marker = record(meta._askUserQuestionCustomAnswer);
    const codex = record(meta.codex);
    const legacy =
      /^question_\d+_custom$/.test(entry.id) &&
      entry.field.title === "Other" &&
      params.toolCallId;
    const parent = str(
      marker.questionId,
      str(codex.questionId, legacy ? entry.id.replace(/_custom$/, "") : ""),
    );
    if (
      entry.field.type === "string" &&
      parent &&
      fields.some((f) => f.id === parent && options(f.field).length) &&
      (meta._askUserQuestionCustomAnswer ||
        codex.isOtherAnswer ||
        codex.role === "user_note" ||
        legacy)
    )
      companions.set(parent, entry);
  }
  const companionIds = new Set(
    [...companions.values()].map((entry) => entry.id),
  );
  const primary = fields.filter((entry) => !companionIds.has(entry.id));
  const order = array(record(params._meta)._harborQuestionOrder);
  if (order.length)
    primary.sort((a, b) => {
      const position = (id: string) =>
        order.includes(id) ? order.indexOf(id) : order.length;
      return position(a.id) - position(b.id);
    });
  const questions: FormQuestion[] = primary.map(({ id, field }) => {
    const companion = companions.get(id);
    const bridge =
      companion ||
      record(field._meta).codex ||
      (params.toolCallId && /^question_\d+$/.test(id));
    let title = str(field.title, str(field.description, id));
    let description = str(field.description);
    if (bridge) {
      const message = str(params.message);
      if (
        primary.length === 1 &&
        message &&
        ![
          "Input requested",
          "Codex needs your input to continue.",
          "Please answer the following questions.",
        ].includes(message)
      )
        title = message;
      else if (description && message !== "Codex needs your input to continue.")
        title = description;
      description = "";
    }
    if (description === title) description = "";
    return {
      id,
      title,
      description,
      field,
      required: array(schema.required).includes(id),
      options: options(field),
      customId: companion?.id,
      customField: companion?.field,
      customRequired:
        !!companion && array(schema.required).includes(companion.id),
    };
  });
  const unsupported =
    schema.type !== "object" ||
    fields.some(
      ({ field }) =>
        !["string", "number", "integer", "boolean", "array"].includes(
          str(field.type),
        ) ||
        (field.type === "array" &&
          (!options(field).length ||
            options(field).some(
              (option) => typeof option.value !== "string",
            ))) ||
        options(field).some(
          (option) =>
            !["string", "number", "boolean"].includes(typeof option.value),
        ),
    );
  const defaults = Object.fromEntries(
    fields.flatMap(({ id, field }) =>
      field.default === undefined ? [] : [[id, field.default as FormValue]],
    ),
  );
  return { questions, unsupported, defaults };
}

export function hasAnswer(question: FormQuestion, answers: FormAnswers) {
  const value = answers[question.id];
  return (
    (value !== undefined &&
      value !== "" &&
      (!Array.isArray(value) || value.length > 0)) ||
    !!(question.customId && String(answers[question.customId] ?? "").trim())
  );
}

export function questionError(
  question: FormQuestion,
  answers: FormAnswers,
): string | undefined {
  const { field, id, title, options } = question;
  const value = answers[id];
  if (question.required && !hasAnswer(question, answers))
    return `Answer ${title} before submitting.`;
  if (question.customId && question.customField) {
    const customError = questionError(
      {
        id: question.customId,
        title: `a custom answer for ${title}`,
        description: "",
        field: question.customField,
        required: !!question.customRequired,
        options: [],
      },
      answers,
    );
    if (customError) return customError;
  }
  if (value === undefined || value === "") return;
  if (Array.isArray(value)) {
    if (
      (typeof field.minItems === "number" && value.length < field.minItems) ||
      (typeof field.maxItems === "number" && value.length > field.maxItems)
    )
      return `Check the number of choices for ${title}.`;
    if (value.some((v) => !options.some((o) => o.value === v)))
      return `Choose a listed answer for ${title}.`;
  } else if (options.length) {
    if (!options.some((o) => o.value === value))
      return `Choose a listed answer for ${title}.`;
  } else if (field.type === "number" || field.type === "integer") {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      (field.type === "integer" && !Number.isInteger(value)) ||
      (typeof field.minimum === "number" && value < field.minimum) ||
      (typeof field.maximum === "number" && value > field.maximum)
    )
      return `Enter a valid number for ${title}.`;
  } else if (typeof value === "string") {
    if (
      (typeof field.minLength === "number" && value.length < field.minLength) ||
      (typeof field.maxLength === "number" && value.length > field.maxLength)
    )
      return `Check the length of ${title}.`;
    if (field.format === "email" && !/^[^\s@]+@[^\s@]+$/.test(value))
      return `Enter a valid email for ${title}.`;
    if (field.format === "uri") {
      try {
        new URL(value);
      } catch {
        return `Enter a valid URL for ${title}.`;
      }
    }
  }
}
