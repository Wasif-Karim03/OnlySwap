# Store listing draft (P16-STORE-02/03 prep)

Owner reviews and pastes these into App Store Connect and Play Console
(RELEASE §5). No university names or marks anywhere.

## Names

- App Store name: `OnlySwap` · subtitle: `Buy and sell on your campus` (≤ 30)
- Play title: `OnlySwap: Campus Marketplace` (28 characters)

## Short description (Play, ≤ 80)

Buy and sell with verified students at your school. Meet on campus, pay in person.

## Full description (both stores)

OnlySwap is a marketplace only students at your school can use.

Swipe through what people on campus are selling: dorm stuff, textbooks, tech.
Swipe right to make an offer. When the seller says yes, a chat opens so you can
plan a meetup at a Meetup spot on campus. Check the item and pay in person.

- Only verified students 18 and older, checked with a school email
- No strangers in your messages: chat opens only after an offer is accepted
- Meetup spots on campus, with reminders and a link you can send a friend
- Around campus: free food, free stuff and Wanted posts from students nearby
- Report and block on every listing, message and profile, reviewed by a person
- Free, no ads, no tracking. OnlySwap never handles your money.

## Keywords (App Store, ≤ 100 characters)

college,student,marketplace,textbooks,dorm,sell,buy,campus,used,furniture

## Screenshots

`maestro test apps/mobile/.maestro/store/screenshots.yaml -e PLATFORM=ios ...`
(and `PLATFORM=android`), then `node --experimental-strip-types scripts/export-store-assets.ts`.
Output: `store-assets/ios` (1320×2868 ×5), `store-assets/android` (1080×1920 ×5,
feature graphic 1024×500, icon 512). Captions show features every campus has
(swipe, offer, chat, meetup, Around campus). The Quad stays out of screenshots
and the description: it's on only at campuses with 300+ active users (DEC 76),
so most people who install wouldn't see it (2.3 accurate metadata). Reviewers
still see it on Demo University (2.3.1, notes below). Demo University and the
bot posts are fictional; no real school names or marks in any asset.

## App Review notes (Apple; reuse for Play "App access")

Sign in with the reviewer account (Welcome → "I already have an account"):
`appreview@review.onlyswap.test` (Play: `playreview@review.onlyswap.test`),
password in the App Review Information field. It opens Demo University, a
fictional school with sample posts and a demo seller (Sam D.) that answers
automatically. Every feature is turned on there.

- **Complete a swap:** swipe right on any card → Send offer → wait about 30
  seconds → Inbox → open the chat → the demo seller proposes a meetup → Accept
  → I'm here.
- **Around campus:** Discover → the "Swipe | Around campus" switch at the top →
  Around campus. It shows free items and Wanted posts; "I have this" on a
  Wanted post starts a listing. Free food posts last at most 3 hours, so post
  one yourself to see it (Around campus → Post free food).
- **The Quad** (anonymous campus board): the Quad tab. The first visit shows
  the four Quad rules; tap "I agree to the Quad rules". Posts are anonymous to
  other students but always tied to a verified 18+ account. Each post and reply
  has a menu with Report and "Hide posts from this person"; posts voted down to
  -5 are hidden and reviewed. New posts are filtered for names, phone numbers,
  emails, handles, rooms and banned words before they go live.
- **Photos in chat** (only if turned on when you review; see OWNER_TODO 16):
  in a chat, tap the photo button to send one. Photos are private (signed links,
  2 hours), blurred from new chats until tapped, and reportable with a long
  press.
- **Safety:** report and block from any listing, chat, message or profile;
  report from any Quad post or reply; a person reviews reports within 24 hours.
  18+ age check at sign-up. Account deletion in Profile → Settings → Delete
  account and on the web at /delete. Download your data in Profile → Settings.
- **Payments:** the app sells physical goods paid in person (3.1.3(e)); there
  are no in-app purchases.

## Apple 1.2 (user-generated content) checklist

| 1.2 requires | Where it is in OnlySwap |
|---|---|
| A way to filter objectionable material | Banned-words check on listings, Wanted, food, Quad posts, replies and polls; Quad blocks phone, email, URL, handle and room numbers; posts naming a student are held for review; Quad photos from accounts under 7 days are held; incoming chat photos are blurred in new chats |
| A way to report offensive content, with timely responses | Report on every listing, profile, chat, message (long press), Quad post and Quad reply; a person reviews within 24 hours (RELEASE §7 daily queue); minor-safety reports are priority 1 |
| A way to block abusive users | Block on profiles and chats; in the Quad, "Hide posts from this person" (authors are anonymous, so we hide without telling you who) plus keyword mutes |
| Published contact information | Help page `/help` (linked in Settings), support email in App Store Connect |
| Users agree to terms before posting | Terms, Privacy and Community Rules accepted at sign-up; Quad rules accepted before the first Quad post; updated rules must be accepted again |
| No anonymous bullying | The Quad is anonymous only to students: every post is tied to a verified 18+ school account; calling out students is against the rules and filtered; strikes and bans apply |

## Age rating answers (R1.1 content present)

**Apple:** User-generated content yes; Messaging and chat yes; Social media /
public posting yes (the Quad); Age assurance yes (18+ check at sign-up); Mature
themes, profanity or crude humor: infrequent/mild (user posts can contain it,
it's filtered and moderated); everything else none. Then **override to 18+**
(Apple's 18+ rating). Unrestricted web access: no. Gambling, contests: no.

**Google Play (IARC):** Users can interact or exchange content: yes (chat, the
Quad). Shares user location: no. Digital purchases: no. Unmoderated UGC: no
(report, block/hide, filters, human review). Then set Target audience to 18+
only.

## Privacy label / Data safety

Copy the lists in RELEASE §5 exactly. Deletion URL: `https://onlyswap.pages.dev/delete`.
Child safety URL: `https://onlyswap.pages.dev/child-safety`.
