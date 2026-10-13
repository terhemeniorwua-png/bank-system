"use client";

import { useRef } from "react";

export default function PinInput({
  label,
  value = "",
  onChange,
  error,
  disabled = false,
  autoFocus = false,
  id,
}) {
  const inputsRef = useRef([]);
  const digits = String(value).split("").slice(0, 4);

  const commit = (next) => {
    onChange(next.join("").replace(/\D/g, "").slice(0, 4));
  };

  const handleChange = (index, event) => {
    const raw = event.target.value.replace(/\D/g, "");

    if (!raw) {
      const next = digits.slice();
      next[index] = "";
      commit(next);
      return;
    }

    const next = digits.slice();

    if (raw.length > 1) {
      // Pasting or fast typing fills subsequent boxes.
      let cursor = index;
      for (const char of raw.split("")) {
        if (cursor > 3) break;
        next[cursor] = char;
        cursor += 1;
      }
      commit(next);
      inputsRef.current[Math.min(cursor, 3)]?.focus();
      return;
    }

    next[index] = raw;
    commit(next);
    if (index < 3) inputsRef.current[index + 1]?.focus();
  };

  const handleKeyDown = (index, event) => {
    if (event.key === "Backspace") {
      event.preventDefault();
      const next = digits.slice();
      if (next[index]) {
        next[index] = "";
        commit(next);
      } else if (index > 0) {
        next[index - 1] = "";
        commit(next);
        inputsRef.current[index - 1]?.focus();
      }
      return;
    }

    if (event.key === "ArrowLeft" && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
    if (event.key === "ArrowRight" && index < 3) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  return (
    <div>
      {label && (
        <label
          htmlFor={id || "pin-input"}
          className="mb-2 block text-sm font-medium text-text-primary"
        >
          {label}
        </label>
      )}
      <div className="flex gap-3" role="group" aria-label={label || "PIN"}>
        {[0, 1, 2, 3].map((index) => (
          <input
            key={index}
            ref={(el) => {
              inputsRef.current[index] = el;
            }}
            id={index === 0 ? id : undefined}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            pattern="[0-9]*"
            maxLength={4}
            value={digits[index] || ""}
            disabled={disabled}
            autoFocus={autoFocus && index === 0}
            aria-label={`${label || "PIN"} digit ${index + 1}`}
            aria-invalid={Boolean(error)}
            onChange={(event) => handleChange(index, event)}
            onKeyDown={(event) => handleKeyDown(index, event)}
            className={`h-14 w-12 rounded-xl border bg-white text-center text-xl font-semibold text-text-primary outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50 ${
              error ? "border-error" : "border-border"
            }`}
          />
        ))}
      </div>
      {error && <p className="mt-2 text-xs text-error">{error}</p>}
    </div>
  );
}
