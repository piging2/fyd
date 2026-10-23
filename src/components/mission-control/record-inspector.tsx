"use client";
import { useEffect, useRef, type ReactNode } from "react";
import type { TraceRecord } from "./trace-model";
import styles from "./evidence-workspace.module.css";

/** Shared native inspector shell for mission records and object source traces. */
export function RecordInspector({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null); const opener = useRef<HTMLElement | null>(null);
  useEffect(() => () => { if (opener.current?.isConnected) opener.current.focus(); }, []);
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open && !node.open) { opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; node.showModal(); node.querySelector<HTMLButtonElement>("button")?.focus(); }
    else if (!open && node.open) { node.close(); if (opener.current?.isConnected) opener.current.focus(); }
  }, [open]);
  return <dialog ref={dialog} className={styles.inspector} aria-label={`Evidence inspector: ${title}`} onCancel={event => { event.preventDefault(); onClose(); }}><div className={styles.inspectorInner}><div className={styles.inspectorHeader}><div><span className={styles.eyebrow}>EVIDENCE INSPECTOR</span><h3>{title}</h3></div><button type="button" className={styles.close} aria-label="Close evidence inspector" onClick={onClose}>×</button></div>{children}</div></dialog>;
}

export function TraceBody({ trace }: { trace: TraceRecord }) {
  return <div className="mc-trace-body"><p className={styles.note}>Lines below represent the bindings returned by this read contract. Missing evidence is shown separately; it is never connected through a guessed link.</p><ol className="mc-trace-nodes">{trace.nodes.map(node => <li key={node.id} data-state={node.state}><div><strong>{node.label}</strong><span>{node.state}</span></div>{node.identity && <code>{node.identity}</code>}<p>{node.note}</p>{node.data !== undefined && <details className={styles.raw}><summary>Returned record</summary><pre>{JSON.stringify(node.data, null, 2)}</pre></details>}</li>)}</ol><h4>Established bindings</h4>{trace.links.length ? <ul className="mc-trace-links">{trace.links.map((link, i) => <li key={i}><strong>{trace.nodes.find(n => n.id === link.from)?.label} → {trace.nodes.find(n => n.id === link.to)?.label}</strong><code>{link.basis}</code></li>)}</ul> : <p className={styles.note}>No connection is established by the selected returned record.</p>}</div>;
}
