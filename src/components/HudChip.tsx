"use client";

interface Props {
  children: React.ReactNode;
  className?: string;
}

/** Subtle pill backdrop for HUD copy — fits the quiet mono / kiosk look. */
export function HudChip({ children, className = "" }: Props) {
  return (
    <div
      className={`inline-flex max-w-full items-center rounded-md border border-white/12 bg-black/55 px-2.5 py-1.5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] backdrop-blur-sm ${className}`}
    >
      {children}
    </div>
  );
}
