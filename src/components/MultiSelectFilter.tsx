"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export interface MultiSelectFilterOption {
  id: string;
  label: string;
  meta?: string | null;
}

const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d={open ? "M18 15l-6-6-6 6" : "M6 9l6 6 6-6"} />
  </svg>
);

export function MultiSelectFilter({
  options,
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  allOptionId = "all",
  minWidth = 220,
}: {
  options: MultiSelectFilterOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder: string;
  searchPlaceholder: string;
  allOptionId?: string;
  minWidth?: number;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = useMemo(() => new Set(value), [value]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const summary = useMemo(() => {
    const labels = options.filter(option => selected.has(option.id)).map(option => option.label);
    if (!labels.length) return placeholder;
    const shown = labels.slice(0, 2).join(", ");
    return labels.length > 2 ? `${shown} +${labels.length - 2}` : shown;
  }, [options, placeholder, selected]);

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(option => `${option.label} ${option.meta ?? ""}`.toLowerCase().includes(q));
  }, [options, query]);

  const toggle = (id: string) => {
    if (id === allOptionId) {
      onChange([id]);
      return;
    }

    const next = new Set(value.filter(token => token !== allOptionId));
    next.has(id) ? next.delete(id) : next.add(id);
    onChange(next.size ? Array.from(next) : [allOptionId]);
  };

  return (
    <div ref={rootRef} className={"assignment-dropdown multi-select-filter" + (open ? " open" : "")} style={{ minWidth }}>
      <div
        className="assignment-trigger"
        onClick={() => {
          setOpen(true);
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
      >
        <input
          ref={inputRef}
          value={open ? query : summary}
          placeholder={open ? searchPlaceholder : placeholder}
          onFocus={() => setOpen(true)}
          onChange={event => setQuery(event.target.value)}
        />
        {open && query ? (
          <button
            type="button"
            className="assignment-trigger-clear"
            onClick={event => {
              event.stopPropagation();
              setQuery("");
              requestAnimationFrame(() => inputRef.current?.focus());
            }}
            aria-label="Clear search"
          >
            x
          </button>
        ) : null}
        <button
          type="button"
          className="assignment-trigger-toggle"
          onClick={event => {
            event.stopPropagation();
            setOpen(current => !current);
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
          aria-label={open ? "Close filter" : "Open filter"}
        >
          <ChevronIcon open={open} />
        </button>
      </div>
      {open ? (
        <div className="assignment-menu">
          <div className="assignment-list">
            {filteredOptions.length ? filteredOptions.map(option => {
              const checked = selected.has(option.id);
              return (
                <button
                  key={option.id}
                  type="button"
                  className={"assignment-row" + (checked ? " selected" : "")}
                  onClick={() => toggle(option.id)}
                >
                  <span className="assignment-check">{checked ? "x" : ""}</span>
                  <span className="assignment-name">{option.label}</span>
                  {option.meta ? <span className="assignment-code mono">{option.meta}</span> : null}
                </button>
              );
            }) : (
              <div className="scope-empty">No matching options.</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
