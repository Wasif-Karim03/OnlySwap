# supabase

Migrations (`migrations/`), Edge Functions (`functions/`), pgTAP tests (`tests/`), seed and local config.

```bash
pnpm supabase start      # local stack (Docker); prints the API URL and anon key for apps/mobile/.env.local
pnpm supabase test db    # pgTAP
pnpm supabase stop
```

Staging is linked with `pnpm supabase link --project-ref <staging-ref>` once P0-ACC-04 is done.
