import { cn } from "@/lib/utils";

/** Speed lines + play triangle. Corners are rounded via a round-joined stroke
 * of the same colour, which grows the triangle ~9 units past its points. */
export function WateerMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 128 92"
      fill="currentColor"
      aria-hidden="true"
      className={cn("h-8 w-auto text-brand", className)}
    >
      <rect x="16" y="21" width="28" height="10" rx="5" />
      <rect x="2" y="41" width="42" height="10" rx="5" />
      <rect x="16" y="61" width="28" height="10" rx="5" />
      <polygon
        points="62,18 117,46 62,74"
        stroke="currentColor"
        strokeWidth="18"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function WateerLogo({ className }: { className?: string }) {
  return (
    <div className={cn("flex shrink-0 items-center gap-2", className)}>
      <WateerMark />
      {/* sr-only below sm so the name stays in the accessibility tree when the
       * wordmark is hidden to save room for the input. */}
      <span className="sr-only text-xl font-bold tracking-tight text-brand sm:not-sr-only">
        Wateer
      </span>
    </div>
  );
}
