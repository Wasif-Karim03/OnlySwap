# functions.md — Function-level spec

Paths are relative to the repo root. `M/` means `apps/mobile/src/`, `A/` means `apps/admin/src/`, `F/` means `supabase/functions/`.

Types come from `packages/shared/src/db.ts` (generated) and `packages/shared/src/types.ts` (domain types: `Listing`, `FeedItem`, `Offer`, `Chat`, `Message`, `Meetup`, `QuadPost`, `QuadReply`, `Notification`, `Prefs`, `AppError`).

Server RPCs are fully specified in `backend.md` §4, with their inputs, outputs, validation and rate limits. This file covers their client wrappers plus the server internals not listed there.

---

## 1. Core libraries (`M/lib/`)

| Function | File | Does | Params → Return | Side effects | Edge cases |
|---|---|---|---|---|---|
| `supabase` | `lib/supabase.ts` | Singleton client with MMKV-encrypted auth storage (web: localStorage) | — | persists session; `autoRefreshToken` on; `AppState` listener starts/stops refresh | web SSR guard (`typeof window`) |
| `rpc<T>(name, args)` | `lib/rpc.ts` | Typed wrapper over `supabase.rpc` that maps Postgres errors to `AppError` | `(name: RpcName, args) → Promise<T>` | Sentry breadcrumb (name only, no args) | `P0001` code parse `CODE:detail:retryAt`; network → `ERR_OFFLINE`; 401 → triggers `auth.refresh()` once then `SESSION_EXPIRED` |
| `toAppError(e)` | `lib/errors.ts` | Normalize any error | `unknown → AppError{code, detail?, retryAt?}` | — | unknown → `ERR_UNKNOWN` |
| `errorCopy(err)` | `lib/errors.ts` | User-facing copy per code (from `strings/en.ts`) | `AppError → {title, body, action?}` | — | `RATE_LIMITED` formats retry time in campus TZ |
| `queryClient` | `lib/queryClient.ts` | TanStack Query client with defaults (staleTime 30 s, retry 2 unless 4xx) + MMKV persister for feed/inbox | — | persists selected queries | purge on sign-out |
| `storage` | `lib/storage.ts` | MMKV instances: `app` (theme, coach flags, drafts, recent searches), `secure` (encrypted with key from SecureStore) | get/set/delete typed keys | disk | key migration version |
| `track(event, props?)` | `lib/analytics.ts` | PostHog capture if opted-in | `(EventName, Record<string, string|number|boolean>) → void` | network (batched) | drops PII keys by allowlist; no-op in `__DEV__` unless flag |
| `identify(userId)` / `resetAnalytics()` | `lib/analytics.ts` | Link events to hashed user id | | | called after sign-in / sign-out |
| `setAnalyticsOptIn(on)` | `lib/analytics.ts` | `posthog.optIn()/optOut()` + RPC `update_profile_flags` | `boolean → Promise<void>` | writes `profiles.analytics_opt_in` | offline → local first, sync later |
| `initSentry()` | `lib/sentry.ts` | `Sentry.init({dsn, tracesSampleRate:0.05, sendDefaultPii:false, enabled})` | | | respects crash-reports toggle |
| `navigateFromLink(url)` | `lib/deeplinks.ts` | Parse universal/scheme/push URLs → route | `string → void` | router push | other campus → X30; signed out → store pending link, show X31 then resume after login |
| `getConfig()` / `useAppConfig()` | `lib/config.ts` | Fetch `app_config` public keys; cache 5 min | `→ AppConfig` | | offline → last cached; missing → safe defaults |
| `compareVersions(a,b)` | `lib/version.ts` | semver compare | `(string,string) → -1|0|1` | | build metadata ignored |
| `formatPrice(cents)` | `lib/format.ts` | "$40", "Free" | `number → string` | | 0 → "Free"; > 99999 → "$1,000" style |
| `formatRelative(date)` | `lib/format.ts` | "12m ago", "Yesterday" | `Date|string → string` | | future dates → "in 5 min" |
| `haptic(kind)` | `lib/haptics.ts` | expo-haptics wrapper honoring reduce-motion setting | `'light'|'select'|'success'|'warning'` | vibration | web no-op |
| `useReduceMotion()` | `lib/a11y.ts` | subscribes to OS setting | `→ boolean` | | |
| `announce(msg)` | `lib/a11y.ts` | `AccessibilityInfo.announceForAccessibility` | | | web: aria-live region |

