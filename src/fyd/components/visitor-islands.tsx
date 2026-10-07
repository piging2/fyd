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
