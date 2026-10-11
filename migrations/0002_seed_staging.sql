-- Staging-only non-personal operational seed.
INSERT OR IGNORE INTO units(id,property_id,code,name,status,capacity,bedrooms) VALUES
('unit-235','utower','235','Apartment 235','available',2,1),
('unit-250','utower','250','Apartment 250','available',4,1),
('unit-49','utower','49','Apartment 49','available',3,1);

INSERT OR IGNORE INTO app_users(id,organization_id,email,display_name) VALUES
('u-cleaner','views','cleaner.staging@views.invalid','Cleaner Staging'),
('u-tech','views','technician.staging@views.invalid','Technician Staging'),
('u-front','views','frontdesk.staging@views.invalid','Front Desk Staging'),
('u-manager','views','manager.staging@views.invalid','Manager Staging');

INSERT OR IGNORE INTO staff_roles(user_id,property_id,role) VALUES
('u-cleaner','utower','cleaner'),
('u-tech','utower','technician'),
('u-front','utower','front_desk'),
('u-manager','utower','general_manager');
