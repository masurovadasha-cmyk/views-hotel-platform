BEGIN;

ALTER TABLE booking_quotes
  ADD COLUMN booking_channel text,
  ADD COLUMN market_segment text,
  ADD COLUMN attribution_source text,
  ADD COLUMN attribution_actor_user_id uuid REFERENCES users(id),
  ADD COLUMN attribution_actor_membership_id uuid REFERENCES organization_memberships(id);

ALTER TABLE booking_quotes
  ADD CONSTRAINT booking_quotes_channel_code
    CHECK (
      booking_channel IS NULL
      OR booking_channel IN ('staff_crm','guest_app','host_portal','marketplace_api','import')
    ),
  ADD CONSTRAINT booking_quotes_market_segment_code
    CHECK (
      market_segment IS NULL
      OR market_segment ~ '^[a-z0-9][a-z0-9_-]{0,63}$'
    ),
  ADD CONSTRAINT booking_quotes_attribution_source
    CHECK (
      attribution_source IS NULL
      OR attribution_source IN ('staff_actor','authenticated_guest','trusted_integration','import')
    ),
  ADD CONSTRAINT booking_quotes_attribution_actor_pair
    CHECK (
      (attribution_actor_user_id IS NULL AND attribution_actor_membership_id IS NULL)
      OR
      (attribution_actor_user_id IS NOT NULL AND attribution_actor_membership_id IS NOT NULL)
    );

CREATE INDEX booking_quotes_attribution_idx
  ON booking_quotes(organization_id,property_id,booking_channel,market_segment,created_at DESC);

COMMIT;
