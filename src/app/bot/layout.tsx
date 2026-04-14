import type { ReactNode } from "react";
import { BotKioskCursor } from "./BotKioskCursor";

export default function BotLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <BotKioskCursor />
      {children}
    </>
  );
}
