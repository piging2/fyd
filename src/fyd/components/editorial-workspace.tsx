"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { EditorialSymbol } from "./editorial-symbols";
import type { EditorialIntent } from "../sitespec/types";

type WorkspaceIntent = NonNullable<EditorialIntent["workspace"]>;

/** A presentation walkthrough, not a mission simulator or operating authority.
 * Selection changes the visible explanation only. No polling, persistence,
 * dispatch, approvals, fabricated run IDs, or runtime-status inference.
 */
export function EditorialWorkspace({ intent }: { intent: WorkspaceIntent }) {
  const [viewIndex, setViewIndex] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [isExceptionMode, setIsExceptionMode] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<
    boolean | null
  >(null);
  const [revision, setRevision] = useState(0);
  const panelId = useId();
  const workspaceRef = useRef<HTMLDivElement>(null);
  const isInViewRef = useRef(true);
  const playTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const view = intent.views[viewIndex] ?? intent.views[0];
  const step = view?.steps[stepIndex] ?? view?.steps[0];
  const exception = view?.exception;

  const stopPlayback = useCallback(() => {
    if (playTimerRef.current !== null) {
      clearTimeout(playTimerRef.current);
      playTimerRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  useEffect(() => {
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(motionPreference.matches);

    const onMotionChange = () => {
      setPrefersReducedMotion(motionPreference.matches);
      stopPlayback();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") stopPlayback();
    };
    const observer = new IntersectionObserver(([entry]) => {
      isInViewRef.current = entry.isIntersecting;
      if (!entry.isIntersecting) stopPlayback();
    });
    if (workspaceRef.current) observer.observe(workspaceRef.current);
    motionPreference.addEventListener("change", onMotionChange);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      observer.disconnect();
      motionPreference.removeEventListener("change", onMotionChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [stopPlayback]);

  // Advance one explanation at a time. Every change cancels the previous timer.
  useEffect(() => {
    if (!isPlaying || prefersReducedMotion !== false || !view) return;

    const lastStepIndex = view.steps.length - 1;
    if (
      stepIndex >= lastStepIndex ||
      document.visibilityState === "hidden" ||
      !isInViewRef.current
    ) {
      stopPlayback();
      return;
    }

    playTimerRef.current = setTimeout(() => {
      playTimerRef.current = null;
      if (
        document.visibilityState === "hidden" ||
        !isInViewRef.current ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        stopPlayback();
        return;
      }
      const nextStepIndex = stepIndex + 1;
      setStepIndex(nextStepIndex);
      setRevision((current) => current + 1);
      if (nextStepIndex === lastStepIndex) setIsPlaying(false);
    }, 2800);

    return () => {
      if (playTimerRef.current !== null) {
        clearTimeout(playTimerRef.current);
        playTimerRef.current = null;
      }
    };
  }, [isPlaying, prefersReducedMotion, stepIndex, stopPlayback, view]);

  if (!view || !step) return null;

  const chooseView = (index: number) => {
    stopPlayback();
    setIsExceptionMode(false);
    setViewIndex(index);
    setStepIndex(0);
    setRevision((current) => current + 1);
  };

  const chooseStep = (index: number) => {
    stopPlayback();
    setIsExceptionMode(false);
    setStepIndex(index);
    setRevision((current) => current + 1);
  };

  const toggleException = () => {
    stopPlayback();
    setIsExceptionMode((current) => !current);
    setRevision((current) => current + 1);
  };

  const togglePlayback = () => {
    if (isPlaying) {
      stopPlayback();
      return;
    }
    if (
      prefersReducedMotion !== false ||
      document.visibilityState === "hidden" ||
      !isInViewRef.current
    ) {
      return;
    }

    setIsExceptionMode(false);
    if (stepIndex >= view.steps.length - 1) setStepIndex(0);
    setIsPlaying(true);
    setRevision((current) => current + 1);
  };

  return (
    <div
      ref={workspaceRef}
      className="ed-workspace"
      data-accent={view.accent}
      data-unknown={isExceptionMode}
      data-playing={isPlaying}
    >
      <div className="ed-workspace-bar">
        <span className="ed-workspace-mark" aria-hidden="true">
          <EditorialSymbol concept="coordination"/>
        </span>
        <strong>{intent.label}</strong>
        <span className="ed-concept-label">Interface study</span>
      </div>

      <div
        className="ed-workspace-tabs"
        role="tablist"
        aria-label="Explore the operating environment"
      >
        {intent.views.map((item, index) => (
          <button
            key={item.id}
            id={`${panelId}-${index}`}
            role="tab"
            aria-selected={index === viewIndex}
            aria-controls={panelId}
            tabIndex={index === viewIndex ? 0 : -1}
            onClick={() => chooseView(index)}
            onKeyDown={(event) => {
              const next =
                event.key === "ArrowRight"
                  ? (index + 1) % intent.views.length
                  : event.key === "ArrowLeft"
                    ? (index - 1 + intent.views.length) % intent.views.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? intent.views.length - 1
                        : null;
              if (next !== null) {
                event.preventDefault();
                chooseView(next);
                document.getElementById(`${panelId}-${next}`)?.focus();
              }
            }}
          >
            <span className="ed-workspace-tab-number" aria-hidden="true">
              0{index + 1}
            </span>
            {item.label}
            <span aria-hidden="true">↗</span>
          </button>
        ))}
      </div>

      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={`${panelId}-${viewIndex}`}
        className="ed-workspace-panel"
      >
        <aside className="ed-workspace-sidebar">
          <p className="ed-label">{view.purpose}</p>
          <h3>{view.title}</h3>
          <p>{view.description}</p>

          <div
            className="ed-workspace-navigation"
            aria-label={`${view.label} concepts`}
          >
            {view.steps.map((item, index) => (
              <button
                key={item.label}
                aria-pressed={!isExceptionMode && index === stepIndex}
                onClick={() => chooseStep(index)}
              >
                <span className="ed-stage-dot" aria-hidden="true" />
                <span>{item.label}</span>
                <span aria-hidden="true">↗</span>
              </button>
            ))}
            {exception && (
              <button
                className="ed-workspace-exception-toggle"
                aria-pressed={isExceptionMode}
                onClick={toggleException}
              >
                <span className="ed-stage-dot" aria-hidden="true" />
                <span>Unknown outcome</span>
                <span aria-hidden="true">?</span>
              </button>
            )}
          </div>
        </aside>

        <div className="ed-workspace-canvas">
          <div className="ed-workspace-canvas-label">
            <span className="ed-label">
              {isExceptionMode
                ? "When the outcome is unknown"
                : "Explore the logic"}
            </span>
            <span>
              {isExceptionMode
                ? "Hold and reconcile"
                : `${String(stepIndex + 1).padStart(2, "0")} / ${String(view.steps.length).padStart(2, "0")}`}
            </span>
          </div>

          <div
            className="ed-workspace-diagram"
            aria-hidden="true"
            key={`diagram-${revision}`}
          >
            <svg viewBox="0 0 600 210" preserveAspectRatio="none">
              <path className="ed-diagram-base" d="M35 105H565" />
              <path
                className="ed-diagram-trace"
                d={
                  isExceptionMode
                    ? "M35 105H380 Q450 105 450 160"
                    : "M35 105H565"
                }
                pathLength="1"
              />
            </svg>
            {view.steps.map((item, index) => (
              <div
                key={item.label}
                className="ed-diagram-node"
                data-selected={!isExceptionMode && index === stepIndex}
              >
                <span><EditorialSymbol concept={item.label} phase={!isExceptionMode && index===stepIndex?2:0}/></span>
                <b>{item.label}</b>
              </div>
            ))}
            {exception && isExceptionMode && (
              <div
                className="ed-diagram-node ed-diagram-exception-node"
                data-selected="true"
              >
                <span>?</span>
                <b>Hold and reconcile</b>
              </div>
            )}
          </div>

          <div
            className="ed-workspace-inspector"
            aria-live="polite"
            aria-atomic="true"
          >
            {isExceptionMode && exception ? (
              <>
                <span className="ed-label">Unknown outcome</span>
                <h4>{exception.title}</h4>
                <p>{exception.detail}</p>
                <div className="ed-workspace-requirement">
                  <span aria-hidden="true">↳</span>
                  <p>{exception.requirement}</p>
                </div>
              </>
            ) : (
              <>
                <span className="ed-label">{step.label}</span>
                <h4>{step.title}</h4>
                <p>{step.detail}</p>
                <div className="ed-workspace-requirement">
                  <span aria-hidden="true">↳</span>
                  <p>{step.requirement}</p>
                </div>
              </>
            )}
          </div>

          <div className="ed-workspace-bottom">
            <div className="ed-workspace-actions">
              {prefersReducedMotion === false && view.steps.length > 1 && (
                <button
                  className="ed-workspace-playback"
                  onClick={togglePlayback}
                  aria-pressed={isPlaying}
                  aria-label={
                    isPlaying
                      ? `Pause ${view.label} walkthrough`
                      : `Play ${view.label} walkthrough`
                  }
                >
                  {isPlaying ? "Pause walkthrough" : "Play walkthrough"}
                  <span aria-hidden="true">{isPlaying ? "Ⅱ" : "▷"}</span>
                </button>
              )}
              {exception && (
                <button
                  className="ed-workspace-exception-toggle"
                  onClick={toggleException}
                  aria-pressed={isExceptionMode}
                >
                  {isExceptionMode
                    ? "Return to walkthrough"
                    : "What if the outcome is unknown?"}
                </button>
              )}
            </div>

            <button
              onClick={() =>
                chooseStep(
                  isExceptionMode
                    ? stepIndex
                    : (stepIndex + 1) % view.steps.length,
                )
              }
              aria-label={
                isExceptionMode
                  ? `Return to ${view.label} walkthrough`
                  : `Explore next ${view.label} concept`
              }
            >
              {isExceptionMode ? "Return" : "Next"}
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      </div>

      <div className="ed-workspace-disclosure">
        <p>{intent.disclosure}</p>
        <details>
          <summary>Design basis</summary>
          <p>{view.source}</p>
        </details>
      </div>
    </div>
  );
}
