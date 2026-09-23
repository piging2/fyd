"use client";

/**
 * FYD Workspace: STATE 3. The restrained sheet for intentional
 * interaction.
 *
 * Desktop: a viewport-fixed right side sheet (~400px). Mobile: a
 * bottom sheet. NOT circular, NOT a second dark application: the
 * neutral FYD shell (light by default), FYD identity as the glyph
 * mark + royal accents.
 *
 * Tabs: Ask | Evidence | Contact | Related (+ Owner behind the DEMO
 * badge when viewer.role is owner-demo).
 *
 * - Ask: the evidence-bounded AskObjectPanel (SUPPORTED -> answer +
 *   evidence; PARTIALLY -> qualified; UNSUPPORTED -> says so).
 *   Lazy-loaded: the chat initializes only when the workspace opens.
 * - Evidence: trust on demand. Each fact renders its claim + the
 *   ProvenanceLine grammar (compact verified line -> tap expands the
 *   lineage). No dashboard.
 * - Contact: ContactMethod values through the contact lane's
 *   ContactFlow (value -> provenance -> real Call/Send email action
 *   inside the flow). Plus Copy and "Ask about contacting".
 *   Native tel:/mailto: remain the deterministic fallbacks inside the
 *   flow's actionUri. No PhoneAuthority/EmailAuthority invented.
 * - Related: real related objects only, never invented.
 * - Owner: DEMO/DEV capability injection, explicitly labeled, impossible
 *   to mistake for production security. Not an auth platform.
 */

import * as React from "react";
import { motion, useDragControls, useReducedMotion } from "framer-motion";
import { shell, shellSurface, type ShellColorScheme } from "./fyd-shell";
import type { PresentationSpec, SpecAction } from "./presentation-spec";
import { FydGlyphMark } from "./PeekCard";
import { ContactFlow, ProvenanceLine } from "../../components/contact-link";
import type { AskPageContext } from "./types";

const AskObjectPanel = React.lazy(() =>
  import("../ask-object-panel").then((m) => ({ default: m.AskObjectPanel })),
);

export type WorkspaceTab = "ask" | "evidence" | "contact" | "related" | "owner";
/** Desktop sheet width (px). Restrained: host content stays readable. */
export const WORKSPACE_W = 400;

function TabButton({
  active,
  onClick,
  children,
  scheme,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  scheme: ShellColorScheme;
}) {
  const dark = scheme === "dark";
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className="min-h-[44px] flex-1 cursor-pointer rounded-[10px] px-2 text-[13px] font-semibold"
      style={
        active
          ? { background: "#7C5CD6", color: "#FFFFFF" }
          : {
              background: "transparent",
              color: dark ? shell.surface.inkSoftOnDark : shell.surface.inkSoft,
            }
      }
    >
      {children}
    </button>
  );
}

