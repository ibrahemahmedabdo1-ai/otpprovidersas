\set ON_ERROR_STOP on
\set QUIET on
BEGIN;
INSERT INTO users(email,role,status,mfa_required) VALUES ('cu@x.co','customer','active',false),('ag@x.co','support_staff','active',true);
SELECT id AS cu FROM users WHERE email='cu@x.co' \gset
SELECT id AS ag FROM users WHERE email='ag@x.co' \gset
INSERT INTO organizations(name,owner_user_id) VALUES ('TO',:'cu');
INSERT INTO tickets(organization_id,created_by,subject) SELECT id,:'cu','Hello' FROM organizations WHERE name='TO';
INSERT INTO conversations(ticket_id,organization_id) SELECT t.id,t.organization_id FROM tickets t WHERE subject='Hello';
INSERT INTO messages(conversation_id,author_id,body) SELECT id,:'cu','مرحبا' FROM conversations;
SELECT id AS mid FROM messages \gset

INSERT INTO message_translations(message_id,target_lang,source_lang,body,provider) VALUES (:'mid','en','ar','Hello','test');
DO $$ BEGIN
  BEGIN INSERT INTO message_translations(message_id,target_lang,body,provider) SELECT id,'en','Again','test' FROM messages;
    RAISE EXCEPTION 'FAIL duplicate translation allowed';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS a message cannot be translated twice into the same language'; END;
  BEGIN INSERT INTO message_translations(message_id,target_lang,body,provider) SELECT id,'fr','x','test' FROM messages;
    RAISE EXCEPTION 'FAIL unsupported language allowed';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS only the six supported languages are accepted'; END;
  BEGIN UPDATE tickets SET customer_language = 'en';
    RAISE EXCEPTION 'FAIL language without source allowed';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS a ticket language must say whether it was detected or set by an agent'; END;
END $$;

UPDATE tickets SET customer_language='ar', customer_language_source='override';
INSERT INTO user_translation_prefs(user_id) VALUES (:'ag');
SELECT (allowed AND enabled AND language IS NULL) AS ok FROM user_translation_prefs WHERE user_id=:'ag' \gset
\if :ok \echo PASS agent preferences default to allowed, enabled, account language \else SELECT 1/0; \endif
SELECT ((value->>'enabled')::boolean = false) AS ok FROM system_settings WHERE key='translation' \gset
\if :ok \echo PASS translation is off by default \else SELECT 1/0; \endif
ROLLBACK;
