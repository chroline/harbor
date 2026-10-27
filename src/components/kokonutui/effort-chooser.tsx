"use client";

/** Adapted from Kokonut UI's AI Prompt effort menu (MIT, @kokonutui).
 * https://kokonutui.com/r/ai-prompt.json
 */
import { ChevronDown } from "@/lib/icons";
import { Button } from "../ui/button";
import { DropdownMenu, DropdownTrigger, DropdownLabel } from "../ui/dropdown";
import { MenuItem } from "../ui/menu-item";
import { ComposerPickerContent } from "../composer-picker";
import { cn } from "@/lib/utils";

/** Rising bars, filled up to the current effort, like a signal meter.
 *  Height matches the cap box so the meter shares the label baseline. */
function EffortBars({ count, level }: { count: number; level: number }) {
  return (
    <span aria-hidden="true" className="effort-meter-bars">
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className={cn(
            "w-[3px] rounded-[1px] transition-colors duration-200",
            i <= level
              ? "bg-current"
              : "bg-current opacity-25",
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
  options: { value: string; label: string; description?: string }[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  if (!options.length) return null;
  const level = options.findIndex((option) => option.value === value);
  const label = options[level]?.label ?? "Choose effort";
  const choices = [...options].reverse();
  return (
    <DropdownMenu size="compact" disabled={disabled}>
      <DropdownTrigger render={
        <Button variant="ghost" trailingIcon={ChevronDown}
          aria-label={`Effort: ${label}. Change`} disabled={disabled}>
          <span className="effort-meter">
            <EffortBars count={options.length} level={level} />
            <span className="effort-meter-label">{label}</span>
          </span>
        </Button>
      } />
      <ComposerPickerContent checkedIndex={choices.findIndex(option => option.value === value)}>
        <DropdownLabel>Effort</DropdownLabel>
        {choices.map((option, index) => (
          <MenuItem key={option.value} index={index} label={option.label}
            description={option.description}
            checked={option.value === value}
            onSelect={() => {
              if (!disabled && option.value !== value) onChange(option.value);
            }}
          />
        ))}
      </ComposerPickerContent>
    </DropdownMenu>
  );
}
