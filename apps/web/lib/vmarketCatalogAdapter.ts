/**
 * V Market catalog normalization boundary.
 * Pure functions only. No production inventory writes, payment calls or network requests.
 * The reviewed 195-line catalog is supplied separately; do not treat it as live inventory.
 */
export type VMarketCatalogRow = {
  id: string;
  name: string;
  category: string;
  unit: string;
  stock: number;
  cost: number;
  price: number;
  unitsPerBlock: number | null;
  imageUrl: string | null;
  imageReviewStatus: string;
};

export function validateVMarketCatalog(rows: readonly VMarketCatalogRow[]): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const [index, p] of rows.entries()) {
    const label = p.id || String(index);
    if (!p.id || ids.has(p.id)) errors.push(`Duplicate or empty id: ${label}`);
    ids.add(p.id);
    if (!p.name.trim()) errors.push(`Missing name: ${label}`);
    if (!Number.isSafeInteger(p.stock) || p.stock < 0) errors.push(`Invalid stock: ${label}`);
    if (![p.cost, p.price].every(n => Number.isFinite(n) && n >= 0)) errors.push(`Invalid money: ${label}`);
    if (p.unitsPerBlock !== null && (!Number.isSafeInteger(p.unitsPerBlock) || p.unitsPerBlock < 1)) errors.push(`Invalid block size: ${label}`);
    if (p.imageReviewStatus === 'approved' && (!p.imageUrl || !p.imageUrl.startsWith('https://'))) errors.push(`Unusable approved image: ${label}`);
  }
  return errors;
}

export function reviewedProductImage(p: VMarketCatalogRow): string | null {
  return p.imageReviewStatus === 'approved' && p.imageUrl?.startsWith('https://')
    ? p.imageUrl : null;
}

export function demoCartTotal(
  rows: readonly VMarketCatalogRow[],
  lines: readonly { id: string; quantity: number }[]
): number {
  const byId = new Map(rows.map(p => [p.id, p]));
  const totals = new Map<string, number>();
  for (const line of lines) {
    if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0) throw new Error('Invalid quantity');
    totals.set(line.id, (totals.get(line.id) || 0) + line.quantity);
  }
  let total = 0;
  for (const [id, quantity] of totals) {
    const p = byId.get(id);
    if (!p || quantity > p.stock) throw new Error('Unknown item or insufficient demo stock');
    total += p.price * quantity;
    if (!Number.isSafeInteger(total)) throw new Error('Cart total overflow');
  }
  return total;
}
