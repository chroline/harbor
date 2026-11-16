"use client";

/** Adapted from Kokonut UI's AI Prompt effort menu (MIT, @kokonutui).
 * https://kokonutui.com/r/ai-prompt.json
 */
import { useEffect, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { motion } from "framer-motion";
import { ChevronDown } from "@/lib/icons";
import { popupMotionClass } from "@/lib/popup";
import { exitFallbackMs, spring } from "@/lib/springs";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import { Slider } from "../ui/slider";

export type EffortOption = {
  value: string;
  label: string;
  description?: string;
};

/** Rising bars, filled up to the current effort, like a signal meter.
 *  Height matches the cap box so the meter shares the label baseline. */
export function EffortBars({ count, level }: { count: number; level: number }) {
  return (
    <span aria-hidden="true" className="effort-meter-bars">
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className={cn(
            "w-[3px] rounded-[1px] transition-colors duration-200",
            i <= level ? "bg-current" : "bg-current opacity-25",
          )}
          style={{ height: `${((i + 1) / count) * 100}%` }}
        />
      ))}
    </span>
  );
}

export function EffortChooser({
  options,
  value,
  onChange,
  disabled,
}: {
  options: EffortOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  if (open && !mounted) setMounted(true);
  useEffect(() => {
    if (open) return;
    const timer = setTimeout(
      () => setMounted(false),
      exitFallbackMs(spring.fast),
    );
    return () => clearTimeout(timer);
  }, [open]);

  const level = options.findIndex((option) => option.value === value);
  const current = Math.max(0, level);
  const label = options[level]?.label ?? "Choose effort";

  const [preview, setPreview] = useState(current);
  const previewRef = useRef(current);
  const dragging = useRef(false);
  const sliderContainerRef = useRef<HTMLDivElement>(null);
  const signature = options.map((option) => option.value).join("\0");

  useEffect(() => {
    dragging.current = false;
    previewRef.current = current;
    setPreview(current);
  }, [current, signature]);

  if (!options.length) return null;

  const select = (index: number) => {
    const next = options[index]?.value;
    if (!disabled && next && next !== value) onChange(next);
  };

  const update = (nextValue: number | [number, number]) => {
    const raw = Math.round(Array.isArray(nextValue) ? nextValue[0] : nextValue);
    const index = Math.max(0, Math.min(options.length - 1, raw));
    previewRef.current = index;
    setPreview(index);
    if (!dragging.current) select(index);
  };

  const cancel = () => {
    dragging.current = false;
    previewRef.current = current;
    setPreview(current);
  };

  const shownLevel = open ? preview : level;
  const shownLabel = open ? (options[preview]?.label ?? label) : label;

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        dragging.current = false;
        previewRef.current = current;
        setPreview(current);
      }}
    >
      <Popover.Trigger asChild>
        <Button
          type="button"
          variant="ghost"
          trailingIcon={ChevronDown}
          aria-label={`Effort: ${label}. Change`}
          disabled={disabled}
        >
          <span className="effort-meter">
            <EffortBars count={options.length} level={shownLevel} />
            <span className="effort-meter-label">{shownLabel}</span>
          </span>
        </Button>
      </Popover.Trigger>
      {mounted && (
        <Popover.Portal forceMount>
          <Popover.Content
            forceMount
            asChild
            side="top"
            align="start"
            sideOffset={6}
            collisionPadding={14}
            aria-label="Reasoning effort"
            onOpenAutoFocus={(event) => {
              const slider = sliderContainerRef.current?.querySelector<HTMLElement>(
                '[role="slider"]',
              );
              if (slider && !slider.hasAttribute("data-disabled")) {
                event.preventDefault();
                slider.focus({ preventScroll: true });
              }
            }}
          >
            <motion.div
              className={`effort-popover-motion z-50 outline-none ${popupMotionClass}`}
              initial={{
                opacity: 0,
                y: "var(--popup-enter-y)",
                scaleY: 0.96,
              }}
              animate={
                open
                  ? { opacity: 1, y: 0, scaleY: 1 }
                  : { opacity: 0, y: "var(--popup-enter-y)", scaleY: 0.96 }
              }
              transition={open ? spring.fast : spring.fast.exit}
              inert={!open}
              aria-hidden={!open || undefined}
              style={{ pointerEvents: open ? "auto" : "none" }}
              onAnimationComplete={() => {
                if (!open) setMounted(false);
              }}
            >
              {/* No card: the slider floats on its own above the trigger. */}
              <div className="composer-picker-menu effort-popover">
                <div
                  ref={sliderContainerRef}
                  className="effort-slider"
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      event.target instanceof HTMLElement &&
                      event.target.getAttribute("role") === "slider"
                    ) {
                      event.preventDefault();
                      setOpen(false);
                    }
                  }}
                  onPointerDownCapture={(event) => {
                    if (!disabled && options.length >= 2 && event.button === 0)
                      dragging.current = true;
                  }}
                  onPointerUpCapture={() => {
                    if (dragging.current) {
                      dragging.current = false;
                      select(previewRef.current);
                    }
                  }}
                  onPointerCancelCapture={cancel}
                  onLostPointerCapture={() => {
                    if (dragging.current) cancel();
                  }}
                >
                  <Slider
                    size="compact"
                    className="effort-control"
                    label="Reasoning effort"
                    value={preview}
                    min={0}
                    max={Math.max(1, options.length - 1)}
                    step={1}
                    steps={options.map((_, i) => i)}
                    showSteps={options.length >= 2}
                    showFilledSteps
                    smoothDrag
                    hideFocusRing
                    showValue={false}
                    disabled={disabled || options.length < 2}
                    formatValue={(i) => options[Math.round(i)]?.label ?? ""}
                    onChange={update}
                    trackClassName="border-transparent"
                    trackStyle={{
                      backgroundColor:
                        "light-dark(var(--color-neutral-200), var(--color-neutral-700))",
                    }}
                    fillStyle={{ backgroundColor: "var(--effort-blue)" }}
                  />
                </div>
              </div>
            </motion.div>
          </Popover.Content>
        </Popover.Portal>
      )}
    </Popover.Root>
  );
}

