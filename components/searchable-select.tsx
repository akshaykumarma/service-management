"use client";

import { useEffect, useMemo, useRef, useState } from "react";

interface Option {
  id: string;
  label: string;
}

export default function SearchableSelect({
  id,
  label,
  options,
  value,
  onChange,
  placeholder = "All",
  required,
}: {
  id: string;
  label: string;
  options: Option[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedLabel = options.find((o) => o.id === value)?.label ?? "";

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  useEffect(() => {
    function handlePointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  function selectOption(optionId: string) {
    onChange(optionId);
    setOpen(false);
    setQuery("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      setHighlighted((prev) => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && filtered[highlighted]) selectOption(filtered[highlighted].id);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="searchable-select" ref={containerRef}>
      <label htmlFor={id}>{label}</label>
      <div className="searchable-select__control">
        <input
          id={id}
          ref={inputRef}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls={`${id}-listbox`}
          required={required}
          autoComplete="off"
          placeholder={placeholder}
          value={open ? query : selectedLabel}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlighted(0);
            if (!open) setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
        />
        {value && !open && (
          <button
            type="button"
            className="searchable-select__clear"
            aria-label={`Clear ${label}`}
            onClick={() => selectOption("")}
          >
            ×
          </button>
        )}
      </div>
      {open && (
        <ul id={`${id}-listbox`} role="listbox" className="searchable-select__panel">
          {value && (
            <li role="option" aria-selected={value === ""}>
              <button type="button" className="searchable-select__option" onClick={() => selectOption("")}>
                {placeholder}
              </button>
            </li>
          )}
          {filtered.length === 0 && <li className="searchable-select__empty">No matches</li>}
          {filtered.map((option, index) => (
            <li key={option.id} role="option" aria-selected={option.id === value}>
              <button
                type="button"
                className={`searchable-select__option${index === highlighted ? " searchable-select__option--highlighted" : ""}`}
                onMouseEnter={() => setHighlighted(index)}
                onClick={() => selectOption(option.id)}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
