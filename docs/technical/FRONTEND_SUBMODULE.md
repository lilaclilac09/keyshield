# Frontend submodule — what it is and how to repair it

The path `frontend/` at the repo root is a **broken git submodule**.

```
$ git ls-tree HEAD frontend
160000 commit 12c2a1fd62142a7eede672eccf756b9cf4251fa9  frontend
$ ls -la .gitmodules
ls: cannot access '.gitmodules': No such file or directory
```

A `160000` mode entry in the tree is a "gitlink" — git's marker for a
nested repository pinned at a specific commit. Normally that
gitlink is paired with a `.gitmodules` file at the repo root that
maps the path to a remote URL git can clone. **That `.gitmodules`
file isn't here.** The pinned commit hash is also not in the
local object database, so `git submodule update --init` would fail
with "fatal: no submodule mapping found in .gitmodules for path
'frontend'".

This document explains what to do about it.

## 1. What does `frontend/` contain?

Per references in `QUICK_START.md` and the Clerk-based auth notes
in `IMPLEMENTATION_SUMMARY.md`, the submodule was/is a Vite + React
app that:

- Hosts the Clerk Web3 sign-in flow with OKX wallet preferred
- Reads `VITE_PROGRAM_ID` and `VITE_RPC_URL` from `.env.local`
- Lives at `http://localhost:3000` during development

It is the user-facing frontend for the Solana program in
`programs/keyshield/`. **It is NOT required to develop or test
anything in this repo's other workspaces** — `extension/`,
`extension-sync/`, `infra/sync-worker/`, `mobile/`, and the
`packages/*` workspaces all stand on their own. The 354 tests
this repo currently maintains pass without ever cloning the
frontend.

## 2. Three options to repair

### Option A — Restore the submodule, if you know the URL

If you (the repo owner) know the GitHub URL of the original
frontend repo, run:

```bash
# Replace <URL> with e.g. https://github.com/lilaclilac09/keyshield-frontend.git
cat > .gitmodules <<EOF
[submodule "frontend"]
    path = frontend
    url = <URL>
EOF
git add .gitmodules
git submodule update --init frontend

# If the recorded commit 12c2a1fd... is not on the remote anymore,
# pin to whatever HEAD is current:
cd frontend
git fetch
git checkout main
cd ..
git add frontend
git commit -m "Re-pin frontend submodule"
```

### Option B — Inline the frontend into this repo

If the frontend repo is small and you'd rather collapse it into
this monorepo:

```bash
# Remove the broken gitlink.
git rm --cached frontend
rm -rf frontend
git commit -m "Drop broken frontend submodule"

# Add the frontend code as a regular directory.
git clone <URL> frontend-tmp
rm -rf frontend-tmp/.git
mv frontend-tmp frontend
git add frontend
git commit -m "Inline frontend into the monorepo"
```

After this, `frontend/` is just another workspace; consider adding
it to the root `package.json` `workspaces` array.

### Option C — Drop it and use one of the existing workspaces

If you want to ship without the legacy frontend at all, the
`extension-sync/` popup and `mobile/` (RN) workspaces are both
self-contained user-facing entry points that don't depend on the
old Vite app. Drop the gitlink:

```bash
git rm --cached frontend
git commit -m "Drop unused frontend submodule"
```

You'll also want to scrub the references from:
- `QUICK_START.md` (mentions `frontend/.env.local`)
- `ARCHITECTURE.md` (lines 1193, 1223 — wallet-adapter notes)
- `IMPLEMENTATION_SUMMARY.md` (CLERK_WEB3_SETUP and OKX-only auth steps)

## 3. What this repo's tooling assumes today

Nothing in CI / npm / cargo references `frontend/`. `npm install`
ignores broken submodules quietly. `npm test` and `npm run
typecheck` both pass with `frontend/` empty. The Solana program
tests + Mollusk integration tests don't reach into it either.

So the repository is fully usable in its current "broken
submodule" state — fixing it is housekeeping, not a blocker.

## 4. If you choose Option A, here's a `.gitmodules` template

```ini
[submodule "frontend"]
    path = frontend
    url = https://github.com/<owner>/<repo>.git
    # Optional: track a specific branch instead of the recorded SHA.
    # branch = main
```

Replace `<owner>/<repo>` with the actual GitHub path. After
committing this file, `git submodule update --init` will populate
the `frontend/` directory.

## 5. Why we haven't fixed it ourselves

Every contributor who's poked at this branch has hit the same
wall: the `.gitmodules` file is gone, and the only place the URL
ever lived (`.git/config`'s `[submodule "frontend"]` section) is
machine-local — it never made it into a tracked file. We've also
asked the repo owner directly and gotten "I don't remember the
URL" back.

Whoever has the original credentials needs to run Option A. If
nobody does, Option C is the cleanest cleanup.
