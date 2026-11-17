// ============================================
// Paste YOUR Supabase project values below.
// Find them in: Supabase → Project Settings → API
// ============================================

const SUPABASE_URL = "https://vthhzijailjgttetdtef.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0aGh6aWphaWxqZ3R0ZXRkdGVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY1NTc1MTEsImV4cCI6MjEwMjEzMzUxMX0.CJR6KjQti15hfZDsNgJenZ1rxpfV8e9fXaPISESUxG8";

// Creates one shared client that every page can use.
// (Loaded as a plain script, so this defines a global `supabaseClient`.)
//
// persistSession + autoRefreshToken (both true) are what keep you logged in
// across visits — the session is saved in the browser's localStorage, and
// the library silently refreshes it in the background so it doesn't expire
// just from time passing. You only get logged out if you click "Log out"
// (which clears it) or if the browser's storage for this site gets cleared
// (e.g. clearing history/cache, or private/incognito windows).
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: window.localStorage,
  },
});
