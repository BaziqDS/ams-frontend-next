"use client";

import { useMemo, useRef, useState } from "react";

export interface ThemedSelectOption {
  value: string;
  label: string;
  meta?: string;
  disabled?: boolean;
}

function SelectIcon({ open }: { open: boolean }) {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={open ? "M18 15l-6-6-6 6" : "M6 9l6 6 6-6"} />
    </svg>
  );
}

export function ThemedSelect({
  value,
  options,
  onChange,
  placeholder = "Select option",
  ariaLabel,
  disabled = false,
  size = "default",
}: {
  value: string;
  options: ThemedSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
  size?: "default" | "compact";
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = options.find(option => option.value === value) ?? null;
  const normalizedQuery = query.trim().toLowerCase();
  const filteredOptions = useMemo(() => {
    if (!normalizedQuery) return options;
    return options.filter(option => `${option.label} ${option.meta ?? ""}`.toLowerCase().includes(normalizedQuery));
  }, [normalizedQuery, options]);

  const focusInput = () => requestAnimationFrame(() => inputRef.current?.focus());
  const openMenu = () => {
    if (disabled) return;
    setOpen(true);
    focusInput();
  };

  return (
    <div
      className={`assignment-dropdown themed-select ${size === "compact" ? "compact" : ""}${open ? " open" : ""}${disabled ? " disabled" : ""}`}
      onBlur={event => {
        const nextTarget = event.relatedTarget;
        if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
          setOpen(false);
          setQuery("");
        }
      }}
    >
      <div className="assignment-trigger" onClick={openMenu} aria-expanded={open} aria-label={ariaLabel}>
        <input
          ref={inputRef}
          value={open ? query : selected?.label ?? ""}
          placeholder={open ? "Search options..." : placeholder}
          disabled={disabled}
          onFocus={() => {
            if (disabled) return;
            setOpen(true);
          }}
          onChange={event => {
            if (!open) setOpen(true);
            setQuery(event.target.value);
          }}
        />
        <button
          type="button"
          className="assignment-trigger-toggle"
          onClick={event => {
            event.stopPropagation();
            if (disabled) return;
            setOpen(prev => !prev);
            focusInput();
          }}
          disabled={disabled}
          aria-label={open ? "Close options" : "Open options"}
        >
          <SelectIcon open={open} />
        </button>
      </div>

      {open && !disabled ? (
        <div className="assignment-menu">
          <div className="assignment-list" style={{ maxHeight: 220 }}>
            {filteredOptions.length > 0 ? filteredOptions.map(option => (
              <button
                key={option.value}
                type="button"
                className={"assignment-row" + (option.value === value ? " selected" : "") + (option.disabled ? " locked" : "")}
                disabled={option.disabled}
                onClick={() => {
                  if (option.disabled) return;
                  onChange(option.value);
                  setQuery("");
                  setOpen(false);
                }}
              >
                <span className="assignment-name">{option.label}</span>
                {option.meta ? <span className="assignment-code mono">{option.meta}</span> : null}
              </button>
            )) : (
              <div className="scope-empty">No matching options</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
