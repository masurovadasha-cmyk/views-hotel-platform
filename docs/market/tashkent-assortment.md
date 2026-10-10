# Tashkent guest-market supplier reference

The guest market uses a source-backed supplier reference in `services/service-core/public/market-reference.json`.

## Source and limits

- Supplier page: [Korzinka — Tashkent and Tashkent region catalogue](https://www.korzinka.uz/ru/catalog/special?id=263).
- Snapshot date: 10 October 2026. The page identified Tashkent and Tashkent region and showed product listings with packages and supplier images.
- The reference contains 101 listings across dairy, water, beverages and snacks, oils, meat and cheese, canned goods, cooking staples, breakfast items, household goods, and sweets.
- 32 cards had a complete supplier title and pack label and a directly associated image file. Those official Korzinka Go images are stored under `services/service-core/public/market-images/` and each record retains both the catalogue page and original image URL.
- 69 incomplete or truncated listings remain photo placeholders. Their source names and pack labels are retained as supplier references for later confirmation.
- The supplier page does not publish a reuse license for these images. The metadata records that limit; obtain reuse confirmation before public commercial promotion.
- The supplier's retail prices are intentionally excluded. They are not VIEWS hotel prices. Every reference item also has no VIEWS stock and is non-purchasable until a hotel maps it to its own SKU, records a server-side price, and loads inventory.

The migration adds category, package, supplier reference, photo provenance and price provenance fields to tenant catalog rows. The authenticated catalog API joins those tenant records to the supplier references and returns null price/stock for reference-only entries. The guest UI keeps those entries visible but prevents adding them to a cart.
