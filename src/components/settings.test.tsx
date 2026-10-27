import { supportedProviders } from "../lib/bindings/supported-providers";
// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Settings } from "./Settings";
import { ProviderConnectionButton } from "./ProviderConnectionButton";
import type { ProviderDefinition } from "../lib/bindings/ProviderDefinition";

const mock = vi.hoisted(() => ({
  call: vi.fn(),
  refresh: vi.fn(),
  setError: vi.fn(),
  settings: { editor: "/Applications/Zed.app" } as Record<string, unknown>,
  providers: [] as ProviderDefinition[],
  open: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: mock.open }));
vi.mock("../lib/api", () => ({
  desktop: true,
  call: mock.call,
  json: (value: unknown) => value,
}));
vi.mock("../lib/store", () => ({
  useStore: () => ({
    data: { providers: mock.providers, settings: mock.settings },
    refresh: mock.refresh,
    setError: mock.setError,
  }),
}));
beforeAll(() => {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});
beforeEach(() => {
  vi.clearAllMocks();
  mock.settings = { editor: "/Applications/Zed.app" };
  mock.providers = [];
  mock.refresh.mockResolvedValue(undefined);
  mock.open.mockResolvedValue(null);
  mock.call.mockImplementation(async (command: string) =>
    command === "list_editors"
      ? [
          { value: "/Applications/Zed.app", label: "Zed" },
          { value: "/Applications/Local Editor.app", label: "Local Editor" },
        ]
      : undefined,
  );
});

const grok: ProviderDefinition = {
  id: "grok",
  name: "Grok Build",
  command: "grok",
  args: ["--no-auto-update", "agent", "stdio"],
  nativeCommand: "grok",
  installHint: "Install Grok Build",
  color: "sand",
};

it("configures a renamed Grok Build executable from the composer without changing its identity or arguments", async () => {
  mock.providers = [{ ...grok }];
  const user = userEvent.setup();
  render(<ProviderConnectionButton providerId="grok" />);
  await user.click(
    screen.getByRole("button", { name: "Configure executable" }),
  );
  expect(screen.getByRole("dialog").textContent).toContain(
    "Grok Build connection",
  );
  expect(
    screen.queryByRole("textbox", { name: "Native CLI executable" }),
  ).toBeNull();
  expect(screen.queryByRole("textbox", { name: "Arguments" })).toBeNull();
  const command = screen.getByRole("textbox", { name: "Executable" });
  await user.clear(command);
  await user.type(command, "  local-grok  ");
  await user.click(screen.getByRole("button", { name: "Advanced" }));
  expect(
    (
      screen.getByRole("textbox", {
        name: "Native CLI executable",
      }) as HTMLInputElement
    ).value,
  ).toBe("  local-grok  ");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() =>
    expect(mock.call).toHaveBeenCalledWith("save_provider", {
      provider: {
        ...grok,
        command: "local-grok",
        nativeCommand: "local-grok",
      },
    }),
  );
  expect(mock.refresh).toHaveBeenCalledOnce();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

it("browses for an executable and checks the saved provider", async () => {
  mock.providers = [{ ...grok }];
  mock.open.mockResolvedValue("/Applications/Local Tools/local-grok");
  mock.call.mockResolvedValue({
    status: "ready",
    message: "Connected and authenticated",
    path: "/Applications/Local Tools/local-grok",
    version: "1.0",
  });
  const user = userEvent.setup();
  render(<ProviderConnectionButton providerId="grok" />);
  await user.click(
    screen.getByRole("button", { name: "Configure executable" }),
  );
  await user.click(screen.getByRole("button", { name: "Browse…" }));
  expect(mock.open).toHaveBeenCalledWith({
    title: "Choose Grok Build executable",
    directory: false,
    multiple: false,
  });
  await user.click(screen.getByRole("button", { name: "Save and check" }));
  await screen.findByText("Connected");
  expect(mock.call).toHaveBeenCalledWith("save_provider", {
    provider: {
      ...grok,
      command: "/Applications/Local Tools/local-grok",
      nativeCommand: "/Applications/Local Tools/local-grok",
    },
  });
  expect(mock.call).toHaveBeenCalledWith("probe_provider", {
    providerId: "grok",
  });
  expect(mock.refresh).toHaveBeenCalledOnce();
});

it("preserves a separately configured native CLI when changing an ACP adapter", async () => {
  mock.providers = [{ ...grok, command: "grok-acp" }];
  const user = userEvent.setup();
  render(<Settings />);
  await user.click(screen.getByRole("combobox", { name: "Agent connection" }));
  await user.click(screen.getByRole("option", { name: "Grok Build" }));
  const command = screen.getByRole("textbox", { name: "Executable" });
  await user.clear(command);
  await user.type(command, "custom-acp");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() =>
    expect(mock.call).toHaveBeenCalledWith("save_provider", {
      provider: { ...grok, command: "custom-acp" },
    }),
  );
});
afterEach(cleanup);

it("lists only discovered apps and saves the selected application", async () => {
  const user = userEvent.setup();
  render(<Settings />);
  await waitFor(() => expect(mock.call).toHaveBeenCalledWith("list_editors"));
  const picker = screen.getByRole("combobox", { name: "External editor" });
  await waitFor(() => expect(picker.textContent).toContain("Zed"));
  expect(
    screen.queryByRole("textbox", { name: "Editor executable" }),
  ).toBeNull();
  await user.click(picker);
  expect(screen.getAllByRole("option").map((item) => item.textContent)).toEqual(
    ["Zed", "Local Editor"],
  );
  await user.click(screen.getByRole("option", { name: "Local Editor" }));
  await waitFor(() =>
    expect(mock.call).toHaveBeenCalledWith("save_settings", {
      settings: { editor: "/Applications/Local Editor.app" },
    }),
  );
});

it("disables the dropdown when no text editors are detected", async () => {
  mock.call.mockResolvedValue([]);
  render(<Settings />);
  const picker = screen.getByRole("combobox", { name: "External editor" });
  await waitFor(() => expect(picker.textContent).toContain("No editors found"));
  expect(picker.hasAttribute("disabled")).toBe(true);
});

it("offers exactly the supported providers without custom-agent creation", async () => {
  mock.providers = supportedProviders;
  const user = userEvent.setup();
  render(<Settings />);
  expect(screen.queryByRole("button", { name: "Custom agent" })).toBeNull();
  await user.click(screen.getByRole("combobox", { name: "Agent connection" }));
  expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["OpenAI Codex", "Claude Code", "Grok Build"]);
});

it("keeps the provider draft and shows save failure in the form, then permits retry", async () => {
  const user = userEvent.setup();
  mock.providers = [grok];
  render(<Settings />);
  await user.click(screen.getByRole("combobox", { name: "Agent connection" }));
  await user.click(screen.getByRole("option", { name: "Grok Build" }));
  await user.clear(screen.getByRole("textbox", { name: "Executable" }));
  await user.type(
    screen.getByRole("textbox", { name: "Executable" }),
    "test-acp",
  );
  mock.call.mockImplementation(async (command: string) => {
    if (command === "save_provider") throw new Error("Could not save agent");
    return [];
  });
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Could not save agent",
  );
  expect(
    (
      screen.getByRole("textbox", {
        name: "Executable",
      }) as HTMLInputElement
    ).value,
  ).toBe("test-acp");
  expect(mock.setError).not.toHaveBeenCalled();
  mock.call.mockResolvedValue(undefined);
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() =>
    expect(screen.queryByRole("textbox", { name: "Executable" })).toBeNull(),
  );
});
