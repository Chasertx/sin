import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY in app/.env.local');
}

/**
 * Supabase client for the mobile app (React Native equivalent of Supabase's Next.js
 * utils/supabase/client.ts; no cookies or middleware needed on mobile).
 *
 * Sin's users, swipes and messages go through the .NET API, which signs people in itself,
 * so this client doesn't keep a Supabase auth session. Use it for public, read-only things
 * (e.g. Storage photo URLs) or future Supabase features like Realtime.
 */
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
