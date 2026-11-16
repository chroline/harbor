// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { ProjectContext } from "./ProjectContext";
const mock = vi.hoisted(() => ({ call: vi.fn(), close: vi.fn() }));
vi.mock("../lib/api", () => ({ call: mock.call }));
vi.mock("./shared", () => ({
  RichText: ({ text }: { text: string }) => (
    <div>
      {text}
      {text === "Project brief" && <a href="decisions.md">Read decisions</a>}
    </div>
  ),
  IconButton: ({ label, children, ...props }: any) => (
    <button aria-label={label} {...props}>
      {children}
    </button>
  ),
}));
beforeEach(() => {
  vi.clearAllMocks();
  mock.call.mockImplementation(async (command: string, args: any) => {
    if (command === "project_documents") return ["index.md", "decisions.md"];
    if (command === "read_project_document")
      return args.path === "index.md"
        ? "Project brief"
        : "Billing belongs to organizations. Source: user.";
  });
});
afterEach(cleanup);
it("previews documents and opens the selected file in the editor", async () => {
  render(<ProjectContext projectId="billing" onClose={mock.close} />);
  await screen.findByText("Project brief");
  fireEvent.click(screen.getByRole("button", { name: "decisions.md" }));
  await screen.findByText("Billing belongs to organizations. Source: user.");
  fireEvent.click(
    screen.getByRole("button", { name: "Open context document in editor" }),
  );
  expect(mock.call).toHaveBeenCalledWith("open_project_document", {
    projectId: "billing",
    sessionId: undefined,
    path: "decisions.md",
  });
});
it("keeps historical context scoped to its original orchestrator", async () => {
  render(
    <ProjectContext
      projectId="billing"
      sessionId="old-chat"
      onClose={mock.close}
    />,
  );
  await screen.findByText("Project brief");
  expect(mock.call).toHaveBeenCalledWith("read_project_document", {
    projectId: "billing",
    sessionId: "old-chat",
    path: "index.md",
  });
});
it("shows filesystem errors and supports explicit initialization/retry", async () => {
  mock.call.mockRejectedValueOnce(new Error("Folder is missing"));
  render(<ProjectContext projectId="billing" onClose={mock.close} />);
  await screen.findByText(/Folder is missing/);
  fireEvent.click(
    screen.getByRole("button", { name: "Initialize or retry context" }),
  );
  await waitFor(() =>
    expect(mock.call).toHaveBeenCalledWith("initialize_project_context", {
      projectId: "billing",
    }),
  );
  await screen.findByText("Project brief");
});
it("closes on Escape", async () => {
  render(<ProjectContext projectId="billing" onClose={mock.close} />);
  fireEvent.keyDown(
    screen.getByRole("complementary", { name: "Project context" }),
    { key: "Escape" },
  );
  expect(mock.close).toHaveBeenCalledOnce();
});

it("follows relative document links inside the context panel", async () => {
  render(<ProjectContext projectId="billing" onClose={mock.close} />);
  fireEvent.click(await screen.findByRole("link", { name: "Read decisions" }));
  await screen.findByText("Billing belongs to organizations. Source: user.");
});
