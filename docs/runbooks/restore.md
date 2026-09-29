# Restore runbook (P14-BAK-02)

Backups come from `.github/workflows/backup.yml`: every night at 03:00 UTC it
writes `db/YYYY-MM-DD.tar.age` to the R2 bucket `onlyswap-backups` (kept 30 days).
Each file is a gzipped tar of `roles.sql`, `schema.sql`, `data.sql` and
`counts.json` (live row counts per public table at dump time), encrypted to the
backup age key. The private key lives only in your password manager.

## Drill (do this once before launch, then every 3 months)

On the Mac, with Docker running:

```bash
# 1. Get the newest backup (R2 dashboard → onlyswap-backups → db/ → Download),
#    or with the AWS CLI and a read token:
aws s3 cp s3://onlyswap-backups/db/2027-03-01.tar.age . \
  --endpoint-url https://<account-id>.r2.cloudflarestorage.com

# 2. Decrypt (asks for nothing; the key file comes from your password manager)
age -d -i ~/onlyswap-backup-key.txt 2027-03-01.tar.age | tar xz -C restore/

# 3. A clean local database
supabase start
DB=postgresql://postgres:postgres@127.0.0.1:54322/postgres
psql "$DB" -c 'drop schema if exists public cascade; create schema public;'

# 4. Restore in order
psql "$DB" -v ON_ERROR_STOP=0 -f restore/roles.sql     # existing roles report errors; fine
psql "$DB" -v ON_ERROR_STOP=1 -f restore/schema.sql
psql "$DB" -v ON_ERROR_STOP=1 -c 'set session_replication_role = replica' -f restore/data.sql

# 5. Compare row counts with the manifest
psql "$DB" -At -c "select json_object_agg(relname, n_live_tup) from pg_stat_user_tables where schemaname='public'" > now.json
psql "$DB" -c 'analyze'
node -e "const a=require('./restore/counts.json'),b=require('./now.json');let bad=0;for(const k in a){if((b[k]??0)!==a[k]){bad++;console.log(k,a[k],b[k]??0)}};console.log(bad?'MISMATCH':'row counts match')"
```

Run `analyze` before the count query if the numbers look low (the stats are
estimates until analyzed). Write the date and result in `docs/BUILD_PROGRESS.md`.

## Real incident

- **Bad migration:** prefer a forward-fix migration. For lost rows, restore the
  backup into a local database as above, then copy just the rows you need into
  a temp schema on the project and move them with SQL.
- **Project lost:** create a new Supabase project, restore roles, schema and data
  as above against its connection string, then re-deploy functions
  (`supabase functions deploy`), re-set secrets, and point the app and site at
  the new URL (EAS env + Pages env). Storage in R2 is untouched.
- Never restore production data onto a laptop you share, and delete the
  decrypted files when done.
