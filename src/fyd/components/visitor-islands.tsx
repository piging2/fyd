"use client";

/**
 * Item 8 (fyd-execution): the client islands for the generated visitor page.
 *
 * INV-SC-1: these are the ONLY client modules permitted in the generated
 * visitor page's client closure, and they exist for exactly two reasons:
 *   - AskFydIsland: Ask FYD needs execution (chat state, fetch). It may
 *     degrade to a "requires JavaScript" note with JS disabled.
 *   - ObjectOverlayIsland (rendered by the provider below): dialog
 *     enhancement for the service object overlay (open/close state, focus
 *     + scroll ownership via the item-2 useFydDialog primitive).
 *
 * Everything else on the visitor page (identity, business facts, services,
 * locations, contact, navigation, evidence-bound static content) is server
 * rendered by visitor-experience.tsx and must survive hydration failure
 * (INV-SC-2).
 *
 * The provider owns the ONLY client state on the page: which service object
 * is open in the overlay, and the pending Ask FYD question/sequence fed by
 * "Ask about X" affordances. No business facts are derived here; titles and
 * descriptions arrive as serializable props computed by the server tree.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ArrowUpRight } from "lucide-react";
import { AskFydWidget } from "./ask-fyd-widget";
import { ObjectOverlay } from "./object-overlay";
import { useFydDialog } from "../ui/use-fyd-dialog";
import type { PingObject } from "../../lib/ping/types";
import type { FYDThemeTokens, ObjectGraph } from "../sitespec/types";

export interface OpenedObjectPayload {
  object: PingObject;
  title: string;
  description: string;
}

interface VisitorInteraction {
  openObject: (payload: OpenedObjectPayload) => void;
  askAbout: (title: string) => void;
  serviceQuestion: string;
  questionSequence: number;
}

const VisitorInteractionContext = createContext<VisitorInteraction | null>(null);

function useVisitorInteraction(): VisitorInteraction {
  const ix = useContext(VisitorInteractionContext);
  if (!ix) throw new Error("visitor island used outside VisitorInteractionProvider");
  return ix;
}

export function VisitorInteractionProvider({
  graph,
  siteId,
  askEnabled,
  children,
}: {
  graph: ObjectGraph;
  siteId: string;
  askEnabled: boolean;
  children: ReactNode;
}) {
  const [opened, setOpened] = useState<OpenedObjectPayload | null>(null);
  const [serviceQuestion, setServiceQuestion] = useState("");
  const [sequence, setSequence] = useState(0);
  const overlayRegionRef = useRef<HTMLDivElement>(null);
  const closeOverlay = useCallback(() => setOpened(null), []);
  // Item 2: coordinate the ObjectOverlay through the one FYD dialog
  // primitive. ObjectOverlay is a legacy div-dialog that still owns its own
  // focus and markup (its native-<dialog> migration is pending its lane's
  // commit); the hook gives it balanced Lenis scroll ownership on every
  // exit path and makes the returned focus visible.
  useFydDialog(overlayRegionRef, {
    open: opened !== null,
    onClose: closeOverlay,
    focus: "none",
    deferTeardown: true,
  });
  const askAbout = useCallback((title: string) => {
    setServiceQuestion(`Can they help with ${title}?`);
    setSequence((s) => s + 1);
  }, []);
  return (
    <VisitorInteractionContext.Provider
      value={{
        openObject: setOpened,
        askAbout,
        serviceQuestion,
        questionSequence: sequence,
      }}
    >
      {children}
      {opened && (
        <div ref={overlayRegionRef}>
          <ObjectOverlay
            object={{
              ...opened.object,
              title: opened.title,
              description: opened.description,
            }}
            graph={graph}
            siteId={siteId}
            visitor
            onAsk={
              askEnabled
                ? () => {
                    askAbout(opened.title || "this service");
                    closeOverlay();
                  }
                : undefined
            }
            onClose={closeOverlay}
          />
        </div>
      )}
    </VisitorInteractionContext.Provider>
  );
}

/**
 * In-flow object trigger. The server tree renders the identity mark as
 * children; this island only adds the click that opens the SAME
 * ObjectOverlay the per-card Explore button opens, via the provider.
 */
export function ObjectTriggerIsland({
  object,
  title,
  description,
  className,
  children,
}: {
  object: PingObject;
  title: string;
  description: string;
  className?: string;
  children: ReactNode;
}) {
  const ix = useVisitorInteraction();
  return (
    <button
      type="button"
      className={className}
      aria-label={"Open " + title}
      onClick={() => ix.openObject({ object, title, description })}
    >
      {children}
    </button>
  );
}

/**
 * Live website view. Opens an inline dialog in the ObjectOverlay idiom
 * whose body is exactly one iframe over the /api/live proxy for the site.
 * Scroll and focus coordination goes through the one FYD dialog
 * primitive, exactly as VisitorInteractionProvider coordinates the
 * ObjectOverlay, and the opening scroll position is saved and restored
 * on close or unmount in the ObjectOverlay idiom.
 */
