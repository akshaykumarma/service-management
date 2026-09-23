"use client";

import { useEffect, useRef, useState } from "react";

interface Option {
  id: string;
  label: string;
}

export default function MultiSelectDropdown({
  id,
  label,
  options,
  selected,
  onChange,
  placeholder = "All",
}: {
  id: string;
  label: string;
  options: Option[];
  selected: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  function toggleOption(optionId: string) {
    onChange(selected.includes(optionId) ? selected.filter((id) => id !== optionId) : [...selected, optionId]);
  }

  const summary =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? (options.find((o) => o.id === selected[0])?.label ?? placeholder)
        : `${selected.length} selected`;

  return (
    <div className="multiselect" ref={containerRef}>
      <span className="multiselect__label" id={`${id}-label`}>
        {label}
      </span>
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-labelledby={`${id}-label ${id}`}
        id={id}
        className="multiselect__button"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className={selected.length === 0 ? "multiselect__summary--empty" : undefined}>{summary}</span>
        <span className="multiselect__chevron" aria-hidden="true">
          {open ? "▴" : "▾"}
        </span>
      </button>
      {open && (
        <div className="multiselect__panel">
          {options.length === 0 && <p className="multiselect__empty">No options</p>}
          {options.map((option) => (
            <label key={option.id} className="multiselect__option">
              <input type="checkbox" checked={selected.includes(option.id)} onChange={() => toggleOption(option.id)} />
              {option.label}
            </label>
          ))}
          {selected.length > 0 && (
            <button type="button" className="multiselect__clear" onClick={() => onChange([])}>
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}
