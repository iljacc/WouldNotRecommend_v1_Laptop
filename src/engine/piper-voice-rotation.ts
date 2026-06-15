export function nextPiperVoiceIndex(current: number, total: number): number {
  if (total <= 0) return 0;
  return ((Math.floor(current) % total) + total) % total;
}

export function advancePiperVoiceIndex(current: number, total: number): number {
  return nextPiperVoiceIndex(current + 1, total);
}
