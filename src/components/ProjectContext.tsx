import { useEffect, useRef, useState } from "react";
import { call } from "../lib/api";
import { RichText, IconButton } from "./shared";
import { RefreshCw, ExternalLink, X, BookOpen } from "@/lib/icons";
import { Button } from "./ui/button";
import "./project-context.css";

export function ProjectContext({
  projectId,
  sessionId,
  onClose,
}: {
  projectId: string;
  sessionId?: string;
  onClose: () => void;
}) {
  const [files, setFiles] = useState<string[]>([]);
  const [selected, setSelected] = useState("index.md");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus();
  }, []);
  useEffect(() => {
    let disposed = false;
    setBusy(true);
    setError("");
    void call<string[]>("project_documents", { projectId, sessionId })
      .then((files) => {
        if (disposed) return;
        setFiles(files);
        setSelected((current) =>
          files.includes(current) ? current : (files[0] ?? ""),
        );
      })
      .catch((e) => {
        if (!disposed) setError(String(e));
      })
      .finally(() => {
        if (!disposed) setBusy(false);
      });
    return () => {
      disposed = true;
    };
  }, [projectId, sessionId, revision]);
  useEffect(() => {
    let disposed = false;
    setText("");
    if (selected)
      void call<string>("read_project_document", {
        projectId,
        sessionId,
        path: selected,
      })
        .then((text) => {
          if (!disposed) setText(text);
        })
        .catch((e) => {
          if (!disposed) setError(String(e));
        });
    return () => {
      disposed = true;
    };
  }, [projectId, sessionId, selected, revision]);
  const initialize = async () => {
    setBusy(true);
    try {
      await call("initialize_project_context", { projectId });
      setRevision((r) => r + 1);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <aside
      className="project-context-pane"
      aria-label="Project context"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="panel-heading">
        <span>
          <BookOpen size={15} /> Context
        </span>
        <div>
          <IconButton
            label="Refresh project context"
            onClick={() => setRevision((r) => r + 1)}
            disabled={busy}
          >
            <RefreshCw size={14} />
          </IconButton>
          <button
            ref={close}
            className="icon-button"
            aria-label="Close project context"
            onClick={onClose}
          >
            <X size={14} />
          </button>
        </div>
      </div>
      {error && (
        <div className="project-context-error" role="alert">
          <p>{error}</p>
          <Button
            size="compact"
            onClick={() => void initialize()}
            disabled={busy}
          >
            Initialize or retry context
          </Button>
        </div>
      )}
      <nav className="project-context-files" aria-label="Context documents">
        {files.map((file) => (
          <button
            key={file}
            aria-current={selected === file ? "page" : undefined}
            onClick={() => {
              setError("");
              setSelected(file);
            }}
          >
            {file}
          </button>
        ))}
      </nav>
      {selected && (
        <div
          className="project-context-document"
          onClickCapture={(event) => {
            const link = (event.target as Element).closest<HTMLAnchorElement>(
              "a[href]",
            );
            const href = link?.getAttribute("href");
            if (
              !href ||
              /^[a-z][a-z0-9+.-]*:/i.test(href) ||
              href.startsWith("#")
            )
              return;
            event.preventDefault();
            event.stopPropagation();
            try {
              const target = new URL(
                href,
                `https://harbor.invalid/${selected}`,
              );
              const path = decodeURIComponent(target.pathname.slice(1));
              if (
                target.origin !== "https://harbor.invalid" ||
                !files.includes(path)
              )
                throw new Error(
                  "This link does not reference a document in this project.",
                );
              setError("");
              setSelected(path);
            } catch (e) {
              setError(String(e));
            }
          }}
        >
          <div className="project-context-document-heading">
            <span>{selected}</span>
            <IconButton
              label="Open context document in editor"
              onClick={() => {
                void call("open_project_document", {
                  projectId,
                  sessionId,
                  path: selected,
                }).catch((e) => setError(String(e)));
              }}
            >
              <ExternalLink size={14} />
            </IconButton>
          </div>
          <RichText text={text} />
        </div>
      )}
    </aside>
  );
}
