"use client";

import { useId, useState } from "react";

interface PasswordInputProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  required?: boolean;
  disabled?: boolean;
}

/**
 * A password <input> plus a show/hide toggle. Plain button + input, matching this app's
 * unstyled-by-default, no-widget-library convention — just enough markup for the toggle.
 */
export default function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  required,
  disabled,
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const toggleId = useId();

  return (
    <div className="password-input">
      <input
        id={id}
        name={id}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        required={required}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        className="password-input__toggle"
        aria-pressed={visible}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-describedby={toggleId}
        onClick={() => setVisible((v) => !v)}
        tabIndex={-1}
      >
        {visible ? "Hide" : "Show"}
      </button>
      <span id={toggleId} hidden>
        Toggles whether the password above is shown as plain text.
      </span>
    </div>
  );
}
