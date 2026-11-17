-- Read-only consistency check: every wallet bucket must equal the sum of its ledger entries.
-- Returns one row per mismatching (wallet, bucket); an empty result means the books agree.
CREATE OR REPLACE FUNCTION wallet_reconciliation()
RETURNS TABLE (wallet_id uuid, bucket text, wallet_micro_usd bigint, ledger_micro_usd bigint)
LANGUAGE sql STABLE AS $$
  WITH l AS (
    SELECT e.wallet_id, e.bucket, sum(e.amount_micro_usd)::bigint AS s FROM ledger_entries e GROUP BY e.wallet_id, e.bucket
  ), w AS (
    SELECT id AS wallet_id, 'paid'::text AS bucket, paid_micro_usd AS v FROM wallets
    UNION ALL SELECT id, 'promo', promo_micro_usd FROM wallets
    UNION ALL SELECT id, 'reserved', reserved_micro_usd FROM wallets
  )
  SELECT w.wallet_id, w.bucket, w.v, COALESCE(l.s, 0)::bigint
  FROM w LEFT JOIN l ON l.wallet_id = w.wallet_id AND l.bucket = w.bucket
  WHERE w.v <> COALESCE(l.s, 0)
$$;
