import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_KEY as string | undefined

/** null, wenn app/.env.local fehlt. Dann geht nur der Demo-Modus. */
export const supabase =
  url && key ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } }) : null
