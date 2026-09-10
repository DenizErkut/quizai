import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Some route modules create their Supabase client at module evaluation time.
// Next.js evaluates those modules while collecting route data during a build.
// A Preview deployment intentionally running without Supabase configuration
// must still be buildable, so use inert values only for client construction.
// proxy.ts prevents those clients from ever being used at request time.
const INERT_SUPABASE_URL = 'https://supabase-not-configured.invalid'
const INERT_SUPABASE_KEY = 'supabase-not-configured'

export const createClient: typeof createSupabaseClient = ((
  supabaseUrl: string,
  supabaseKey: string,
  options?: Parameters<typeof createSupabaseClient>[2],
) => createSupabaseClient(
  supabaseUrl || INERT_SUPABASE_URL,
  supabaseKey || INERT_SUPABASE_KEY,
  options,
)) as typeof createSupabaseClient
