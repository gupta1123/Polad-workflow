# How we work

Written 2026-11-05. The short version for agents is `CLAUDE.md` at the repo root.

## The situation
The product is live and a real client uses it. It is early, so we keep fixing bugs and those fixes must reach the client quickly and safely. We also want to add bigger features (for example cash discount), try them locally first, and push them only when they work.

So there are two kinds of work:
1. **Fixes to the live product.** Small, urgent, shipped soon.
2. **New features.** Longer, experimental, private until ready.

They must never get mixed.

## Where things deploy
- **Frontend** (`apps/polaad-web`): Netlify, `polaad-workflow.netlify.app`. Builds automatically from GitHub `main` (`gupta1123/Polad-workflow`). Config in `netlify.toml`.
- **Backend and worker** (`apps/api`): Heroku app `polaad-workflow`. `Procfile` runs `web` and `worker`. Deploy by pushing to the `heroku` remote's `main`.
- **Connector installer** (`apps/tally-bridge`, `installer/tally-bridge`): built by the GitHub workflow `build-tally-connector-installer.yml` and published as a GitHub Release tagged `polaad-tally-connector-vX.Y.Z`. There is also a Nyx-branded installer.
- **Database**: Supabase. Migrations live in `supabase/`. Agents only write the SQL; the user applies it.

GitHub and Heroku are independent. Pushing to one does not update the other.

## The ideal setup

```
main  ────●────●────●──────────●────  ← live (Netlify + Heroku)
           \                  /
            feature/cash-discount     ← private playground
```

- `main` is the single source of truth. "What's live?" = the latest commit on `main`.
- Netlify and Heroku both deploy from `main`, so they cannot drift apart.
- Each fix or feature has its own branch off `main`.
- One project folder is the workspace. It is kept clean. No temp copies.

## Routines

### Bug fix
1. `git switch main && git pull`, then `git switch -c fix/<short-name>`.
2. Fix, test locally, commit.
3. Merge into `main`.
4. Push `main` to GitHub (deploys the frontend) and to Heroku (deploys the backend).
5. If the connector changed, do a connector release (below).

### New feature (e.g. cash discount)
1. `git switch -c feature/<name>` off `main`.
2. Build and test locally against the Nyx company in Tally. Do not deploy.
3. Keep the branch pushed to GitHub so the work is safe. A feature branch does not deploy anything.
4. When the user says it is ready, merge into `main` and ship as above.
5. If an urgent bug appears meanwhile, fix it from `main`, not from the feature branch.

### Connector release
1. Bump the version in `apps/tally-bridge/package.json` and `installer/tally-bridge/electron-app/package.json`; keep the workflow's version in step.
2. Merge to `main` and push.
3. Run the `Build Tally Connectors` workflow. It publishes the Release and the installer exe.
4. Build the exe locally only for quick sharing: `npm run installer:tally-bridge`.

### Database change
Create a SQL file under `supabase/migrations/`. Tell the user. The user applies it. Never apply it from an agent.

## Don'ts
- Don't deploy from temp copies or worktrees in `AppData\Local\Temp`.
- Don't leave work uncommitted or only in a temp folder.
- Don't deploy a feature branch.
- Don't push to Heroku and GitHub from different commits.
- Don't apply migrations.

## Checking what is live
- Heroku: `heroku releases -a polaad-workflow -n 5`. Release names include the commit.
- GitHub/Netlify: `git fetch origin && git log origin/main -5`.
- Connector: the newest tag in GitHub Releases.

Don't rely on `git branch` ahead/behind counts. Past deploys were made as squashed snapshot commits ("Deploy abc123: …"), so the counts mislead.

## State as of 2026-11-05
- GitHub `main` = `07d9319` (includes the 4 Nov Axis payee and debit/credit fixes, post timings, connector 0.1.99 code).
- Heroku is at v64 (2026-11-02) and already has everything the backend needs; `07d9319` only touches the connector.
- Connector: the last GitHub Release is v0.1.98. 0.1.99 is built locally only, not released.
- Installer binaries must never be committed. An old branch, `feature/nyx-brand`, has a 172MB installer file in its history and cannot be pushed; do not push it.
- `feature/nyx-brand-clean` (on GitHub) holds the Nyx branding plus the dual Polaad/Nyx installer workflow, based on `main`. It is not merged and not typechecked.
- Still to clean up: the old temp worktrees under `AppData\Local\Temp` and the old `deploy/*` and `feature/*` branches. Check each for unique work before deleting.
