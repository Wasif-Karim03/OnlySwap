# Phase 3 follow-ups

Proposals from [DESIGN_REVIEW.md](DESIGN_REVIEW.md) that Phase 3 (commit 739a532) did not build, and review notes for the owner. Each needs either a test update (owner OK), a file outside its batch, or a logic change (section 5).

B0-B3 and B8 skip lists were not saved; only their leftovers recorded in NOTES.md appear here.

## Pinned by tests (needs owner OK to update the test)

| Screen | Proposal not built | Test |
|---|---|---|
| Offer (3.04) | Replace the "Accepted" label | `dealRedesign.test.tsx:365` |
| Mark sold (3.04) | Confirm dialog before marking sold | Test presses Mark sold and expects the call at once |
| Meetup day (3.04) | Move late, no-show, cancel into a "More" sheet | `meetups.test.tsx` presses them directly |
| Make an offer (3.04) | Drop "Asking $X · Name" | Exact-text test |
| Quad feed (3.05) | Post button built from Button, named per proposal; list bottom padding | `youQuadRedesign.test.tsx:428,432` |
| Quad (3.05) | New `quad.hiddenFrom` wording | `quadScreens.test.tsx:644` |
| Quad thread (3.05) | Reply "..." moves to long-press | `quadScreens.test.tsx:376` |
| Feed post (3.05) | Bare counts next to icons ("7", not "7 likes") | `comments.test.tsx` |
| Data export (3.06) | "What's in it" as a collapsed row | `me.test.tsx` |
| Data export (3.06) | `settings.dataSent`, `settings.dataRateLimited` rewrites | `me.test.tsx` |
| My listings (3.06) | Pause and Moving out behind a Sheet (built inline instead) | Tests press them on screen |
| Profile tab (3.06) | Drop "Sold 0" counts on the segment | Pinned as `${tabs.sold} 1` |
| Sign-up (3.01) | "Step n of 4" | `youQuadRedesign` pins "of 5" |
| Verify (3.01) | Spam hint only after the timer | `youQuadRedesign` pins it visible |
| Email (3.01) | Remove `alumniTitle` | `signInScreens` |
| Email (3.01) | Dock "Join the waitlist" | `signInScreens`, `turnstile` tests |
| Safety (3.07) | Collapse banned list, drop the typed bullet | `safety.test` pins `• ${banned[0]}` |
| Help (3.07) | Contact form in a Sheet | `safety`, `turnstile` tests |
| Rules update (3.01) | Drop the spinner on the update screen | Test needs it |

## Needs a file outside its batch

- Plan the pickup: map collapsed by default (`SpotsMap.tsx`, shared).
- Chat: "Finish swap" in the dock (state lives in `Handoff`).
- Mark sold: item photo row (needs listing data the screen doesn't fetch).
- Quad outcome sheet: box-free hint and glyph removal (`components/OutcomeSheet.tsx`).
- Launch screen: "Sign out" (`LaunchScreen` not in B7).
- Discover card: "Moving out by" still shown (`feed/logic.ts`).
- Saved-state circle (needs logic).

## Deferred (section 5, logic)

Live offer countdown and push reminder; trust signals on Offer and Chat; "Verified at {campus}"; offer-timing claim; session-expired sheet behaviour and its resend; update store link; signed-out link error; Inbox badge; sign-out on the OS-required Close; hardcoded `'DELETE'` check; tappable blocked rows; Appearance save-failure toast.

## Not built, open question

- Chat bubble fade-in, chip/sort switch fades, sent-reply fade (section 2.7 says Phase 3 adds no new animations).
- Held-reply shortening and the note for posts that aren't live (`held.*` shared by posts and replies; wording unclear).
- Trust line on sale rows in the Feed (named as a problem, absent from the proposed layout).

## Review notes for the owner

- Edit and Relist now block a price under $1.00 or over $2,000 locally (Sell rules). An old listing priced under $1 can't be saved after an edit.
- Chat action row sits above the composer and stays visible with the keyboard open; check on a small phone.
- Plan the pickup lost its time heading (proposal removed it); screen readers get no label for the time chips.
- Approved copy that drops information: `me.awayBody` (no new offers, expiry shift), `settings.dataOthers`, `banner.offline`.
- Spanish maintenance time with a weekday may read awkwardly ("cerca de las mar 9:00").
- Admin console now follows OS dark mode; only the own-avatar contrast was fixed, the rest of `styles.css` was not audited in dark.
