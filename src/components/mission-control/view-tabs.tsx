"use client";
import { useRef } from "react";
export function ViewTabs({ id, views, value, onChange, label }: { id: string; views: { id: string; label: string }[]; value: string; onChange: (value: string) => void; label: string }) {
  const refs = useRef(new Map<string, HTMLButtonElement>());
  return <div className="mc-view-tabs" role="tablist" aria-label={label}>{views.map((view, index) => <button type="button" role="tab" id={`${id}-${view.id}`} aria-controls={`${id}-panel`} aria-selected={value === view.id} tabIndex={value === view.id ? 0 : -1} key={view.id} ref={node => { if (node) refs.current.set(view.id, node); else refs.current.delete(view.id); }} onClick={() => onChange(view.id)} onKeyDown={event => {
    let next: number;
    if (event.key === "ArrowRight") next = (index + 1) % views.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + views.length) % views.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = views.length - 1;
    else return;
    event.preventDefault(); onChange(views[next].id); refs.current.get(views[next].id)?.focus();
  }}>{view.label}</button>)}</div>;
}