## 2. Auth, age, onboarding (`M/features/auth/`)

| Function | File | Does | Params → Return | Side effects | Edge cases |
|---|---|---|---|---|---|
| `lookupSchool(email)` | `auth/api.ts` | Debounced domain lookup | `string → Promise<School|null>` | — | personal domains list (`gmail.com`, `yahoo.com`, `outlook.com`, `icloud.com`, `hotmail.com`, `proton.me`) short-circuit to `PERSONAL_EMAIL` |
| `sendCode(email)` | `auth/api.ts` | `supabase.auth.signInWithOtp({email, options:{shouldCreateUser:true, data:{invite_code}}})` | `→ Promise<void>` | email sent | hook rejects: `SCHOOL_UNKNOWN` → A5, `AGE_BLOCKED` → A8, `BANNED`, `DOMAIN_BLOCKED`; 429 → `RATE_LIMITED` |
| `verifyCode(email, token)` | `auth/api.ts` | `verifyOtp({email, token, type:'email'})` | `→ Promise<Session>` | session stored; `identify()`; `track('email_verified')` | expired → `CODE_EXPIRED`; wrong → `CODE_INVALID` with remaining attempts (client counts, 5 max → 5 min lockout) |
| `signInReviewer(email, pw)` | `auth/api.ts` | `signInWithPassword` for review domain only | `→ Promise<Session>` | | non-review domain → never called (UI guard) |
| `signOut()` | `auth/api.ts` | disable push token, `auth.signOut()`, clear queryClient + MMKV user keys, `resetAnalytics()` | `→ Promise<void>` | | offline → local sign-out, token disabled on next launch via `pendingTokenDisable` |
| `useSession()` | `auth/useSession.ts` | Session + profile + claims | `→ {session, profile, status, loading}` | subscribes `onAuthStateChange` | token refresh race: single-flight |
| `useAppGate()` | `auth/useAppGate.ts` | Computes route per gate order (screens.md §0) | `→ Route` | redirects | config fetch fail → proceed with cached |
| `requestAgeSignal()` | `auth/age.ts` | `expo-age-range` request (iOS DAR / Play Age Signals) | `→ Promise<{status:'adult'|'minor'|'unknown'}>` | OS sheet (iOS) | unsupported OS/web → unknown; timeout 3 s → unknown; result never sent to analytics |
| `confirmAge(input)` | `auth/api.ts` | RPC `confirm_age` | `{method, isAdult?, birthDate?} → {adult}` | profile updated or blocked | minor → call `deleteSelf('underage')` then `signOut()` |
| `validateName(s)` | `auth/logic.ts` | 1–30 chars letters/space/-/' | `string → ValidationResult` | | unicode letters allowed (`\p{L}`) |
| `acceptRules()` | `auth/api.ts` | RPC `accept_rules(RULES_VERSION)` | | | |
| `useWaitlist()` | `auth/useWaitlist.ts` | position + progress, polls 60 s while focused | `→ {position, members, threshold}` | | unlocked → invalidates session claims (`refreshSession()`) |
| `joinUnknownSchoolWaitlist(email)` | `auth/api.ts` | POST `waitlist-request` | | | dup → silent success |

## 3. Components with logic (`M/components/`)

