\set ON_ERROR_STOP on
\set QUIET on
BEGIN;
INSERT INTO users(email,role,status,mfa_required) VALUES
 ('c@x.co','customer','active',false),('s@x.co','support_staff','active',true),('r@x.co','super_admin','active',true);
SELECT id AS cu FROM users WHERE email='c@x.co' \gset
SELECT id AS sp FROM users WHERE email='s@x.co' \gset
SELECT id AS rt FROM users WHERE email='r@x.co' \gset
INSERT INTO organizations(name,owner_user_id) VALUES ('LD',:'cu');
SELECT id AS org FROM organizations WHERE name='LD' \gset
INSERT INTO wallets(organization_id) VALUES (:'org');
SELECT id AS w FROM wallets WHERE organization_id=:'org' \gset
SELECT request_deposit(:'w', 10000000, 'wire') AS dep \gset
INSERT INTO tickets(organization_id,created_by,subject,priority) VALUES (:'org',:'cu','Wallet top-up','high');
SELECT id AS tk FROM tickets WHERE organization_id=:'org' \gset
INSERT INTO conversations(ticket_id,organization_id) VALUES (:'tk',:'org');
UPDATE deposits SET ticket_id=:'tk' WHERE id=:'dep';

DO $$ BEGIN
  BEGIN
    UPDATE deposits SET support_evidence_note='abc';
    RAISE EXCEPTION 'FAIL short evidence note accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS evidence note must be 5-500 characters'; END;
END $$;

-- Support submits evidence: status moves to under_review, still NO credit.
UPDATE deposits SET status='under_review', support_submitted_by=:'sp', support_submitted_at=now(), support_evidence_note='transfer slip checked' WHERE id=:'dep';
SELECT (paid_micro_usd=0) AS ok FROM wallets WHERE id=:'w' \gset
\if :ok \echo PASS support submission credits nothing \else SELECT 1/0; \endif
SELECT (SELECT count(*) FROM messages)=0 AS ok \gset
\if :ok \echo PASS no customer message before an admin decision \else SELECT 1/0; \endif

-- Admin approval: credits once, posts to ticket, resolves it, notifies owner.
SELECT approve_deposit(:'dep', :'rt', 'funds seen on bank statement') \gset
SELECT (paid_micro_usd=10000000) AS ok FROM wallets WHERE id=:'w' \gset
\if :ok \echo PASS admin approval credits the wallet \else SELECT 1/0; \endif
SELECT (SELECT count(*) FROM messages WHERE reply_identity='admin' AND author_id=:'rt' AND internal=false)=1 AS ok \gset
\if :ok \echo PASS decision is posted to the ticket by the deciding admin \else SELECT 1/0; \endif
SELECT (status='resolved') AS ok FROM tickets WHERE id=:'tk' \gset
\if :ok \echo PASS ticket resolved on decision \else SELECT 1/0; \endif
SELECT (SELECT count(*) FROM notifications WHERE user_id=:'cu' AND kind='deposit_approved')=1 AS ok \gset
\if :ok \echo PASS customer notified once \else SELECT 1/0; \endif
ROLLBACK;