/** The effort slider on its own, for embedding in another surface (the model
 *  menu). Dragging previews a level and commits it on release; clicks and
 *  arrow keys commit immediately. */
export function EffortSlider({
  options,
  value,
  onChange,
  onPreview,
  disabled,
}: {
  options: EffortOption[];
  value: string;
  onChange: (value: string) => void;
  /** The level under the thumb, live while dragging (index into options). */
  onPreview?: (index: number) => void;
  disabled?: boolean;
}) {
  const level = options.findIndex((option) => option.value === value);
  const current = Math.max(0, level);
  const [preview, setPreview] = useState(current);
  const previewRef = useRef(current);
  const dragging = useRef(false);
  const signature = options.map((option) => option.value).join("\0");
  const onPreviewRef = useRef(onPreview);
  onPreviewRef.current = onPreview;

  useEffect(() => {
    dragging.current = false;
    previewRef.current = current;
    setPreview(current);
  }, [current, signature]);
  useEffect(() => {
    onPreviewRef.current?.(preview);
  }, [preview]);

  if (!options.length) return null;

  const select = (index: number) => {
    const next = options[index]?.value;
    if (!disabled && next && next !== value) onChange(next);
  };
  const update = (nextValue: number | [number, number]) => {
    const raw = Math.round(Array.isArray(nextValue) ? nextValue[0] : nextValue);
    const index = Math.max(0, Math.min(options.length - 1, raw));
    previewRef.current = index;
    setPreview(index);
    if (!dragging.current) select(index);
  };
  const cancel = () => {
    dragging.current = false;
    previewRef.current = current;
    setPreview(current);
  };

  return (
    <div className="effort-inline">
      <div className="effort-inline-heading">
        <span>Reasoning</span>
        <span className="effort-meter">
          <span className="effort-meter-label">{options[preview]?.label}</span>
          <EffortBars count={options.length} level={preview} />
        </span>
      </div>
      <div
        className="effort-slider"
        onPointerDownCapture={(event) => {
          if (!disabled && options.length >= 2 && event.button === 0)
            dragging.current = true;
        }}
        onPointerUpCapture={() => {
          if (dragging.current) {
            dragging.current = false;
            select(previewRef.current);
          }
        }}
        onPointerCancelCapture={cancel}
        onLostPointerCapture={() => {
          if (dragging.current) cancel();
        }}
      >
        <Slider
          size="compact"
          className="effort-control"
          label="Reasoning effort"
          value={preview}
          min={0}
          max={Math.max(1, options.length - 1)}
          step={1}
          steps={options.map((_, i) => i)}
          showSteps={options.length >= 2}
          showFilledSteps
          smoothDrag
          hideFocusRing
          showValue={false}
          disabled={disabled || options.length < 2}
          formatValue={(i) => options[Math.round(i)]?.label ?? ""}
          onChange={update}
          trackClassName="border-transparent"
          trackStyle={{
            backgroundColor:
              "light-dark(var(--color-neutral-200), var(--color-neutral-700))",
          }}
          fillStyle={{ backgroundColor: "var(--effort-blue)" }}
        />
      </div>
    </div>
  );
}
