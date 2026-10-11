-- Staging-only operational seed for Stage 4 live workflow verification.
-- Contains no real guest PII.
INSERT OR IGNORE INTO housekeeping_jobs(
  id,property_id,unit_id,reservation_id,assigned_user_id,status
) VALUES
('hk-stage4-235','utower','unit-235',NULL,'u-cleaner','dirty'),
('hk-stage4-49','utower','unit-49',NULL,'u-cleaner','inspection');

INSERT OR IGNORE INTO maintenance_tickets(
  id,property_id,unit_id,assigned_user_id,title,description,priority,status
) VALUES
('mt-stage4-250','utower','unit-250','u-tech','Air conditioning check','Synthetic staging maintenance ticket','high','assigned'),
('mt-stage4-49','utower','unit-49','u-tech','Door lock inspection','Synthetic staging ticket awaiting manager verification','normal','inspection');
