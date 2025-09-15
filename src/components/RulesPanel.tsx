import type { Rules } from "../engine/baseball";
import { Field } from "./ui/Field";
import { Toggle } from "./ui/Toggle";

export function RulesPanel({ rules, setRules, syncRules }: { rules: Rules; setRules: (r: Rules) => void; syncRules: () => void }) {
  return (
    <div className="card">
      <h3 className="h2">Reglas del juego</h3>

      <Field label={`Entradas reglamentarias: ${rules.regulationInnings}`}>
        <input
          type="range"
          min={3}
          max={12}
          value={rules.regulationInnings}
          onChange={(e) => setRules({ ...rules, regulationInnings: +e.target.value })}
          onMouseUp={syncRules}
          onTouchEnd={syncRules}
        />
      </Field>

      <Toggle label="Walk-off activo" checked={rules.walkoff} onChange={(v) => { setRules({ ...rules, walkoff: v }); syncRules(); }} />

      <Toggle label="Entradas extra" checked={rules.enableExtraInnings} onChange={(v) => { setRules({ ...rules, enableExtraInnings: v }); syncRules(); }} />

      <Toggle
        label="Base running estocástico"
        checked={(rules as any).stochasticBaseRunning ?? true}
        onChange={(v) => {
          setRules({ ...(rules as any), stochasticBaseRunning: v } as Rules);
          syncRules();
        }}
      />

      <Toggle label="Permitir empates" checked={rules.allowTies} onChange={(v) => { setRules({ ...rules, allowTies: v }); syncRules(); }} />

      <Field label={`Límite de entradas extra: ${rules.maxInnings ?? "-"}`}>
        <input
          type="number"
          min={rules.regulationInnings}
          placeholder="vacío = sin límite"
          value={rules.maxInnings ?? ""}
          onChange={(e) => {
            const v = e.target.value === "" ? null : Math.max(+e.target.value, rules.regulationInnings);
            setRules({ ...rules, maxInnings: v });
          }}
          onBlur={syncRules}
        />
      </Field>

      <hr style={{ opacity: 0.15, margin: "12px 0" }} />

      <Field label={`Mercy rule (diferencia): ${rules.mercyDiff ?? "off"}`}>
        <input
          type="number"
          min={1}
          placeholder="vacío = off"
          value={rules.mercyDiff ?? ""}
          onChange={(e) => {
            const v = e.target.value === "" ? undefined : Math.max(1, +e.target.value);
            setRules({ ...rules, mercyDiff: v });
          }}
          onBlur={syncRules}
        />
      </Field>

      <Field label={`Mercy rule (a partir de la entrada): ${rules.mercyInning ?? "off"}`}>
        <input
          type="number"
          min={1}
          placeholder="vacío = off"
          value={rules.mercyInning ?? ""}
          onChange={(e) => {
            const v = e.target.value === "" ? undefined : Math.max(1, +e.target.value);
            setRules({ ...rules, mercyInning: v });
          }}
          onBlur={syncRules}
        />
      </Field>
    </div>
  );
}
