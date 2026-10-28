import { createContext, useContext, useEffect, useState } from "react";
import { call } from "../lib/api";
import { LightboxPhoto } from "./ui/lightbox";

export const MessageImageContext = createContext<{
  sessionId: string;
  childId: string | null;
} | null>(null);

/** Markdown image paths belong to the conversation, not the UI's origin. */
export function MessageImage({
  src,
  alt,
  title,
}: {
  src?: string;
  alt?: string;
  title?: string;
}) {
  const context = useContext(MessageImageContext);
  const local = !!src && !/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(src);
  const key = `${context?.sessionId}:${context?.childId}:${src}`;
  const [dimensions, setDimensions] = useState({
    key: "",
    width: 1,
    height: 1,
  });
  const [loaded, setLoaded] = useState<{
    key: string;
    url?: string;
    failed?: boolean;
  } | null>(null);
  useEffect(() => {
    if (!local || !context || !src) return;
    let cancelled = false;
    void call<string>("read_message_image", { ...context, source: src })
      .then((url) => {
        if (!cancelled) setLoaded({ key, url });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ key, failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [local, context, src, key]);
  const resolved =
    local && context ? (loaded?.key === key ? loaded.url : undefined) : src;
  const failed = loaded?.key === key && loaded.failed;
  if (failed || !src)
    return (
      <span
        role="img"
        aria-label={alt || "Image unavailable"}
        title={src}
        className="inline-flex rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground"
      >
        {alt ? `${alt} — ` : ""}Image unavailable
      </span>
    );
  if (!resolved)
    return (
      <span className="text-sm text-muted-foreground">Loading image…</span>
    );
  return (
    <LightboxPhoto
      key={resolved}
      src={resolved}
      alt={alt || "Image"}
      width={dimensions.key === key ? dimensions.width : 1}
      height={dimensions.key === key ? dimensions.height : 1}
      className="max-w-full rounded-lg"
    >
      <img
        src={resolved}
        alt={alt ?? ""}
        title={title}
        className="max-h-[40rem] max-w-full rounded-lg object-contain"
        onLoad={(event) => {
          const { naturalWidth: width, naturalHeight: height } =
            event.currentTarget;
          if (width && height) setDimensions({ key, width, height });
        }}
        onError={() => setLoaded({ key, failed: true })}
      />
    </LightboxPhoto>
  );
}