function CopyButton({ value, scheme }: { value: string; scheme: ShellColorScheme }) {
  const [copied, setCopied] = React.useState(false);
  const dark = scheme === "dark";
  return (
    <button
      type="button"
      onClick={() => {
        if (typeof navigator === "undefined" || !navigator.clipboard) return;
        navigator.clipboard.writeText(value).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          },
          () => {},
        );
      }}
      className="inline-flex min-h-[40px] cursor-pointer items-center rounded-[10px] px-3 text-[13px] font-semibold"
      style={{
        border: dark
          ? "1px solid rgba(244,241,234,0.22)"
          : "1px solid rgba(26,23,41,0.16)",
        background: "transparent",
        color: dark ? shell.surface.inkOnDark : shell.surface.ink,
      }}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export function WorkspaceSheet({
  spec,
  siteId,
  initialQuestion,
  initialTab = "ask",
  mobile = false,
  onClose,
  onNavigateObject,
  pageContext,
  scheme = "light",
  transitionId,
}: {
  spec: PresentationSpec;
  siteId: string;
  initialQuestion?: string;
  initialTab?: WorkspaceTab;
  mobile?: boolean;
  onClose: () => void;
  onNavigateObject?: (objectId: string) => void;
  pageContext?: AskPageContext;
  scheme?: ShellColorScheme;
  /**
   * Shared identity name for the peek -> workspace view transition
   * (see ./view-transitions). The peek's identity row uses the same
   * name; the avatar/logo + title persist through the expand.
   */
  transitionId?: string;
}) {
  const surf = shellSurface(scheme);
  const [tab, setTab] = React.useState<WorkspaceTab>(initialTab);
  const [askSeed, setAskSeed] = React.useState(initialQuestion ?? "");
  const [ownerNote, setOwnerNote] = React.useState<string | null>(null);
  const closeRef = React.useRef<HTMLButtonElement>(null);
  const reduceMotion = useReducedMotion();
  const dragControls = useDragControls();
  // Drag-to-dismiss is an EXIT gesture: enabled only on the mobile
  // bottom sheet, only from the handle (dragListener={false}), so the
  // tab panel's own scrolling keeps working. Reduced motion disables
  // it: the close button remains the dismiss path.
  const dragDismiss = mobile && reduceMotion !== true;

  React.useEffect(() => {
    closeRef.current?.focus();
  }, []);

  const headerRef = React.useCallback(
    (el: HTMLDivElement | null) => {
      if (el) {
        if (transitionId) el.style.setProperty("view-transition-name", transitionId);
        else el.style.removeProperty("view-transition-name");
      }
    },
    [transitionId],
  );

  const tabs: Array<{ id: WorkspaceTab; label: string }> = [
    { id: "ask", label: "Ask" },
    { id: "evidence", label: "Evidence" },
    { id: "contact", label: "Contact" },
    { id: "related", label: "Related" },
  ];
  if (spec.ownerDemo) tabs.push({ id: "owner", label: "Owner" });

  const askAboutContacting = (methodLabel: string, value: string) => {
    setAskSeed(`How do I reach them ${methodLabel === "phone" ? "by phone" : "by email"} at ${value}? What should I know before contacting them?`);
    setTab("ask");
  };

  const ownerActions = spec.actions.filter((a) => a.demo);

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={`${spec.name} workspace`}
      data-fyd-surface="workspace"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
      className="fyd-workspace"
      drag={dragDismiss ? "y" : false}
      dragListener={false}
      dragControls={dragDismiss ? dragControls : undefined}
      dragConstraints={{ top: 0 }}
      dragElastic={0.18}
      onDragEnd={(_e, info) => {
        if (info.offset.y > 120 || info.velocity.y > 900) onClose();
      }}
      style={
        mobile
          ? {
              position: "fixed",
              left: 0,
              right: 0,
              bottom: 0,
              maxHeight: "88vh",
              display: "flex",
              flexDirection: "column",
              background: surf.bg,
              color: surf.ink,
              borderTop: surf.border,
              borderTopLeftRadius: shell.radius.workspace,
              borderTopRightRadius: shell.radius.workspace,
              boxShadow: shell.elevation.workspace,
              isolation: "isolate",
              zIndex: 90,
            }
          : {
              position: "fixed",
              top: 24,
              right: 24,
              bottom: 24,
              width: `min(${WORKSPACE_W}px, calc(100vw - 48px))`,
              display: "flex",
              flexDirection: "column",
              background: surf.bg,
              color: surf.ink,
              border: surf.border,
              borderRadius: shell.radius.workspace,
              boxShadow: shell.elevation.workspace,
              isolation: "isolate",
              zIndex: 90,
            }
      }
    >
      {/* Drag handle: the only drag-to-dismiss affordance (EXIT). 44px
          hit area, thumb-reachable. Hidden when drag is disabled. */}
      {dragDismiss && (
        <div
          aria-hidden="true"
          onPointerDown={(e) => dragControls.start(e)}
          className="flex w-full cursor-grab touch-none items-center justify-center"
          style={{ minHeight: 32, paddingTop: 8 }}
        >
          <span
            className="block rounded-full"
            style={{
              width: 40,
              height: 4,
              background: "rgba(26,23,41,0.18)",
            }}
          />
        </div>
      )}
      {/* Header: identity + DEMO badge + close. */}
      <div
        ref={headerRef}
        className="flex items-center gap-2.5"
        style={{ padding: `${shell.spacing.workspacePad}px ${shell.spacing.workspacePad}px 0` }}
      >
        <FydGlyphMark name={spec.name} size={32} />
        <div className="min-w-0 flex-1">
          <p
            className="truncate font-semibold"
            style={{ fontSize: shell.type.name + 1, color: surf.ink }}
          >
            {spec.name}
          </p>
          {spec.kindLabel && (
            <p
              className="truncate"
              style={{ fontSize: shell.type.caption, color: surf.inkSoft }}
            >
              {spec.kindLabel}
            </p>
          )}
        </div>
        {spec.ownerDemo && (
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-bold tracking-wide"
            style={{
              background: "#FEF3C7",
              color: "#92400E",
              border: "1px solid #F59E0B",
            }}
            title="Owner demo mode: capability injection for demonstration only, not production security."
          >
            DEMO
          </span>
        )}
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close workspace"
          className="inline-flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-[10px] text-[18px]"
          style={{ color: surf.inkSoft }}
        >
          ×
        </button>
      </div>

      {/* Tab bar. */}
      <div
        role="tablist"
        aria-label="Workspace sections"
        className="flex gap-1"
        style={{ padding: `12px ${shell.spacing.workspacePad}px 0` }}
      >
        {tabs.map((t) => (
          <TabButton
            key={t.id}
            active={tab === t.id}
            onClick={() => {
              setTab(t.id);
              setOwnerNote(null);
            }}
            scheme={scheme}
          >
            {t.label}
          </TabButton>
        ))}
      </div>

      {/* Tab panels. Sticky tab bar above; the panel scrolls. The mobile
          sheet pads the home-indicator safe area (edge-to-edge sheet,
          inset content). */}
      <div
        className="min-h-0 flex-1 overflow-y-auto"
        style={{
          padding: `16px ${shell.spacing.workspacePad}px ${
            mobile
              ? `calc(${shell.spacing.workspacePad}px + env(safe-area-inset-bottom, 0px))`
              : `${shell.spacing.workspacePad}px`
          }`,
        }}
      >
        {tab === "ask" && (
          <React.Suspense
            fallback={
              <p style={{ fontSize: shell.type.desc, color: surf.inkSoft }}>
                Loading Ask FYD…
              </p>
            }
          >
            <AskObjectPanel
              siteId={siteId}
              objectId={spec.objectId}
              objectName={spec.name}
              sampleQuestions={spec.suggestions}
              pageContext={pageContext}
              initialQuestion={askSeed || undefined}
            />
          </React.Suspense>
        )}

        {tab === "evidence" && (
          <div>
            <p
              className="mb-3"
              style={{ fontSize: shell.type.desc, color: surf.inkSoft }}
            >
              Trust on demand. Each claim carries its evidence; expand any
              line to see the source.
            </p>
            {spec.evidence && (
              <p
                className="mb-4"
                style={{ fontSize: shell.type.caption, color: surf.inkSoft }}
              >
                {spec.evidence.receipt}
                {spec.evidence.asOf ? ` · observed ${spec.evidence.asOf}` : ""}
              </p>
            )}
            {spec.facts.length === 0 && (
              <p style={{ fontSize: shell.type.desc, color: surf.inkSoft }}>
                FYD has no evidence-backed facts for this object yet.
              </p>
            )}
            <ul className="space-y-4">
              {spec.facts.map((f, i) => (
                <li key={i}>
                  <p
                    className="font-semibold"
                    style={{ fontSize: shell.type.desc, color: surf.ink }}
                  >
                    {f.label}
                  </p>
                  {f.evidence.state !== "unknown" && f.value && (
                    <p
                      className="mt-0.5"
                      style={{ fontSize: shell.type.desc, color: surf.inkSoft }}
                    >
                      {f.value}
                    </p>
                  )}
                  <div className="mt-1">
                    <ProvenanceLine evidence={f.evidence} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {tab === "contact" && (
          <div>
            {spec.contactMethods.length === 0 && (
              <p style={{ fontSize: shell.type.desc, color: surf.inkSoft }}>
                FYD has no verified contact method for this object.
              </p>
            )}
            {spec.contactMethods.map((m) => (
              <div key={m.kind} className="mb-5">
                <p
                  className="mb-1 font-semibold capitalize"
                  style={{ fontSize: shell.type.desc, color: surf.ink }}
                >
                  {m.kind === "phone" ? "Phone" : "Email"}
                </p>
                <ContactFlow method={m} />
                <div className="mt-2 flex flex-wrap gap-2">
                  <CopyButton value={m.value} scheme={scheme} />
                  <button
                    type="button"
                    onClick={() => askAboutContacting(m.kind, m.value)}
                    className="inline-flex min-h-[40px] cursor-pointer items-center rounded-[10px] px-3 text-[13px] font-semibold"
                    style={{
                      border:
                        scheme === "dark"
                          ? "1px solid rgba(244,241,234,0.22)"
                          : "1px solid rgba(26,23,41,0.16)",
                      background: "transparent",
                      color: scheme === "dark" ? shell.surface.inkOnDark : shell.surface.ink,
                    }}
                  >
                    Ask about contacting
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "related" && (
          <div>
            {spec.related.length === 0 && (
              <p style={{ fontSize: shell.type.desc, color: surf.inkSoft }}>
                No related objects in the graph.
              </p>
            )}
            <ul className="space-y-1">
              {spec.related.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    disabled={!onNavigateObject}
                    onClick={() => onNavigateObject?.(r.id)}
                    className="flex w-full items-center gap-2.5 rounded-[10px] px-2 py-2 text-left disabled:cursor-default"
                    style={{ minHeight: 44 }}
                  >
                    <FydGlyphMark name={r.name} size={24} />
                    <span className="min-w-0 flex-1">
                      <span
                        className="block truncate font-medium"
                        style={{ fontSize: shell.type.desc, color: surf.ink }}
                      >
                        {r.name}
                      </span>
                      {r.kindLabel && (
                        <span
                          className="block truncate"
                          style={{
                            fontSize: shell.type.caption,
                            color: surf.inkSoft,
                          }}
                        >
                          {r.kindLabel}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {tab === "owner" && spec.ownerDemo && (
          <div>
            <p
              className="mb-3 rounded-[10px] px-3 py-2 font-semibold"
              style={{
                fontSize: shell.type.caption,
                background: "#FEF3C7",
                color: "#92400E",
                border: "1px solid #F59E0B",
              }}
            >
              DEMO owner mode: capability injection for demonstration only.
              Not production security. Nothing here is wired to a live
              owner account.
            </p>
            {ownerNote && (
              <p
                className="mb-3"
                style={{ fontSize: shell.type.desc, color: surf.inkSoft }}
              >
                {ownerNote}
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              {ownerActions.map((a: SpecAction) => (
                <button
                  key={a.kind}
                  type="button"
                  onClick={() =>
                    setOwnerNote(
                      `"${a.label}" is a demo placeholder in this build. Owner actions ship behind real authentication, not this badge.`,
                    )
                  }
                  className="min-h-[44px] cursor-pointer rounded-[10px] px-3 text-[14px] font-semibold"
                  style={{
                    border: "1px dashed #F59E0B",
                    background: "transparent",
                    color: surf.ink,
                  }}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
