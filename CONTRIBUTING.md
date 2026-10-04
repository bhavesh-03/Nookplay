# Contributing to Nookplay

Thanks for helping make in-person games easier to host. Small fixes and well-defined game proposals are welcome.

## Before you start

- Search [existing issues](https://github.com/bhavesh-03/Nookplay/issues) before opening a new one.
- For a new game or a change to Mafia rules, open an issue first so the rules and host flow can be discussed.
- Never post `.env.local`, room access tokens, secret roles from a live game, or SMTP credentials.

## Development workflow

1. Fork the repository and create a branch from `main`.
2. Follow the [local setup](README.md#run-locally) in the README.
3. Make a focused change. Keep controls comfortable on narrow phone screens and usable with a keyboard.
4. Add or update tests when the change affects rules, privacy, room recovery, or phase transitions.
5. Run `npm run typecheck`, `npm test`, and `npm run build`.
6. Open a pull request explaining the behavior, screenshots for UI changes, and how you verified it.

## Adding a new game

Nookplay currently has one game: Mafia. Its state machine lives in `src/lib/game.ts`, and its interface lives in `src/app/page.tsx`. A new game should be a separate mode with its own rules rather than a collection of custom Mafia roles.

Start with a [game proposal](https://github.com/bhavesh-03/Nookplay/issues/new?template=game_proposal.yml) covering:

- Minimum and maximum players, and whether the host occupies a seat.
- Setup choices and default roles or teams.
- Which facts each player may see, and when they may see them.
- What the host says or records in person.
- The phases of a round, timers, ties, eliminations, and win conditions.
- How someone rejoins and what resets for a second game.

Then implement the game in a dedicated rules module, add server-side validation and a view that reveals only the right information to each player, and add UI for the host and players. Keep the existing Mafia behavior working. Tests should cover one normal round, ties, early termination, reconnects, and secret-data boundaries. A proposal can be accepted before every implementation detail is settled; the goal is to agree on a fun in-person flow first.

## Bug reports

Use the [app form](https://nookplay.vercel.app/report) or the [bug report issue template](https://github.com/bhavesh-03/Nookplay/issues/new?template=bug_report.yml). Provide steps to reproduce, expected and actual behavior, and a browser/device. Do not include private game data.

## Code style

- Use TypeScript for application code and follow the existing Next.js App Router structure.
- Validate room actions on the server. Never trust a browser to enforce role secrecy, voting limits, or host authority.
- Prefer clear labels and strong contrast to decorative controls that hide the next action.
- Keep pull requests focused and explain any database migration or environment variable they add.
