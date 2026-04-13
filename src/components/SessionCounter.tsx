"use client";

interface Props {
  count: number;
}

export function SessionCounter({ count }: Props) {
  return <span className="text-xs text-white/60 tabular-nums">{count}</span>;
}
