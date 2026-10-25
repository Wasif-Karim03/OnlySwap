# Photo screening (DEC 152)

Two layers:

1. **Automatic check (free).** Every new listing, Quad and profile photo is queued in `private.photo_scans`. The `scan_photos` job calls the `scan-photos` Edge Function every minute; it asks Cloudflare Workers AI whether the photo shows nudity, a sexualized minor, gore, weapons, drugs or hate symbols. Flagged: the listing goes to `held_review`, the Quad post to `held`, or the profile photo is removed, and a system report lands in the admin queue.
2. **Known CSAM matching (Cloudflare CSAM Scanning Tool, free, needs a domain).** Matches photos against NCMEC hash lists at the edge and blocks them.

Until step 1 is configured the function answers `not_configured` and photos simply wait in the queue (nothing breaks).

## 1. Turn on the automatic check

1. Cloudflare dashboard: copy your **Account ID** (right side of the account home).
2. My Profile, API Tokens, Create Token, Custom token: permission **Account / Workers AI / Read**. Copy the token.
3. Accept Meta's Llama 3.2 license once:

   ```bash
   curl https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/ai/run/@cf/meta/llama-3.2-11b-vision-instruct \
     -H "Authorization: Bearer $CF_AI_TOKEN" -d '{"prompt":"agree"}'
   ```

4. Set the function secrets (hosted project):

   ```bash
   supabase secrets set CF_ACCOUNT_ID=... CF_AI_TOKEN=... MEDIA_URL=https://<public media base>
   supabase functions deploy scan-photos --no-verify-jwt
   ```

   Locally, put the same three lines in `supabase/functions/.env`.

Free allowance: 10,000 neurons a day (a few hundred to a few thousand photos depending on size). When it runs out the API answers 429 and the rest wait for the next day; nothing is passed unchecked.

## 2. Turn on the CSAM Scanning Tool

1. Buy a domain (about $10 a year, owner approved) and add it to Cloudflare (free plan).
2. Point the media Worker at it: in `workers/media/wrangler.toml` add a route or custom domain, for example `media.<domain>`, deploy, and set `MEDIA_URL` / the app's media env to that host.
3. Dashboard, Caching, Configuration, **CSAM Scanning Tool**: enable it, verify your NCMEC reporting account email, and save.
4. Cloudflare emails you on a match and blocks the URL. Then: suspend the account in admin, keep the evidence (never delete it), and file the NCMEC CyberTipline report (see `docs/SECURITY.md` and `child-safety.md`).

## Test it

```bash
# queue state
psql "$DB" -c "select status, count(*) from private.photo_scans group by 1"
# run one batch now
curl -X POST "$SUPABASE_URL/functions/v1/scan-photos" -H "Authorization: Bearer $SERVICE_ROLE_JWT"
```

Expect `{ok:true, claimed, passed, flagged, retried}`. Post a listing with a normal photo (passes) and one with a kitchen knife or a pill bottle (should flag and disappear from Discover). Check the report in the admin queue, then clear it.

Tuning: if the model flags too much, edit `SCAN_PROMPT` in `supabase/functions/_shared/photoScan.ts`. A photo that fails three times stays `failed` for moderators.
