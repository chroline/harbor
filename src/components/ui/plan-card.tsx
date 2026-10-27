import type { ReactNode } from "react";
import { IconListCheck } from "@tabler/icons-react";
import { Button } from "./button";
import "./plan-card.css";

// Recovered from Kobra's delivered PlanCard (JD → iO); docs/plan-sheet.md.
// The inset steps slot carries Harbor's plan preview instead of task rows.
export function PlanCard({
  title,
  preview,
  view,
  busy,
  canApprove,
  error,
  onApprove,
  status,
}: {
  title: string;
  preview: ReactNode;
  view: ReactNode;
  busy: boolean;
  canApprove: boolean;
  error?: string;
  onApprove?: () => void;
  status?: string;
}) {
  return (
    <div
      className="harbor-plan-card"
      data-slot="plan-card"
      data-state={onApprove ? "pending" : "resolved"}
      aria-busy={busy}
    >
      <div className="harbor-plan-card-header">
        <span className="harbor-plan-card-icon">
          <IconListCheck aria-hidden="true" />
        </span>
        <h3>{title}</h3>
      </div>
      <div className="harbor-plan-card-inset">
        <div className="harbor-plan-card-preview" aria-hidden="true">
          {preview}
        </div>
      </div>
      {error && (
        <p className="plan-review-error" role="alert">
          {error}
        </p>
      )}
      <div className="harbor-plan-card-footer">
        <span className="harbor-plan-card-status">
          {busy ? "Sending your response…" : (status ?? "Ready for review")}
        </span>
        <div className="harbor-plan-card-actions">
          {view}
          {onApprove && (
            <Button
              variant="primary"
              disabled={busy || !canApprove}
              onClick={onApprove}
            >
              Implement plan
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
