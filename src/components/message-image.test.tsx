// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MessageImageContext } from "./MessageImage";
import { RichText } from "./shared";
import { call } from "../lib/api";

vi.mock("../lib/api", () => ({ call: vi.fn() }));
vi.mock("../lib/store", () => ({ useStore: () => ({ setError: vi.fn() }) }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

const image = "data:image/png;base64,iVBORw0KGgo=";
it("resolves relative Markdown screenshots in the current conversation", async () => {
  vi.mocked(call).mockResolvedValue(image);
  render(
    <MessageImageContext.Provider value={{ sessionId: "chat", childId: null }}>
      <RichText text="![Confirmer path](images/confirmer.png)" />
    </MessageImageContext.Provider>,
  );
  await waitFor(() =>
    expect(
      screen.getByRole("img", { name: "Confirmer path" }).getAttribute("src"),
    ).toBe(image),
  );
  expect(call).toHaveBeenCalledWith("read_message_image", {
    sessionId: "chat",
    childId: null,
    source: "images/confirmer.png",
  });
  expect(
    screen
      .getByRole("button", { name: "Open Confirmer path" })
      .getAttribute("aria-haspopup"),
  ).toBe("dialog");
});

it("scopes worker images to their worker and replaces failed images with readable text", async () => {
  vi.mocked(call).mockRejectedValue(new Error("Missing file"));
  render(
    <MessageImageContext.Provider
      value={{ sessionId: "chat", childId: "worker" }}
    >
      <RichText text="![Backfill path](images/backfill.png)" />
    </MessageImageContext.Provider>,
  );
  expect(
    await screen.findByText("Backfill path — Image unavailable"),
  ).toBeTruthy();
  expect(call).toHaveBeenCalledWith("read_message_image", {
    sessionId: "chat",
    childId: "worker",
    source: "images/backfill.png",
  });
  expect(document.querySelector("img")).toBeNull();
});

it("keeps web image URLs intact and handles browser load failures", () => {
  render(<RichText text="![Screenshot](https://example.com/shot.png)" />);
  const img = screen.getByRole("img", { name: "Screenshot" });
  expect(img.getAttribute("src")).toBe("https://example.com/shot.png");
  expect(call).not.toHaveBeenCalled();
  fireEvent.error(img);
  expect(screen.getByText("Screenshot — Image unavailable")).toBeTruthy();
});
