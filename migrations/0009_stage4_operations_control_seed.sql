-- Stage 4 synthetic operations-control fixtures.
-- No real guest personal data and no fabricated financial KPIs.
INSERT OR IGNORE INTO lost_found_items(
  id,organization_id,property_id,unit_id,guest_id,item_name,description,found_location,found_at,status,created_by
) VALUES
('lf-stage4-charger','views','utower','unit-49',NULL,'Phone charger','Synthetic lost-and-found fixture','Apartment 49','2026-10-05T08:30:00+05:00','pending','u-front'),
('lf-stage4-scarf','views','utower',NULL,NULL,'Black scarf','Synthetic front desk fixture','Lobby','2026-10-05T09:00:00+05:00','claimed','u-front');

INSERT OR IGNORE INTO damage_reports(
  id,organization_id,property_id,unit_id,reservation_id,reported_by,severity,title,description,estimated_cost,currency,status
) VALUES
('damage-stage4-lock','views','utower','unit-49',NULL,'u-front','high','Door lock inspection','Synthetic damage report requiring review',NULL,'UZS','open');

INSERT OR IGNORE INTO inventory_items(
  id,organization_id,property_id,category,name,sku,quantity,par_level,unit_of_measure
) VALUES
('inventory-stage4-toiletries','views','utower','housekeeping','Guest toiletries','STAGE4-TOILETRIES',12,30,'set'),
('inventory-stage4-linen','views','utower','housekeeping','Bed linen','STAGE4-LINEN',8,20,'set');

INSERT OR IGNORE INTO shift_handovers(
  id,organization_id,property_id,from_shift,to_shift,unresolved_json,risks_json,follow_up_json,created_by
) VALUES
(
  'handover-stage4',
  'views',
  'utower',
  'morning',
  'evening',
  '["Synthetic staging: late checkout decision pending"]',
  '["Synthetic staging: housekeeping inspection awaiting supervisor"]',
  '["Synthetic staging: verify turnover queue before next arrival"]',
  'u-manager'
);
