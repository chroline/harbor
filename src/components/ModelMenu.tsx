import { ThinkingIndicator } from "./ui/thinking-indicator";
import { Tooltip } from "./ui/tooltip";
import { findAdapter } from "../adapters";
import { ComposerPickerSurface } from "./composer-picker";
import { rem } from "@/lib/units";
import {
  useState,
  useEffect,
  useMemo,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import * as Popover from "@radix-ui/react-popover";
import { motion } from "framer-motion";
import {
  Check,
  ChevronRight,
  ArrowLeft,
  SlidersHorizontal,
  Star,
} from "@/lib/icons";
import {
  isFavoriteModel,
  toggleFavoriteModel,
  useFavoriteModels,
} from "../lib/favorite-models";
import { Button } from "./ui/button";
import { PickerViews } from "./ui/picker-views";
import {
  EffortBars,
  EffortChooser,
  EffortSlider,
} from "./kokonutui/effort-chooser";
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
import {
  missingModelMessage,
  selectProviderConfig,
  useProviderConfig,
} from "../lib/provider-config";
import { workspaceRecentModels, type RecentModel } from "../lib/model-recents";
import { exitFallbackMs, spring } from "../lib/springs";
import { popupMotionClass } from "../lib/popup";
import type { SessionRecord } from "../lib/bindings/SessionRecord";

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
  /** Agent + model pairs used recently in the current workspace. */
  recents?: RecentModel[];
  onRecentSelect?: (recent: RecentModel) => void;
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
  recents = [],
  onRecentSelect,
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
  const effortIndex = effort
    ? levels.findIndex(
        (l) =>
          l.value === str(pendingSelections?.[effort.id] ?? effort.currentValue),
      )
    : -1;
  // While the menu is open the trigger follows the slider's thumb.
  const [effortPreview, setEffortPreview] = useState<number | null>(null);
  const shownEffortIndex =
    open && effortPreview !== null ? effortPreview : effortIndex;
  const effortLabel = levels[shownEffortIndex]?.name;
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
      // Effort lives beside the model popup and is independent of its pane.
      (id === effort?.id || view !== "agents") &&
      !disabled &&
      (!busy || id === (model?.id ?? "__legacy_model"))
    )
      onChange(id, value);
  };
  const changeSetting = (id: string, value: string | boolean) => {
    if (!disabled && !busy) onChange(id, value);
  };
  const favorites = useFavoriteModels();
  const isCurrent = (m: RecentModel) =>
    m.providerId === provider && m.value === selected;
  // Favorites follow you across workspaces; recents fill in what isn't starred.
  const favoriteShortcuts = onRecentSelect
    ? favorites.filter((f) => data.providers.some((p) => p.id === f.providerId))
    : [];
  const shortcuts = onRecentSelect
    ? recents.filter((r) => !isCurrent(r) && !isFavoriteModel(favorites, r))
    : [];
  const agentName = (id: string) =>
    data.providers.find((p) => p.id === id)?.name ?? id;
  // One star control for model-list rows and shortcut rows alike.
  const starFor = (pair: RecentModel) => {
    const starred = isFavoriteModel(favorites, pair);
    return (
      <Tooltip content={starred ? "Remove from favorites" : "Add to favorites"}>
        <Button
          variant="ghost"
          size="icon-compact"
          className="model-menu-favorite"
          data-favorite={starred || undefined}
          aria-pressed={starred}
          aria-label={`Favorite ${pair.name} on ${agentName(pair.providerId)}`}
          onClick={() => toggleFavoriteModel(pair)}
        >
          <Star size={rem(14)} fill={starred ? "currentColor" : "none"} />
        </Button>
      </Tooltip>
    );
  };
  const favoriteStar = (choice: { value: string; name: string }) =>
    starFor({
      providerId: provider,
      optionId: model?.id ?? "__legacy_model",
      value: choice.value,
      name: choice.name,
    });
  const shortcutSection = (label: string, items: RecentModel[]) => (
    <div className="model-menu-recents">
      <span className="model-menu-recents-label">{label}</span>
      <div
        className="model-menu-list"
        aria-label={label}
        onKeyDown={navigateMenuList}
      >
        <ActionList
          items={items.map((r) => {
            const agent =
              data.providers.find((p) => p.id === r.providerId)?.name ??
              r.providerId;
            return {
              id: `${r.providerId}:${r.value}`,
              selected: isCurrent(r),
              trailing: starFor(r),
              onClick: () => {
                if (disabled || busy) return;
                if (!isCurrent(r)) onRecentSelect?.(r);
                setOpen(false);
              },
              content: (
                <>
                  <ProviderIcon id={r.providerId} />
                  <span className="model-menu-recent-label">
                    <span>{r.name}</span>
                    <span>{agent}</span>
                  </span>
                  {isCurrent(r) && <Check size={rem(16)} />}
                </>
              ),
            };
          })}
        />
      </div>
    </div>
  );
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
          trailingIcon={busy ? SpinnerIcon : undefined}
          className="model-menu-trigger"
          aria-label="Choose model and reasoning"
          disabled={disabled}
        >
          <span className="model-trigger-content flex items-center gap-1.5">
            <span className="model-trigger-name">
              {current?.name ?? providerName}
            </span>
            {effortLabel && (
              // The signal-bar stepper stands in for the level name; the name
              // stays available to assistive tech.
              <span className="model-trigger-effort effort-meter">
                <EffortBars count={levels.length} level={shownEffortIndex} />
                <span className="sr-only">{effortLabel}</span>
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
            side="top"
            align="start"
            sideOffset={6}
            collisionPadding={14}
            aria-label="Model and agent settings"
            onOpenAutoFocus={focusPopupContainer}
            onKeyDown={(event) => {
              if (
                event.target !== event.currentTarget ||
                !["ArrowDown", "ArrowUp"].includes(event.key)
              )
                return;
              event.preventDefault();
              event.currentTarget
                .querySelector<HTMLElement>(
                  '.model-menu-view[data-active="true"] button:not(:disabled), .model-menu-view[data-active="true"] input',
                )
                ?.focus();
            }}
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
              <ComposerPickerSurface className="model-menu" data-view={view}>
                <ModelMenuViews
                  view={view}
                  returnFocus={returnFocus}
                  settings={
                    <>
                      {favoriteShortcuts.length > 0 &&
                        shortcutSection("Favorites", favoriteShortcuts)}
                      {shortcuts.length > 0 &&
                        shortcutSection("Recent in this workspace", shortcuts)}
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
                            <ProviderIcon id={provider} />
                            <span className="model-menu-summary-label">
                              <Tooltip content={current?.name ?? providerName}><strong>
                                {current?.name ?? providerName}
                              </strong></Tooltip>
                              <span>{providerName}</span>
                            </span>
                            <ChevronRight size={rem(14)} />
                          </span>
                        </Button>
                      </div>
                      {effort && levels.length > 0 && (
                        <div className="model-menu-effort">
                          <EffortSlider
                            options={levels.map((level) => ({
                              value: level.value,
                              label: level.name,
                              description: level.description,
                            }))}
                            value={str(
                              pendingSelections?.[effort.id] ??
                                effort.currentValue,
                            )}
                            disabled={busy || disabled}
                            onChange={(value) => change(effort.id, value)}
                            onPreview={setEffortPreview}
                          />
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
                    </>
                  }
                  agents={
                    onProviderChange ? (
                      <>
                        <div className="model-menu-agent-header">
                          <Button
                            variant="ghost"
                            size="icon-compact"
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
                      size="icon-compact"
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
                        trailing: favoriteStar(c),
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
                      <div className="model-menu-empty">
                        {busy
                          ? <ThinkingIndicator size="compact" label="Loading models…" />
                          : query
                            ? "No matching models"
                            : "No models available"}
                      </div>
                    )}
                  </div>
                  <div className="model-menu-provider">
                    {/* An existing chat can't change agent, but the row looks the
                        same; it just doesn't respond. */}
                    <Button
                      variant="ghost"
                      className="model-menu-agent-trigger"
                      data-static={onProviderChange ? undefined : ""}
                      aria-label={onProviderChange ? "Choose agent" : `Agent: ${providerName}`}
                      aria-disabled={onProviderChange ? undefined : true}
                      tabIndex={onProviderChange ? undefined : -1}
                      onClick={onProviderChange ? () => setView("agents") : undefined}
                      disabled={disabled}
                    >
                      <span className="model-menu-agent-trigger-content">
                        <ProviderIcon id={provider} />
                        <span>{providerName}</span>
                        {onProviderChange && <ChevronRight size={rem(16)} />}
                      </span>
                    </Button>
                  </div>
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
              </ComposerPickerSurface>
            </motion.div>
          </Popover.Content>
        </Popover.Portal>
      )}
      {(remaining.length > 0 || legacyModes.length > 0) && (
        <AgentSettingsPopover disabled={disabled}>
          <div className="model-menu-settings">
            {remaining.map((o) => (
              <div className="model-menu-setting" key={o.id}>
                <span>{findAdapter(provider)?.controlLabel(o) ?? o.name}</span>
                {o.type === "boolean" ? (
                  <Switch
                    label={o.name}
                    labelHidden
                    checked={o.currentValue === true}
                    onToggle={() => changeSetting(o.id, o.currentValue !== true)}
                    disabled={busy || disabled}
                  />
                ) : /permission|approval|access|mode/i.test(
                    `${o.id} ${o.category} ${o.name}`,
                  ) ? (
                  <PermissionChoices
                    label={findAdapter(provider)?.controlLabel(o) ?? o.name}
                    choices={values(o)}
                    value={String(o.currentValue)}
                    disabled={busy || disabled}
                    onChange={(v) => changeSetting(o.id, v)}
                  />
                ) : (
                  <Picker
                    label={o.name}
                    value={String(o.currentValue)}
                    disabled={busy || disabled}
                    items={values(o).map((v) => ({
                      value: v.value,
                      label: v.name,
                    }))}
                    onValueChange={(v) => changeSetting(o.id, v)}
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
                  onChange={(v) => changeSetting("__legacy_mode", v)}
                />
              </div>
            )}
          </div>
        </AgentSettingsPopover>
      )}
    </Popover.Root>
  );
}

/** Opening shouldn't ring the first row: focus the popup itself so Tab and
 *  arrows still move into it, but nothing shows a focus outline yet. */
function focusPopupContainer(event: Event) {
  event.preventDefault();
  (event.currentTarget as HTMLElement | null)?.focus({ preventScroll: true });
}

/** Agent options beyond model and effort (permissions, fast mode…) behind a tuning icon. */
function AgentSettingsPopover({
  disabled,
  children,
}: {
  disabled?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Tooltip content="Agent settings">
        <Popover.Trigger asChild>
          <Button
            variant="ghost"
            size="icon-compact"
            className="agent-settings-trigger"
            aria-label="Agent settings"
            disabled={disabled}
          >
            <SlidersHorizontal size={rem(16)} />
          </Button>
        </Popover.Trigger>
      </Tooltip>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="start"
          sideOffset={6}
          collisionPadding={14}
          aria-label="Agent settings"
          onOpenAutoFocus={focusPopupContainer}
          className={`z-50 outline-none ${popupMotionClass}`}
          asChild
        >
          <motion.div
            initial={{ opacity: 0, y: "var(--popup-enter-y)", scaleY: 0.96 }}
            animate={{ opacity: 1, y: 0, scaleY: 1 }}
            transition={spring.fast}
          >
            <ComposerPickerSurface className="model-menu agent-settings-menu">
              {children}
            </ComposerPickerSurface>
          </motion.div>
        </Popover.Content>
      </Popover.Portal>
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
      "button:not(:disabled):not(.model-menu-favorite)",
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
  workspaceId,
}: {
  state: ReturnType<typeof useProviderConfig>;
  provider: string;
  onProviderChange: (id: string) => void;
  disabled?: boolean;
  /** Workspace whose recent agent + model pairs to offer; omit to hide recents. */
  workspaceId?: string | null;
}) {
  const { data } = useStore();
  const recents = useMemo(
    () =>
      workspaceId === undefined
        ? []
        : workspaceRecentModels(
            data.sessions,
            workspaceId,
            data.providers.map((p) => p.id),
          ),
    [data.sessions, data.providers, workspaceId],
  );
  const selectRecent = (recent: RecentModel) => {
    if (recent.providerId === provider) {
      state.set(recent.optionId, recent.value);
      return;
    }
    const definition = data.providers.find((p) => p.id === recent.providerId);
    if (!definition) return;
    selectProviderConfig(definition, recent.optionId, recent.value);
    onProviderChange(recent.providerId);
  };
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
      recents={recents}
      onRecentSelect={selectRecent}
      onChange={state.set}
      busy={state.busy}
      pendingSelections={state.pending}
      disabled={disabled}
      retry={state.retry}
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
  blocking = false,
}: {
  session: SessionRecord;
  disabled?: boolean;
  blocking?: boolean;
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
      busy={blocking && configuration.blocked(session.id)}
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
  return (
    <EffortChooser
      options={values(option).map((level) => ({
        value: level.value,
        label: level.name,
        description: level.description,
      }))}
      value={str(option.currentValue)}
      onChange={onChange}
      disabled={disabled}
    />
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

/** Native workers retain provider ownership; display only the model the worker reports. */
export function WorkerModelMenu({ provider, capabilities }: { provider: string; capabilities: unknown }) {
  const controls = options(record(capabilities).harborConfigOptions);
  const model = controls.find((option) => option.category === "model" || option.id === "model");
  const current = model && values(model).find((choice) => choice.value === model.currentValue);
  const label = current?.name ?? (str(model?.currentValue) || "Provider-managed model");
  const reason = provider === "codex" ? "This native worker’s model is managed by its provider. Codex continuation does not support changing the worker model." : "This native worker’s model is managed by its provider. Model changes are unavailable through this worker connection.";
  return <Tooltip content={reason}><span className="inline-flex" tabIndex={0} aria-label={`${label}. ${reason}`}>
    <Button variant="ghost" className="model-menu-trigger" leadingIcon={providerGlyph(provider)} disabled>{label}</Button>
  </span></Tooltip>;
}
