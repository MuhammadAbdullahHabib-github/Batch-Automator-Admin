# Batch Automator

Admin panel for granting trial and paid access to Batch Automator for ChatGPT users. Talks directly to the same Supabase project the extension uses (`admin_list_profiles` / `admin_add_or_update` RPCs) — no separate backend.

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You'll need `.env.local` set (see `.env.example`) with the Supabase project URL and publishable/anon key — both are safe to expose client-side, access is actually gated by the admin password checked server-side inside the Supabase functions.

The admin password itself isn't stored here — it's hashed in the `admin_config` table in Supabase.

## Deploying to Vercel

1. Push this folder to its own GitHub repo (or `vercel --prod` directly from here with the Vercel CLI).
2. Import the repo in Vercel.
3. Add the two environment variables from `.env.example` in the Vercel project settings (Production + Preview):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy. No other config needed — it's a static/client-rendered app with no server-side secrets.
