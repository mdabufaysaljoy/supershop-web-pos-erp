#!/usr/bin/env bash
# Bring up the local dev infrastructure this project needs:
#   - MongoDB as a SINGLE-NODE REPLICA SET (rs0). Transactions are mandatory for
#     `npm run seed` and every money/stock write, and a standalone mongod cannot do them.
#   - Redis with maxmemory-policy=noeviction (required by BullMQ).
# Homebrew/macOS setup. Prefer containers? Use `docker compose up -d --wait` instead
# (stop the Homebrew services first: both want port 27017/6379).
#
#   npm run infra:local
set -uo pipefail

MONGO_PORT="${MONGO_PORT:-27017}"
REDIS_PORT="${REDIS_PORT:-6379}"
MONGO_CONF="${MONGO_CONF:-/opt/homebrew/etc/mongod.conf}"
REPL_SET="${REPL_SET:-rs0}"
PLIST_LABEL="homebrew.mxcl.mongodb-community"

say() { printf '%s\n' "$*"; }
fail() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}
listening() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }
need() { command -v "$1" >/dev/null 2>&1 || fail "$1 not found in PATH"; }

[ "$(uname -s)" = "Darwin" ] || fail "macOS/Homebrew script. On other systems run: docker compose up -d --wait"
need mongosh

# ---- .env ------------------------------------------------------------------
root="$(cd "$(dirname "$0")/../.." && pwd)"
if [ ! -f "$root/.env" ]; then
  cp "$root/.env.example" "$root/.env"
  say "created .env from .env.example (dev-only secrets)"
fi

# ---- mongod ----------------------------------------------------------------
if listening "$MONGO_PORT"; then
  say "mongod already listening on $MONGO_PORT"
else
  # `brew services start mongodb-community` fails when the tap's formula version no
  # longer matches the installed keg ("has not implemented #plist, #service"), so the
  # keg's own launch agent is used directly — same mechanism, survives a reboot.
  if ! brew services start mongodb-community 2>/dev/null; then
    src="$(brew --prefix mongodb-community 2>/dev/null)/$PLIST_LABEL.plist"
    [ -f "$src" ] || fail "no launch agent at $src — install it with: brew tap mongodb/brew && brew install mongodb-community"
    mkdir -p "$HOME/Library/LaunchAgents"
    cp "$src" "$HOME/Library/LaunchAgents/"
    launchctl bootout "gui/$(id -u)/$PLIST_LABEL" 2>/dev/null
    launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/$PLIST_LABEL.plist" ||
      fail "could not load $PLIST_LABEL — check /opt/homebrew/var/log/mongodb/mongo.log"
    say "loaded $PLIST_LABEL as a login service"
  fi
  for _ in $(seq 1 30); do
    listening "$MONGO_PORT" && break
    sleep 1
  done
  listening "$MONGO_PORT" || fail "mongod did not start — see /opt/homebrew/var/log/mongodb/mongo.log"
  say "mongod started on $MONGO_PORT"
fi

if ! grep -q "replSetName" "$MONGO_CONF" 2>/dev/null; then
  fail "$MONGO_CONF has no replica set. Add:

replication:
  replSetName: $REPL_SET

then re-run this script (existing data is kept; other local projects keep working)."
fi

state="$(mongosh --quiet --port "$MONGO_PORT" --eval 'try { rs.status().myState } catch (e) { e.codeName }' 2>/dev/null | tail -1)"
if [ "$state" = "NoReplicationEnabled" ] || [ "$state" = "NotYetInitialized" ]; then
  say "initiating replica set $REPL_SET…"
  mongosh --quiet --port "$MONGO_PORT" --eval \
    "rs.initiate({ _id: '$REPL_SET', members: [{ _id: 0, host: 'localhost:$MONGO_PORT' }] })" >/dev/null ||
    fail "rs.initiate failed — see /opt/homebrew/var/log/mongodb/mongo.log"
  for _ in $(seq 1 30); do
    [ "$(mongosh --quiet --port "$MONGO_PORT" --eval 'try { rs.status().myState } catch (e) { 0 }' 2>/dev/null | tail -1)" = "1" ] && break
    sleep 1
  done
fi

mongosh --quiet --port "$MONGO_PORT" --eval 'rs.status().members[0].stateStr' 2>/dev/null | tail -1 | grep -q PRIMARY ||
  fail "replica set $REPL_SET is not PRIMARY yet — check rs.status() in mongosh"
say "mongodb: replica set $REPL_SET PRIMARY on $MONGO_PORT (transactions available)"

# ---- redis -----------------------------------------------------------------
if listening "$REDIS_PORT"; then
  say "redis already listening on $REDIS_PORT"
else
  brew services start redis >/dev/null 2>&1 || fail "could not start redis — install it with: brew install redis"
  for _ in $(seq 1 20); do
    listening "$REDIS_PORT" && break
    sleep 1
  done
  listening "$REDIS_PORT" || fail "redis did not start"
  say "redis started on $REDIS_PORT"
fi

policy="$(redis-cli -p "$REDIS_PORT" config get maxmemory-policy 2>/dev/null | tail -1)"
[ "$policy" = "noeviction" ] || say "warning: redis maxmemory-policy is '$policy'; BullMQ needs 'noeviction'"

say ""
say "infrastructure ready. Next: npm run seed  →  npm run dev"
