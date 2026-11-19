import { demoCartTotal, reviewedProductImage, validateVMarketCatalog, type VMarketCatalogRow } from './vmarketCatalogAdapter';

const sample: VMarketCatalogRow = {
  id: 'VM-0150', name: 'Lipton 1.5 L Qora', category: 'Ichimliklar',
  unit: 'dona', stock: 30, cost: 11833.3333, price: 14792,
  unitsPerBlock: 6, imageUrl: null, imageReviewStatus: 'pending'
};

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export function runVMarketAdapterSmokeTests(): void {
  assert(validateVMarketCatalog([sample]).length === 0, 'Valid sample rejected');
  assert(validateVMarketCatalog([sample, sample]).some(x => x.includes('Duplicate')), 'Duplicate not detected');
  assert(reviewedProductImage(sample) === null, 'Unreviewed image shown');
  assert(demoCartTotal([sample], [{ id: sample.id, quantity: 2 }]) === 29584, 'Incorrect total');
  let failed = false;
  try { demoCartTotal([sample], [{ id: sample.id, quantity: 31 }]); } catch { failed = true; }
  assert(failed, 'Overselling accepted');
}
