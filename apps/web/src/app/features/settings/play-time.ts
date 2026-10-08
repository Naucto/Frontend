export interface PlayTime {
  hours: number;
  minutes: number;
}

/** A running time in whole hours and minutes, the precision a person reads it at. */
export function playTime(ms: number): PlayTime {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  return { hours: Math.floor(minutes / 60), minutes: minutes % 60 };
}
