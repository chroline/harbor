import { rem } from "@/lib/units";
import { RadioGroup, RadioItem } from "./ui/radio-group";
import { useEffect, useState } from "react";
import {
  isPermissionGranted,
  requestPermission,
} from "@tauri-apps/plugin-notification";
import { PlugZap } from "@/lib/icons";
import { Button } from "./ui/button";
import { Picker } from "./fluid";
import { Switch } from "./ui/switch";
import { providerGlyph } from "./shared";
import { ProviderEditor } from "./ProviderEditor";
import { useStore } from "../lib/store";
import { call, desktop, json } from "../lib/api";
import { record, str } from "../lib/protocol";
import { skylineCities, skylineCity } from "../lib/skyline-city";
import { skylineTimesOfDay, skylineTimeOfDay } from "../lib/skyline-period";
import { timeForTheme, useSkylineTheme } from "../lib/skyline-theme";
import type { EditorChoice } from "../lib/bindings/EditorChoice";

export function Settings() {
  const { data, refresh, setError } = useStore();
  const settings = record(data.settings);
  const resolvedTheme = useSkylineTheme();
  const theme = settings.theme === "light" || settings.theme === "dark" ? settings.theme : resolvedTheme;
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

        </div>
        <p className="section-description">
          Connect Claude Code, OpenAI Codex, and Grok Build. Your existing logins stay with
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
          }}
        />
        {selected && (
          <ProviderEditor
            key={selected}
            provider={data.providers.find((p) => p.id === selected)!}
            onSaved={refresh}
            onDone={() => {
              setSelected(null);
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
            aria-orientation="horizontal"
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
        <div className="setting-row">
          <div>
            <strong>Background city</strong>
            <p>Choose the city shown in the skyline background.</p>
          </div>
          <Picker
            label="Background city"
            className="editor-setting"
            value={skylineCity(settings.skylineCity)}
            items={skylineCities}
            disabled={saving}
            onValueChange={(value) => {
              if (value !== skylineCity(settings.skylineCity))
                void save("skylineCity", value);
            }}
          />
        </div>
        <div className="setting-row">
          <div>
            <strong>Time of day</strong>
            <p>Follow your local time or choose a fixed appearance.</p>
          </div>
          <Picker
            label="Time of day"
            className="editor-setting"
            value={timeForTheme(skylineTimeOfDay(settings.skylineTimeOfDay), theme)}
            items={skylineTimesOfDay.filter(({ value }) => value === "automatic" || timeForTheme(value, theme) === value)}
            disabled={saving}
            onValueChange={(value) => {
              if (value !== skylineTimeOfDay(settings.skylineTimeOfDay))
                void save("skylineTimeOfDay", value);
            }}
          />
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
