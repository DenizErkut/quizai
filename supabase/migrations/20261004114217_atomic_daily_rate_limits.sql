CREATE OR REPLACE FUNCTION public.consume_daily_api_rate_limit_v1(p_user_id uuid,p_endpoint text,p_limit integer)
RETURNS TABLE(allowed boolean,remaining integer,reset_at timestamptz)
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE v_count integer; v_day date := (now() AT TIME ZONE 'UTC')::date;
BEGIN
  IF p_user_id IS NULL OR length(p_endpoint) NOT BETWEEN 1 AND 100 OR p_limit NOT BETWEEN 1 AND 10000 THEN
    RAISE EXCEPTION 'Invalid rate limit scope';
  END IF;
  INSERT INTO public.api_rate_limits AS limits(user_id,endpoint,count,window_date)
  VALUES (p_user_id,p_endpoint,1,v_day)
  ON CONFLICT (user_id,endpoint,window_date) DO UPDATE SET count=limits.count+1
  WHERE limits.count<p_limit RETURNING count INTO v_count;
  RETURN QUERY SELECT v_count IS NOT NULL,
    CASE WHEN v_count IS NULL THEN 0 ELSE greatest(0,p_limit-v_count) END,
    (v_day+1)::timestamp AT TIME ZONE 'UTC';
END $$;
REVOKE ALL ON FUNCTION public.consume_daily_api_rate_limit_v1(uuid,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.consume_daily_api_rate_limit_v1(uuid,text,integer) TO service_role;
