import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {marketProducts,marketPhotos} from './market-catalog';
import messages from './market-translations.json';
describe('offline illustrative market photo provenance',()=>{
 it('preserves all eight sample IDs and leaves the unverified bottle without a photo',()=>{
  expect(marketProducts.map(p=>p.id)).toEqual(['sample-water','sample-tea','sample-coffee','sample-oats','sample-fruit','sample-nuts','sample-toothbrush','sample-tissues']);
  expect(marketProducts[0].photo).toBeUndefined();expect(marketPhotos).toHaveLength(7);
 });
 it('ships the reviewed bytes with attribution and unchanged photo licenses',()=>{
  for(const photo of marketPhotos){
   const bytes=readFileSync(new URL('../../assets/market/'+photo.file,import.meta.url));
   expect(createHash('sha256').update(bytes).digest('hex')).toBe(photo.sha256);
   expect(bytes.toString('ascii',8,12)).toBe('WEBP');expect(bytes.length).toBeLessThan(100000);
   expect(photo.source).toMatch(/^https:\/\/commons.wikimedia.org\/wiki\/File:/);
   expect(photo.author).toBeTruthy();expect(photo.derivativeLicense).toBe(photo.license);expect(photo.exactSupplierSku).toBe(false);
   expect(Math.max(...photo.dimensions)).toBeLessThanOrEqual(640);expect(photo.src).not.toMatch(/^https?:/);
  }
 });
 it('translates disclosure, attribution and missing-photo states',()=>{
  for(const key of ['Illustrative demo photo','Photo unavailable','Illustrative demo photo. Packaging and quantity may differ; not a supplier SKU photo.','Photo credit and license','Resized and converted to WebP. The photo retains its original license.'])for(const locale of ['ru','uz'])expect((messages as Record<string,Record<string,string>>)[key][locale]).toBeTruthy();
 });
});
