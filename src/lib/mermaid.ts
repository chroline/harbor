// Mermaid's configuration is global. Serialize initialization and rendering so
// concurrent chat blocks cannot change another diagram's theme mid-render.
let queue: Promise<unknown> = Promise.resolve();
let nextId = 0;

export function renderMermaid(
  text: string,
  dark: boolean,
  cancelled: () => boolean,
): Promise<string | undefined> {
  const job = queue
    .catch(() => {})
    .then(async () => {
      if (cancelled()) return;
      const { default: mermaid } = await import("mermaid");
      if (cancelled()) return;
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        suppressErrorRendering: true,
        theme: dark ? "dark" : "default",
        fontFamily: "Arial, sans-serif",
        htmlLabels: false,
      });
      // A dedicated offscreen container keeps Mermaid's measuring and any error
      // markup out of the conversation, and is always removed after rendering.
      const container = document.createElement("div");
      container.style.cssText =
        "position:fixed;left:-100000px;top:0;visibility:hidden";
      document.body.append(container);
      try {
        const { svg } = await mermaid.render(
          `harbor-mermaid-${++nextId}`,
          text,
          container,
        );
        const svgDocument = new DOMParser().parseFromString(
          svg,
          "image/svg+xml",
        );
        const root = svgDocument.documentElement;
        const bounds = root
          .getAttribute("viewBox")
          ?.trim()
          .split(/[\s,]+/)
          .map(Number);
        if (bounds?.length === 4 && bounds[2] > 0 && bounds[3] > 0) {
          // Give image consumers an intrinsic aspect ratio in WebKit as well
          // as Chromium; Mermaid otherwise emits width="100%" without height.
          root.setAttribute("width", String(bounds[2]));
          root.setAttribute("height", String(bounds[3]));
        }
        const image = new XMLSerializer().serializeToString(root);
        // An image isolates SVG styles, IDs and links from the app and lets the
        // inline preview and lightbox safely reuse the same render.
        return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(image)}`;
      } finally {
        container.remove();
      }
    });
  queue = job;
  return job;
}
