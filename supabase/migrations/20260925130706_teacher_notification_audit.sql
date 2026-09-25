-- Minimal, append-only audit evidence for teacher-to-class notifications.
-- Message contents and individual student ids are deliberately excluded.
CREATE TABLE IF NOT EXISTS public.teacher_notification_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  teacher_id uuid NOT NULL,
  classroom_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('attempted', 'completed', 'failed')),
  recipient_count integer CHECK (recipient_count IS NULL OR recipient_count >= 0),
  push_delivered_count integer CHECK (push_delivered_count IS NULL OR push_delivered_count >= 0),
  reason_code text CHECK (reason_code IS NULL OR reason_code IN (
    'dispatch_started', 'no_recipients', 'completed', 'partial_push_failure',
    'in_app_delivery_failed', 'notification_history_write_failed'
  )),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS teacher_notification_audit_teacher_created_idx
  ON public.teacher_notification_audit (teacher_id, created_at DESC);
CREATE INDEX IF NOT EXISTS teacher_notification_audit_request_idx
  ON public.teacher_notification_audit (request_id, created_at);

ALTER TABLE public.teacher_notification_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.teacher_notification_audit FROM PUBLIC, anon, authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON public.teacher_notification_audit FROM service_role;
GRANT SELECT, INSERT ON public.teacher_notification_audit TO service_role;

COMMENT ON TABLE public.teacher_notification_audit IS
  'Append-only service-role audit events for teacher class notifications; stores counts and reason codes, never message text or recipient ids.';
