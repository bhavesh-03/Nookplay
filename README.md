# Nookplay

A host-led hidden-role game for 4–16 players. Built with Next.js, TypeScript, Tailwind CSS, and shadcn-style controls. The UI has a dark neo brutalist theme and adapts to phones.

## Supabase setup

1. In your Supabase project's SQL Editor, run [`supabase/migrations/202610040001_nookplay_rooms.sql`](supabase/migrations/202610040001_nookplay_rooms.sql). It creates a room table with row level security enabled and no browser access.
2. Copy `.env.example` to `.env.local`. Set `SUPABASE_URL` to your project's Data API URL and `SUPABASE_SECRET_KEY` to a server-side secret key from Settings → API Keys. A legacy `SUPABASE_SERVICE_ROLE_KEY` also works. Never prefix the secret with `NEXT_PUBLIC_`.
3. Run `npm install` and `npm run dev`, then open `http://localhost:3000`.

Players can join through a public deployment URL from any network. No Supabase key is sent to the browser. The Next.js API checks each room token before returning a role or accepting a host action. Only SHA-256 hashes of those tokens are saved in Supabase. The whole room is stored in one database row; every change uses a revision check so concurrent joins or host actions cannot silently overwrite one another.

## Game flow

1. The host creates a room and shares its code or invite link. The host does not occupy a player slot. Players join with a name, without an account.
2. The host edits role names, teams, abilities, and quantities, then assigns each player's role manually or shuffles assignments.
3. The host presses **Reveal roles to players**. Each connected player receives their own private card within about two seconds, with no refresh. A press and hold displays the card.
4. For this first version, the host coordinates night actions and votes outside the app. The host selects the eliminated player or no elimination. The app immediately marks the player out and announces whether their assigned role was Mafia.
5. The app checks for Town victory when no Mafia remain and Mafia victory when living Mafia equal or outnumber living Town.

Updates use a two-second poll of the shared Supabase state. Redis and Supabase Realtime are not required for this first version.

## Deploy to Vercel

Sign in with `vercel login`, then run `vercel` for a preview deployment. Add `SUPABASE_URL` and `SUPABASE_SECRET_KEY` as **server-side** environment variables for Preview and Production in the Vercel project, then run `vercel --prod`. Do not deploy until the SQL migration and environment variables are present. Never put the secret key in client code or a public repository.

## Checks

```bash
npm run typecheck
npm run test:game
npm run build
```
