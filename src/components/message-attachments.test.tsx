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

it("shows a document as a name and size, separate from image previews", () => {
  render(
    <MessageAttachments
      files={[
        {
          name: "OpenUsage-0.7.16.dmg",
          mimeType: "application/octet-stream",
          size: 23_278_387,
        },
      ]}
    />,
  );
  expect(screen.getByText("OpenUsage-0.7.16.dmg")).toBeTruthy();
  expect(screen.getByText("22.2 MB")).toBeTruthy();
  expect(screen.queryByRole("img")).toBeNull();
});
