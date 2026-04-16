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
  type TtsSubtitlePayload,
} from "@/lib/types";

function localCalendarDayBounds(): { dayStart: string; dayEnd: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { dayStart: start.toISOString(), dayEnd: end.toISOString() };
}

function reviewStatsUrl(): string {
  const { dayStart, dayEnd } = localCalendarDayBounds();
  return `/api/log?${new URLSearchParams({ dayStart, dayEnd }).toString()}`;
}

export interface BotUIState {
  mode: BotMode;
  state: BotState;
  coords: LatLng;
  city: string;
  reviewCount: number;
  sessionStartTime: number;
  teleportPhase: TeleportPhase;
  cityTourSegmentEndTime: number;
  nextCityLabel: string;
  cityTourActive: boolean;
  scheduledCityTeleportUi: boolean;
}

export function useBot() {
  const botRef = useRef<Bot | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isStarted, setIsStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewsToday, setReviewsToday] = useState<number | null>(null);
  const [lifetimeReviewsTotal, setLifetimeReviewsTotal] = useState<number | null>(
    null,
  );
  const [subtitle, setSubtitle] = useState<TtsSubtitlePayload | null>(null);
  const [uiState, setUIState] = useState<BotUIState>({
    mode: "Searching",
    state: BotState.WANDER,
    coords: { lat: 0, lng: 0 },
    city: "Initializing",
    reviewCount: 0,
    sessionStartTime: Date.now(),
    teleportPhase: "none",
    cityTourSegmentEndTime: 0,
    nextCityLabel: "",
    cityTourActive: false,
    scheduledCityTeleportUi: false,
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
      cityTourSegmentEndTime: context.cityTourSegmentEndTime,
      nextCityLabel: context.nextCityLabel,
      cityTourActive: context.cityTourActive,
      scheduledCityTeleportUi: context.scheduledCityTeleportUi,
    });
  }, []);

  const refreshReviewStats = useCallback(async () => {
    try {
      const response = await fetch(reviewStatsUrl());
      if (!response.ok) return;
      const data = (await response.json()) as SessionStats;
      if (typeof data.totalReviewsRead === "number") {
        setLifetimeReviewsTotal(data.totalReviewsRead);
      }
      if (typeof data.reviewsToday === "number") {
        setReviewsToday(data.reviewsToday);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void refreshReviewStats();
  }, [refreshReviewStats]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void refreshReviewStats();
    }, 60_000);
    return () => window.clearInterval(id);
  }, [refreshReviewStats]);

  const lastSessionReviewCount = useRef<number | null>(null);
  useEffect(() => {
    const prev = lastSessionReviewCount.current;
    lastSessionReviewCount.current = uiState.reviewCount;

    if (prev !== null && uiState.reviewCount > prev) {
      const timer = window.setTimeout(() => {
        void refreshReviewStats();
      }, 900);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [uiState.reviewCount, refreshReviewStats]);

  const startBot = useCallback(async () => {
    if (!containerRef.current || botRef.current) return;

    setError(null);
    const bot = new Bot();
    botRef.current = bot;

    try {
      await bot.start(containerRef.current, handleStateChange, {
        onSubtitleChange: setSubtitle,
      });
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
    reviewsToday,
    lifetimeReviewsTotal,
    subtitle,
    isStarted,
    error,
    startBot,
  };
}
