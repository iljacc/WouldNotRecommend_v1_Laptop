"use client";

interface Props {
  city: string;
}

export function CityLocation({ city }: Props) {
  return <span className="max-w-[46vw] truncate text-xs text-white/60">{city}</span>;
}
