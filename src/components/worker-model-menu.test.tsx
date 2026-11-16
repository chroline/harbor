// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { WorkerModelMenu } from "./ModelMenu";
afterEach(cleanup);
it("shows the worker's reported model with its native configuration restriction", () => {
  render(<WorkerModelMenu provider="codex" capabilities={{ harborConfigOptions: [{ id: "model", category: "model", type: "select", currentValue: "worker-model", options: [{ value: "worker-model", name: "Worker model" }] }] }} />);
  expect(screen.getByRole("button", { name: "Worker model" }).hasAttribute("disabled")).toBe(true);
  expect(screen.getByLabelText(/Worker model.*managed by its provider/)).toBeTruthy();
});
it("does not substitute the parent's model when the worker has not reported one", () => {
  render(<WorkerModelMenu provider="codex" capabilities={{}} />);
  expect(screen.getByRole("button", { name: "Provider-managed model" })).toBeTruthy();
});
