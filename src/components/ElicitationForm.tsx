import { useId, useState } from "react";
import { array, record, str } from "../lib/protocol";
import { Button } from "./ui/button";

type Answer = string | number | boolean | string[];
/** ACP form elicitation, including Claude/Codex question forms and custom answers. */
export function ElicitationForm({ params, busy, onAnswer }: {
  params: Record<string, unknown>;
  busy: boolean;
  onAnswer: (result: unknown) => void;
}) {
  const formId = useId();
  const schema = record(params.requestedSchema);
  const fields = Object.entries(record(schema.properties)).map(([id, value]) => [id, record(value)] as const);
  const [answers, setAnswers] = useState<Record<string, Answer>>(() => Object.fromEntries(fields.flatMap(([id, field]) => field.default === undefined ? [] : [[id, field.default as Answer]])));
  const [error, setError] = useState("");
  const choices = (field: Record<string, unknown>) => {
    const source = field.type === "array" ? record(field.items) : field;
    const titled = array(source.oneOf ?? source.anyOf);
    return titled.length ? titled.map((value) => ({ value: str(record(value).const), label: str(record(value).title, str(record(value).const)) })) : array(source.enum).map((value, i) => ({ value: str(value), label: str(array(source.enumNames)[i], str(value)) }));
  };
  const unsupported = schema.type !== "object" || fields.some(([, field]) => !["string", "number", "integer", "boolean", "array"].includes(str(field.type)) || (field.type === "array" && !choices(field).length));
  const set = (id: string, value: Answer) => setAnswers((previous) => ({ ...previous, [id]: value }));
  return <form className="request-questions" aria-busy={busy} onSubmit={(event) => {
    event.preventDefault();
    if (busy || unsupported) return;
    for (const [id, field] of fields) {
      const value = answers[id];
      if (array(schema.required).includes(id) && (value === undefined || value === "" || (Array.isArray(value) && !value.length))) {
        setError(`Answer ${str(field.title, id)} before submitting.`); return;
      }
      if (Array.isArray(value) && ((typeof field.minItems === "number" && value.length < field.minItems) || (typeof field.maxItems === "number" && value.length > field.maxItems))) {
        setError(`Check the number of choices for ${str(field.title, id)}.`); return;
      }
    }
    setError("");
    onAnswer({ action: "accept", content: answers });
  }}>
    <p>{str(params.message, "Please answer the agent’s questions.")}</p>
    {unsupported ? <p>This form contains unsupported fields. Decline it to let the agent continue.</p> : fields.map(([id, field]) => {
      const label = str(field.title, str(field.description, id));
      const options = choices(field);
      const required = array(schema.required).includes(id);
      return <div className="field-label" key={id}>
        <label htmlFor={`${formId}-${id}`}>{label}{required ? " *" : ""}</label>
        {str(field.description) && <small>{str(field.description)}</small>}
        {field.type === "array" ? <fieldset disabled={busy} aria-label={label}>
          {options.map((option) => <label key={option.value}><input type="checkbox" checked={Array.isArray(answers[id]) && (answers[id] as string[]).includes(option.value)} onChange={(event) => {
            const selected = Array.isArray(answers[id]) ? answers[id] as string[] : [];
            set(id, event.target.checked ? [...selected, option.value] : selected.filter((value) => value !== option.value));
          }} />{option.label}</label>)}
        </fieldset> : options.length ? <select id={`${formId}-${id}`} disabled={busy} required={required} value={String(answers[id] ?? "")} onChange={(event) => set(id, event.target.value)}>
          <option value="">Choose an answer</option>
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select> : field.type === "boolean" ? <select id={`${formId}-${id}`} disabled={busy} required={required} value={answers[id] === undefined ? "" : String(answers[id])} onChange={(event) => {
          if (!event.target.value) setAnswers(({ [id]: _, ...rest }) => rest);
          else set(id, event.target.value === "true");
        }}><option value="">Choose an answer</option><option value="true">Yes</option><option value="false">No</option></select> : <input id={`${formId}-${id}`} disabled={busy} required={required}
          type={["number", "integer"].includes(str(field.type)) ? "number" : ({ email: "email", uri: "url", date: "date" }[str(field.format)] ?? "text")}
          placeholder={field.format === "date-time" ? "2026-10-26T12:00:00Z" : undefined}
          step={field.type === "integer" ? 1 : "any"} min={typeof field.minimum === "number" ? field.minimum : undefined} max={typeof field.maximum === "number" ? field.maximum : undefined}
          minLength={typeof field.minLength === "number" ? field.minLength : undefined} maxLength={typeof field.maxLength === "number" ? field.maxLength : undefined}
          value={String(answers[id] ?? "")} onChange={(event) => {
            if (!event.target.value) setAnswers(({ [id]: _, ...rest }) => rest);
            else set(id, field.type === "number" || field.type === "integer" ? Number(event.target.value) : event.target.value);
          }} />}
      </div>;
    })}
    {error && <p role="alert">{error}</p>}
    <div className="request-buttons">
      <Button type="submit" disabled={busy || unsupported}>Submit answers</Button>
      <Button type="button" variant="secondary" disabled={busy} onClick={() => onAnswer({ action: "decline" })}>Decline</Button>
      <Button type="button" variant="ghost" disabled={busy} onClick={() => onAnswer({ action: "cancel" })}>Cancel</Button>
    </div>
  </form>;
}
