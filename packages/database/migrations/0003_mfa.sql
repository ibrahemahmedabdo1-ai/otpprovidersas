-- MFA hardening: replay protection for TOTP steps, one confirmed TOTP factor per user, unique recovery hashes.
ALTER TABLE mfa_factors ADD COLUMN last_step bigint;
CREATE UNIQUE INDEX mfa_one_confirmed_totp ON mfa_factors(user_id) WHERE type = 'totp' AND confirmed_at IS NOT NULL;
CREATE UNIQUE INDEX mfa_recovery_unique ON mfa_factors(user_id, code_hash) WHERE type = 'recovery_code';
