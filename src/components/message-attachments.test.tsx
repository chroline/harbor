// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MessageImageContext } from "./MessageImage";
import { MessageAttachments } from "./MessageAttachments";
import { call } from "../lib/api";
vi.mock("../lib/api", () => ({ call: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it("loads a saved screenshot without a provider echo and exposes the lightbox", async () => {
  const image = "data:image/png;base64,iVBORw0KGgo=";
  vi.mocked(call).mockResolvedValue(image);
  render(
    <MessageImageContext.Provider
      value={{ sessionId: "grok-chat", childId: null }}
    >
      <MessageAttachments
        files={[
          {
            name: "screen.png",
            mimeType: "image/png",
            size: 8,
            previewSource: "harbor-attachment:batch/0-screen.png",
          },
        ]}
      />
    </MessageImageContext.Provider>,
  );
  await waitFor(() =>
    expect(
      screen.getByRole("img", { name: "screen.png" }).getAttribute("src"),
    ).toBe(image),
  );
  expect(call).toHaveBeenCalledWith("read_message_image", {
    sessionId: "grok-chat",
    childId: null,
    source: "harbor-attachment:batch/0-screen.png",
  });
  expect(
    screen
      .getByRole("button", { name: "Open screen.png" })
      .getAttribute("aria-haspopup"),
  ).toBe("dialog");
});
