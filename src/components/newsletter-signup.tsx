"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Mail, Loader2 } from "lucide-react";

export function NewsletterSignup() {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const uid = React.useId().replace(/:/g, "");
  const [firstName, setFirstName] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState("");
  const [isSuccess, setIsSuccess] = React.useState(false);
  const errorRef = React.useRef<HTMLParagraphElement>(null);

  React.useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          firstName,
          source: "homepage",
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.error || "Failed to subscribe. Please try again.");
        setIsSubmitting(false);
        return;
      }

      setIsSuccess(true);
      // Redirect to thank you page after short delay
      setTimeout(() => {
        router.push("/newsletter/thank-you");
      }, 500);
    } catch {
      setError("Network error. Please try again.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="rounded-lg bg-deep border border-honey/20 p-6">
      <h3 className="mb-2 text-2xl font-bold text-text-on-dark">
        Follow the Build
      </h3>
      <p className="mb-6 text-text-on-dark/80">
        Notes on continuity, agents, business systems, and building PING. One email when there is something worth saying.
      </p>

      <noscript>
        <p className="mb-4 text-sm text-text-on-dark">
          Signup requires JavaScript. You can still <a href="/blog" className="font-semibold underline">read the build notes</a>.
        </p>
      </noscript>
      <p role="status" className={isSuccess ? "font-semibold text-honey" : "sr-only"}>
        {isSuccess ? "Request accepted." : isSubmitting ? "Submitting your request…" : ""}
      </p>
      {!isSuccess && (
        <form onSubmit={handleSubmit} aria-busy={isSubmitting} className="space-y-4">
          {error && (
            <p id={uid + "-error"} ref={errorRef} tabIndex={-1} className="scroll-mt-24 text-sm text-red-400 focus-visible:outline-2">
              {error}
            </p>
          )}
          <div>
            <label htmlFor={uid + "-email"} className="mb-1.5 block text-sm font-medium text-text-on-dark">Email address</label>
            <input
              type="email"
              id={uid + "-email"}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              required
              aria-describedby={error ? uid + "-error" : undefined}
              disabled={isSubmitting}
              className="w-full rounded-lg border border-text-on-dark/20 bg-deep px-4 py-3 text-text-on-dark placeholder:text-text-on-dark/50 focus:border-honey focus:outline-none focus:ring-1 focus:ring-honey disabled:opacity-50"
            />
          </div>

          <div>
            <label htmlFor={uid + "-first-name"} className="mb-1.5 block text-sm font-medium text-text-on-dark">First name (optional)</label>
            <input
              type="text"
              id={uid + "-first-name"}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="First name (optional)"
              disabled={isSubmitting}
              className="w-full rounded-lg border border-text-on-dark/20 bg-deep px-4 py-3 text-text-on-dark placeholder:text-text-on-dark/50 focus:border-honey focus:outline-none focus:ring-1 focus:ring-honey disabled:opacity-50"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !email}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-honey px-6 py-3 font-semibold text-deep transition-colors hover:bg-honey/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 aria-hidden="true" className="h-5 w-5 motion-safe:animate-spin" />
                Subscribing...
              </>
            ) : (
              <>
                <Mail className="h-5 w-5" />
                Subscribe
              </>
            )}
          </button>

          <p className="text-xs text-text-on-dark/60">
            No spam, ever. Unsubscribe anytime.
          </p>
        </form>
      )}
    </div>
  );
}
