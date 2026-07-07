// Lactate is stored as milli-mmol/L (integer ×1000) to keep an integer column
// while preserving two decimals. These converters are pure and client-safe
// (no db import), so both server actions and client editors can use them.

export const mmolToMilli = (v: number) => Math.round(v * 1000);
export const milliToMmol = (v: number | null) => (v == null ? null : v / 1000);
