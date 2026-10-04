# Nookplay

A host-led Mafia game for 4–16 players. The dark neo brutalist interface works on phones and desktops. Players join by code and name, without accounts or a shared Wi-Fi network.

## Set up

1. Run `supabase/migrations/202610040001_nookplay_rooms.sql` and then `supabase/migrations/202610040002_room_expiry.sql` in the Supabase SQL Editor. The second migration adds a 24-hour room lifetime and schedules removal of expired rows every 15 minutes.
2. Copy `.env.example` to `.env.local`. Set `SUPABASE_URL` to the project URL ending in `.supabase.co` and `SUPABASE_SECRET_KEY` to the server-side secret key. A legacy `SUPABASE_SERVICE_ROLE_KEY` also works. Never expose the secret through `NEXT_PUBLIC_`.
3. Run `npm install` and `npm run dev`, then open `http://localhost:3000`.

The Next.js API stores room state in Supabase Postgres. Room access tokens are saved as SHA-256 hashes. Player responses never contain another player's role or role distribution. Revisions prevent concurrent changes from silently overwriting each other. The browser polls for updates every two seconds; Redis and Supabase Realtime are not required.

## Play

1. The host creates a room and shares its six-character code or invite link. Names appear in capitals. The host does not occupy a player slot.
2. In the waiting room, the host sets the player limit, phase durations, role reveal policy, tie rule, automatic timer advancement, spectator joining, and action mode. **Host guided** is the default: the group talks and makes choices face to face, while the host records outcomes. **Private devices** lets players submit night actions and votes in the app.
3. Roles default to Mafia, Villager, Doctor, and Detective. The host can edit quantities, assign roles manually or randomly, and add custom Town, Mafia, or Neutral roles with a group-defined objective. Role quantities must match the joined player count.
4. The host reveals roles. Each player sees only their own card by pressing and holding it. The host starts night when the group is ready.
5. At night, the host calls Mafia, Doctor, and Detective in person. The host can record their choices or override the outcome, including multiple eliminations. In private-device mode, Mafia targets, protection, and inspection are submitted privately. The Doctor can protect the target; the Detective sees a private Mafia/not-Mafia result.
6. Morning announces who was eliminated without revealing their role unless the room setting allows it. Discussion and voting follow. The host can pause, resume, extend, or advance the timer. In guided mode, the host selects the eliminated players. In device mode, votes stay hidden until resolved. A tie causes no elimination or a revote, according to room settings.
7. After the vote result, the host starts the next night. Town wins when no Mafia remain; Mafia wins when living Mafia equal or outnumber living Town. A host can declare a custom Neutral role's group-defined win. **Play again** resets the game but keeps room members and settings.

The host can always see players' roles and alive/out status. Eliminated players follow the game as spectators and cannot act or vote. A player can return from the same browser using saved access, or enter the room code and their original name to request a host-approved recovery on a new browser. Approval revokes the old access token. The host's access is saved in their browser to survive accidental tab closure. Clearing that browser's storage loses host access, so use the same browser for the room's lifetime.

Rooms stop accepting requests 24 hours after creation and are removed by the scheduled database job. The host can delete a room sooner.

## Deploy

Add `SUPABASE_URL` and `SUPABASE_SECRET_KEY` as server-side Vercel environment variables for Preview and Production, then deploy with `vercel --prod`. Apply both migrations before deploying this version.

## Checks

```bash
npm run typecheck
npm run test:game
npm run build
```
