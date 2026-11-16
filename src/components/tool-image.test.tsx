// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ToolCard } from "./Chat";
import { MessageImageContext } from "./MessageImage";
import { call } from "../lib/api";
import { emptyTranscript, reduceEvent, toolImageSource } from "../lib/protocol";

vi.mock("../lib/api", () => ({ call: vi.fn() }));
vi.mock("./NativeTerminal", () => ({ NativeTerminal: () => null }));
vi.mock("./Review", () => ({ Review: () => null }));
vi.mock("../lib/store", () => ({ useStore: () => ({ setError: vi.fn() }) }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

// Codex ACP records view_image as a resource link, including during history replay.
const path = "/workspace/evidence/chat-lists-1440.png";
const resource = { type: "resource_link", name: path, uri: path };
const image = "data:image/png;base64,iVBORw0KGgo=";

it("renders a recorded Codex image resource through the conversation image reader", async () => {
  vi.mocked(call).mockResolvedValue(image);
  const transcript = reduceEvent(emptyTranscript(), {
    sequence: 1,
    sessionId: "chat",
    timestamp: 1,
    kind: "session/update",
    payload: {
      sessionId: "native",
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "view-image",
        title: `View Image ${path}`,
        name: "view_image",
        kind: "read",
        status: "completed",
        rawInput: { path },
        locations: [{ path }],
        content: [{ type: "content", content: resource }],
      },
    },
  });
  render(
    <MessageImageContext.Provider
      value={{ sessionId: "chat", childId: "worker" }}
    >
      <ToolCard detailsOnly tool={Object.values(transcript.tools)[0]} />
    </MessageImageContext.Provider>,
  );
  const preview = await screen.findByRole("img", {
    name: `View Image ${path}`,
  });
  expect(preview.getAttribute("src")).toBe(image);
  expect(call).toHaveBeenCalledWith("read_message_image", {
    sessionId: "chat",
    childId: "worker",
    source: path,
  });
  expect(
    screen.getByRole("button", { name: `Open View Image ${path}` }),
  ).toBeTruthy();
});

it("recognizes image resources by MIME type or URI, without treating other resources as images", () => {
  expect(toolImageSource({ type: "content", content: resource })).toBe(path);
  expect(
    toolImageSource({
      type: "resource_link",
      uri: "https://example.com/render",
      mimeType: "image/png",
    }),
  ).toBe("https://example.com/render");
  expect(
    toolImageSource({
      type: "resource_link",
      uri: "https://example.com/shot.PNG?v=1",
    }),
  ).toBe("https://example.com/shot.PNG?v=1");
  expect(
    toolImageSource({ type: "resource_link", uri: "/workspace/notes.md" }),
  ).toBeUndefined();
  expect(toolImageSource({ type: "text", text: path })).toBeUndefined();
  expect(
    toolImageSource({ type: "resource_link", name: path }),
  ).toBeUndefined();
});
