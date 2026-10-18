-- Bank SMS → "Paste messages": add messages the phone missed by copying them into the app.
-- The same rules as messages from the phone (no OTPs, only messages about money, never the same message twice),
-- saved to your own inbox, so they're matched and added exactly like the rest.
create or replace function public.add_sms(body text, sender text default null, received_at timestamptz default null) returns text
language plpgsql security definer set search_path = public, extensions
as $$
declare
  uid uuid := auth.uid();
  b text := left(trim(coalesce(body, '')), 1000);
  n int;
begin
  if uid is null then return 'signed out'; end if;
  if b = '' then return 'empty'; end if;
  if b ~* '(\motp\M|one[ -]time password|verification code|\mpin\M is)' then return 'skipped'; end if;
  if b !~* '((rs\.?|inr|₹)\s*[0-9])|((debited|credited|spent|sent|received|paid|withdrawn|deposited)[^0-9]{0,40}[0-9])' then return 'skipped'; end if;
  if (select count(*) from public.sms_inbox i where i.user_id = uid and i.created_at > now() - interval '1 day') >= 500 then return 'limit'; end if;
  insert into public.sms_inbox (user_id, sender, body, received_at, body_hash)
  values (uid, left(nullif(trim(sender), ''), 60), b, coalesce(received_at, now()), encode(extensions.digest(b, 'sha256'), 'hex'))
  on conflict (user_id, body_hash) do nothing;
  get diagnostics n = row_count;
  return case when n = 0 then 'duplicate' else 'ok' end;
end;
$$;
revoke all on function public.add_sms(text, text, timestamptz) from public, anon;
grant execute on function public.add_sms(text, text, timestamptz) to authenticated;
