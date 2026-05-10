#!/usr/bin/env bash
# auto-rebase-main.sh — SessionStart hook.
#
# When a Claude Code session opens in a `claude/*` worktree branch
# (the default isolated-worktree pattern), rebase the branch onto the
# latest origin/main so the work the session does isn't based on a
# stale commit. Skips if:
#   - We're not in a git repo
#   - We're on `main` directly (no worktree isolation)
#   - The branch isn't a `claude/*` branch (custom workflow)
#   - origin can't be reached (offline)
#   - The working tree has uncommitted changes (--autostash handles this,
#     but we surface the stash so it's not silent)
#
# On rebase conflict, aborts cleanly and logs an error. The session
# starts on the un-rebased branch — we never leave a half-conflicted
# state for Claude to walk into.
#
# Output goes to stdout as a single JSON line; Claude Code shows the
# `systemMessage` field to the user. Silent on no-op (already up-to-date).

set -euo pipefail

emit() {
    # Print one JSON line and exit 0. `jq` produces well-escaped JSON
    # without us hand-rolling the escape rules.
    if command -v jq >/dev/null 2>&1; then
        jq -nc --arg msg "$1" '{systemMessage: $msg}'
    else
        # Fallback: assume $1 has no quotes/backslashes worth escaping
        # (we only call emit() with plain ASCII messages we control).
        printf '{"systemMessage": "%s"}\n' "$1"
    fi
    exit 0
}

# Read the session payload (we only need cwd; SessionStart payloads vary
# by Claude Code version, so just discard stdin and use $PWD).
cat >/dev/null 2>&1 || true

# 1. In a git repo?
if ! git rev-parse --git-dir >/dev/null 2>&1; then
    exit 0
fi

# 2. On a claude/* branch (= worktree-style session)?
branch=$(git symbolic-ref --short HEAD 2>/dev/null || echo "")
case "$branch" in
    claude/*) ;;
    *)        exit 0 ;;  # main, detached HEAD, or custom branch — leave alone
esac

# 3. Fetch origin/main
if ! git fetch origin main --quiet 2>/dev/null; then
    emit "auto-rebase: couldn't fetch origin/main (offline?), session continues on stale base"
fi

# 4. Already up-to-date?
base=$(git merge-base HEAD origin/main 2>/dev/null || echo "")
main_sha=$(git rev-parse origin/main 2>/dev/null || echo "")
if [ -n "$base" ] && [ "$base" = "$main_sha" ]; then
    exit 0  # silent: nothing to do
fi

# 5. Rebase with --autostash so uncommitted changes survive.
#    We capture stderr to inspect for conflicts vs other failures.
rebase_log=$(mktemp -t ks-rebase.XXXXXX)
trap 'rm -f "$rebase_log"' EXIT

if git rebase --autostash origin/main --quiet >"$rebase_log" 2>&1; then
    new_sha=$(git rev-parse --short HEAD 2>/dev/null || echo "?")
    main_short=$(git rev-parse --short origin/main 2>/dev/null || echo "?")
    emit "auto-rebased $branch onto origin/main ($main_short → HEAD now $new_sha)"
fi

# 6. Rebase failed. Abort and surface the reason.
git rebase --abort >/dev/null 2>&1 || true
# Restore any autostashed changes the abort might have left behind.
git stash list 2>/dev/null | grep -q "autostash" && git stash pop >/dev/null 2>&1 || true

snippet=$(tail -3 "$rebase_log" | tr '\n' ' ' | head -c 200)
emit "auto-rebase: conflict against origin/main, aborted. Run: git fetch origin main && git rebase origin/main. Detail: ${snippet:-unknown}"
