# Polaad AI Agents — rules for agents

Full detail: `docs/how-we-work.md`. Read it before any deploy, push or release.

## What this is
Bank-statement → Tally posting product, live with a real client. Early stage: we keep fixing bugs and adding features (e.g. cash discount).

- `apps/polaad-web` — frontend (Next.js)
- `apps/api` — backend API + background worker
- `apps/tally-bridge` — local Tally connector (Windows)
- `installer/tally-bridge` — builds the connector installer exe
- `supabase/` — database migrations

## Where things deploy
| Piece | Target | How |
|---|---|---|
| Frontend | Netlify (`polaad-workflow.netlify.app`) | auto-builds from GitHub `origin/main` (`gupta1123/Polad-workflow`) |
| Backend + worker | Heroku app `polaad-workflow` | push to the `heroku` remote, branch `main` |
| Connector installer | GitHub Releases, tag `polaad-tally-connector-vX.Y.Z` | `.github/workflows/build-tally-connector-installer.yml` |
| Database | Supabase | migration files only; **the user applies them by hand** |

GitHub and Heroku do not update each other. Always push the same commit to both.

## Rules
1. `main` is what the client has. Deploy only from `main`.
2. Every bug fix and every feature gets its own branch off `main`. Never mix a half-finished feature into a fix.
3. New features (e.g. cash discount) are tried locally first and stay on their branch until the user says ready.
4. Never deploy from a temp copy or a git worktree under `AppData\Local\Temp`.
5. Never leave work uncommitted or only in a temp folder. Commit and push branches so work is safe.
6. Never apply Supabase migrations. Create the SQL file and tell the user.
7. Ask before pushing to GitHub/Heroku, releasing a connector, or anything else outward-facing.
8. Bump the connector version in `apps/tally-bridge/package.json` and `installer/tally-bridge/electron-app/package.json` together, and keep the workflow file's version in step.

## Before saying "what's live"
Don't guess from branch ancestry. Check:
- Heroku: `heroku releases -a polaad-workflow -n 5`
- GitHub: `git fetch origin` then `git log origin/main -5`
- Connector: latest tag in GitHub Releases

## Current state (update when it changes)
GitHub `main` = latest code (2026-11-05). See "State as of 2026-11-05" in `docs/how-we-work.md`. Never commit installer binaries; the installer is published via GitHub Releases.
