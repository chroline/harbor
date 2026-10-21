import { Picker } from "./fluid";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";
import {
  missingModelMessage,
  modelControls,
  legacyModels,
  useProviderConfig,
} from "../lib/provider-config";
import { record, str, values } from "../lib/protocol";

export function ProviderModels({
  state,
  disabled = false,
}: {
  state: ReturnType<typeof useProviderConfig>;
  disabled?: boolean;
}) {
  const controls = modelControls(state.config);
  const hasModel = controls.some(
    (o) => o.category === "model" || o.id === "model",
  );
  const legacy = legacyModels(state.config);
  return (
    <div
      className="provider-models"
      aria-label="Model configuration"
      aria-busy={state.busy}
    >
      <div className="provider-model-fields">
        {!hasModel && (
          <div className="provider-model-field">
            <span>Model</span>
            <Picker
              label="Model"
              searchable
              value={str(record(state.config?.models).currentModelId)}
              placeholder={state.busy ? "Loading models…" : "Unavailable"}
              disabled={disabled || state.busy || !legacy.length}
              items={legacy}
              onValueChange={(v) => state.set("__legacy_model", v)}
            />
          </div>
        )}
        {controls.map((o) => (
          <div key={o.id} className="provider-model-field">
            <span>{o.name}</span>
            {o.type === "boolean" ? (
              <Switch
                checked={o.currentValue === true}
                disabled={disabled || state.busy}
                onToggle={() => state.set(o.id, o.currentValue !== true)}
                label={o.name}
                labelHidden
              />
            ) : (
              <Picker
                label={o.name}
                searchable={o.category === "model" || o.id === "model"}
                value={String(o.currentValue)}
                disabled={disabled || state.busy}
                items={values(o).map((v) => ({
                  value: v.value,
                  label: v.name,
                }))}
                onValueChange={(v) => state.set(o.id, v)}
              />
            )}
          </div>
        ))}
      </div>
      {state.preview ? (
        <p className="provider-model-note">
          Open the desktop app to load models.
        </p>
      ) : state.error ? (
        <div className="provider-model-error" role="alert">
          <span>{state.error}</span>
          <Button
            variant="ghost"
            size="compact"
            disabled={state.busy || disabled}
            onClick={state.retry}
          >
            Retry
          </Button>
        </div>
      ) : state.config && !hasModel && !legacy.length ? (
        <div className="provider-model-error" role="status">
          <span>{missingModelMessage(state.config)}</span>
          <Button
            variant="ghost"
            size="compact"
            disabled={state.busy || disabled}
            onClick={state.retry}
          >
            Retry
          </Button>
        </div>
      ) : null}
    </div>
  );
}
