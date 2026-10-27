import { useMemo, useState } from "react";
import { useIcons } from "@/lib/icon-context";
import {
  elicitationQuestions,
  questionError,
  type FormAnswers,
  type FormQuestion,
} from "../lib/elicitation";
import { record, str } from "../lib/protocol";
import {
  AskUserQuestions,
  type AskUserAnswer,
  type AskUserQuestion,
} from "./ui/ask-user-questions";
import { Button } from "./ui/button";
import "./ui/agent-card.css";
import "./question-card.css";

type Answers = Record<string, AskUserAnswer>;
const secret = (field: Record<string, unknown>) =>
  record(record(field._meta).codex).isSecret === true;

/** Translate display IDs back to the provider's original field IDs and types. */
function formAnswers(questions: FormQuestion[], answers: Answers): FormAnswers {
  const result: FormAnswers = {};
  for (const question of questions) {
    const answer = answers[question.id];
    if (!answer || answer.skipped) continue;
    if (question.options.length) {
      const values = answer.selectedIds.flatMap((id) => {
        const option = question.options[Number(id)];
        return option ? [option.value] : [];
      });
      if (question.field.type === "array")
        result[question.id] = values as string[];
      else if (values.length) result[question.id] = values[0];
      if (question.customId && answer.otherText)
        result[question.customId] = answer.otherText;
    } else if (answer.otherText) {
      result[question.id] = ["integer", "number"].includes(
        str(question.field.type),
      )
        ? Number(answer.otherText)
        : answer.otherText;
    }
  }
  return result;
}

/** ACP/native transport adapter. Fluid owns the question flow and controls. */
export function ElicitationForm({
  params,
  busy,
  onAnswer,
  error,
}: {
  params: Record<string, unknown>;
  busy: boolean;
  onAnswer: (result: unknown) => void;
  error?: string;
}) {
  const icons = useIcons();
  const ArrowRight = icons["arrow-right"];
  const { questions, unsupported, defaults } = useMemo(
    () => elicitationQuestions(params),
    [params],
  );
  const [answers, setAnswers] = useState<Answers>(() =>
    Object.fromEntries(
      questions.flatMap((question) => {
        const value = defaults[question.id];
        const other = question.customId
          ? defaults[question.customId]
          : undefined;
        if (value === undefined && other === undefined) return [];
        return [
          [
            question.id,
            {
              questionId: question.id,
              selectedIds: question.options.flatMap((option, index) =>
                (
                  Array.isArray(value)
                    ? value.includes(String(option.value))
                    : value === option.value
                )
                  ? [String(index)]
                  : [],
              ),
              otherText: question.options.length
                ? String(other ?? "")
                : String(value ?? ""),
            },
          ],
        ];
      }),
    ),
  );
  const [index, setIndex] = useState(0);
  const content = formAnswers(questions, answers);
  const current = questions[index];
  const preview = current?.options.find(
    (option) => option.value === content[current.id],
  )?.preview;
  const message = str(params.message);
  const flow: AskUserQuestion[] = questions.map((question) => {
    const type = str(question.field.type);
    const inputType = ["number", "integer"].includes(type)
      ? "number"
      : secret(question.field)
        ? "password"
        : { email: "email", uri: "url", date: "date" }[
            str(question.field.format)
          ];
    const showContext =
      message &&
      message !== question.title &&
      ![
        "Codex needs your input to continue.",
        "Input requested",
        "Please answer the following questions.",
      ].includes(message);
    return {
      id: question.id,
      title: question.title,
      description: [
        showContext && message,
        question.description,
        type === "array" && "Select all that apply.",
      ]
        .filter(Boolean)
        .join("\n"),
      options: question.options.map((option, optionIndex) => ({
        id: String(optionIndex),
        title: option.title,
        description: option.description,
      })),
      multiSelect: type === "array",
      allowOther: !!question.customId,
      otherPlaceholder: "Something else, or add a note…",
      otherInputType:
        question.customField && secret(question.customField)
          ? "password"
          : undefined,
      freeText: !question.options.length,
      freeTextMultiline: false,
      freeTextPlaceholder:
        question.field.format === "date-time"
          ? "2026-10-27T12:00:00Z"
          : "Type your answer…",
      inputProps: inputType
        ? {
            type: inputType,
            autoComplete: "off",
            step: type === "integer" ? 1 : "any",
            min:
              typeof question.field.minimum === "number"
                ? question.field.minimum
                : undefined,
            max:
              typeof question.field.maximum === "number"
                ? question.field.maximum
                : undefined,
          }
        : undefined,
      skippable: false,
      nextLabel: "Continue",
      validateAnswer: (answer) =>
        questionError(
          question,
          formAnswers([question], { [question.id]: answer }),
        ),
    };
  });
  const actions = (
    <>
      <Button
        variant="ghost"
        size="sm"
        trailingIcon={ArrowRight}
        disabled={busy}
        onClick={() => onAnswer({ action: "decline" })}
      >
        Skip
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={busy}
        onClick={() => onAnswer({ action: "cancel" })}
      >
        Cancel
      </Button>
    </>
  );
  if (unsupported || !questions.length)
    return (
      <div
        className="harbor-agent-card harbor-question-card"
        data-slot="question-card"
        aria-label="Agent questions"
      >
        <header className="harbor-agent-card-header">
          <h3>Questions</h3>
        </header>
        <p className="question-card-unsupported">
          {unsupported
            ? "This form contains unsupported fields. Skip it to let the agent continue."
            : "The agent requested an empty form."}
        </p>
        {error && (
          <p className="question-card-error" role="alert">
            {error}
          </p>
        )}
        <footer className="harbor-agent-card-footer">
          <div className="harbor-agent-card-actions">
            {actions}
            <Button disabled>Continue</Button>
          </div>
        </footer>
      </div>
    );
  return (
    <AskUserQuestions
      className="harbor-agent-card harbor-question-card"
      data-slot="question-card"
      aria-label="Agent questions"
      questions={flow}
      answers={answers}
      onAnswersChange={setAnswers}
      currentIndex={index}
      onCurrentIndexChange={setIndex}
      advanceOnSelect={false}
      unstyled
      disabled={busy}
      loading={busy}
      error={error}
      footerActions={actions}
      onComplete={(snapshot) =>
        onAnswer({
          action: "accept",
          content: formAnswers(questions, snapshot),
        })
      }
    >
      {preview && <pre className="question-card-preview">{preview}</pre>}
    </AskUserQuestions>
  );
}
