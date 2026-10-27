// @vitest-environment jsdom
import { beforeAll, afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ElicitationForm } from "./ElicitationForm";
import { AskUserQuestions } from "./ui/ask-user-questions";
import { questionRequests } from "../../tests/providers/questions";

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  window.matchMedia = vi.fn().mockImplementation((media) => ({
    matches: media.includes("reduced-motion"),
    media,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
  }));
});
afterEach(cleanup);
it("retains Fluid's default immediate single-choice flow", () => {
  const onComplete = vi.fn();
  render(
    <AskUserQuestions
      questions={[
        {
          id: "color",
          title: "Pick a color",
          options: [{ id: "blue", title: "Blue" }],
        },
      ]}
      onComplete={onComplete}
    />,
  );
  fireEvent.click(screen.getByRole("radio", { name: "Blue" }));
  expect(onComplete).toHaveBeenCalledExactlyOnceWith({
    color: {
      questionId: "color",
      selectedIds: ["blue"],
      otherText: undefined,
      skipped: false,
    },
  });
});

it("does not let the document shortcut edit a busy question", () => {
  const onAnswer = vi.fn();
  const view = render(
    <ElicitationForm
      params={questionRequests.claude.params}
      busy
      onAnswer={onAnswer}
    />,
  );
  fireEvent.keyDown(document.body, { key: "2" });
  view.rerender(
    <ElicitationForm
      params={questionRequests.claude.params}
      busy={false}
      onAnswer={onAnswer}
    />,
  );
  expect(
    screen.getByRole("radio", { name: "Green" }).getAttribute("aria-checked"),
  ).toBe("false");
  expect(onAnswer).not.toHaveBeenCalled();
});

