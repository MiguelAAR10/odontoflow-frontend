"use client";

import { useRef, type KeyboardEvent } from "react";

export function Tabs({ items, value, onChange, ariaLabel, panelId }: { items: { id: string; label: string }[]; value: string; onChange: (value: string) => void; ariaLabel: string; panelId?: string }) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = event.key === "ArrowRight" ? (index + 1) % items.length : event.key === "ArrowLeft" ? (index - 1 + items.length) % items.length : event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault();
    refs.current[next]?.focus();
    onChange(items[next].id);
  };

  return <div className="tabs" role="group" aria-label={ariaLabel}>
    {items.map((item, index) => <button key={item.id} ref={(element) => { refs.current[index] = element; }} type="button" aria-pressed={value === item.id} aria-controls={panelId} tabIndex={value === item.id ? 0 : -1} onKeyDown={(event) => move(event, index)} onClick={() => onChange(item.id)} className={value === item.id ? "tab--active" : ""}>{item.label}</button>)}
  </div>;
}
