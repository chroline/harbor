import { ThinkingIndicatorGlyph } from "./ui/thinking-indicator";
import { supportedProviderId } from "../lib/providers";
import { useId, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { RefreshCw, ChevronDown } from "@/lib/icons";
import { Card } from "./ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible";
import { InputGroup } from "./ui/input-group";
import { InputCopy } from "./ui/input-copy";
import { Banner, BannerDescription, BannerTitle } from "./ui/banner";
import { Button } from "./ui/button";
import { Field } from "./fluid";
import { call, desktop } from "../lib/api";
import { array, record, str } from "../lib/protocol";
import { invalidateProviderConfig } from "../lib/provider-config";
import type { ProviderProbe } from "../lib/bindings/ProviderProbe";
import type { ProviderDefinition } from "../lib/bindings/ProviderDefinition";

export function ProviderEditor({
  provider,
  onDone,
  onSaved,
}: {
  provider: ProviderDefinition;
  onDone: () => void;
  onSaved: () => Promise<void>;
}) {
  const [value, setValue] = useState(provider);
  const [nativeLinked, setNativeLinked] = useState(
    !!provider.command && provider.nativeCommand === provider.command,
  );
  const [advanced, setAdvanced] = useState(
    !!provider.nativeCommand && provider.nativeCommand !== provider.command,
  );
  const [browsing, setBrowsing] = useState(false);
  const [args, setArgs] = useState(provider.args.join("\n"));
  const [probe, setProbe] = useState<ProviderProbe | null>(null);
  const [pending, setPending] = useState<"check" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const argsHelpId = useId();
  const commandHelpId = useId();
  const busy = pending !== null || browsing;
  const valid = !!value.name.trim() && !!value.command.trim();
  const setCommand = (command: string) => {
    setProbe(null);
    setValue((v) => ({
      ...v,
      command,
      nativeCommand: nativeLinked ? command : v.nativeCommand,
    }));
  };
  const browse = async () => {
    if (busy || inFlight.current) return;
    setBrowsing(true);
    setError(null);
    try {
      const path = await open({
        title: `Choose ${value.name} executable`,
        directory: false,
        multiple: false,
      });
      if (typeof path === "string") setCommand(path);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBrowsing(false);
    }
  };
  const save = async () => {
    const p = {
      ...value,
      name: value.name.trim(),
      command: value.command.trim(),
      nativeCommand: value.nativeCommand.trim(),
      args: args
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
    };
    await call("save_provider", { provider: p });
    invalidateProviderConfig(provider.id);
    await onSaved();
  };
  const submit = async (action: "check" | "save") => {
    if (!valid || busy || inFlight.current) return;
    inFlight.current = true;
    setPending(action);
    setError(null);
    setProbe(null);
    try {
      await save();
      if (action === "check")
        setProbe(
          await call<ProviderProbe>("probe_provider", {
            providerId: supportedProviderId(value.id),
          }),
        );
      else onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      inFlight.current = false;
      setPending(null);
    }
  };
  return (
    <Card className="provider-editor" aria-busy={busy}>
      <div className="form-grid">
        <div className="field-label">
          Display name
          <Field
            aria-label="Display name"
            disabled
            value={value.name}
            onValueChange={(value) => setValue((v) => ({ ...v, name: value }))}
          />
        </div>
        <div className="field-label">
          Executable
          <div className="flex items-center gap-2">
            <Field
              className="min-w-0 flex-1"
              aria-label="Executable"
              aria-describedby={commandHelpId}
              disabled={busy}
              value={value.command}
              placeholder={`${provider.command} or /path/to/executable`}
              onValueChange={setCommand}
            />
            <Button
              variant="secondary"
              disabled={busy || !desktop}
              onClick={() => void browse()}
            >
              {browsing ? "Choosing…" : "Browse…"}
            </Button>
          </div>
          <small id={commandHelpId}>
            A command name or an absolute file path.
          </small>
        </div>
      </div>
      <Collapsible open={advanced} onOpenChange={setAdvanced}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            disabled={busy}
            trailingIcon={ChevronDown}
            className="w-fit [&[data-state=open]_svg]:rotate-180"
          >
            Advanced
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3">
          <div className="form-grid">
            <div className="field-label">
              Arguments
              <InputGroup>
                <textarea
                  aria-label="Arguments"
                  aria-describedby={argsHelpId}
                  disabled={busy}
                  className="fluid-textarea"
                  value={args}
                  rows={3}
                  onChange={(e) => setArgs(e.target.value)}
                />
              </InputGroup>
              <small id={argsHelpId}>
                One per line; passed without a shell
              </small>
            </div>
            <div className="field-label">
              Native CLI executable
              <Field
                aria-label="Native CLI executable"
                disabled={busy}
                placeholder="Optional"
                value={value.nativeCommand}
                onValueChange={(nativeCommand) => {
                  setProbe(null);
                  setNativeLinked(
                    nativeCommand.trim() === value.command.trim(),
                  );
                  setValue((v) => ({ ...v, nativeCommand }));
                }}
              />
              <small>
                Only needed when the terminal CLI is a different program.
              </small>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
      <p className="muted text-xs">{value.installHint}</p>
      {error && (
        <Banner status="error" role="alert">
          <BannerDescription>{error}</BannerDescription>
        </Banner>
      )}
      {probe && (
        <Banner
          className="probe-result"
          status={probe.status === "ready" ? "success" : "warning"}
        >
          <BannerTitle>
            {
              {
                ready: "Connected",
                missing_executable: "Executable not found",
                incompatible_protocol: "Incompatible adapter",
                authentication_required: "Sign-in required",
                timed_out: "Connection timed out",
                connection_failed: "Connection failed",
              }[probe.status]
            }
          </BannerTitle>
          <BannerDescription>
            <span>{probe.message}</span>
            <span>Native CLI: {probe.version ?? "Version unavailable"}</span>
            {str(record(probe.agentInfo).version) && (
              <span>
                ACP adapter: {str(record(probe.agentInfo).name)}{" "}
                {str(record(probe.agentInfo).version)}
              </span>
            )}
            {array(probe.authMethods).length > 0 && (
              <span>
                Authentication methods:{" "}
                {array(probe.authMethods)
                  .map((method) =>
                    str(record(method).name, str(record(method).id)),
                  )
                  .join(", ")}
                . Sign in through the provider CLI, then check again.
              </span>
            )}
            <span>
              Worktrunk: {probe.worktrunk ? "Installed" : "Not installed"}
            </span>
            <span className="probe-note">
              Terminal handoff is enabled only after a verified same-session
              round trip for your installed version.
            </span>
          </BannerDescription>
          {str(probe.path) && (
            <InputCopy
              className="col-start-2 row-start-3 min-w-0 mt-2"
              value={str(probe.path)}
              label="Executable"
              wrap
            />
          )}
        </Banner>
      )}
      <div className="dialog-footer">
        <Button
          className="provider-editor-cancel"
          variant="ghost"
          disabled={busy}
          onClick={onDone}
        >
          Cancel
        </Button>
        <Button
          variant="secondary"
          className="min-w-[12.5rem]"
          disabled={busy || !valid}
          leadingIcon={pending === "check" ? ThinkingIndicatorGlyph : RefreshCw}
          onClick={() => void submit("check")}
        >
          {pending === "check" ? "Checking…" : "Save and check"}
        </Button>
        <Button
          className="primary-button min-w-[7.5rem]"
          disabled={busy || !valid}
          leadingIcon={pending === "save" ? ThinkingIndicatorGlyph : undefined}
          onClick={() => void submit("save")}
        >
          {pending === "save" ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </Card>
  );
}
