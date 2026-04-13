"use client";

import { forwardRef } from "react";

export const StreetViewCanvas = forwardRef<HTMLDivElement>(
  function StreetViewCanvas(_, ref) {
    return <div ref={ref} className="absolute inset-0 h-full w-full" />;
  },
);
