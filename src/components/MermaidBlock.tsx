import { ThinkingIndicator } from "./ui/thinking-indicator";
import { useEffect, useState } from "react";
import { Code, Scaling } from "@/lib/icons";
import { renderMermaid } from "@/lib/mermaid";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { CopyButton } from "./shared";
import {
  MermaidCanvas,
  MIN_DIAGRAM_ZOOM,
  MAX_DIAGRAM_ZOOM,
} from "./MermaidCanvas";
import "./mermaid-block.css";

export function MermaidBlock({ text }: { text: string }) {
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains("dark"),
  );
  const [result, setResult] = useState<{
    text: string;
    dark: boolean;
    image?: string;
    failed?: boolean;
  }>();
  const [source, setSource] = useState(false);
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const observer = new MutationObserver(() =>
      setDark(document.documentElement.classList.contains("dark")),
    );
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Avoid parsing every streamed token, and discard queued or stale renders.
    const timer = setTimeout(() => {
      renderMermaid(text, dark, () => cancelled).then(
        (image) => {
          if (!cancelled) setResult({ text, dark, image });
        },
        () => {
          if (!cancelled) setResult({ text, dark, failed: true });
        },
      );
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [text, dark]);

  const current =
    result?.text === text && result.dark === dark ? result : undefined;
  const image = current?.image;

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        setZoom(1);
      }}
    >
      <figure className="harbor-mermaid-block">
        <figcaption className="mermaid-block-header">
          <span>mermaid</span>
          <div className="mermaid-block-actions">
            <Button
              variant="ghost"
              size="icon-compact"
              aria-label="Show Mermaid source"
              aria-pressed={source}
              onClick={() => setSource(!source)}
            >
              <Code />
            </Button>
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon-compact"
                aria-label="Expand diagram"
                disabled={!image}
              >
                <Scaling />
              </Button>
            </DialogTrigger>
            <CopyButton text={text} />
          </div>
        </figcaption>
        {source || current?.failed ? (
          <>
            {current?.failed && (
              <p className="mermaid-status" role="status">
                Diagram preview unavailable. Showing source.
              </p>
            )}
            <pre className="mermaid-source" dir="ltr" tabIndex={0}>
              {text}
            </pre>
          </>
        ) : image ? (
          <button
            type="button"
            className="mermaid-preview"
            aria-label="Expand Mermaid diagram"
            onClick={() => {
              setZoom(1);
              setOpen(true);
            }}
          >
            <img src={image} alt="Mermaid diagram" />
          </button>
        ) : (
          <ThinkingIndicator
            className="mermaid-status"
            label="Rendering diagram…"
          />
        )}
      </figure>
      <DialogContent className="mermaid-lightbox" size="xl">
        <div className="mermaid-lightbox-toolbar">
          <DialogTitle>Mermaid diagram</DialogTitle>
          <div
            className="mermaid-zoom-controls"
            role="group"
            aria-label="Diagram zoom"
          >
            <Button
              variant="ghost"
              size="sm"
              aria-label="Zoom out"
              disabled={zoom <= MIN_DIAGRAM_ZOOM}
              onClick={() =>
                setZoom((value) => Math.max(MIN_DIAGRAM_ZOOM, value - 0.25))
              }
            >
              −
            </Button>
            <Button title={"Fit diagram to view"}
              variant="ghost"
              size="sm"
              aria-label="Reset diagram zoom"
              onClick={() => setZoom(1)}
            >
              {Math.round(zoom * 100)}%
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Zoom in"
              disabled={zoom >= MAX_DIAGRAM_ZOOM}
              onClick={() =>
                setZoom((value) => Math.min(MAX_DIAGRAM_ZOOM, value + 0.25))
              }
            >
              +
            </Button>
          </div>
        </div>
        <DialogDescription className="sr-only">
          Pinch to zoom and scroll with two fingers to move around. Reset zoom
          to fit the whole diagram. Press Escape to close.
        </DialogDescription>
        {image ? (
          <MermaidCanvas image={image} zoom={zoom} onZoomChange={setZoom} />
        ) : (
          <div className="mermaid-status">
            {current?.failed ? (
              <p role="status">Diagram preview unavailable.</p>
            ) : (
              <ThinkingIndicator label="Rendering diagram…" />
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
