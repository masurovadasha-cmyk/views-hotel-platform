-- Stage 5.35: traceable product presentation metadata for tenant market SKUs.
-- Prices and images remain unset until a hotel operator verifies them with a supplier.
ALTER TABLE market_catalog
 ADD COLUMN IF NOT EXISTS category text,
 ADD COLUMN IF NOT EXISTS brand text,
 ADD COLUMN IF NOT EXISTS package_label text,
 ADD COLUMN IF NOT EXISTS image_url text,
 ADD COLUMN IF NOT EXISTS image_source_url text,
 ADD COLUMN IF NOT EXISTS image_license text,
 ADD COLUMN IF NOT EXISTS photo_status text NOT NULL DEFAULT 'placeholder',
 ADD COLUMN IF NOT EXISTS supplier_reference_id text,
 ADD COLUMN IF NOT EXISTS price_source_url text,
 ADD COLUMN IF NOT EXISTS price_checked_at timestamptz;

ALTER TABLE market_catalog DROP CONSTRAINT IF EXISTS market_catalog_photo_status_check;
ALTER TABLE market_catalog ADD CONSTRAINT market_catalog_photo_status_check
 CHECK (photo_status IN ('placeholder','verified'));
ALTER TABLE market_catalog DROP CONSTRAINT IF EXISTS market_catalog_verified_image_check;
ALTER TABLE market_catalog ADD CONSTRAINT market_catalog_verified_image_check
 CHECK (photo_status <> 'verified' OR (
   image_url IS NOT NULL AND image_url LIKE '/market-images/%'
   AND image_source_url LIKE 'https://%'
   AND image_license IS NOT NULL AND length(trim(image_license)) > 0
 ));
ALTER TABLE market_catalog DROP CONSTRAINT IF EXISTS market_catalog_metadata_length_check;
ALTER TABLE market_catalog ADD CONSTRAINT market_catalog_metadata_length_check
 CHECK (
   (category IS NULL OR length(category) <= 80)
   AND (brand IS NULL OR length(brand) <= 120)
   AND (package_label IS NULL OR length(package_label) <= 120)
   AND (supplier_reference_id IS NULL OR supplier_reference_id ~ '^KZ-[A-Za-z0-9_-]{1,100}$')
   AND (image_source_url IS NULL OR image_source_url LIKE 'https://%')
   AND (price_source_url IS NULL OR price_source_url LIKE 'https://%')
 );

CREATE INDEX IF NOT EXISTS market_catalog_category_active
 ON market_catalog (organization_id, category, name, sku) WHERE active = true;
CREATE UNIQUE INDEX IF NOT EXISTS market_catalog_supplier_reference
 ON market_catalog (organization_id, supplier_reference_id) WHERE supplier_reference_id IS NOT NULL;
