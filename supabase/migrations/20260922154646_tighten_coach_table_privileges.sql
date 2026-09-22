-- Remove inherited object capabilities (TRUNCATE/TRIGGER/REFERENCES included),
-- then grant only the read capability required by the browser.
revoke all privileges on public.coach_conversations from authenticated;
revoke all privileges on public.coach_messages from authenticated;
grant select on public.coach_conversations, public.coach_messages to authenticated;
