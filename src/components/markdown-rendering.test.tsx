// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { RichText } from "./shared";

vi.mock("@tauri-apps/api/core", async (original) => ({ ...(await original<typeof import("@tauri-apps/api/core")>()), isTauri: vi.fn(() => true) }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../lib/store", () => ({ useStore: () => ({ setError: vi.fn() }) }));
afterEach(cleanup);

it("keeps fenced source and blank lines intact with a copy action", () => {
  const source = "const n = 1;\n\n\nconst empty = '';\n";
  const { container } = render(
    <RichText text={`Use \`n\`.\n\n\`\`\`typescript\n${source}\`\`\``} />,
  );
  expect(container.querySelector("pre > code")?.textContent).toBe(source);
  expect(container.querySelector("p > code")?.textContent).toBe("n");
  expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy();
  expect(container.querySelector("figure")).toBeNull();
  expect(container.querySelector('[data-slot="file-diff"]')).toBeNull();
});

it("preserves partial fences as source while a response streams", () => {
  const view = render(<RichText text={"```python\nprint("} />);
  expect(view.container.querySelector("pre > code")?.textContent).toBe(
    "print(\n",
  );
  view.rerender(<RichText text={'```python\nprint("hello")\n\n```'} />);
  expect(view.container.querySelector("pre > code")?.textContent).toBe(
    'print("hello")\n\n',
  );
  expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy();
});

it("opens chat web links in the system browser in the desktop app", async () => {
  const { fireEvent } = await import("@testing-library/react");
  const { openUrl } = await import("@tauri-apps/plugin-opener");
  const open = vi.mocked(openUrl);
  render(<RichText text="[Example](https://example.com/path)" />);
  fireEvent.click(screen.getByRole("link", { name: "Example" }));
  expect(open).toHaveBeenCalledWith("https://example.com/path");
});
