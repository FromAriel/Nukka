/** Integer geometry in milli-units (Technical Architecture spec §4.1). */
import { ceilDiv, floorDiv, isqrt } from '@nukka/core';

export const MILLI = 1000;

export interface Vec {
  x: number;
  y: number;
}

export const toMilli = ([x, y]: readonly [number, number]): Vec => ({ x: x * MILLI, y: y * MILLI });

export function distance(a: Vec, b: Vec): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return isqrt(dx * dx + dy * dy);
}

export function within(a: Vec, b: Vec, radius: number): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy <= radius * radius;
}

/** Moves `from` toward `to` by at most `step`; returns the new point. */
export function moveToward(from: Vec, to: Vec, step: number): Vec {
  const d = distance(from, to);
  if (d <= step || d === 0) return { x: to.x, y: to.y };
  return {
    x: from.x + floorDiv((to.x - from.x) * step, d),
    y: from.y + floorDiv((to.y - from.y) * step, d),
  };
}

/** Velocity (milli-units per tick) that covers `from`→`to` in exactly `ticks`. */
export function velocityOver(from: Vec, to: Vec, ticks: number): Vec {
  const t = Math.max(1, ticks);
  return { x: floorDiv(to.x - from.x, t), y: floorDiv(to.y - from.y, t) };
}

/** Ticks needed to cover a distance at a speed in units per second. */
export function travelTicks(dist: number, unitsPerSecond: number, ticksPerSecond: number): number {
  const perTick = Math.max(1, floorDiv(unitsPerSecond * MILLI, ticksPerSecond));
  return Math.max(1, ceilDiv(dist, perTick));
}

export function perTick(unitsPerSecond: number, ticksPerSecond: number): number {
  return floorDiv(unitsPerSecond * MILLI, ticksPerSecond);
}

export function msToTicks(ms: number, ticksPerSecond: number): number {
  return floorDiv(ms * ticksPerSecond, 1000);
}
