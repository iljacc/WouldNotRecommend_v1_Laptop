"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bot } from "@/engine/bot";
import {
  BotState,
  type BotContext,
  type BotMode,
  type LatLng,
  type SessionStats,
  type TeleportPhase,
} from "@/lib/types";

export interface BotUIState {
  mode: BotMode;
  state: BotState;
  coords: LatLng;
  city: string;
  reviewCount: number;
  sessionStartTime: number;
  teleportPhase: TeleportPhase;
}

export function useBot() {
  const botRef = useRef<Bot | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isStarted, setIsStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lifetimeReviewsTotal, setLifetimeReviewsTotal] = useState<number | null>(
    null,
  );
  const [uiState, setUIState] = useState<BotUIState>({
    mode: "Searching",
    state: BotState.WANDER,
    coords: { lat: 0, lng: 0 },
    city: "Initializing",
    reviewCount: 0,
    sessionStartTime: Date.now(),
    teleportPhase: "none",
  });

  const handleStateChange = useCallback((context: BotContext) => {
    setUIState({
      mode: context.mode,
      state: context.state,
      coords: context.currentCoords,
      city: context.currentCity,
      reviewCount: context.sessionReviewCount,
      sessionStartTime: context.sessionStartTime,
      teleportPhase: context.teleportPhase,
    });
  }, []);

  const refreshLifetimeReviews = useCallback(async () => {
    try {
      const response = await fetch("/api/log");
      if (!response.ok) return;
      const data = (await response.json()) as SessionStats;
      if (typeof data.totalReviewsRead === "number") {
        setLifetimeReviewsTotal(data.totalReviewsRead);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void refreshLifetimeReviews();
  }, [refreshLifetimeReviews]);

  const lastSessionReviewCount = useRef<number | null>(null);
  useEffect(() => {
    const prev = lastSessionReviewCount.current;
    lastSessionReviewCount.current = uiState.reviewCount;

    if (prev !== null && uiState.reviewCount > prev) {
      const timer = window.setTimeout(() => {
        void refreshLifetimeReviews();
      }, 900);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [uiState.reviewCount, refreshLifetimeReviews]);

  const startBot = useCallback(async () => {
    if (!containerRef.current || botRef.current) return;

    setError(null);
    const bot = new Bot();
    botRef.current = bot;

    try {
      await bot.start(containerRef.current, handleStateChange);
      setIsStarted(true);
    } catch (startError) {
      console.error("Failed to start bot:", startError);
      bot.destroy();
      botRef.current = null;
      setIsStarted(false);
      setError(
        startError instanceof Error
          ? startError.message
          : "The bot could not start.",
      );
    }
  }, [handleStateChange]);

  useEffect(() => {
    return () => {
      botRef.current?.destroy();
      botRef.current = null;
    };
  }, []);

  return {
    containerRef,
    uiState,
    lifetimeReviewsTotal,
    isStarted,
    error,
    startBot,
  };
}
