import {
  array,
  options,
  record,
  str,
  values,
  type ConfigValue,
} from "./protocol";

export type ChatMode = {
  configId: string;
  current: string;
  choices: ConfigValue[];
};

/** Resolve advertised mode controls without depending on provider identity. */
export function chatMode(
  configOptions: unknown,
  modes?: unknown,
): ChatMode | undefined {
  const controls = options(configOptions).filter(
    (o) => o.type === "select" && values(o).length > 0,
  );
  // A separate collaboration selector describes working behavior more precisely
  // than the general session mode (which can also control permissions).
  const control =
    controls.find(
      (o) =>
        o.category === "collaboration_mode" ||
        (!o.category && o.id === "collaboration_mode"),
    ) ??
    controls.find((o) => o.category === "mode") ??
    controls.find((o) => !o.category && o.id === "mode");
  if (control)
    return {
      configId: control.id,
      current: str(control.currentValue),
      choices: values(control),
    };

  const choices = array(record(modes).availableModes)
    .map(record)
    .map((m) => ({
      value: str(m.id),
      name: str(m.name, str(m.id)),
      description: str(m.description),
    }))
    .filter((m) => m.value);
  // Legacy modes sometimes mirror another advertised setting, such as effort.
  const duplicate = controls.some((o) => {
    const modern = values(o);
    return (
      modern.length === choices.length &&
      choices.every((c) =>
        modern.some((v) => v.value === c.value && v.name === c.name),
      )
    );
  });
  if (choices.length && !duplicate)
    return {
      configId: "__legacy_mode",
      current: str(record(modes).currentModeId),
      choices,
    };
}

export function nextMode(mode: ChatMode, selected = mode.current) {
  return mode.choices[
    (mode.choices.findIndex((c) => c.value === selected) + 1) %
      mode.choices.length
  ]?.value;
}
