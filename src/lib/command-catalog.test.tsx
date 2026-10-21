// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useCommandCatalog } from "./command-catalog";
import { browserBootstrap } from "./api";
const mocks = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  desktop: true,
  call: mocks.call,
}));
afterEach(() => {
  cleanup();
  mocks.call.mockReset();
});
it("deduplicates concurrent requests and ignores replies for a previous workspace", async () => {
  let resolveOld!: (value: unknown) => void;
  let resolveNew!: (value: unknown) => void;
  mocks.call
    .mockImplementationOnce(() => new Promise((r) => (resolveOld = r)))
    .mockImplementationOnce(() => new Promise((r) => (resolveNew = r)));
  const provider = browserBootstrap.providers[0];
  const first = renderHook(({ cwd }) => useCommandCatalog(provider, cwd), {
    initialProps: { cwd: "/old" },
  });
  const second = renderHook(() => useCommandCatalog(provider, "/old"));
  expect(mocks.call).toHaveBeenCalledTimes(1);
  first.rerender({ cwd: "/new" });
  expect(first.result.current.status).toBe("loading");
  await act(async () => resolveNew([{ name: "$new", description: "New" }]));
  await waitFor(() =>
    expect(first.result.current.commands[0].name).toBe("$new"),
  );
  await act(async () => resolveOld([{ name: "$old", description: "Old" }]));
  expect(first.result.current.commands[0].name).toBe("$new");
  expect(second.result.current.commands[0].name).toBe("$old");
});
it("offers retry after failure and treats an empty advertised list as unavailable", async () => {
  mocks.call
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce([]);
  const { result } = renderHook(() =>
    useCommandCatalog(browserBootstrap.providers[0], "/retry"),
  );
  await waitFor(() => expect(result.current.status).toBe("error"));
  act(() => result.current.retry?.());
  await waitFor(() => expect(result.current.status).toBe("unavailable"));
  expect(mocks.call).toHaveBeenCalledTimes(2);
});
