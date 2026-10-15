/**
 * Integer-only math for the simulation (Technical Architecture spec §4.1).
 * All values must be safe integers; fractions are expressed in per-mille.
 */

export const PERMILLE = 1000;

export function assertSafeInt(value: number, label = 'value'): number {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be a safe integer, got ${value}`);
  }
  return value;
}

/** Floor division that rounds toward negative infinity for any signs. */
export function floorDiv(a: number, b: number): number {
  assertSafeInt(a, 'dividend');
  assertSafeInt(b, 'divisor');
  if (b === 0) throw new RangeError('division by zero');
  const q = Math.trunc(a / b);
  return a % b !== 0 && a < 0 !== b < 0 ? q - 1 : q;
}

/** Ceiling division for non-negative operands. */
export function ceilDiv(a: number, b: number): number {
  return -floorDiv(-a, b);
}

/** Multiplies by a per-mille factor, rounding down: mulPermille(10, 750) === 7. */
export function mulPermille(value: number, permille: number): number {
  return floorDiv(value * permille, PERMILLE);
}

/** Integer square root: the largest r with r * r <= n. */
export function isqrt(n: number): number {
  assertSafeInt(n, 'isqrt input');
  if (n < 0) throw new RangeError('isqrt of a negative number');
  if (n < 2) return n;
  // Newton's method on integers, starting above the root.
  let x = n;
  let y = floorDiv(x + 1, 2);
  while (y < x) {
    x = y;
    y = floorDiv(x + floorDiv(n, x), 2);
  }
  return x;
}

export function distanceSquared(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return assertSafeInt(dx * dx + dy * dy, 'distanceSquared');
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