| Component | Key props | Internal logic | Edge cases |
|---|---|---|---|
| `Button` | `variant, size, loading, disabled, onPress, haptic` | press-scale 0.97 via Reanimated; loading replaces label with spinner keeping width | double-tap guard 500 ms |
| `Input` | `state, leftIcon, rightSlot, error` | focus ring 2px ink; error shows `ErrorText` with icon | autofill styles on iOS |
| `OTPInput` | `length=6, onComplete` | single hidden TextInput; paste handling; auto-submit | Android autofill via SMS Retriever not used (email) |
| `Sheet` | `snapPoints, onClose` | Reanimated + RNGH pan to close; backdrop; focus trap | keyboard avoidance; Android back closes |
| `SwipeDeck` | `items, onSwipe(item, dir), onTap, renderCard, onEnd` | keeps 3 mounted cards; gesture: translateX/Y, rotate = x/width*12°; threshold 35% or velocity 800; programmatic `swipe(dir)` for buttons; undo stack size 1 | fast consecutive swipes queue; list mode when screen reader/reduce motion |
| `SwipeCard` | `item` | expo-image with blurhash, gradient, stamp labels opacity from gesture | image fail → placeholder |
| `PhotoCarousel` | `photos` | pager + dots, pinch to zoom in viewer | 1 photo → no dots |
| `MapView` | `spots, selectedId, userLocation?` | MapLibre with OpenFreeMap style URL `https://tiles.openfreemap.org/styles/liberty`; attribution visible | tiles fail → `SpotList` fallback (X20 layout) |
| `VoteControl` | `score, myVote, onVote` | optimistic ±; haptic select | tapping same vote removes it |
| `MessageBubble` / `PhotoMessage` | `message, isMine, blurred` | PhotoMessage blur (expo-image `blurRadius`) until tapped when sender not previously revealed in this chat | failed upload retry |
| `ReportSheet` | `targetType, targetId, reasons, allowBlock` | reason radio, details, block toggle default by reason | duplicate → toast |
| `PermissionPrimer` | `kind: 'camera'|'photos'|'location'|'notifications', onGranted` | checks status; `undetermined` → primer → request; `denied` & `!canAskAgain` → Settings variant | iOS limited photo library treated as granted |
| `OfflineBanner` | — | NetInfo subscription, slide-in banner | flapping debounce 2 s |
| `ToastUndo` | `message, onUndo, duration=5000` | countdown bar | stacked toasts replace |

## 4. Feature hooks (`M/features/*/api.ts`, TanStack Query)

