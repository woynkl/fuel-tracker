#!/bin/sh
set -e

# Fix permissions for the mounted volume
chown -R nextjs:nodejs /app/prisma/db

# Ensure DATABASE_URL is set, default to the container path if not provided
export DATABASE_URL=${DATABASE_URL:-"file:/app/prisma/db/dev.db"}

echo "Applying database migrations..."
# Apply committed migrations without destructive schema pushes.
su-exec nextjs npx prisma migrate deploy

echo "Checking database file..."
ls -la /app/prisma/db

# Run the main container command as nextjs user
exec su-exec nextjs "$@"
