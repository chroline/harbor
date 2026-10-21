import { useEffect, useLayoutEffect, useRef, useState } from "react";

export const MIN_DIAGRAM_ZOOM = 0.25;
export const MAX_DIAGRAM_ZOOM = 4;
const PADDING = 24;
const clampZoom = (value: number) =>
  Math.min(MAX_DIAGRAM_ZOOM, Math.max(MIN_DIAGRAM_ZOOM, value));
type Size = { width: number; height: number };
type Gesture = Event & { scale: number; clientX: number; clientY: number };

export function MermaidCanvas({
  image,
  zoom,
  onZoomChange,
}: {
  image: string;
  zoom: number;
  onZoomChange: (zoom: number) => void;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState<Size>({ width: 0, height: 0 });
  const [intrinsic, setIntrinsic] = useState<Size>({ width: 0, height: 0 });
  const zoomRef = useRef(zoom);
  const onZoomRef = useRef(onZoomChange);
  const anchor = useRef<{
    x: number;
    y: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  const previous = useRef<{
    width: number;
    height: number;
    left: number;
    top: number;
  } | null>(null);

  useLayoutEffect(() => {
    zoomRef.current = zoom;
    onZoomRef.current = onZoomChange;
  }, [zoom, onZoomChange]);

  useLayoutEffect(() => {
    const element = viewport.current!;
    const measure = () =>
      setBounds({ width: element.clientWidth, height: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Explicit pixel dimensions avoid percentage-height resolution differences
  // between WebKit and Chromium. The initial view fits both axes and never
  // enlarges a small diagram beyond its intrinsic size.
  const fit =
    intrinsic.width && intrinsic.height
      ? Math.max(
          0,
          Math.min(
            1,
            (bounds.width - PADDING * 2) / intrinsic.width,
            (bounds.height - PADDING * 2) / intrinsic.height,
          ),
        )
      : 0;
  const width = intrinsic.width * fit * zoom;
  const height = intrinsic.height * fit * zoom;
  const canvasWidth = Math.max(bounds.width, width + PADDING * 2);
  const canvasHeight = Math.max(bounds.height, height + PADDING * 2);
  const left = (canvasWidth - width) / 2;
  const top = (canvasHeight - height) / 2;

  useLayoutEffect(() => {
    const element = viewport.current!;
    const old = previous.current;
    if (old?.width && old.height && width && height) {
      const point = anchor.current ?? {
        x: element.clientWidth / 2,
        y: element.clientHeight / 2,
        scrollLeft: element.scrollLeft,
        scrollTop: element.scrollTop,
      };
      // Preserve the diagram point under the fingers while its size changes.
      element.scrollLeft =
        left +
        ((point.scrollLeft + point.x - old.left) / old.width) * width -
        point.x;
      element.scrollTop =
        top +
        ((point.scrollTop + point.y - old.top) / old.height) * height -
        point.y;
    }
    previous.current = { width, height, left, top };
    anchor.current = null;
  }, [width, height, left, top]);

  useEffect(() => {
    const element = viewport.current!;
    let gestureStartZoom: number | null = null;
    const changeZoom = (
      value: number,
      event: { clientX: number; clientY: number },
    ) => {
      const next = clampZoom(value);
      if (!Number.isFinite(next) || next === zoomRef.current) return;
      const rect = element.getBoundingClientRect();
      anchor.current = {
        scrollLeft: element.scrollLeft,
        scrollTop: element.scrollTop,
        x:
          Number.isFinite(event.clientX) && rect.width
            ? ((event.clientX - rect.left) * element.clientWidth) / rect.width
            : element.clientWidth / 2,
        y:
          Number.isFinite(event.clientY) && rect.height
            ? ((event.clientY - rect.top) * element.clientHeight) / rect.height
            : element.clientHeight / 2,
      };
      zoomRef.current = next;
      onZoomRef.current(next);
    };
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return; // Ordinary two-finger scrolling pans natively.
      event.preventDefault();
      if (gestureStartZoom !== null) return; // Avoid handling a WebKit pinch twice.
      const unit =
        event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? element.clientHeight
            : 1;
      changeZoom(
        zoomRef.current * Math.exp(-event.deltaY * unit * 0.01),
        event,
      );
    };
    const gestureStart = (event: Event) => {
      event.preventDefault();
      gestureStartZoom = zoomRef.current;
    };
    const gestureChange = (event: Event) => {
      event.preventDefault();
      if (gestureStartZoom !== null)
        changeZoom(
          gestureStartZoom * (event as Gesture).scale,
          event as Gesture,
        );
    };
    const gestureEnd = (event: Event) => {
      event.preventDefault();
      gestureStartZoom = null;
    };
    element.addEventListener("wheel", wheel, { passive: false });
    element.addEventListener("gesturestart", gestureStart, { passive: false });
    element.addEventListener("gesturechange", gestureChange, {
      passive: false,
    });
    element.addEventListener("gestureend", gestureEnd, { passive: false });
    return () => {
      element.removeEventListener("wheel", wheel);
      element.removeEventListener("gesturestart", gestureStart);
      element.removeEventListener("gesturechange", gestureChange);
      element.removeEventListener("gestureend", gestureEnd);
    };
  }, []);

  return (
    <div
      ref={viewport}
      className="mermaid-lightbox-viewport"
      tabIndex={0}
      aria-label="Diagram canvas"
    >
      <div
        className="mermaid-lightbox-canvas"
        style={{ width: canvasWidth, height: canvasHeight }}
      >
        <img
          src={image}
          alt="Mermaid diagram"
          draggable={false}
          onLoad={(event) =>
            setIntrinsic({
              width: event.currentTarget.naturalWidth,
              height: event.currentTarget.naturalHeight,
            })
          }
          style={{
            width,
            height,
            left,
            top,
            visibility: fit ? "visible" : "hidden",
          }}
        />
      </div>
    </div>
  );
}
