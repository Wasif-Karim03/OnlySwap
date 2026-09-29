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
- Report and block on every listing, message and profile, reviewed by a person
- Free, no ads, no tracking. OnlySwap never handles your money.

## Keywords (App Store, ≤ 100 characters)

college,student,marketplace,textbooks,dorm,sell,buy,campus,used,furniture

## Screenshots

`maestro test apps/mobile/.maestro/store/screenshots.yaml -e PLATFORM=ios ...`
(and `PLATFORM=android`), then `node --experimental-strip-types scripts/export-store-assets.ts`.
Output: `store-assets/ios` (1320×2868 ×5), `store-assets/android` (1080×1920 ×5,
feature graphic 1024×500, icon 512). Captions are R1.0 features only (no Quad).

## App Review notes (Apple)

Sign in with the reviewer account (Welcome → "I already have an account"):
`appreview@review.onlyswap.test`, password in the App Review Information field.
It opens Demo University, a fictional school with sample listings and a demo
seller that answers. To complete a swap: swipe right on any card → Send offer →
wait about 30 seconds → Inbox → open the chat → the demo seller proposes a
meetup → Accept → I'm here. Safety: report and block from any listing, chat or
profile; 18+ age check at sign-up; account deletion in Profile → Settings →
Delete account and on the web at /delete. The app sells physical goods paid in
person (3.1.3(e)); there are no in-app purchases.

## Privacy label / Data safety

Copy the lists in RELEASE §5 exactly. Deletion URL: `https://onlyswap.pages.dev/delete`.
Child safety URL: `https://onlyswap.pages.dev/child-safety`.
