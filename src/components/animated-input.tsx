"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

interface AnimatedInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  isValid?: boolean;
  showSuccessCheckmark?: boolean;
}

/**
 * AnimatedInput - Premium input with floating label and success feedback
 * 
 * Micro-interactions:
 * - Border eases on focus
 * - Label floats when focused or has value
 * - Success checkmark appears when valid
 * 
 * Provides satisfying feedback without being distracting.
 */
export function AnimatedInput({
  label,
  isValid = false,
  showSuccessCheckmark = true,
  className,
  value,
  onChange,
  ...props
}: AnimatedInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [hasValue, setHasValue] = useState(false);

  useEffect(() => {
    setHasValue(!!value);
  }, [value]);

  const isFloating = isFocused || hasValue;

  return (
    <div className="relative">
      <input
        {...props}
        value={value}
        onChange={onChange}
        onFocus={(e) => {
          setIsFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setIsFocused(false);
          props.onBlur?.(e);
        }}
        className={cn(
          "w-full rounded-lg border-2 border-border bg-surface px-4 py-3 text-base transition-all duration-200 ease-out",
          "placeholder-transparent",
          "focus:border-primary focus:ring-0",
          "hover:border-border/80",
          isValid && "border-accent/50",
          className
        )}
        placeholder={label}
      />
      
      {/* Floating label */}
      <label
        className={cn(
          "absolute left-4 top-3 text-sm transition-all duration-200 ease-out pointer-events-none",
          isFloating
            ? "-translate-y-6 scale-85 text-primary bg-surface px-1"
            : "text-text-muted",
          isValid && isFloating && "text-accent"
        )}
      >
        {label}
      </label>

      {/* Success checkmark */}
      {showSuccessCheckmark && isValid && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <Check className="h-5 w-5 text-accent animate-in fade-in slide-in-from-right-2 duration-300" />
        </div>
      )}
    </div>
  );
}
