import { rem } from "@/lib/units";
import { Card } from "./ui/card";
import { RadioGroup, RadioItem } from "./ui/radio-group";
import { InputGroup } from "./ui/input-group";
import { InputCopy } from "./ui/input-copy";
import { Banner, BannerDescription } from "./ui/banner";
import { useEffect, useState } from "react";
import {
  isPermissionGranted,
  requestPermission,
} from "@tauri-apps/plugin-notification";
import { Plus, RefreshCw, PlugZap } from "@/lib/icons";
import { Button } from "./ui/button";
import { Field, Picker } from "./fluid";
import { Switch } from "./ui/switch";
import { providerGlyph } from "./shared";
import { useStore } from "../lib/store";
import { call, desktop, json } from "../lib/api";
import { record, str } from "../lib/protocol";
import type { ProviderDefinition } from "../lib/bindings/ProviderDefinition";
import type { EditorChoice } from "../lib/bindings/EditorChoice";

export function Settings() {
  const { data, refresh, setError } = useStore();
  const settings = record(data.settings);
  const editor = str(settings.editor);
  const [editors, setEditors] = useState<EditorChoice[]>([]);
  const [loadingEditors, setLoadingEditors] = useState(desktop);
  const selectedEditor =
    editors.find(
      (choice) =>
        choice.value === editor ||
        choice.label.toLowerCase() === editor.toLowerCase(),
    )?.value ?? "";
  const [selected, setSelected] = useState<string | null>(null);
  const [custom, setCustom] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!desktop) return;
    let active = true;
    void call<EditorChoice[]>("list_editors")
      .then((choices) => {
        if (active) setEditors(choices);
      })
      .catch((error) => {
        if (active) setError(String(error));
      })
      .finally(() => {
        if (active) setLoadingEditors(false);
      });
    return () => {
      active = false;
    };
  }, [setError]);
  const save = async (key: string, value: unknown) => {
    if (saving) return;
    setSaving(true);
    try {
      if (
        key === "notifications" &&
        value === true &&
        desktop &&
        !(await isPermissionGranted()) &&
        (await requestPermission()) !== "granted"
      ) {
        throw new Error(
          "Notifications are disabled in macOS System Settings. Allow Harbor notifications to enable them.",
        );
      }
      await call("save_settings", {
        settings: json({ ...settings, [key]: value }),
      });
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="settings-page page-width">
      <div className="page-intro">
        <h1>Settings</h1>
      </div>
      <section className="settings-section">
        <div className="section-title">
          <h2>Agent connections</h2>
          <Button
            variant="secondary"
            size="compact"
            leadingIcon={Plus}
            onClick={() => {
              setCustom(true);
              setSelected(null);
            }}
          >
            Custom agent
          </Button>
        </div>
        <p className="section-description">
          Connect installed agents through ACP. Your existing logins stay with
          each provider.
        </p>
        <Picker
          label="Agent connection"
          className="settings-agent-picker"
          searchable
          placeholder="Select agent"
          value={selected ?? ""}
          icon={selected ? providerGlyph(selected) : undefined}
          items={data.providers.map((p) => ({
            value: p.id,
            label: p.name,
            icon: providerGlyph(p.id),
          }))}
          onValueChange={(id) => {
            setSelected(id);
            setCustom(false);
          }}
        />
        {(selected || custom) && (
          <ProviderEditor
            key={selected ?? "custom"}
            provider={
              data.providers.find((p) => p.id === selected) ?? {
                id: "custom-" + Date.now().toString(36),
                name: "Custom agent",
                command: "",
                args: [],
                nativeCommand: "",
                installHint: "Provide the path to an installed ACP executable.",
                color: "blue",
              }
            }
            onDone={() => {
              setSelected(null);
              setCustom(false);
              void refresh();
            }}
          />
        )}
      </section>
      <section className="settings-section">
        <h2>Appearance</h2>
        <div className="setting-row">
          <div>
            <strong>Theme</strong>
          </div>
          <RadioGroup
            className="theme-choices"
            value={str(settings.theme, "dark")}
            onValueChange={(value) => void save("theme", value)}
            aria-label="Theme"
          >
            {["dark", "light", "system"].map((theme, index) => (
              <RadioItem
                key={theme}
                index={index}
                value={theme}
                label={theme[0].toUpperCase() + theme.slice(1)}
              />
            ))}
          </RadioGroup>
        </div>
      </section>
      <section className="settings-section">
        <h2>Workspace</h2>
        <div className="setting-row">
          <div>
            <strong>Desktop notifications</strong>
            <p>Know when an agent finishes or needs your attention.</p>
          </div>
          <Switch
            disabled={saving}
            checked={settings.notifications === true}
            label="Desktop notifications"
            labelHidden
            onToggle={() =>
              void save("notifications", settings.notifications !== true)
            }
          />
        </div>
        <div className="setting-row">
          <div>
            <strong>External editor</strong>
            <p>Editor used to open files from the review panel.</p>
          </div>
          <Picker
            label="External editor"
            className="editor-setting"
            value={selectedEditor}
            items={editors}
            placeholder={
              !desktop
                ? "Open desktop app"
                : loadingEditors
                  ? "Finding editors…"
                  : editors.length
                    ? "Select editor"
                    : "No editors found"
            }
            disabled={saving || loadingEditors || !editors.length}
            onValueChange={(value) => {
              if (value !== editor) void save("editor", value);
            }}
          />
        </div>
        <div className="setting-row">
          <div>
            <strong>Keep working in the background</strong>
            <p>
              {settings.keepInBackground !== false
                ? "Closing the window keeps agents running in the menu bar."
                : "Closing the window stops agents and quits Harbor."}
            </p>
          </div>
          <Switch
            label="Keep working in the background"
            labelHidden
            checked={settings.keepInBackground !== false}
            disabled={saving}
            onToggle={() =>
              void save("keepInBackground", settings.keepInBackground === false)
            }
          />
        </div>
      </section>
      <div className="settings-footnote">
        <PlugZap size={rem(15)} />
        <span>
          Harbor 0.1.0
          <span className="separator-dot">·</span> ACP v1
        </span>
        {!desktop && <span>Browser preview</span>}
      </div>
    </div>
  );
}
function ProviderEditor({
  provider,
  onDone,
}: {
  provider: ProviderDefinition;
  onDone: () => void;
}) {
  const { setError } = useStore();
  const [value, setValue] = useState(provider);
  const [args, setArgs] = useState(provider.args.join("\n"));
  const [probe, setProbe] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const p = {
      ...value,
      args: args
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
    };
    await call("save_provider", { provider: p });
  };
  const detect = async () => {
    setBusy(true);
    try {
      await save();
      setProbe(await call("probe_provider", { providerId: value.id }));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="provider-editor">
      <div className="form-grid">
        <div className="field-label">
          Display name
          <Field
            aria-label="Display name"
            value={value.name}
            onValueChange={(value) => setValue((v) => ({ ...v, name: value }))}
          />
        </div>
        <div className="field-label">
          ACP executable
          <Field
            aria-label="ACP executable"
            value={value.command}
            placeholder="my-agent-acp"
            onValueChange={(value) =>
              setValue((v) => ({ ...v, command: value }))
            }
          />
        </div>
      </div>
      <div className="form-grid">
        <div className="field-label">
          Arguments <small>One per line; passed without a shell</small>
          <InputGroup>
            <textarea
              aria-label="Arguments"
              className="fluid-textarea"
              value={args}
              rows={3}
              onChange={(e) => setArgs(e.target.value)}
            />
          </InputGroup>
        </div>
        <div className="field-label">
          Native CLI executable
          <Field
            aria-label="Native CLI executable"
            value={value.nativeCommand}
            onValueChange={(value) =>
              setValue((v) => ({ ...v, nativeCommand: value }))
            }
          />
        </div>
      </div>
      <p className="muted text-xs">{value.installHint}</p>
      {probe && (
        <Banner
          className="probe-result"
          status={probe.installed ? "success" : "warning"}
        >
          <BannerDescription>
            <span className={probe.installed ? "success-text" : "warning-text"}>
              {probe.installed
                ? "ACP executable found"
                : "ACP executable not found"}
            </span>
            {str(probe.path) && (
              <InputCopy value={str(probe.path)} label="ACP executable" />
            )}
            <span>Native version: {str(probe.version)}</span>
            <span>
              Worktrunk: {probe.worktrunk ? "Installed" : "Not installed"}
            </span>
            <p>
              Terminal handoff is enabled only after a verified same-session
              round trip for your installed version.
            </p>
          </BannerDescription>
        </Banner>
      )}
      <div className="dialog-footer">
        <Button
          variant="secondary"
          disabled={busy}
          loading={busy}
          leadingIcon={RefreshCw}
          onClick={() => void detect()}
        >
          Check connection setup
        </Button>
        <Button
          className="primary-button"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void save()
              .then(onDone)
              .catch((e) => setError(String(e)))
              .finally(() => setBusy(false));
          }}
        >
          Save changes
        </Button>
      </div>
    </Card>
  );
}
