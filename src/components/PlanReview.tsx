import { useRef, useState } from "react";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "./ui/sheet";
import { ChevronDown } from "@/lib/icons";
import { PlanCard } from "./ui/plan-card";
import { planReview, type PlanChoice } from "../lib/plan-review";
import { RichText } from "./shared";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownTrigger,
  DropdownContent,
  DropdownLabel,
} from "./ui/dropdown";
import { MenuItem } from "./ui/menu-item";

export function PlanReview({
  review,
  busy,
  onSelect,
  error,
  status,
}: {
  review: NonNullable<ReturnType<typeof planReview>>;
  busy: boolean;
  error?: string;
  onSelect?: (choice: PlanChoice) => void;
  status?: string;
}) {
  const [open, setOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [portal, setPortal] = useState<HTMLDivElement | null>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const planTitle =
    review.text.match(/^#\s+(.+)$/m)?.[1] ?? "Plan ready for review";
  return (
    <Sheet
      open={open}
      onOpenChange={(next, details) => {
        // Radix menu and Base UI dialog have independent Escape listeners.
        // Radix may flush its closed state before Base UI sees the same event;
        // retain the event origin as well as the current open state.
        const fromOptions =
          details.event.target instanceof Element &&
          details.event.target.closest(".plan-review-menu");
        if (
          !next &&
          details.reason === "escape-key" &&
          (optionsOpen || fromOptions)
        ) {
          details.cancel();
          return;
        }
        setOpen(next);
      }}
    >
      <PlanCard
        title={planTitle}
        preview={
          <RichText
            text={
              review.text.replace(/^#\s+.+(?:\r?\n|$)/m, "").trim() ||
              "The agent did not include plan text."
            }
          />
        }
        busy={busy}
        canApprove={!!review.text.trim()}
        error={open ? undefined : error}
        onApprove={onSelect ? () => onSelect(review.implement) : undefined}
        status={status}
        view={
          <SheetTrigger
            ref={trigger}
            render={<Button variant="secondary" />}
            aria-label="Review plan"
            disabled={busy}
          >
            View plan
          </SheetTrigger>
        }
      />
      <SheetContent
        ref={setPortal}
        className="plan-review"
        initialFocus={title}
        finalFocus={trigger}
        aria-busy={busy}
      >
        <SheetHeader className="plan-sheet-header">
          <SheetTitle ref={title} tabIndex={-1}>
            Review plan
          </SheetTitle>
          <SheetDescription>
            {onSelect
              ? "Choose whether to implement this plan or keep planning."
              : status}
          </SheetDescription>
        </SheetHeader>
        <div className="plan-review-body">
          {review.text ? (
            <RichText text={review.text} />
          ) : (
            <p>
              The agent did not include plan text. Choose Keep planning to ask
              for a written plan.
            </p>
          )}
        </div>
        <SheetFooter className="plan-review-footer">
          {error && (
            <p className="plan-review-error" role="alert">
              {error}
            </p>
          )}
          {onSelect ? (
            <div className="plan-review-actions">
              <Button
                variant="primary"
                disabled={busy || !review.text.trim()}
                onClick={() => onSelect(review.implement)}
              >
                Implement plan
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => onSelect(review.revise)}
              >
                Keep planning
              </Button>
            </div>
          ) : (
            <p className="plan-review-status">{status}</p>
          )}
          {!!onSelect && !!review.extra.length && (
            <DropdownMenu
              size="compact"
              disabled={busy}
              open={optionsOpen}
              onOpenChange={setOptionsOpen}
            >
              <DropdownTrigger
                render={
                  <Button
                    variant="ghost"
                    disabled={busy}
                    trailingIcon={ChevronDown}
                  >
                    More options
                  </Button>
                }
              />
              <DropdownContent
                container={portal}
                side="top"
                align="start"
                className="plan-review-menu"
              >
                <DropdownLabel>Provider options</DropdownLabel>
                {review.extra.map((choice, index) => (
                  <MenuItem
                    key={choice.id}
                    index={index}
                    label={choice.label}
                    disabled={busy}
                    onSelect={() => onSelect(choice)}
                  />
                ))}
              </DropdownContent>
            </DropdownMenu>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
