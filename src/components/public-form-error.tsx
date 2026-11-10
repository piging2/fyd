"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function PublicFormError({ message, errors, fields, children }: {
  message: string;
  errors: Partial<Record<string, string>>;
  fields: Record<string, string>;
  children: ReactNode;
}) {
  const summary = useRef<HTMLDivElement>(null);
  useEffect(() => { summary.current?.focus(); }, [message, errors]);

  const invalidFields = Object.entries(fields).filter(([field]) => errors[field]);

  return (
    <div ref={summary} tabIndex={-1} className="scroll-mt-24 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800 focus-visible:outline-2 focus-visible:outline-offset-2">
      <p>{message}</p>
      {invalidFields.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {invalidFields.map(([field, id]) => (
            <li key={field}>
              <a
                href={"#" + id}
                className="underline"
                onClick={(event) => {
                  const input = document.getElementById(id);
                  if (!input) return;
                  event.preventDefault();
                  input.focus({ preventScroll: true });
                  input.scrollIntoView({ block: "center" });
                }}
              >
                {errors[field]}
              </a>
            </li>
          ))}
        </ul>
      )}
      {children}
    </div>
  );
}
