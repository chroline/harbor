import { pixelsToRem, scaledSize } from "@/lib/units";
import {
  useState,
  useRef,
  type ReactNode,
  type InputHTMLAttributes,
} from "react";
import { InputGroup, InputField } from "./ui/input-group";
import { Select, SelectTrigger, SelectContent, SelectItem } from "./ui/select";
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxList,
  ComboboxItem,
} from "./ui/combobox";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "./ui/accordion";
import {
  useFluidHover,
  useRegisterFluidHoverItem,
} from "../hooks/use-fluid-hover";
import { FluidHoverHighlight } from "./fluid-hover-highlight";
import type { IconComponent } from "../lib/icon-context";

export type Choice = {
  value: string;
  label: string;
  icon?: IconComponent;
  disabled?: boolean;
};
export function Picker({
  label,
  value,
  onValueChange,
  items,
  disabled,
  searchable = false,
  variant,
  icon,
  placeholder,
  className = "",
  contentClassName,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  items: Choice[];
  disabled?: boolean;
  searchable?: boolean;
  variant?: "bordered" | "borderless";
  icon?: IconComponent;
  placeholder?: string;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <div className={`harbor-picker ${className}`}>
      {searchable ? (
        <Combobox
          items={items}
          value={value}
          onValueChange={onValueChange}
          disabled={disabled}
        >
          <ComboboxInput
            variant={variant}
            aria-label={label}
            placeholder={placeholder ?? label}
            icon={icon}
          />
          <ComboboxContent className={contentClassName}>
            <ComboboxEmpty>No matches</ComboboxEmpty>
            <ComboboxList>
              {(item) => {
                const choice = items.find(
                  (c) =>
                    c.value === (typeof item === "string" ? item : item.value),
                )!;
                return (
                  <ComboboxItem
                    value={choice.value}
                    icon={choice.icon}
                    disabled={choice.disabled}
                  >
                    {choice.label}
                  </ComboboxItem>
                );
              }}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      ) : (
        <Select value={value} onValueChange={onValueChange} disabled={disabled}>
          <SelectTrigger
            variant={variant}
            aria-label={label}
            placeholder={placeholder ?? label}
            icon={icon}
          />
          <SelectContent className={contentClassName}>
            {items.map((item, index) => (
              <SelectItem
                key={item.value}
                index={index}
                value={item.value}
                icon={item.icon}
                disabled={item.disabled}
              >
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

export function Field({
  value,
  defaultValue = "",
  onValueChange,
  label,
  className,
  "aria-label": ariaLabel,
  ...props
}: Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "onChange" | "value" | "defaultValue"
> & {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  label?: string;
}) {
  const [internal, setInternal] = useState(defaultValue);
  return (
    <InputGroup className={className}>
      <InputField
        {...props}
        index={0}
        label={label ?? ariaLabel ?? ""}
        labelHidden
        value={value ?? internal}
        onChange={(next) => {
          setInternal(next);
          onValueChange?.(next);
        }}
      />
    </InputGroup>
  );
}

export function Disclosure({
  title,
  children,
  className = "",
  open,
  onOpenChange,
  disabled,
}: {
  title: ReactNode;
  children: ReactNode;
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Accordion
      className={className}
      value={open === undefined ? undefined : open ? "content" : ""}
      onValueChange={
        onOpenChange
          ? (value: string) => onOpenChange(value === "content")
          : undefined
      }
    >
      <AccordionItem value="content" disabled={disabled}>
        <AccordionTrigger>{title}</AccordionTrigger>
        <AccordionContent>{children}</AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

export function ActionList({
  items,
  className = "",
}: {
  items: {
    id: string;
    content: ReactNode;
    onClick: () => void;
    selected?: boolean;
    depth?: number;
  }[];
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const hover = useFluidHover(ref, { axis: "y" });
  return (
    <div
      ref={ref}
      {...hover.handlers}
      className={`fluid-action-list ${className}`}
    >
      <FluidHoverHighlight hover={hover} className="rounded-lg" />
      {items.map((item, index) => (
        <ActionRow
          key={item.id}
          item={item}
          index={index}
          registerItem={hover.registerItem}
        />
      ))}
    </div>
  );
}
function ActionRow({
  item,
  index,
  registerItem,
}: {
  item: {
    content: ReactNode;
    onClick: () => void;
    selected?: boolean;
    depth?: number;
  };
  index: number;
  registerItem: (index: number, element: HTMLElement | null) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useRegisterFluidHoverItem(registerItem, index, ref);
  return (
    <button
      ref={ref}
      className="fluid-action-row"
      style={
        item.depth
          ? {
              paddingInlineStart: pixelsToRem(
                scaledSize(10) + Math.min(item.depth, 6) * 14,
              ),
            }
          : undefined
      }
      aria-current={item.selected ? "true" : undefined}
      onClick={item.onClick}
    >
      {item.content}
    </button>
  );
}
