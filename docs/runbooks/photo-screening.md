# Photo screening (DEC 152)

Two layers:

1. **Automatic check (free, no setup).** Every new listing, Quad and profile photo is queued in `private.photo_scans`. The `scan_photos` job calls the `scan-photos` Edge Function every minute. It sends each photo key to the media Worker (`POST /internal/scan`), which reads the photo from R2 and asks Workers AI (`@cf/meta/llama-3.2-11b-vision-instruct`) through the Worker's AI binding whether it shows nudity, a sexualized minor, gore, weapons, drugs or hate symbols. No Cloudflare API token exists, and the photo never leaves Cloudflare. Flagged: the listing goes to `held_review`, the Quad post to `held`, or the profile photo is removed, and a system report lands in the admin queue.
2. **Known CSAM matching (Cloudflare CSAM Scanning Tool, free, needs a domain).** Matches photos against NCMEC hash lists at the edge and blocks them.

## How it is wired

- `workers/media/wrangler.toml` has `[ai] binding = "AI"` (and `[env.staging.ai]`).
- One random key, `SCAN_KEY`, is the Worker secret and the Edge Function secret. The deploy scripts make it once, keep it in the Keychain (`onlyswap-vault-scan_key`) and set both sides: `cloudflare-staging.command` / `cloudflare-prod.command`.
- Meta's Llama license is accepted automatically: the Worker sends the prompt `agree` once when the model asks for it.
- Without `SCAN_KEY` or `MEDIA_URL` the function answers `not_configured` and photos wait in the queue. Nothing breaks.

Free allowance: 10,000 neurons a day. When it runs out the Worker answers 429 and the rest wait for the next day; nothing is passed unchecked.

## Turn it on

```bash
bash scripts/deploy/cloudflare-staging.command   # staging
bash scripts/deploy/cloudflare-prod.command      # production
```

## CSAM Scanning Tool (production)

1. Buy a domain (about $10 a year, owner approved) and add it to Cloudflare (free plan). `cloudflare-prod.command` puts the media Worker on `media.<domain>`.
2. Dashboard, Caching, Configuration, **CSAM Scanning Tool**: enable it, verify your NCMEC reporting account email, and save.
3. Cloudflare emails you on a match and blocks the URL. Then: suspend the account in admin, keep the evidence (never delete it), and file the NCMEC CyberTipline report (see `docs/SECURITY.md` and `child-safety.md`).

## Test it

```sql
-- queue state (SQL editor)
select status, reason, count(*) from private.photo_scans group by 1, 2;
```

Post a listing with a normal photo (it should end `ok` within about a minute) and one with a kitchen knife or a pill bottle (it should end `flagged`, and the listing leaves Discover). Check the report in the admin queue, then clear it. Function logs show counts only: `{"event":"scan-photos","claimed":1,"passed":1,...}`.

Open question until the first real run: whether the model reads `.webp` photos. If every scan ends `failed` after three tries, tell Claude; the fix is converting to JPEG in the Worker.

Tuning: if the model flags too much, edit `SCAN_PROMPT` in `workers/media/src/scan.ts` and redeploy the Worker. A photo that fails three times stays `failed` for moderators.
