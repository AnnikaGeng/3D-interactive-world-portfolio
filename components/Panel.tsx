"use client";

import type { Life } from "./Scene";

export type Tuning = { life: Life };

const DEFAULT: Life = { flow: 0.7, flowSpeed: 0.06, water: 0.5, deer: true };
export const DEFAULT_LIFE = DEFAULT;

/** Tuning panel (press D). Motion strength is a thing you judge by eye. */
export default function Panel({
  open,
  value,
  onChange,
}: {
  open: boolean;
  value: Tuning;
  onChange: (t: Tuning) => void;
}) {
  if (!open) return null;
  const set = (patch: Partial<Life>) => onChange({ life: { ...value.life, ...patch } });

  const sliders: [keyof Life, string, number, number][] = [
    ["flow", "trail flow", 0, 1],
    ["flowSpeed", "flow speed", 0, 0.25],
    ["water", "water glint", 0, 1.5],
  ];

  return (
    <div className="panel">
      <div className="panel-title">TUNING · press D to hide</div>

      {sliders.map(([key, label, min, max]) => (
        <label key={key}>
          <span>{label}</span>
          <input
            type="range" min={min} max={max} step={(max - min) / 100}
            value={value.life[key] as number}
            onChange={(e) => set({ [key]: Number(e.target.value) } as Partial<Life>)}
          />
          <b>{(value.life[key] as number).toFixed(2)}</b>
        </label>
      ))}

      <label className="check">
        <input
          type="checkbox"
          checked={value.life.deer}
          onChange={(e) => set({ deer: e.target.checked })}
        />
        <span>walking deer</span>
      </label>

      <button onClick={() => onChange({ life: { ...DEFAULT } })}>reset</button>
    </div>
  );
}
