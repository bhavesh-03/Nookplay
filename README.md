<div align="center">

# Nookplay

**MAFIA: SUSPECT EVERYONE.**

A host-led, phone-friendly Mafia game for people playing together in the same room.

[Play Nookplay](https://nookplay.vercel.app) · [Report a bug](https://nookplay.vercel.app/report) · [Suggest a game](https://github.com/bhavesh-03/Nookplay/issues/new?template=game_proposal.yml)

</div>

## Why Nookplay?

The host should run the game, not spend the evening managing paper slips and remembering who is still alive. Nookplay gives the host a clear role sheet and phase controls while players receive private role cards and live announcements on their own phones. Conversation, accusations, and surprises still happen face to face.

Nookplay currently supports **Mafia**. It uses a dark, neo-brutalist interface designed for mobile screens. Players join with a room code and a name; no email, password, or shared Wi-Fi is needed.

## Features

- **Host-led by default:** the host calls roles, records night choices, announces results, and can eliminate several players at once. Optional device mode accepts private night actions and votes.
- **Private roles:** Mafia, Villager, Doctor, and Detective are included. The host can change quantities, assign roles manually or randomly, and add custom Town, Mafia, or Neutral characters such as Joker.
- **Clear game flow:** waiting room → private reveal → night → morning → discussion → vote → result → next round or victory.
- **Host controls:** player limits, phase timers, pause/resume/extend, reveal policy, tie rule, spectator joining, play again, and room deletion.
- **Return safely:** names are shown in capitals. Players can continue from a saved browser or request host-approved recovery using their room code and name. The host can reopen an accidentally closed room from the same browser.
- **Short-lived rooms:** access ends 24 hours after creation. An optional Supabase Cron migration removes expired rows from storage.
- **Bug reports:** an in-app form can email reports through a server-side SMTP account; GitHub Issues remains available.

## How a round works

1. The host creates a room and shares its code or link. The host does not take a player slot.
2. Players join. The host edits the roles and assigns one to each player.
3. The host reveals the cards. Each player presses and holds their own card to see their role.
4. During night, the host calls Mafia, Doctor, and Detective. In host-guided mode, everyone makes choices in person and the host records the outcome. In device mode, actions can be submitted privately.
5. Morning announces who was eliminated. Roles stay private unless the host chose immediate or end-of-game reveals.
6. Players discuss and vote. The host announces the result; eliminated players become spectators. A tie causes no elimination or a revote, depending on room settings.
7. If no team has won, the host starts the next night. Town wins when no Mafia remain. Mafia wins when living Mafia equal or outnumber living Town. The host may declare a Neutral character's agreed win condition.

## Run locally

**Requirements:** Node.js 20 or newer, npm, and a Supabase project.

```bash
git clone https://github.com/bhavesh-03/Nookplay.git
cd Nookplay
npm install
cp .env.example .env.local
```

1. Run [`202610040001_nookplay_rooms.sql`](supabase/migrations/202610040001_nookplay_rooms.sql) in the Supabase SQL Editor.
2. Run [`202610040002_room_expiry.sql`](supabase/migrations/202610040002_room_expiry.sql) to add scheduled cleanup. The app can run before this second migration, but expired rows will remain stored until it is applied.
3. Add your project's URL and **server-side** secret key to `.env.local`:

   ```env
   SUPABASE_URL=https://your-project-ref.supabase.co
   SUPABASE_SECRET_KEY=sb_secret_replace_me
   ```

4. Start the app:

   ```bash
   npm run dev
   ```

Open [localhost:3000](http://localhost:3000). To simulate several players, use separate browsers or private windows. The browser checks for room changes every two seconds.

### Environment variables

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL, ending in `.supabase.co`. |
| `SUPABASE_SECRET_KEY` | Server-only secret key. A legacy `SUPABASE_SERVICE_ROLE_KEY` also works. |
| `SMTP_HOST` | SMTP server for bug reports. |
| `SMTP_PORT` | SMTP port; `465` uses TLS from connection start. |
| `SMTP_USER` | SMTP login. |
| `SMTP_PASSWORD` | SMTP password or provider API key. |
| `SMTP_FROM` | Sender address accepted by the provider. |
| `BUG_REPORT_TO` | Private destination for bug reports. |

Never prefix secret values with `NEXT_PUBLIC_`, commit `.env.local`, or paste credentials into an issue.

## Set up free SMTP for bug reports

The bug form is at `/report`. Delivery is disabled until all SMTP variables above are configured; the page then points reporters to GitHub Issues.

For a personal Gmail inbox, turn on [2-Step Verification and create a Google app password](https://support.google.com/accounts/answer/185833). Use the app password for `SMTP_PASSWORD`, never your normal Google password. A personal Gmail account can send to the same inbox:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=your-address@gmail.com
SMTP_PASSWORD=your_16_character_app_password
SMTP_FROM="Nookplay <your-address@gmail.com>"
BUG_REPORT_TO=your-address@gmail.com
```

If you have a verified sending domain, [Resend's free SMTP plan](https://resend.com/pricing) is another option: `smtp.resend.com`, port `465`, username `resend`, API key as password, and a sender address on that domain. Add the chosen variables to Vercel's **Production** environment and redeploy. Keep the key server-side.

The reporter's optional email is used as `Reply-To`; it is never used as the sender. Test delivery by submitting a report from `/report` and checking the destination inbox. The server validates lengths, rejects cross-origin posts, uses a hidden spam trap, and applies a small per-instance throttle. For a higher-traffic public deployment, add a shared rate limiter or bot challenge.

## Project layout

| Path | Responsibility |
| --- | --- |
| `src/app/page.tsx` | Home, lobby, host controls, and player game screens. |
| `src/lib/game.ts` | Mafia roles, room state, phase transitions, privacy, and win rules. |
| `src/lib/room-repository.ts` | Supabase persistence and revision checks. |
| `src/app/api/rooms/` | Room API routes. |
| `src/app/report/` and `src/app/api/report/` | Bug report form and SMTP delivery. |
| `supabase/migrations/` | Database schema and expiry cleanup. |
| `tests/game.test.mjs` | Rule and privacy tests. |

The browser never receives the Supabase secret. Room access tokens are stored as SHA-256 hashes in the database. Each room update checks its revision to prevent concurrent actions from silently overwriting one another.

## Contribute

Bug fixes, accessibility improvements, translations, tests, and new games are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) for the development workflow.

**Want to add another game?** Open a [game proposal](https://github.com/bhavesh-03/Nookplay/issues/new?template=game_proposal.yml) first. Describe its player count, setup, private information, host actions, round flow, and win conditions. Mafia is currently the only game and its rules live in `src/lib/game.ts`; a new game will need its own state and screens rather than a renamed Mafia role. Keep the host's work clear, minimize device time during play, and include tests for secret information and phase transitions. See the [new game checklist](CONTRIBUTING.md#adding-a-new-game).

## Report a bug

Use the [in-app form](https://nookplay.vercel.app/report) or [open a GitHub issue](https://github.com/bhavesh-03/Nookplay/issues/new?template=bug_report.yml). Include what you expected, what happened, how to repeat it, and your device/browser. Do not include room tokens, private role assignments, or passwords.

## Checks

```bash
npm run typecheck
npm test
npm run build
```

## Deployment

The app deploys to Vercel with the Supabase variables set for Production. Apply the database migrations before relying on scheduled cleanup. The SMTP variables are optional for running the game, but required for sending bug reports. No Redis service is needed.

## License

Nookplay is released under the [MIT License](LICENSE).
