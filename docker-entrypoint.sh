#!/bin/sh
set -eu

PRISMA_BIN="./node_modules/.bin/prisma"
EXPECTED_PRISMA_VERSION="5.19.1"

if [ ! -x "$PRISMA_BIN" ]; then
  echo "Error: bundled Prisma CLI is missing or not executable: $PRISMA_BIN" >&2
  exit 1
fi

PRISMA_VERSION=$(node -p "require('./node_modules/prisma/package.json').version")
if [ "$PRISMA_VERSION" != "$EXPECTED_PRISMA_VERSION" ]; then
  echo "Error: expected Prisma CLI $EXPECTED_PRISMA_VERSION, found $PRISMA_VERSION" >&2
  exit 1
fi

# Exercise the bundled binary before touching the database. This never downloads packages.
su-exec nextjs "$PRISMA_BIN" --version >/dev/null
echo "Using bundled Prisma CLI $PRISMA_VERSION"

# Fix permissions for the mounted volume
chown -R nextjs:nodejs /app/prisma/db

# Ensure DATABASE_URL is set, default to the container path if not provided
export DATABASE_URL=${DATABASE_URL:-"file:/app/prisma/db/dev.db"}

echo "Applying database migrations..."
# Apply committed migrations without destructive schema pushes.
su-exec nextjs "$PRISMA_BIN" migrate deploy

echo "Checking database file..."
ls -la /app/prisma/db

# Run the main container command as nextjs user
exec su-exec nextjs "$@"
