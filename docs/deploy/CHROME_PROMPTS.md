# Dashboard steps for Claude in Chrome

Everything that can run in Terminal is in `scripts/deploy/`. These are the few
steps that only exist in a website dashboard. Copy one prompt at a time into
Claude in Chrome. You type every password, card number and 2-step code
yourself; the prompts tell Claude to stop and hand over at those points.

Order:

| When | Step | Then run |
|---|---|---|
| Before Supabase | F (check the 2-project limit), then G only if needed | `bash scripts/deploy/staging-supabase.command` |
| Before Supabase, optional | E (Gmail app password for login codes) | same script asks for it |
| Before Cloudflare | A (account + R2) | `bash scripts/deploy/cloudflare-staging.command` |
| When that script asks for R2 keys | B | paste at its hidden prompt |
| Only if the script says so | C or D | re-run the script |

---

## A. Cloudflare account and R2 (free)

```
Go to https://dash.cloudflare.com. If I'm not signed in, stop and let me sign in or sign up myself (I'll type my own email and password).

Then open R2 Object Storage from the left menu. If it shows a button to enable or purchase R2 (the free tier, $0 for our usage), click it and continue until it asks for payment details. At the payment form, STOP and tell me: I will type my own card details. Do not type any card or billing information.

After R2 is enabled, go to Manage Account > Billing (or Notifications) and, if there is an option for a usage or billing alert, create one at $1 so I get an email before anything costs money. Do not change any plan or buy anything.

Finally tell me: is R2 enabled (yes/no), and is the $1 alert set (yes/no)?
```

## B. R2 API token for the staging buckets

Run this when `cloudflare-staging.command` stops at "R2 Access Key ID (hidden)".

```
In https://dash.cloudflare.com, open R2 Object Storage, then "Manage R2 API Tokens" (or "API" > "Manage API tokens" on the R2 overview page). Click "Create Account API token" (if only "User API token" exists, use that).

Fill in:
- Token name: onlyswap-staging-functions
- Permissions: Object Read & Write
- Specify bucket(s): Apply to specific buckets only: onlyswap-media-staging and onlyswap-private-staging
- TTL: Forever
- Client IP filtering: leave empty

Click Create. On the result page, do NOT read the Access Key ID or Secret Access Key back to me and do not copy them anywhere. Just tell me "the token page is open". I will copy the two values into Terminal myself. Do not close the page.
```

## C. workers.dev subdomain (only if the script says "no workers.dev URL")

```
In https://dash.cloudflare.com, open Workers & Pages. If it asks to choose a workers.dev subdomain, set it to "onlyswap" (if taken, "onlyswap-app"), and confirm. Do not create any Worker or change any plan. Tell me the subdomain you set.
```

## D. CORS on the media bucket (only if the script says "cors: set it in the dashboard")

```
In https://dash.cloudflare.com, open R2 Object Storage > onlyswap-media-staging > Settings > CORS Policy > Edit. Replace the policy with exactly this JSON and save:

[
  {
    "AllowedOrigins": ["https://onlyswap-web.pages.dev", "https://onlyswap.pages.dev", "http://localhost:8081"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["content-type"],
    "MaxAgeSeconds": 3600
  }
]

Tell me when it is saved.
```

## E. Gmail app password for login codes

Use a Gmail you control (a new one like onlyswap.app@gmail.com is cleaner for launch).

```
Go to https://myaccount.google.com/security. If I'm not signed in or it asks for my password or a 2-step code, stop and let me type it.

Check that 2-Step Verification is On. If it's Off, open it and stop so I can turn it on myself.

Then go to https://myaccount.google.com/apppasswords. Create an app password named "OnlySwap". When Google shows the 16-letter password, do NOT read it back to me or copy it anywhere. Tell me "the app password is on screen" and leave it open. I'll type it into Terminal myself.
```

## F. Supabase: check the free project limit

```
Go to https://supabase.com/dashboard/projects. If I'm not signed in, stop and let me sign in.

List every project with its status (Active or Paused). Do not change anything. If there are already 2 active projects and neither is named onlyswap-staging, tell me their names so I can decide which one to pause.
```

## G. Supabase: pause an old project (only after I confirm which one)

```
In https://supabase.com/dashboard/projects, open the project named <NAME I CHOSE>. Go to Project Settings > General and click "Pause project", then confirm. Do not delete it. Tell me when it shows Paused.
```