| Hook | File | Params → Return | Side effects | Edge cases |
|---|---|---|---|---|
| `useFeed()` | `feed/api.ts` | `→ InfiniteQuery<FeedItem[]>` via `get_feed` | prefetch next 3 images | exhaustion → EndOfDeck; campus switch resets |
| `useSwipe()` | `feed/useSwipe.ts` | `→ {swipe(item, dir), undo()}` | queues in MMKV `pendingSwipes`, flush every 10 or on blur/background via `record_swipes`; right → opens offer sheet (not recorded until offer or save) | offline accumulate ≤ 200; app killed → flush next launch |
| `useSaveListing(id)` | `feed/api.ts` | `→ Mutation` save/unsave | optimistic save_count | rollback on error |
| `useListing(id)` | `listing/api.ts` | `→ Query<ListingDetail>` | `record_view` once/day | RLS null → Item gone state |
| `useCreateListing()` | `sell/api.ts` | `(draft) → Mutation<Listing>` | ensures uploads done; calls `create_listing`; clears draft; `track('listing_created')` | BANNED → map field error; held → X14 state |
| `useDraft()` | `sell/useDraft.ts` | `→ {draft, update, clear}` | MMKV autosave (debounced 500 ms) | schema version mismatch → discard |
| `processPhoto(uri)` | `lib/media.ts` | `→ {full:{uri,w,h,size}, thumb:{…}, blurhash}` | writes temp files | HEIC input ok; >20 MP downscale in two steps to avoid OOM; output > 2 MB → re-encode q 0.6 |
| `pickPhotos({max})` | `lib/media.ts` | `→ Asset[]` via system picker | — | cancelled → [] |
| `uploadPhotos(kind, targetId, processed[])` | `lib/media.ts` | `→ {path, thumb_path}[]` | calls `upload-url`, PUTs with `fetch` (retry 3, exponential), progress callback | 403 expired URL → re-request once |
| `generateShareCard(listing)` | `sell/share.ts` | `→ path` | `captureRef(ShareCard)` → JPEG 1200×630 → upload kind `share` → `update_listing(share_image_path)` | missing cover photo → skip, share link still works |
| `useSearch(q, filters)` / `useSuggest(q)` | `search/api.ts` | → results / suggestions | recent searches MMKV | q < 2 → no call |
| `useSavedSearches()` | `search/api.ts` | CRUD + new counts | | max 20 → error copy |
| `useOffers()` / `useOffer(id)` | `offers/api.ts` | inbox & detail | realtime `user:{uid}` invalidation while Inbox focused | |
| `useMakeOffer()` | `offers/api.ts` | `(listingId, amount, note, quick) → Offer` | `track('offer_made')`; triggers notification primer if push not granted | RATE_LIMITED → B12; OFFERS_PAUSED → explain no-shows |
| `useRespondOffer()` | `offers/api.ts` | `accept|counter|decline|withdraw` | accept → navigate chat | race: offer already accepted elsewhere → `OFFER_NOT_PENDING` |
| `useChat(chatId)` | `chat/useChat.ts` | `→ {messages, send, loadOlder, markRead}` | subscribes Realtime private channel on focus; merges broadcast inserts; unsubscribes on blur/background | reconnect → refetch since last id; dedupe by id/client_id |
| `useSendMessage(chatId)` | `chat/useChat.ts` | `(text | photo) → Message` | optimistic pending bubble with client_id | offline → queued, sent on reconnect in order |
| `useMeetup(chatId)` | `meetup/api.ts` | propose/confirm/checkin/late/cancel/share | | time zone: always campus TZ display |
| `distanceTo(spot, loc)` | `meetup/logic.ts` | haversine meters | `→ number` | loc null → undefined |
| `useLocationOnce()` | `meetup/useLocation.ts` | `Location.getCurrentPositionAsync({accuracy: Balanced})` after primer | never persisted/sent | denied → null |
| `useDealCheck(chatId)` / `useRating(chatId)` | `deal/api.ts` | outcome + rating | review prompt eligibility | |
| `maybeAskForReview()` | `deal/review.ts` | `StoreReview.isAvailableAsync()` and conditions (≥3 swaps, 14 d, 120 d since last) | stores `lastReviewPromptAt` | never after a bad experience (fell through / no-show) |
| `useQuadFeed(sort)` / `useQuadThread(id)` | `quad/api.ts` | infinite posts / thread | | quad disabled → hides tab |
| `useCreateQuadPost()` | `quad/api.ts` | `→ {status, reason}` | `track('quad_post_created')` | blocked/held UX |
| `useVote()` | `quad/api.ts` | optimistic vote | | rapid toggles debounce 300 ms, last wins |
| `useReport()` | `safety/api.ts` | `create_report` (+ optional `block_user`) | `track('report_submitted', {target})` | ALREADY_REPORTED |
| `useBlocks()` | `safety/api.ts` | list/unblock | invalidates feed, inbox | |
| `useAppeal()` | `safety/api.ts` | `create_appeal` | | one per subject |
| `useNotifications()` / `useUnreadCount()` | `notifications/api.ts` | list/mark read; badge | `Notifications.setBadgeCountAsync` | |
| `usePrefs()` | `notifications/api.ts` | read/update prefs | | |
| `registerPush()` | `lib/push.ts` | permission → `getExpoPushTokenAsync({projectId})` → `register_push_token`; Android channels created first | stores token | simulator → skip; token change listener re-registers |
| `handleNotificationResponse(resp)` | `lib/push.ts` | tap → `navigateFromLink(data.url)` | marks read | cold start via `getLastNotificationResponseAsync` |
| `useDeleteAccount()` / `useExportData()` | `settings/api.ts` | call Edge Functions | sign out after delete | offline → blocked |

