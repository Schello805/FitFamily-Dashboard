"use client";

import { Delete, RotateCcw } from "lucide-react";

export function TouchPinpad({
  value,
  onChange,
  maxLength = 8,
  disabled = false
}: {
  value: string;
  onChange: (val: string) => void;
  maxLength?: number;
  disabled?: boolean;
}) {
  function handleDigit(digit: string) {
    if (disabled || value.length >= maxLength) return;
    onChange(value + digit);
  }

  function handleBackspace() {
    if (disabled || value.length === 0) return;
    onChange(value.slice(0, -1));
  }

  function handleClear() {
    if (disabled || value.length === 0) return;
    onChange("");
  }

  const dotCount = Math.max(4, Math.min(value.length, maxLength));

  return (
    <div className="touch-pinpad" role="group" aria-label="PIN-Tastenfeld">
      <div className="pinpad-dots" aria-label={`Eingegebene Ziffern: ${value.length}`}>
        {Array.from({ length: dotCount }).map((_, index) => {
          const isFilled = index < value.length;
          return (
            <span
              key={index}
              className={`pinpad-dot ${isFilled ? "filled" : ""}`}
            />
          );
        })}
      </div>

      <div className="pinpad-grid">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
          <button
            key={num}
            type="button"
            className="pinpad-key"
            disabled={disabled || value.length >= maxLength}
            onClick={() => handleDigit(String(num))}
          >
            {num}
          </button>
        ))}

        <button
          type="button"
          className="pinpad-key action-key"
          title="PIN leeren"
          aria-label="Eingabe leeren"
          disabled={disabled || value.length === 0}
          onClick={handleClear}
        >
          <RotateCcw size={20} />
        </button>

        <button
          type="button"
          className="pinpad-key"
          disabled={disabled || value.length >= maxLength}
          onClick={() => handleDigit("0")}
        >
          0
        </button>

        <button
          type="button"
          className="pinpad-key action-key"
          title="Letzte Ziffer löschen"
          aria-label="Letzte Ziffer löschen"
          disabled={disabled || value.length === 0}
          onClick={handleBackspace}
        >
          <Delete size={22} />
        </button>
      </div>
    </div>
  );
}
