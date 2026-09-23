-- Referral credit is earned only after the referred user completes a paid
-- subscription. Registration itself must never grant a reward.

ALTER TABLE public.referrals
  ADD COLUMN IF NOT EXISTS qualified_at timestamptz,
  ADD COLUMN IF NOT EXISTS qualified_subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rewarded_at timestamptz,
  ADD COLUMN IF NOT EXISTS rewarded_months integer;

CREATE UNIQUE INDEX IF NOT EXISTS referrals_one_referrer_per_referred_uidx
  ON public.referrals (referred_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'referrals_no_self_referral'
      AND conrelid = 'public.referrals'::regclass
  ) THEN
    ALTER TABLE public.referrals
      ADD CONSTRAINT referrals_no_self_referral CHECK (referrer_id <> referred_id);
  END IF;
END;
$$;

-- Remove the old registration-time reward trigger.
DROP TRIGGER IF EXISTS on_referral_created ON public.referrals;
DROP FUNCTION IF EXISTS public.handle_referral_bonus();

CREATE OR REPLACE FUNCTION public.qualify_referral_on_paid_subscription()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_referral_id uuid;
  v_referrer_id uuid;
  v_qualified_at timestamptz;
  v_qualified_count bigint;
  v_profile_id uuid;
  v_reward_months integer;
BEGIN
  -- Only a successful paid PayTR subscription qualifies. Free plans,
  -- failed payments, renewals and repeated callbacks cannot earn extra credit.
  IF NEW.status IS DISTINCT FROM 'active'
     OR OLD.status = 'active'
     OR NEW.provider IS DISTINCT FROM 'paytr'
     OR COALESCE(NEW.price_paid, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT r.id, r.referrer_id, r.qualified_at
    INTO v_referral_id, v_referrer_id, v_qualified_at
    FROM public.referrals AS r
   WHERE r.referred_id = NEW.user_id
   ORDER BY r.created_at, r.id
   LIMIT 1
   FOR UPDATE;

  IF v_referral_id IS NULL OR v_qualified_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Serialize milestone counting per referrer so concurrent first payments
  -- cannot skip or duplicate a 10-referral reward.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_referrer_id::text, 0)
  );

  UPDATE public.referrals
     SET qualified_at = pg_catalog.now(),
         qualified_subscription_id = NEW.id
   WHERE id = v_referral_id
     AND qualified_at IS NULL;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT pg_catalog.count(*)
    INTO v_qualified_count
    FROM public.referrals
   WHERE referrer_id = v_referrer_id
     AND qualified_at IS NOT NULL;

  IF v_qualified_count % 10 = 0 THEN
    -- The milestone reward follows the paid term of the referral that
    -- completes this block of ten: monthly purchase = 1 month, yearly = 12.
    v_reward_months := CASE
      WHEN NEW.plan IN ('silver_monthly', 'gold_monthly', 'platinum_monthly', 'monthly') THEN 1
      ELSE 12
    END;

    UPDATE public.referrals
       SET rewarded_at = pg_catalog.now(),
           rewarded_months = v_reward_months
     WHERE id = v_referral_id;

    UPDATE public.profiles
       SET plan = CASE WHEN plan = 'unlimited' THEN plan ELSE 'premium' END,
           plan_expires_at = GREATEST(
             COALESCE(plan_expires_at, pg_catalog.now()),
             pg_catalog.now()
           ) + pg_catalog.make_interval(months => v_reward_months)
     WHERE id = v_referrer_id
     RETURNING id INTO v_profile_id;

    IF v_profile_id IS NULL THEN
      RAISE EXCEPTION 'Referral owner profile not found: %', v_referrer_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.qualify_referral_on_paid_subscription() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.qualify_referral_on_paid_subscription() TO service_role;

DROP TRIGGER IF EXISTS qualify_referral_after_paid_subscription ON public.subscriptions;
CREATE TRIGGER qualify_referral_after_paid_subscription
  AFTER UPDATE OF status ON public.subscriptions
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM 'active' AND NEW.status = 'active')
  EXECUTE FUNCTION public.qualify_referral_on_paid_subscription();

