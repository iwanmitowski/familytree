#!/bin/sh
# Runs once on first Postgres init (empty volume), as the superuser against
# POSTGRES_DB. Creates a least-privilege application role — the API connects as
# this role, never as the superuser (idea.md §2).
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
  DO \$\$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${APP_DB_USER}') THEN
      CREATE ROLE ${APP_DB_USER} LOGIN PASSWORD '${APP_DB_PASSWORD}';
    END IF;
  END
  \$\$;

  -- The app role owns the schema so it can run migrations (DDL) but has no
  -- superuser powers and no rights on other databases.
  GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO ${APP_DB_USER};
  ALTER SCHEMA public OWNER TO ${APP_DB_USER};
  GRANT ALL ON SCHEMA public TO ${APP_DB_USER};
SQL