it("validates typed fields while preserving numeric defaults and secrets", () => {
  const onAnswer = vi.fn();
  render(
    <ElicitationForm
      busy={false}
      onAnswer={onAnswer}
      params={{
        requestedSchema: {
          type: "object",
          required: ["count", "secret"],
          properties: {
            count: {
              type: "integer",
              title: "Count",
              default: 0,
              minimum: 1,
              maximum: 3,
            },
            secret: {
              type: "string",
              title: "Token",
              minLength: 4,
              _meta: { codex: { isSecret: true } },
            },
          },
        },
      }}
    />,
  );
  const count = screen.getByRole("spinbutton", {
    name: "Count",
  }) as HTMLInputElement;
  expect(count.value).toBe("0");
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(screen.getByRole("alert").textContent).toContain("valid number");
  fireEvent.change(count, { target: { value: "2" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  const secret = screen.getByLabelText("Token") as HTMLInputElement;
  expect(secret.type).toBe("password");
  fireEvent.change(secret, { target: { value: "abc" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(screen.getByRole("alert").textContent).toContain("length");
  fireEvent.change(secret, { target: { value: "abcd" } });
  fireEvent.keyDown(secret, { key: "Enter", ctrlKey: true, isComposing: true });
  expect(onAnswer).not.toHaveBeenCalled();
  fireEvent.keyDown(secret, { key: "Enter", ctrlKey: true });
  expect(onAnswer).toHaveBeenCalledExactlyOnceWith({
    action: "accept",
    content: { count: 2, secret: "abcd" },
  });
});
it.each(["codex", "claude", "grok"])(
  "renders %s questions with visible choices and inline custom input",
  (provider) => {
    const onAnswer = vi.fn();
    render(
      <ElicitationForm
        params={questionRequests[provider].params}
        busy={false}
        onAnswer={onAnswer}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "What's your favorite color?" }),
    ).toBeTruthy();
    expect(screen.getAllByText("Calm and classic").length).toBeGreaterThan(0);
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByRole("radio", { name: "Blue" }).getAttribute("aria-description")).toBe("Calm and classic");
    fireEvent.click(screen.getByRole("radio", { name: "Green" }));
    fireEvent.click(screen.getByRole("radio", { name: "Blue" }));
    expect(screen.getByRole("radio", { name: "Green" }).getAttribute("aria-checked")).toBe("false");
    expect(onAnswer).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("textbox", { name: /Something else/ }), {
      target: { value: "Navy, specifically" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    const field = provider === "codex" ? "color" : "question_0";
    const custom = provider === "codex" ? "color_note" : "question_0_custom";
    expect(onAnswer).toHaveBeenCalledWith({
      action: "accept",
      content: { [field]: "Blue", [custom]: "Navy, specifically" },
    });
  },
);

it("retains earlier answers when moving backward through multiple questions", () => {
  const onAnswer = vi.fn();
  render(
    <ElicitationForm
      busy={false}
      onAnswer={onAnswer}
      params={{
        requestedSchema: {
          type: "object",
          required: ["scope", "checks"],
          properties: {
            scope: {
              type: "string",
              title: "Which scope?",
              oneOf: [
                {
                  const: "ui",
                  title: "Interface",
                  description: "Update the visible controls",
                },
              ],
            },
            checks: {
              type: "array",
              title: "Which checks?",
              minItems: 1,
              items: { enum: ["Unit", "Browser"] },
            },
          },
        },
      }}
    />,
  );
  fireEvent.click(screen.getByRole("radio", { name: /Interface/ }));
  fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
  fireEvent.click(screen.getByRole("checkbox", { name: /Unit/ }));
  fireEvent.click(screen.getByRole("checkbox", { name: /Browser/ }));
  fireEvent.click(screen.getByRole("button", { name: "Previous question" }));
  expect(
    screen
      .getByRole("radio", { name: /Interface/ })
      .getAttribute("aria-checked"),
  ).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
  fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
  expect(onAnswer).toHaveBeenCalledWith({
    action: "accept",
    content: { scope: "ui", checks: ["Unit", "Browser"] },
  });
});

it("keeps multi-line custom answers through the Fluid field and keyboard submission", () => {
  const onAnswer = vi.fn();
  render(
    <ElicitationForm
      params={questionRequests.claude.params}
      busy={false}
      onAnswer={onAnswer}
    />,
  );
  const input = screen.getByRole("textbox", { name: /Something else/ });
  fireEvent.change(input, { target: { value: "Navy\nWith a little green" } });
  fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
  expect(onAnswer).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: "Enter", ctrlKey: true });
  expect(onAnswer).toHaveBeenCalledWith({
    action: "accept",
    content: { question_0_custom: "Navy\nWith a little green" },
  });
});

it("gives the inline answer arrow a name and keyboard activation", () => {
  const onAnswer = vi.fn();
  render(
    <ElicitationForm
      params={questionRequests.claude.params}
      busy={false}
      onAnswer={onAnswer}
    />,
  );
  const input = screen.getByRole("textbox", { name: /Something else/ });
  fireEvent.change(input, { target: { value: "Navy" } });
  fireEvent.focus(input);
  fireEvent.keyDown(screen.getByRole("button", { name: "Submit answer" }), {
    key: "Enter",
  });
  expect(onAnswer).toHaveBeenCalledExactlyOnceWith({
    action: "accept",
    content: { question_0_custom: "Navy" },
  });
});

it("keeps Fluid choices and custom fields inactive during submission", () => {
  const onAnswer = vi.fn();
  const view = render(
    <ElicitationForm
      params={questionRequests.claude.params}
      busy
      onAnswer={onAnswer}
    />,
  );
  const choice = screen.getByRole("radio", { name: "Blue" });
  const custom = screen.getByRole("textbox", { name: /Something else/ });
  expect(choice.getAttribute("aria-disabled")).toBe("true");
  expect((custom as HTMLTextAreaElement).disabled).toBe(true);
  fireEvent.click(choice);
  fireEvent.change(custom, { target: { value: "Should not be saved" } });
  view.rerender(
    <ElicitationForm
      params={questionRequests.claude.params}
      busy={false}
      onAnswer={onAnswer}
    />,
  );
  expect(
    screen.getByRole("radio", { name: "Blue" }).getAttribute("aria-checked"),
  ).toBe("false");
  expect(
    (
      screen.getByRole("textbox", {
        name: /Something else/,
      }) as HTMLTextAreaElement
    ).value,
  ).toBe("");
});
