/**
 * Placeholder Architecture - Intelligent Placeholders
 * 
 * Every section should already have intelligent placeholders.
 * This avoids redesign later when photography is available.
 * 
 * Examples:
 * - Deck Gallery: "0 Projects - Coming Soon"
 * - Service Page: Hero, Gallery, Project Cards, FAQs, CTA, Before/After, Reviews, Pricing, Related Services
 * 
 * Even if the gallery currently has 0 images, the section structure exists.
 */

import React from "react";

export interface PlaceholderSectionProps {
  type: "gallery" | "service" | "reviews" | "projects" | "before-after" | "generic";
  title?: string;
  description?: string;
  count?: number;
  icon?: React.ReactNode;
  action?: {
    label: string;
    href: string;
  };
  darkMode?: boolean;
}

export function PlaceholderSection({
  type,
  title,
  description,
  count = 0,
  icon,
  action,
  darkMode = false,
}: PlaceholderSectionProps) {
  const getPlaceholderContent = () => {
    switch (type) {
      case "gallery":
        return {
          title: title || "Project Photos Coming Soon",
          description: description || "We're currently building our portfolio. Check back soon to see our latest work.",
          icon: icon || (
            <svg
              className="w-16 h-16 text-amber-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          ),
          countLabel: `${count} Projects`,
        };
      case "service":
        return {
          title: title || "Service Information Coming Soon",
          description: description || "We're currently updating this service page. Check back soon for detailed information.",
          icon: icon || (
            <svg
              className="w-16 h-16 text-amber-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
          ),
          countLabel: undefined,
        };
      case "reviews":
        return {
          title: title || "Reviews Coming Soon",
          description: description || "We're currently collecting reviews from our happy clients. Check back soon to see what people are saying about our work.",
          icon: icon || (
            <svg
              className="w-16 h-16 text-amber-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
              />
            </svg>
          ),
          countLabel: `${count} Reviews`,
        };
      case "projects":
        return {
          title: title || "Projects Coming Soon",
          description: description || "We're currently working on exciting new projects. Check back soon to see our latest work.",
          icon: icon || (
            <svg
              className="w-16 h-16 text-amber-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
              />
            </svg>
          ),
          countLabel: `${count} Projects`,
        };
      case "before-after":
        return {
          title: title || "Before/After Comparisons Coming Soon",
          description: description || "We're currently documenting our transformations. Check back soon to see dramatic before and after photos.",
          icon: icon || (
            <svg
              className="w-16 h-16 text-amber-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
              />
            </svg>
          ),
          countLabel: `${count} Comparisons`,
        };
      case "generic":
      default:
        return {
          title: title || "Coming Soon",
          description: description || "This section is currently being updated. Check back soon.",
          icon: icon || (
            <svg
              className="w-16 h-16 text-amber-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          ),
          countLabel: undefined,
        };
    }
  };

  const content = getPlaceholderContent();

  return (
    <div className={`flex flex-col items-center justify-center py-16 px-4 text-center rounded-lg border ${darkMode ? 'bg-surface-muted border-border text-text-on-dark' : 'bg-stone-50 border-stone-200'}`}>
      <div className="mb-4">{content.icon}</div>
      <h3 className={`text-2xl font-semibold mb-2 ${darkMode ? 'text-text-on-dark' : 'text-stone-900'}`}>
        {content.title}
      </h3>
      {content.countLabel && (
        <p className="text-sm font-medium text-amber-600 mb-3">
          {content.countLabel}
        </p>
      )}
      <p className={`max-w-md mb-6 ${darkMode ? 'text-text-on-dark/90' : 'text-stone-900'}`}>
        {content.description}
      </p>
      {action && (
        <a
          href={action.href}
          className="inline-flex items-center px-6 py-3 bg-amber-600 text-white font-semibold rounded-lg hover:bg-amber-700 transition-colors"
        >
          {action.label}
        </a>
      )}
    </div>
  );
}
