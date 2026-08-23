"use client";
import { useState } from "react";

/**
 * Number input that actually lets you type decimals.
 *
 * A plain `<input type="number" value={Number(...)} onChange={... Number(e.target.value)}>`
 * fights you the moment you try to type "1.85": after the "1." keystroke,
 * `Number("1.")` is `1`, so the controlled value snaps back to "1" and the
 * trailing "." (and the decimal digits after it) never get a chance to land.
 *
 * This keeps the raw typed string as local state so partial input like
 * "1." or "" survives, and only calls back with a parsed number once it's
 * valid. On blur, if what's left isn't a valid number, it reverts to the
 * last good value.
 */
export default function DecimalInput({
  value,
  onChange,
  style,
  ...props
}: {
  value: number;
  onChange: (n: number) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) {
  const [raw, setRaw] = useState(String(value));

  // Re-sync when the external value changes for a reason other than our
  // own onChange (e.g. auto-calculated total, or a different pick loaded).
  // Adjusting state during render (rather than in an effect) avoids an
  // extra render pass — see https://react.dev/learn/you-might-not-need-an-effect.
  const [lastSeenValue, setLastSeenValue] = useState(value);
  if (value !== lastSeenValue) {
    setLastSeenValue(value);
    if (parseFloat(raw) !== value) setRaw(String(value));
  }

  return (
    <input
      {...props}
      type="text"
      inputMode="decimal"
      style={style}
      value={raw}
      onChange={(e) => {
        const v = e.target.value;
        if (v === "" || /^\d*\.?\d*$/.test(v)) {
          setRaw(v);
          const n = parseFloat(v);
          if (!Number.isNaN(n)) onChange(n);
        }
      }}
      onBlur={(e) => {
        const n = parseFloat(raw);
        if (raw === "" || Number.isNaN(n)) setRaw(String(value));
        props.onBlur?.(e);
      }}
    />
  );
}
