"use client";

import { useEffect } from "react";

const BODY_CLASS = "gsv-bot-kiosk-cursor";

export function BotKioskCursor() {
  useEffect(() => {
    document.body.classList.add(BODY_CLASS);
    return () => document.body.classList.remove(BODY_CLASS);
  }, []);
  return null;
}
