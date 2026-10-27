import { useState } from "react";
import {
  Questionnaire,
  QuestionnaireActions,
  QuestionnaireChoice,
  QuestionnaireChoices,
  QuestionnaireItem,
  QuestionnaireNext,
  QuestionnairePrevious,
  QuestionnaireProgress,
  QuestionnaireSubmit,
  QuestionnaireTitle,
} from "./ui/questionnaire";
import { RadioGroup, RadioItem } from "./ui/radio-group";
import { CheckboxGroup, CheckboxItem } from "./ui/checkbox-group";
import { Button } from "./ui/button";

export type ClarificationQuestion = {
  id: string;
  title: string;
  multiple?: boolean;
  options: { id: string; title: string; description?: string }[];
};

/** Fluid rows own interaction; hidden native choices register form values and
 * validation with the headless Questionnaire without duplicate focus stops. */
export function ClarificationQuestionnaire({
  questions,
  busy,
  onComplete,
}: {
  questions: ClarificationQuestion[];
  busy: boolean;
  onComplete: (
    answers: { questionId: string; selectedOptionIds: string[] }[],
  ) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [active, setActive] = useState(questions[0]?.id ?? "");
  const current = questions.find((q) => q.id === active);
  const complete = (values: Record<string, string[]>) =>
    onComplete(
      questions.map((q) => ({
        questionId: q.id,
        selectedOptionIds: values[q.id] ?? [],
      })),
    );
  const choose = (q: ClarificationQuestion, value: string) => {
    if (busy) return;
    const values = { ...answers, [q.id]: [value] };
    setAnswers(values);
    // Preserve Harbor's single-choice flow: selecting advances immediately.
    if (!questions.some((question) => question.multiple)) {
      const next =
        questions[questions.findIndex((question) => question.id === q.id) + 1];
      if (next) setActive(next.id);
      else complete(values);
    }
  };
  return (
    <Questionnaire
      className="fluid-questionnaire"
      item={active}
      onItemChange={setActive}
      aria-busy={busy}
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy && questions.every((q) => answers[q.id]?.length))
          complete(answers);
      }}
    >
      {questions.length > 1 && <QuestionnaireProgress />}
      {questions.map((q) => (
        <QuestionnaireItem
          key={q.id}
          name={q.id}
          multiple={q.multiple}
          required
          disabled={busy}
        >
          <QuestionnaireTitle>{q.title}</QuestionnaireTitle>
          <QuestionnaireChoices>
            <div hidden aria-hidden="true">
              {q.options.map((option) => (
                <QuestionnaireChoice
                  key={option.id}
                  value={option.id}
                  checked={answers[q.id]?.includes(option.id) ?? false}
                >
                  {option.title}
                </QuestionnaireChoice>
              ))}
            </div>
            {q.multiple ? (
              <CheckboxGroup
                className="questionnaire-options"
                checkedIndices={
                  new Set(
                    q.options.flatMap((option, i) =>
                      answers[q.id]?.includes(option.id) ? [i] : [],
                    ),
                  )
                }
              >
                {q.options.map((option, index) => (
                  <CheckboxItem
                    className="questionnaire-option"
                    key={option.id}
                    index={index}
                    label={option.title}
                    checked={answers[q.id]?.includes(option.id) ?? false}
                    onToggle={() =>
                      !busy &&
                      setAnswers((previous) => ({
                        ...previous,
                        [q.id]: previous[q.id]?.includes(option.id)
                          ? previous[q.id].filter((id) => id !== option.id)
                          : [...(previous[q.id] ?? []), option.id],
                      }))
                    }
                  />
                ))}
              </CheckboxGroup>
            ) : (
              <RadioGroup
                className="questionnaire-options"
                value={answers[q.id]?.[0] ?? ""}
                onValueChange={(value) => choose(q, value)}
              >
                {q.options.map((option, index) => (
                  <RadioItem
                    className="questionnaire-option"
                    key={option.id}
                    index={index}
                    value={option.id}
                    label={option.title}
                    description={option.description}
                  />
                ))}
              </RadioGroup>
            )}
          </QuestionnaireChoices>
        </QuestionnaireItem>
      ))}
      <QuestionnaireActions>
        <QuestionnairePrevious
          render={<Button variant="secondary" />}
          disabled={busy}
        />
        <QuestionnaireNext
          render={<Button />}
          disabled={busy || !current || !answers[current.id]?.length}
        />
        <QuestionnaireSubmit
          render={<Button />}
          disabled={busy || questions.some((q) => !answers[q.id]?.length)}
        >
          Submit answers
        </QuestionnaireSubmit>
      </QuestionnaireActions>
    </Questionnaire>
  );
}
