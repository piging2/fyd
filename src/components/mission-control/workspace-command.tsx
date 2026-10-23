"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, CornerDownLeft, Search, X } from "lucide-react";
import styles from "./workspace-command.module.css";

export type WorkspaceCommandItem = {
  id: string;
  label: string;
  group: string;
  keywords?: string[];
  run: () => void;
};

const searchText = (value: string) =>
  value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();

/** Commands are supplied by the workspace so results always lead to real views. */
export function WorkspaceCommand({ commands }: { commands: WorkspaceCommandItem[] }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const resultRefs = useRef(new Map<string, HTMLButtonElement>());
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [shortcut, setShortcut] = useState("Ctrl K");
  const id = useId();

  const results = useMemo(() => {
    const terms = searchText(query).trim().split(/\s+/).filter(Boolean);
    if (!terms.length) return commands;
    return commands.filter((command) => {
      const haystack = searchText([command.label, command.group, ...(command.keywords ?? [])].join(" "));
      return terms.every((term) => haystack.includes(term));
    });
  }, [commands, query]);
  const selectedIndex = Math.min(activeIndex, Math.max(results.length - 1, 0));
  const selected = results[selectedIndex];

  const show = useCallback(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    // Do not replace another modal's keyboard/focus context.
    if (document.querySelector("dialog[open]")) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setQuery("");
    setActiveIndex(0);
    dialog.showModal();
    setOpen(true);
    inputRef.current?.focus();
  }, []);

  const close = useCallback(() => dialogRef.current?.close(), []);

  useEffect(() => {
    const node = dialogRef.current;
    if (!node) return;
    const dismissBackdrop = (event: MouseEvent) => {
      if (event.target !== node) return;
      const rect = node.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
    };
    node.addEventListener("click", dismissBackdrop);
    return () => node.removeEventListener("click", dismissBackdrop);
  }, [close]);

  useEffect(() => {
    setShortcut(/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘ K" : "Ctrl K");
    const onShortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== "k") return;
      event.preventDefault();
      if (dialogRef.current?.open) close();
      else show();
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, [close, show]);

  useEffect(() => {
    if (open && selected) resultRefs.current.get(selected.id)?.scrollIntoView({ block: "nearest" });
  }, [open, selected]);

  const execute = (command: WorkspaceCommandItem) => {
    close();
    command.run();
  };

  return (
    <>
      <button type="button" className={styles.trigger} onClick={show} aria-haspopup="dialog" aria-expanded={open} aria-controls={`${id}-dialog`}>
        <Search size={16} aria-hidden="true" />
        <span>Search workspace</span>
        <kbd>{shortcut}</kbd>
      </button>
      <dialog
        id={`${id}-dialog`}
        ref={dialogRef}
        className={styles.dialog}
        aria-labelledby={`${id}-title`}
        onClose={() => {
          setOpen(false);
          const previous = returnFocusRef.current;
          if (previous?.isConnected) previous.focus({ preventScroll: true });
        }}
      >
        <div className={styles.heading}>
          <div>
            <p className={styles.eyebrow}>PING WORKSPACE</p>
            <h2 id={`${id}-title`}>Go where the work is.</h2>
          </div>
          <button type="button" className={styles.close} onClick={close} aria-label="Close workspace search"><X size={19} aria-hidden="true" /></button>
        </div>
        <div className={styles.search}>
          <Search size={20} aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-label="Search workspace destinations"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={`${id}-results`}
            aria-activedescendant={selected ? `${id}-result-${selectedIndex}` : undefined}
            autoComplete="off"
            placeholder="Find a view or action…"
            value={query}
            onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                if (results.length) setActiveIndex((selectedIndex + (event.key === "ArrowDown" ? 1 : -1) + results.length) % results.length);
              } else if (event.key === "Enter" && selected) {
                event.preventDefault();
                execute(selected);
              }
            }}
          />
          <kbd>esc</kbd>
        </div>
        <p className={styles.resultCount} role="status">{results.length} {results.length === 1 ? "destination" : "destinations"}{query.trim() ? ` matching “${query.trim()}”` : " in your workspace"}</p>
        <div id={`${id}-results`} role="listbox" aria-label="Workspace destinations" className={styles.results}>
          {results.map((command, index) => (
            <button
              type="button"
              role="option"
              aria-selected={index === selectedIndex}
              id={`${id}-result-${index}`}
              key={command.id}
              tabIndex={-1}
              className={styles.result}
              ref={(element) => { if (element) resultRefs.current.set(command.id, element); else resultRefs.current.delete(command.id); }}
              onMouseDown={(event) => event.preventDefault()}
              onPointerMove={() => setActiveIndex(index)}
              onClick={() => execute(command)}
            >
              <span className={styles.resultText}><span>{command.label}</span><small>{command.group}</small></span>
              <CornerDownLeft size={16} aria-hidden="true" />
            </button>
          ))}
        </div>
        {results.length === 0 && <div className={styles.empty}><Search size={25} aria-hidden="true" /><strong>No destinations found</strong><p>Try a shorter name, a team, or a section.</p><button type="button" onClick={() => { setQuery(""); setActiveIndex(0); inputRef.current?.focus(); }}>Clear search</button></div>}
        <div className={styles.footer} aria-hidden="true"><span><ArrowUp size={12} /><ArrowDown size={12} /> to move</span><span><CornerDownLeft size={13} /> to open</span><span>esc to close</span></div>
      </dialog>
    </>
  );
}
