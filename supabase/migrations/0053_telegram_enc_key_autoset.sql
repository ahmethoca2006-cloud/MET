-- 0010/0045 encrypt the Telegram session server-side, but both require a
-- database-level setting (app.telegram_enc_key) to be set manually, once,
-- via the Supabase SQL editor. Until that manual step is done, every call to
-- rpc_set_telegram_session/rpc_get_telegram_session raises (current_setting
-- errors on an unset parameter), which the client catches and silently
-- degrades to storing the session in localStorage only — so credentials
-- never reach the DB and every new device has to re-enter the API ID/hash
-- and re-verify the phone number from scratch, indistinguishable from the
-- feature not existing at all. Auto-generate and set the key here instead,
-- so cross-device sync works immediately on any environment this migration
-- is applied to, with no manual step required. Idempotent: only sets the key
-- if this environment doesn't already have one (e.g. from the old manual
-- step), so it never overwrites/rotates an existing key and breaks already-
-- encrypted sessions.
create extension if not exists pgcrypto;

do $$
begin
  if current_setting('app.telegram_enc_key', true) is null then
    execute format(
      'alter database %I set app.telegram_enc_key = %L',
      current_database(),
      encode(gen_random_bytes(32), 'base64')
    );
  end if;
end $$;
