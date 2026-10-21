// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { providerGlyph } from "./shared";

afterEach(cleanup);

describe("provider logos in icon slots", () => {
  it.each(["pi", "codex", "claude", "cursor", "prime", "opencode", "grok"])(
    "keeps %s visible when the sidebar passes a rem size",
    (id) => {
      const Icon = providerGlyph(id);
      const { container } = render(<Icon size="0.875rem" />);
      const mark = container.querySelector<HTMLElement>(
        ".provider-brand-mark",
      )!;
      expect(mark.style.width).toBe("0.875rem");
      expect(mark.style.height).toBe("0.875rem");
      expect(mark.style.maskImage).toMatch(/^url\(/);
    },
  );

  it("continues to support numeric pixel sizes", () => {
    const Icon = providerGlyph("codex");
    const { container } = render(<Icon size={16} />);
    const mark = container.querySelector<HTMLElement>(".provider-brand-mark")!;
    expect(mark.style.width).toBe("1rem");
    expect(mark.style.height).toBe("1rem");
  });
});
