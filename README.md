# Sidewave

Private YouTube rooms with synchronized playback commands, a shared queue, host-only orders, and live participant presence.

## Deploy to Vercel with Supabase Realtime

1. Create a Supabase project, then enable **Anonymous Sign-Ins** in **Authentication > Providers > Anonymous**.
2. In **Realtime > Settings**, disable **Allow public access to channels**. This forces the private-channel policies in the migration to be evaluated.
3. Run `supabase/migrations/20260909110000_room_realtime.sql` in the Supabase SQL Editor (or apply it with the Supabase CLI).
4. In Vercel, add these variables for **Production**, **Preview**, and **Development**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
5. Redeploy. Do not use a Supabase `service_role` or secret key in Vercel browser variables.

The application works visually without these values, but realtime rooms remain disabled until Supabase is configured.

## Local development

```bash
cp .env.example .env.local
npm install
npm run dev
```

## Realtime behavior

- **Watch together** broadcasts the custom play/pause controls and shared queue updates.
- **Order to host** sends the video request to the room creator, who accepts it into the shared queue.
- A joining participant asks the active host for the current queue, mode, and playback state.
- Room state is live-only. A room with no active host does not retain its queue; add persistent room history only if that product behavior is required.
