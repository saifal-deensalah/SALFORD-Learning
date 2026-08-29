BEGIN;

ALTER TABLE auth_identities
  ADD COLUMN IF NOT EXISTS provider_profile_picture_url text;

COMMIT;
