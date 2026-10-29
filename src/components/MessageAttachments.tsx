import { useContext, useEffect, useState } from "react";
import { File as FileIcon, X } from "@/lib/icons";
import {
  IconFileTypePdf,
  IconFileTypeDoc,
  IconFileTypeXls,
  IconPresentation,
  IconFileZip,
} from "@tabler/icons-react";
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from "./ui/attachment";
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

function fileIcon(name: string) {
  const extension = name.split(".").pop()?.toLowerCase();
  if (extension === "pdf") return IconFileTypePdf;
  if (["doc", "docx", "odt", "rtf", "pages"].includes(extension ?? ""))
    return IconFileTypeDoc;
  if (["xls", "xlsx", "csv", "ods", "numbers"].includes(extension ?? ""))
    return IconFileTypeXls;
  if (["ppt", "pptx", "key", "odp"].includes(extension ?? ""))
    return IconPresentation;
  if (["zip", "gz", "tar", "7z"].includes(extension ?? "")) return IconFileZip;
  return FileIcon;
}

function AttachmentCard({
  file,
  onRemove,
}: {
  file: AttachmentFile;
  onRemove?: () => void;
}) {
  const [dimensions, setDimensions] = useState({ width: 1, height: 1 });
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
  const previewUrl =
    file.previewUrl ??
    (loaded?.source === file.previewSource ? loaded?.url : undefined);
  const image = file.mimeType.startsWith("image/") && !!previewUrl;
  const Icon = fileIcon(file.name);
  const size =
    file.size < 1024
      ? `${file.size} B`
      : file.size < 1024 * 1024
        ? `${Math.ceil(file.size / 1024)} KB`
        : `${(file.size / (1024 * 1024)).toFixed(1)} MB`;
  return (
    <Attachment title={file.name} className="w-54 border-border">
      <AttachmentMedia variant={image ? "image" : "icon"}>
        {image ? (
          <LightboxPhoto
            src={previewUrl!}
            alt={file.name}
            {...dimensions}
            className="size-full"
          >
            <img
              src={previewUrl}
              alt={file.name}
              className="size-full object-cover"
              onLoad={(event) => {
                const { naturalWidth: width, naturalHeight: height } =
                  event.currentTarget;
                if (width && height) setDimensions({ width, height });
              }}
            />
          </LightboxPhoto>
        ) : (
          <Icon aria-hidden="true" />
        )}
      </AttachmentMedia>
      <AttachmentContent>
        <AttachmentTitle>{file.name}</AttachmentTitle>
        <AttachmentDescription>{size}</AttachmentDescription>
      </AttachmentContent>
      {onRemove && (
        <AttachmentActions>
          <AttachmentAction
            aria-label={`Remove ${file.name}`}
            onClick={(event) => {
              event.stopPropagation();
              onRemove();
            }}
          >
            <X />
          </AttachmentAction>
        </AttachmentActions>
      )}
    </Attachment>
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
  useEffect(() => {
    if (!file.type.startsWith("image/")) return;
    const url = URL.createObjectURL(file);
    setPreview({ file, url });
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return (
    <AttachmentCard
      file={{
        name: file.name,
        mimeType: file.type,
        size: file.size,
        previewUrl: preview?.file === file ? preview.url : undefined,
      }}
      onRemove={onRemove}
    />
  );
}

export function MessageAttachments({ files }: { files: AttachmentFile[] }) {
  return (
    <AttachmentGroup
      layout="scroll"
      aria-label="Attachments"
      className="mb-2 flex flex-wrap gap-2"
    >
      {files.map((file, index) => (
        <AttachmentCard key={`${index}:${file.name}`} file={file} />
      ))}
    </AttachmentGroup>
  );
}