export function LiveSiteViewIsland({
  siteId,
  name,
  websiteHref,
}: {
  siteId: string;
  name: string;
  websiteHref: string | null;
}) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const savedScroll = useRef(0);
  const close = useCallback(() => setOpen(false), []);
  useFydDialog(dialogRef, {
    open,
    onClose: close,
    focus: "none",
    deferTeardown: true,
  });
  useEffect(() => {
    if (!open) return;
    savedScroll.current = window.scrollY;
    return () => {
      window.scrollTo(0, savedScroll.current);
    };
  }, [open ]);
  return (
    <>
      <button type="button" className="ve-text-action" onClick={() => setOpen(true)}>
        View live website
      </button>
      {open && (
        <div ref={dialogRef}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={name}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 100,
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "center",
            }}
          >
            <button
              type="button"
              aria-label="Dismiss live website"
              tabIndex={-1}
              onClick={close}
              style={{
                border: 0,
                position: "absolute",
                inset: 0,
                background: "rgba(0, 0, 0, 0.5)",
              }}
            />
            <div
              style={{
                position: "relative",
                width: "100%",
                maxWidth: "900px",
                height: "90vh",
                maxHeight: "90vh",
                overflow: "hidden",
                background: "#fff",
                borderRadius: "16px 16px 0 0",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "16px",
                  padding: "20px 24px",
                  paddingRight: "72px",
                }}
              >
                <span
                  style={{
                    WebkitTextStroke: "1.5px rgba(26, 15, 4, 0.92)",
                    textShadow: "none",
                    fontSize: "24px",
                    fontWeight: 600,
                  }}
                >
                  {name}
                </span>
                {typeof websiteHref === "string" && websiteHref.length > 0 && (
                  <a href={websiteHref} target="_blank" rel="noreferrer">
                    Open site
                  </a>
                )}
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                data-object-close
                style={{
                  position: "absolute",
                  top: "16px",
                  right: "16px",
                  width: "44px",
                  height: "44px",
                  borderRadius: "50%",
                  border: "1px solid #e0e0e0",
                  background: "#fff",
                  fontSize: "18px",
                  cursor: "pointer",
                }}
              >
                ×
              </button>
              <div style={{ flex: 1, minHeight: 0 }}>
                <iframe
                  src={"/api/live/" + encodeURIComponent(siteId)}
                  sandbox="allow-scripts allow-forms allow-popups"
                  title={name + " live website"}
                  style={{ width: "100%", height: "100%", border: 0, display: "block" }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Per-card actions. The server tree renders the card body; this island
 * renders only the interactive affordances (open the object overlay, seed
 * an Ask FYD question). The service-details link is a real anchor.
 */
export function CardActionsIsland({
  object,
  title,
  description,
  ask,
  serviceHref,
}: {
  object: PingObject;
  title: string;
  description: string;
  ask: boolean;
  serviceHref: string | null;
}) {
  const ix = useVisitorInteraction();
  return (
    <div className="ve-card-actions">
      <button
        type="button"
        onClick={() => ix.openObject({ object, title, description })}
      >
        Explore {title} <ArrowUpRight size={16} />
      </button>
      {ask && (
        <a href="#ask" onClick={() => ix.askAbout(title)}>
          Ask about {title} <ArrowUpRight size={16} />
        </a>
      )}
      {serviceHref && (
        <a href={serviceHref} target="_blank" rel="noreferrer">
          Service details <ArrowUpRight size={16} />
        </a>
      )}
    </div>
  );
}

/**
 * "Ask about X" anchor for non-card slots (e.g. the locations block).
 * Plain href="#ask" so it degrades to a working anchor with JS disabled;
 * with JS it also seeds the Ask FYD question.
 */
export function AskAboutLinkIsland({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: ReactNode;
}) {
  const ix = useVisitorInteraction();
  return (
    <a href="#ask" className={className} onClick={() => ix.askAbout(title)}>
      {children}
    </a>
  );
}

/**
 * The Ask FYD island: the ONLY part of the visitor page that requires
 * execution. Owns no business facts; the server tree passes the site id,
 * checkpoint, theme, and prompt seeds. The pending question/sequence fed
 * by "Ask about X" affordances arrives via the provider, exactly as the
 * pre-split component threaded it through useState.
 */
export function AskFydIsland({
  siteId,
  pageCheckpoint,
  theme,
  prompts,
}: {
  siteId?: string;
  pageCheckpoint?: string;
  theme: FYDThemeTokens;
  prompts: string[];
}) {
  const ix = useVisitorInteraction();
  return (
    <AskFydWidget
      pageCheckpoint={pageCheckpoint}
      siteId={siteId}
      theme={theme}
      initialQuestion={ix.serviceQuestion}
      questionSequence={ix.questionSequence}
      prompts={prompts}
    />
  );
}
