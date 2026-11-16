import { useContext, useEffect, useState, type ReactNode } from "react";
import { X } from "@/lib/icons";
import { LightboxPhoto } from "./ui/lightbox";
import { MessageImageContext } from "./MessageImage";
import { call } from "../lib/api";

type AttachmentFile = {
  name: string;
  mimeType: string;
  size: number;
  previewUrl?: string;
  previewSource?: string;
};

function formatSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function FileGlyph() {
  return (
    <svg
      viewBox="0 0 32 32"
      className="size-8 shrink-0 rounded-[0.25rem] bg-[#4C8DFF]"
      aria-hidden="true"
    >
      <path
        fill="#fff"
        d="M9.2 8.2h8.1l5.5 5.4v10.2a1.6 1.6 0 0 1-1.6 1.6H9.2a1.6 1.6 0 0 1-1.6-1.6V9.8a1.6 1.6 0 0 1 1.6-1.6Z"
      />
      <path fill="#4C8DFF" d="M17.3 8.2v4.6c0 .5.4.9.9.9h4.6L17.3 8.2Z" />
      <path
        stroke="#4C8DFF"
        strokeWidth="1.3"
        strokeLinecap="round"
        d="M11.2 17.4h9.2M11.2 20.4h6.4"
      />
    </svg>
  );
}

function Spinner({ label }: { label: string }) {
  return (
    <span
      className="spin size-4 rounded-full border-2 border-muted-foreground/30 border-t-foreground"
      role="status"
      aria-label={label}
    />
  );
}

function RemoveButton({ name, onRemove }: { name: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      aria-label={`Remove ${name}`}
      onClick={(event) => {
        event.stopPropagation();
        onRemove();
      }}
      className="absolute -top-1 -right-1 z-20 flex size-[1.125rem] items-center justify-center rounded-full bg-foreground text-background outline-none hover:bg-foreground/80 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <X size={10} strokeWidth={2.5} />
    </button>
  );
}

function FileChip({
  file,
  onRemove,
  pending = false,
}: {
  file: AttachmentFile;
  onRemove?: () => void;
  pending?: boolean;
}) {
  return (
    <div
      title={file.name}
      className="relative flex h-12 max-h-12 min-h-0 max-w-64 min-w-0 items-center gap-2 rounded-lg bg-muted p-2"
    >
      {pending ? (
        <span className="flex size-8 shrink-0 items-center justify-center">
          <Spinner label={`Loading ${file.name}`} />
        </span>
      ) : (
        <FileGlyph />
      )}
      <span className="min-w-0">
        <span className="block truncate text-[0.8125rem] leading-4 font-medium text-foreground">
          {file.name}
        </span>
        <span className="block truncate text-[0.6875rem] leading-3 text-muted-foreground">
          {formatSize(file.size)}
        </span>
      </span>
      {onRemove && !pending && <RemoveButton name={file.name} onRemove={onRemove} />}
    </div>
  );
}

function useSavedPreview(file: AttachmentFile) {
  const context = useContext(MessageImageContext);
  const [loaded, setLoaded] = useState<{ source: string; url: string }>();
  useEffect(() => {
    if (
      file.previewUrl ||
      !file.mimeType.startsWith("image/") ||
      !file.previewSource ||
      !context
    )
      return;
    let cancelled = false;
    const source = file.previewSource;
    void call<string>("read_message_image", { ...context, source })
      .then((url) => {
        if (!cancelled) setLoaded({ source, url });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [file.previewUrl, file.previewSource, file.mimeType, context]);
  return (
    file.previewUrl ??
    (loaded && loaded.source === file.previewSource ? loaded.url : undefined)
  );
}

function MessageImage({ file }: { file: AttachmentFile }) {
  const [dimensions, setDimensions] = useState({ width: 1, height: 1 });
  const previewUrl = useSavedPreview(file);
  if (!previewUrl) {
    return (
      <div className="flex h-48 w-48 items-center justify-center rounded-[var(--shell-card-radius)] bg-muted">
        <Spinner label={`Loading ${file.name}`} />
      </div>
    );
  }
  return (
    <LightboxPhoto
      src={previewUrl}
      alt={file.name}
      title={file.name}
      width={dimensions.width}
      height={dimensions.height}
      className="block max-w-full overflow-hidden rounded-[var(--shell-card-radius)]"
    >
      <img
        src={previewUrl}
        alt={file.name}
        className="block h-auto max-h-[22rem] w-auto max-w-80 rounded-[var(--shell-card-radius)]"
        onLoad={(event) => {
          const { naturalWidth: width, naturalHeight: height } = event.currentTarget;
          if (width && height) setDimensions({ width, height });
        }}
      />
    </LightboxPhoto>
  );
}

function attachmentGroup(children: ReactNode) {
  return (
    <div
      data-slot="message-attachments"
      aria-label="Attachments"
      className="flex w-fit max-w-full flex-col gap-2 group-data-[align=end]/message:items-end"
    >
      {children}
    </div>
  );
}

export function MessageAttachments({ files }: { files: AttachmentFile[] }) {
  const images = files.filter((file) => file.mimeType.startsWith("image/"));
  const documents = files.filter((file) => !file.mimeType.startsWith("image/"));
  return (
    <>
      {images.length > 0 &&
        attachmentGroup(images.map((file, index) => (
          <MessageImage key={`${index}:${file.name}`} file={file} />
        )))}
      {documents.length > 0 &&
        attachmentGroup(documents.map((file, index) => (
          <FileChip key={`${index}:${file.name}`} file={file} />
        )))}
    </>
  );
}

export function DraftAttachment({
  file,
  onRemove,
}: {
  file: File;
  onRemove?: () => void;
}) {
  const [preview, setPreview] = useState<{ file: File; url: string }>();
  const image = file.type.startsWith("image/");
  useEffect(() => {
    if (!image) return;
    const url = URL.createObjectURL(file);
    setPreview({ file, url });
    return () => URL.revokeObjectURL(url);
  }, [file, image]);
  const previewUrl = preview?.file === file ? preview.url : undefined;
  if (!image) {
    return (
      <FileChip
        file={{
          name: file.name,
          mimeType: file.type,
          size: file.size,
        }}
        onRemove={onRemove}
      />
    );
  }
  return (
    <div className="relative size-12 shrink-0 rounded-lg">
      {previewUrl ? (
        <LightboxPhoto
          src={previewUrl}
          alt={file.name}
          width={1}
          height={1}
          className="block size-full overflow-hidden rounded-[inherit] outline -outline-offset-1 outline-foreground/10"
        >
          <img
            src={previewUrl}
            alt={file.name}
            className="size-full object-cover"
          />
        </LightboxPhoto>
      ) : (
        <div className="flex size-full items-center justify-center rounded-[inherit] bg-muted">
          <Spinner label={`Loading ${file.name}`} />
        </div>
      )}
      {onRemove && <RemoveButton name={file.name} onRemove={onRemove} />}
    </div>
  );
}