## 5. Admin (`A/`)

| Function | File | Does | Edge cases |
|---|---|---|---|
| `requireAdmin()` | `A/auth/guard.tsx` | session + `admin_role` claim + `aal2` else → MFA step | AAL1 → `mfa.challenge()` |
| `enrollTotp()` | `A/auth/mfa.ts` | `auth.mfa.enroll({factorType:'totp'})` → QR → verify | lost device → owner resets via SQL runbook |
| `adminRpc(name, args)` | `A/lib/rpc.ts` | calls `admin.*` with reason prompt enforcement | 403 → sign-in |
| `useReportQueue(filters)` | `A/features/reports/api.ts` | paginated queue, 30 s poll | |
| `useRevealAuthor()` | `A/features/quad/api.ts` | re-MFA challenge then `admin.reveal_quad_author` | rate limited |
| `exportCsv(rows)` | `A/lib/csv.ts` | client-side CSV of audit table | escapes commas/quotes |

## 6. Server internals (`supabase/migrations`, `F/_shared`)

| Function | Where | Params → Return | Side effects | Edge cases |
|---|---|---|---|---|
| `private.require_active()` | SQL | `→ profiles row` | upserts `activity_days` | raises `NOT_ACTIVE:<status>`, `AGE_REQUIRED`, `RULES_REQUIRED` |
| `private.hit(action, lim, win interval)` | SQL | `→ void` | upsert `rate_counters` | raises `RATE_LIMITED:<action>:<retry_at>` |
| `private.hit_ip(action, lim, win)` | SQL | uses `current_setting('request.headers')::json->>'x-forwarded-for'` | | missing header → treat as single bucket "unknown" (tight limit) |
| `private.check_text(txt, scope)` | SQL | `→ text` ('ok'|'block:x'|'review:x') | increments `banned_words.fired_count` | normalizes: lowercase, unaccent, leetspeak map (0→o,1→i,3→e,4→a,5→s,$→s), collapses repeats |
| `private.pii_check(txt)` | SQL | regex phone `(\+?1)?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}`, email, `room \d+`, URLs, `@handle` → reason | | used by Quad only |
| `private.names_student(txt, campus)` | SQL | heuristic: rating/ranking verbs (`rate`, `ranking`, `1-10`, `hottest`, `worst`) + capitalized first-name tokens from `common_first_names` table (~5k) or "@"/initial patterns → bool | | false positives go to review, not block |
| `private.unlock_campus(campus_id)` | SQL | set live, `unlocked_at`, calls `campus-unlock` via `net.http_post` | | idempotent |
| `private.email_hash(email)` | SQL | `encode(digest(lower(email) || current_setting('app.email_pepper'), 'sha256'),'hex')` | | pepper from Vault |
| `private.queue_notification(user, type, title, body, data, ts)` | SQL | inserts `notifications` respecting pref gate at send time (not insert) | | deleted/banned users skipped |
| `private.is_blocked(a,b)` | SQL | `→ bool` either direction | | |
| `private.new_invite_code()` | SQL | 8 char base32 unique | retries on collision | |
| `presignPut(key, type, size)` | `F/_shared/r2.ts` | aws4fetch signed URL 300 s | | |
| `deletePrefix(prefix)` | `F/_shared/r2.ts` | list + batch delete (1000/req) | | pagination |
| `sendExpoPush(messages[])` | `F/_shared/expoPush.ts` | chunks of 100, gzip | returns tickets | 429 → backoff 1 s, 2 s, 4 s |
| `sendMail(to, template, vars)` | `F/_shared/mailer.ts` | SMTP 465 (denomailer) or Resend | | failure → attempts++, retry with backoff; 5 fails → Sentry alert |
| `verifyTurnstile(token, ip)` | `F/_shared/turnstile.ts` | POST siteverify | `→ boolean` | network fail → false |
| `renderTemplate(name, vars)` | `F/_shared/templates/index.ts` | returns `{subject, text, html}` | | all templates plain-English per Voice guide |
