/** V Market packaging policy confirmed by owner, November 2026. */
export const confirmedBlockSizes: Readonly<Record<string, number>> = Object.freeze({
  'Saizup Coffe 0.350 ML': 12,
  'Monster M3 Extra ST 150 ML': 24,
  'Barbican 0.25 ML': 24,
  'Barbican Bugdoy 0.25 ML': 24,
  'Dizzy 24 Tali Qozoqiston 0.33 ML': 24,
  'Vitamin C 0.33 ML': 24,
  'Laimon Fresh JB 0.33 ML': 12,
  'Rich Apelsin 0.2 ST': 24,
  'Rich Steklo 0.2 ML': 24,
  'Heineken ST 0.5 ML': 24,
  'Palpy 0.5 ML': 12
});
/** Defaults apply to bottles; explicit overrides above take precedence. */
export function unitsInBlock(name: string, volumeLitres: number, isBottledDrink: boolean): number | null {
  if (Object.prototype.hasOwnProperty.call(confirmedBlockSizes, name)) return confirmedBlockSizes[name];
  if (!isBottledDrink) return null;
  if (volumeLitres === 1.5 || volumeLitres === 1) return 6;
  if (volumeLitres === 0.5) return 12;
  return null;
}
export function expandBlockStock(blocks: number, units: number): number {
  if (!Number.isSafeInteger(blocks) || blocks < 0 || !Number.isSafeInteger(units) || units < 1) throw new Error('Invalid block stock');
  const result = blocks * units;
  if (!Number.isSafeInteger(result)) throw new Error('Stock overflow');
  return result;
}
