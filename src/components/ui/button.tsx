import * as React from "react";
import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

/**
 * Button — uses SEMANTIC design tokens only (bg-primary, bg-secondary, …).
 * Re-skinning the brand happens in globals.css @theme, not here.
 * Premium micro-interactions: press animation, hover glow, shadow shift, ripple, magnetic effect.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all duration-200 ease-out active:scale-[0.96] active:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none relative overflow-hidden",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary-hover hover:shadow-lg hover:-translate-y-0.5",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary-hover hover:shadow-md hover:-translate-y-0.5",
        accent: "bg-accent text-accent-foreground hover:opacity-90 hover:shadow-md hover:-translate-y-0.5",
        outline: "border border-border bg-surface text-text hover:bg-surface-muted hover:shadow-md hover:-translate-y-0.5",
        ghost: "text-text-muted hover:bg-surface-muted hover:shadow-sm",
        link: "text-accent underline-offset-4 hover:underline p-0",
      },
      size: {
        sm: "h-9 px-4 text-sm",
        md: "h-11 px-6 text-base",
        lg: "h-13 px-8 text-lg",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, children, ...props }: ButtonProps) {
  const [isPressed, setIsPressed] = React.useState(false);
  const [magneticOffset, setMagneticOffset] = React.useState({ x: 0, y: 0 });
  const buttonRef = React.useRef<HTMLButtonElement>(null);

  // Magnetic effect
  React.useEffect(() => {
    const button = buttonRef.current;
    if (!button) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = button.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;

      
      // Subtle magnetic pull (10% of distance)
      setMagneticOffset({ x: x * 0.1, y: y * 0.1 });
    };

    const handleMouseLeave = () => {
      setMagneticOffset({ x: 0, y: 0 });
    };

    button.addEventListener('mousemove', handleMouseMove);
    button.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      button.removeEventListener('mousemove', handleMouseMove);
      button.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  return (
    <button
      ref={buttonRef}
      className={cn(buttonVariants({ variant, size }), className)}
      onMouseDown={() => setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
      onMouseLeave={() => setIsPressed(false)}
      style={{
        transform: `translate(${magneticOffset.x}px, ${magneticOffset.y}px) ${isPressed ? 'scale(0.96)' : 'scale(1)'}`
      }}
      {...props}
    >
      {children}
      {/* Ripple effect overlay */}
      <span 
        className={cn(
          "absolute inset-0 bg-white/20 rounded-full transition-opacity duration-300",
          isPressed ? "opacity-100" : "opacity-0"
        )}
      />
    </button>
  );
}

export { buttonVariants };
