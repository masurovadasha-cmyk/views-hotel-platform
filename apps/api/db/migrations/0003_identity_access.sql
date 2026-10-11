BEGIN;

CREATE TYPE membership_status AS ENUM ('invited','active','suspended','revoked');

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  phone_e164 text,
  display_name text,
  locale text NOT NULL DEFAULT 'ru',
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (email IS NOT NULL OR phone_e164 IS NOT NULL)
);
CREATE UNIQUE INDEX users_email_unique ON users(lower(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX users_phone_unique ON users(phone_e164) WHERE phone_e164 IS NOT NULL;

CREATE TABLE roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  is_platform_role boolean NOT NULL DEFAULT false
);

CREATE TABLE permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  description text NOT NULL
);

CREATE TABLE role_permissions (
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY(role_id,permission_id)
);

CREATE TABLE organization_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  user_id uuid NOT NULL REFERENCES users(id),
  role_id uuid NOT NULL REFERENCES roles(id),
  status membership_status NOT NULL DEFAULT 'invited',
  invited_by uuid REFERENCES users(id),
  joined_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,user_id,role_id)
);
CREATE INDEX memberships_org_user_idx ON organization_memberships(organization_id,user_id);

CREATE TABLE membership_property_scopes (
  membership_id uuid NOT NULL REFERENCES organization_memberships(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  PRIMARY KEY(membership_id,property_id)
);

CREATE TABLE guest_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text,
  phone_e164 text,
  preferred_locale text NOT NULL DEFAULT 'ru',
  tags text[] NOT NULL DEFAULT '{}',
  vip_level text,
  blacklisted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX guest_profiles_org_idx ON guest_profiles(organization_id);
CREATE INDEX guest_profiles_user_idx ON guest_profiles(user_id);

CREATE TABLE audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  actor_user_id uuid,
  actor_membership_id uuid,
  request_id text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  before_state jsonb,
  after_state jsonb,
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_org_time_idx ON audit_log(organization_id,created_at DESC);
CREATE INDEX audit_entity_idx ON audit_log(entity_type,entity_id,created_at DESC);

INSERT INTO roles(code,name,is_platform_role) VALUES
('host','Host',false),('owner','Owner',false),('manager','Manager',false),('front_desk','Front Desk',false),
('housekeeper','Housekeeper',false),('technician','Technician',false),('concierge','Concierge',false),
('accountant','Accountant',false),('platform_admin','Platform Admin',true)
ON CONFLICT(code) DO NOTHING;

INSERT INTO permissions(code,description) VALUES
('property.read','Read property'),('property.manage','Manage property'),
('reservation.read','Read reservations'),('reservation.manage','Manage reservations'),
('guest.read','Read guest profiles'),('guest.manage','Manage guest profiles'),
('housekeeping.work','Work housekeeping tasks'),('maintenance.work','Work maintenance tasks'),
('concierge.work','Work concierge requests'),('finance.read','Read finance'),
('finance.manage','Manage finance'),('team.manage','Manage team and permissions'),
('platform.moderate','Moderate marketplace'),('platform.admin','Platform-wide administration')
ON CONFLICT(code) DO NOTHING;

INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r JOIN permissions p ON
 (r.code='manager' AND p.code IN ('property.read','property.manage','reservation.read','reservation.manage','guest.read','guest.manage','finance.read','team.manage'))
 OR (r.code='front_desk' AND p.code IN ('property.read','reservation.read','reservation.manage','guest.read','guest.manage'))
 OR (r.code='housekeeper' AND p.code IN ('property.read','housekeeping.work'))
 OR (r.code='technician' AND p.code IN ('property.read','maintenance.work'))
 OR (r.code='concierge' AND p.code IN ('property.read','reservation.read','guest.read','concierge.work'))
 OR (r.code='accountant' AND p.code IN ('property.read','reservation.read','finance.read','finance.manage'))
 OR (r.code IN ('host','owner') AND p.code IN ('property.read','property.manage','reservation.read','finance.read'))
 OR (r.code='platform_admin')
ON CONFLICT DO NOTHING;

COMMIT;
