-- Compare-and-swap semantics used by the gateway's enc:v1 -> enc:v2 conversion.
-- The gateway stores each value double-encoded: the jsonb string's text starts with a quote.
-- Runs in a transaction and rolls back; touches only a temp table.
BEGIN;
CREATE TEMP TABLE kv_t(k text PRIMARY KEY, v jsonb NOT NULL, updated_at timestamptz DEFAULT now());
-- stored jsonb string whose text is  "enc:v1:abc"  (with the quotes)
INSERT INTO kv_t(k, v) VALUES ('d:k:1', to_jsonb('"enc:v1:abc"'::text));

DO $$
DECLARE n int; parsed text := '"enc:v1:abc"';
BEGIN
  -- Old compare: the already-JSON-encoded string is encoded again by the driver, so it can never equal the stored value.
  UPDATE kv_t SET v = to_jsonb('"enc:v2:new"'::text)
   WHERE k = 'd:k:1' AND v = to_jsonb(('"' || replace(parsed, '"', '\"') || '"')::text);
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'old compare unexpectedly matched'; END IF;

  -- New compare on the extracted text matches the unchanged row exactly once.
  UPDATE kv_t SET v = to_jsonb('"enc:v2:new"'::text)
   WHERE k = 'd:k:1' AND v #>> '{}' = parsed;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'new compare did not match unchanged row'; END IF;

  -- A second swap against the now-changed row must not replace anything.
  UPDATE kv_t SET v = to_jsonb('"enc:v2:other"'::text)
   WHERE k = 'd:k:1' AND v #>> '{}' = parsed;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'changed row was overwritten'; END IF;

  IF (SELECT v #>> '{}' FROM kv_t WHERE k = 'd:k:1') <> '"enc:v2:new"' THEN RAISE EXCEPTION 'unexpected final value'; END IF;
  IF (SELECT count(*) FROM kv_t) <> 1 THEN RAISE EXCEPTION 'row count changed'; END IF;
END $$;
ROLLBACK;
SELECT 'auth-migration CAS tests passed' AS result;
