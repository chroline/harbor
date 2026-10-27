import { findAdapter } from "../adapters";
import { ProviderConnectionButton } from "./ProviderConnectionButton";
import { rem } from "@/lib/units";
import {
  useState,
  useRef,
  useEffect,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import * as Popover from "@radix-ui/react-popover";
import { motion } from "framer-motion";
import { Check, ChevronDown, ChevronRight, ArrowLeft } from "@/lib/icons";
import { Button } from "./ui/button";
import { PickerViews } from "./ui/picker-views";
import { Slider } from "./ui/slider";
import { Switch } from "./ui/switch";
import { Tabs, TabsList, TabItem } from "./ui/tabs";
import { Field, Picker, ActionList } from "./fluid";
import { ProviderIcon, providerGlyph, SpinnerIcon } from "./shared";
import { useStore } from "../lib/store";
import { chatMode } from "../lib/chat-mode";
import {
  options,
  values,
  record,
  array,
  str,
  type ConfigOption,
} from "../lib/protocol";
import { missingModelMessage, useProviderConfig } from "../lib/provider-config";
import { exitFallbackMs, spring } from "../lib/springs";
import { popupMotionClass } from "../lib/popup";
import type { SessionRecord } from "../lib/bindings/SessionRecord";

function effortLabel(name: string) {
  return name.replace(/^thinking:\s*/i, "").trim();
}

type MenuProps = {
  provider: string;
  controls: ConfigOption[];
  models?: unknown;
  modes?: unknown;
  onProviderChange?: (id: string) => void;
  onChange: (id: string, value: string | boolean) => void;
  busy?: boolean;
  pendingSelections?: Record<string, string | boolean>;
  disabled?: boolean;
  error?: string;
  retry?: () => void;
  connectionAction?: ReactNode;
};
export function ModelMenu({
  provider,
  controls,
  models,
  modes,
  onProviderChange,
  onChange,
  busy,
  pendingSelections,
  disabled,
  error,
  retry,
  connectionAction,
}: MenuProps) {
  const { data } = useStore();
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
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"settings" | "models" | "agents">(
    "settings",
  );
  const [returnFocus, setReturnFocus] = useState<"agent" | "search">("agent");
  const back = () => {
    setReturnFocus("agent");
    setView("models");
  };
  const chooseAgent = (id: string) => {
    if (view !== "agents" || disabled) return;
    if (id !== provider) {
      setQuery("");
      onProviderChange?.(id);
    }
    setReturnFocus("search");
    setView("models");
  };
  const model = controls.find(
    (o) => o.category === "model" || o.id === "model",
  );
  const choices = model
    ? values(model)
    : array(record(models).availableModels)
        .map(record)
        .map((m) => ({
          value: str(m.modelId),
          name: str(m.name, str(m.modelId)),
          description: str(m.description),
        }));
  const selected = str(
    pendingSelections?.[model?.id ?? "__legacy_model"],
    str(model?.currentValue, str(record(models).currentModelId)),
  );
  const current = choices.find((c) => c.value === selected);
  const effort = controls.find(
    (o) =>
      o.type === "select" &&
      (o.category === "thought_level" || /reasoning|effort/i.test(o.id)),
  );
  const levels = effort ? values(effort) : [];
  const workingMode = chatMode(controls, modes);
  const remaining = controls.filter(
    (o) => o !== model && o !== effort && o.id !== workingMode?.configId,
  );
  const availableModes = array(record(modes).availableModes).map(record);
  // A legacy mode may mirror any modern selector, including permissions.
  // Compare choices, not current values: the legacy snapshot can lag behind.
  const representedChoices = [
    ...controls.filter((o) => o.type === "select").map(values),
    ...(workingMode ? [workingMode.choices] : []),
  ];
  const duplicateLegacy = representedChoices.some(
    (choices) =>
      choices.length > 0 &&
      availableModes.length === choices.length &&
      availableModes.every((m) =>
        choices.some((c) => c.value === m.id && c.name === m.name),
      ),
  );
  const legacyModes = duplicateLegacy ? [] : availableModes;
  const providerName =
    data.providers.find((p) => p.id === provider)?.name ?? provider;
  const change = (id: string, value: string | boolean) => {
    if (
      view !== "agents" &&
      !disabled &&
      (!busy || id === (model?.id ?? "__legacy_model"))
    )
      onChange(id, value);
  };
  const shown = choices.filter((c) =>
    `${c.name} ${c.description ?? ""}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setQuery("");
          setView("settings");
          setReturnFocus("search");
        }
      }}
    >
      <Popover.Trigger asChild>
        <Button
          variant="ghost"
          leadingIcon={providerGlyph(provider)}
          trailingIcon={busy ? SpinnerIcon : ChevronDown}
          className="model-menu-trigger"
          aria-label="Choose model and reasoning"
          disabled={disabled}
        >
          <span className="model-trigger-content flex items-center gap-1.5">
            <span className="model-trigger-name">
              {current?.name ?? providerName}
            </span>
            {effort && (
              <span className="model-trigger-effort">
                {effortLabel(
                  levels.find((l) => l.value === effort.currentValue)?.name ??
                    "",
                )}
              </span>
            )}
          </span>
        </Button>
      </Popover.Trigger>
      {mounted && (
        <Popover.Portal forceMount>
          <Popover.Content
            forceMount
            asChild
            side="bottom"
            align="start"
            sideOffset={8}
            collisionPadding={14}
            aria-label="Model and agent settings"
            onEscapeKeyDown={(event) => {
              if (view === "agents") {
                event.preventDefault();
                back();
              } else if (view === "models") {
                event.preventDefault();
                setView("settings");
              }
            }}
          >
            <motion.div
              className={`model-menu-motion z-50 outline-none ${popupMotionClass}`}
              initial={{ opacity: 0, y: "var(--popup-enter-y)", scaleY: 0.96 }}
              animate={
                open
                  ? { opacity: 1, y: 0, scaleY: 1 }
                  : { opacity: 0, y: "var(--popup-enter-y)", scaleY: 0.96 }
              }
              transition={open ? spring.fast : spring.fast.exit}
              inert={!open}
              aria-hidden={!open || undefined}
              style={{ pointerEvents: open ? undefined : "none" }}
              onAnimationComplete={() => {
                if (!open) setMounted(false);
              }}
            >
              <div className="model-menu" data-view={view}>
                <ModelMenuViews
                  view={view}
                  returnFocus={returnFocus}
                  settings={
                    <>
                      <div className="model-menu-summary">
                        <Button
                          variant="ghost"
                          className="model-menu-summary-model"
                          aria-label="Choose model"
                          disabled={disabled}
                          onClick={() => {
                            setReturnFocus("search");
                            setView("models");
                          }}
                        >
                          <span className="model-menu-summary-content">
                            <ProviderIcon id={provider} size={rem(18)} />
                            <span className="model-menu-summary-label">
                              <strong title={current?.name ?? providerName}>
                                {current?.name ?? providerName}
                              </strong>
                              <span>{providerName}</span>
                            </span>
                            <ChevronRight size={rem(14)} />
                          </span>
                        </Button>
                      </div>
                      {effort && levels.length > 0 && (
                        <EffortControl
                          key={`${provider}:${selected}:${effort.id}`}
                          option={effort}
                          disabled={busy || disabled}
                          onChange={(v) => change(effort.id, v)}
                        />
                      )}
                      {(remaining.length > 0 || legacyModes.length > 0) && (
                        <div className="model-menu-settings">
                          {remaining.map((o) => (
                            <div className="model-menu-setting" key={o.id}>
                              <span>
                                {findAdapter(provider)?.controlLabel(o) ?? o.name}
                              </span>
                              {o.type === "boolean" ? (
                                <Switch
                                  label={o.name}
                                  labelHidden
                                  checked={o.currentValue === true}
                                  onToggle={() =>
                                    change(o.id, o.currentValue !== true)
                                  }
                                  disabled={busy}
                                />
                              ) : /permission|approval|access|mode/i.test(
                                  `${o.id} ${o.category} ${o.name}`,
                                ) ? (
                                <PermissionChoices
                                  label={
                                    findAdapter(provider)?.controlLabel(o) ?? o.name
                                  }
                                  choices={values(o)}
                                  value={String(o.currentValue)}
                                  disabled={busy || disabled}
                                  onChange={(v) => change(o.id, v)}
                                />
                              ) : (
                                <Picker
                                  label={o.name}
                                  value={String(o.currentValue)}
                                  disabled={busy}
                                  items={values(o).map((v) => ({
                                    value: v.value,
                                    label: v.name,
                                  }))}
                                  onValueChange={(v) => change(o.id, v)}
                                />
                              )}
                            </div>
                          ))}
                          {!!legacyModes.length && (
                            <div className="model-menu-setting">
                              <span>Mode</span>
                              <PermissionChoices
                                label="Mode"
                                value={str(record(modes).currentModeId)}
                                disabled={busy || disabled}
                                choices={legacyModes.map((m) => ({
                                  value: str(m.id),
                                  name: str(m.name),
                                }))}
                                onChange={(v) => change("__legacy_mode", v)}
                              />
                            </div>
                          )}
                        </div>
                      )}
                      {error && (
                        <div className="model-menu-error" role="alert">
                          <span>{error}</span>
                          {retry && (
                            <Button
                              size="compact"
                              variant="ghost"
                              disabled={busy}
                              onClick={retry}
                            >
                              Retry
                            </Button>
                          )}
                        </div>
                      )}
                      {connectionAction}
                    </>
                  }
                  agents={
                    onProviderChange ? (
                      <>
                        <div className="model-menu-agent-header">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Back to models"
                            onClick={back}
                          >
                            <ArrowLeft size={rem(18)} />
                          </Button>
                          <span>Choose agent</span>
                        </div>
                        <fieldset
                          className="model-menu-agent-options"
                          disabled={disabled}
                          aria-label="Available agents"
                          aria-busy={busy}
                        >
                          <div
                            className="model-menu-list"
                            onKeyDown={navigateMenuList}
                          >
                            <ActionList
                              items={data.providers.map((p) => ({
                                id: p.id,
                                selected: p.id === provider,
                                onClick: () => chooseAgent(p.id),
                                content: (
                                  <>
                                    <ProviderIcon id={p.id} />
                                    <span>{p.name}</span>
                                    <span className="model-menu-agent-check">
                                      {p.id === provider && (
                                        <Check size={rem(16)} />
                                      )}
                                    </span>
                                  </>
                                ),
                              }))}
                            />
                            {!data.providers.length && (
                              <p className="model-menu-empty">
                                No agents available
                              </p>
                            )}
                          </div>
                        </fieldset>
                      </>
                    ) : null
                  }
                >
                  <div className="model-menu-search">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Back to reasoning"
                      onClick={() => setView("settings")}
                    >
                      <ArrowLeft size={rem(16)} />
                    </Button>
                    <Field
                      aria-label="Search models"
                      placeholder="Search models"
                      value={query}
                      onValueChange={setQuery}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowDown") {
                          e.preventDefault();
                          e.currentTarget
                            .closest(".model-menu")
                            ?.querySelector<HTMLButtonElement>(
                              ".model-menu-list button",
                            )
                            ?.focus();
                        }
                      }}
                    />
                  </div>
                  <div className="model-menu-provider">
                    {onProviderChange ? (
                      <Button
                        variant="ghost"
                        className="model-menu-agent-trigger"
                        aria-label="Choose agent"
                        onClick={() => setView("agents")}
                        disabled={disabled}
                      >
                        <span className="model-menu-agent-trigger-content">
                          <ProviderIcon id={provider} />
                          <span>{providerName}</span>
                          <ChevronRight size={rem(16)} />
                        </span>
                      </Button>
                    ) : (
                      <span className="model-menu-agent-trigger-content">
                        <ProviderIcon id={provider} />
                        <span>{providerName}</span>
                      </span>
                    )}
                  </div>
                  <div
                    className="model-menu-list"
                    aria-label="Available models"
                    aria-busy={busy}
                    onKeyDown={navigateMenuList}
                  >
                    <ActionList
                      items={shown.map((c) => ({
                        id: c.value,
                        selected: c.value === selected,
                        onClick: () => {
                          if (disabled) return;
                          change(model?.id ?? "__legacy_model", c.value);
                          setView("settings");
                        },
                        content: (
                          <>
                            <span>{c.name}</span>
                            {c.value === selected && <Check size={rem(16)} />}
                          </>
                        ),
                      }))}
                    />
                    {!shown.length && (
                      <p className="model-menu-empty">
                        {busy
                          ? "Loading models…"
                          : query
                            ? "No matching models"
                            : "No models available"}
                      </p>
                    )}
                  </div>
                  {current?.description && (
                    <p className="model-menu-description">
                      {current.description}
                    </p>
                  )}
                  {error && (
                    <div className="model-menu-error" role="alert">
                      <span>{error}</span>
                      {retry && (
                        <Button
                          size="compact"
                          variant="ghost"
                          disabled={busy}
                          onClick={retry}
                        >
                          Retry
                        </Button>
                      )}
                    </div>
                  )}
                </ModelMenuViews>
              </div>
            </motion.div>
          </Popover.Content>
        </Popover.Portal>
      )}
    </Popover.Root>
  );
}
// Keep inactive panels mounted but inaccessible while the popup changes size.
function ModelMenuViews({
  view,
  returnFocus,
  settings,
  agents,
  children,
}: {
  view: "settings" | "models" | "agents";
  returnFocus: "agent" | "search";
  settings: ReactNode;
  agents: ReactNode;
  children: ReactNode;
}) {
  return (
    <PickerViews
      view={view}
      classPrefix="model-menu"
      panes={[
        {
          id: "settings",
          content: settings,
          focusSelector: ".model-menu-summary-model",
        },
        {
          id: "models",
          content: children,
          focusSelector:
            returnFocus === "agent" ? ".model-menu-agent-trigger" : "input",
        },
        {
          id: "agents",
          content: agents,
          focusSelector: 'button[aria-current="true"]',
        },
      ]}
    />
  );
}

function navigateMenuList(event: KeyboardEvent<HTMLDivElement>) {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  const buttons = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>(
      "button:not(:disabled)",
    ),
  );
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
  if (index < 0) return;
  event.preventDefault();
  buttons[
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? buttons.length - 1
        : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) %
          buttons.length
  ]?.focus();
}

export function DiscoveryModelMenu({
  state,
  provider,
  onProviderChange,
  disabled,
}: {
  state: ReturnType<typeof useProviderConfig>;
  provider: string;
  onProviderChange: (id: string) => void;
  disabled?: boolean;
}) {
  const controls = options(state.config?.configOptions);
  const missing =
    state.config &&
    !controls.some((o) => o.category === "model" || o.id === "model") &&
    !array(record(state.config.models).availableModels).length;
  return (
    <ModelMenu
      provider={provider}
      controls={controls}
      models={state.config?.models}
      modes={state.config?.modes}
      onProviderChange={onProviderChange}
      onChange={state.set}
      busy={state.busy}
      pendingSelections={state.pending}
      disabled={disabled}
      retry={state.retry}
      connectionAction={
        !state.preview && (
          <ProviderConnectionButton providerId={provider} disabled={disabled} />
        )
      }
      error={
        state.preview
          ? "Open the desktop app to load models."
          : (state.error ??
            (missing ? missingModelMessage(state.config!) : undefined))
      }
    />
  );
}
export function SessionModelMenu({
  session,
  disabled,
}: {
  session: SessionRecord;
  disabled?: boolean;
}) {
  const { configuration } = useStore();
  const state = configuration.get(session.id);
  return (
    <ModelMenu
      provider={session.providerId}
      controls={options(session.configOptions)}
      models={session.models}
      modes={session.modes}
      disabled={disabled}
      busy={configuration.blocked(session.id)}
      pendingSelections={Object.fromEntries(
        state.pending.map((p) => [p.id, p.value]),
      )}
      error={state.error}
      retry={() => configuration.retry(session.id)}
      onChange={(id, value) => configuration.select(session, id, value)}
    />
  );
}
export function EffortControl({
  option,
  disabled,
  onChange,
}: {
  option: ConfigOption;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const levels = values(option);
  const current = Math.max(
    0,
    levels.findIndex((l) => l.value === option.currentValue),
  );
  const [preview, setPreview] = useState(current);
  const previewRef = useRef(current);
  const dragging = useRef(false);
  const signature = levels.map((l) => l.value).join("\0");
  useEffect(() => {
    dragging.current = false;
    previewRef.current = current;
    setPreview(current);
  }, [current, signature]);
  const select = (index: number) => {
    const value = levels[index]?.value;
    if (!disabled && value && value !== option.currentValue) onChange(value);
  };
  const update = (value: number | [number, number]) => {
    const index = Math.round(Array.isArray(value) ? value[0] : value);
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
    <div className="model-menu-effort">
      <div className="effort-heading">
        <strong>{effortLabel(levels[preview]?.name ?? option.name)}</strong>
      </div>
      <div
        className="effort-slider"
        onPointerDownCapture={(e) => {
          if (!disabled && e.button === 0) dragging.current = true;
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
          label={option.name}
          value={preview}
          min={0}
          max={Math.max(1, levels.length - 1)}
          step={1}
          steps={levels.map((_, i) => i)}
          showSteps
          showValue={false}
          disabled={disabled || levels.length < 2}
          formatValue={(i) => effortLabel(levels[Math.round(i)]?.name ?? "")}
          onChange={update}
          fillStyle={{ backgroundColor: "var(--effort-blue)" }}
        />
      </div>
    </div>
  );
}
function PermissionChoices({
  label,
  choices,
  value,
  disabled,
  onChange,
}: {
  label: string;
  choices: { value: string; name: string }[];
  value: string;
  disabled?: boolean;
  onChange: (v: string) => void;
}) {
  if (choices.length > 2) {
    return (
      <Picker
        label={label}
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        items={choices.map((choice) => ({
          value: choice.value,
          label: choice.name,
        }))}
      />
    );
  }
  return (
    <Tabs
      value={value}
      onValueChange={(v) => {
        if (!disabled) onChange(v);
      }}
    >
      <TabsList aria-label={label}>
        {choices.map((c) => (
          <TabItem
            key={c.value}
            value={c.value}
            label={c.name}
            disabled={disabled}
          />
        ))}
      </TabsList>
    </Tabs>
  );
}
