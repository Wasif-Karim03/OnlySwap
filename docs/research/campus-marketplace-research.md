# Campus-Only Swipe Marketplace — Pre-Build Research

**Prepared for:** Wasif (founder, sole engineer) · **Date:** August 30, 2026
**Scope:** Product, trust-and-safety, and legal research to inform a build plan before more code is written.
**Stack assumed locked:** Expo/React Native + TS, Expo Router, Reanimated, TanStack Query, Supabase (Postgres + RLS + auth + realtime), Cloudflare R2. Cash/in-person v1. Near-zero infra budget. Minimal, animated, non-template design.

**How to read this.** This is written to be blunt, not encouraging. Where evidence is thin or inferred, it says so. Legal and policy sections are research to hand to counsel, not legal advice — the researcher flags that specific statute cites and case holdings may be misremembered and must be verified. App-store policy and several laws (COPPA 2.0, Epic settlements, state privacy) are in flux as of mid-2026; treat dated items as needing re-check at build time.

---

## 1. Executive Summary — the five things that most change what you build

1. **The category is a graveyard, and empty feeds are what kill these apps — not bad code.** There are already many near-identical ".edu-verified campus marketplace" apps live right now (Dormo, DormSy, DormDeal, rumie, Unilist, Plug, and more), and Facebook killed its own **Facebook Campus** in 2022 concluding students are better served by ordinary Groups. Your real competitor isn't Depop — it's free, pre-installed **Facebook Marketplace + campus Buy/Sell Groups + GroupMe**, which already do local, cash, in-person deals. ".edu-verified campus marketplace" is table stakes, not a wedge. **This reframes the whole project: your scarcest resource is single-campus liquidity, and every early decision should be judged by whether it creates or starves it.**

2. **The swipe UI is very likely a novelty that decays by week two — and it actively *raises* your liquidity bar.** The entire 2014 "Tinder-for-shopping" cohort (Mallzee, Kwoller, Stylect, Grabble) is dead or pivoted; Mallzee's founder publicly disowned the consumer concept. Swiping is low-intent, lean-back browsing that converts worse than search, and a swipe feed *advertises its own emptiness* by running out — where a search/list view can look "full" with 30 items. Campus buying is mostly high-intent ("I need a desk by Friday"). **Recommendation: ship swipe as a top-of-funnel delight layer, but make search, category filters, and "wanted" posts first-class. Do not bet retention on the gesture.**

3. **Auto-opening a chat on every bid is a harassment vector, and it's worse on a real-name single campus.** Using "make an offer" as a backdoor DM to women is a documented pattern on Facebook Marketplace and eBay. On an anonymous national platform that's bad; on a scoped app where the harasser shares a dining hall and knows the target's face and dorm, it's materially more dangerous. **Recommendation: do not auto-open a live chat. Treat a bid as a lightweight, structured request the seller must accept before a chat opens (the dating-app connection-request model), and ship instant mutual block + message-level reporting from day one.** You lose some liquidity/friction; on a small identity-linked community the safety upside outweighs it.

4. **Two features you're planning are legal landmines you don't need in v1: chat-content analysis for "sold" detection, and real-prize gamification.** Scanning DM content to infer sales invites wiretap/ECPA exposure (courts are expanding this) and is a toxic privacy signal — and it's unnecessary, because explicit "mark sold" + metadata-based nudges get you there at near-zero risk. Real prizes for selling activity can trip lottery/sweepstakes law (prize + chance + consideration), and "tokens earned by selling" arguably looks like *consideration* — genuinely unsettled and a "get counsel first" item. **Recommendation: v1 uses explicit mark-sold + time nudges (no content scanning), and either drops prizes or ships a purely deterministic, no-chance, no-purchase reward with counsel review.**

5. **Physical-meetup safety is your defining risk and your cheapest big win is free.** Pairing strangers and sending them to meet with cash is the highest-physical-risk primitive in consumer software; Facebook Marketplace meetups have been tied to documented robberies and homicides, and one bad incident tied to *your* app, with your name as sole operator, can end the product and follow you personally. Your campus almost certainly already has a **police-run safe-exchange zone** — you can pin it as the default meetup and nudge every deal toward it *unilaterally, with no partnership needed*. Combined with block/report and automated tripwires (keyword flags, rate limits, auto-hide on N reports) so bad content dies while you sleep, that's the floor of "reasonable care." **Form an LLC, write assumption-of-risk Terms, and price liability insurance before launch.**

---

## 2. Findings by Section

### 1) Prior art and post-mortems

**The category is heavily attempted and rarely survives.** A long tail of near-identical campus marketplace apps exists right now — Dormo, DormSy, DormDeal, rumie, Unilist, Plug, and a Northeastern student project (Dibs) — nearly all pitching the same trio you are: .edu verification, in-app chat, dorm goods + textbooks. Specific post-mortems for tiny campus apps generally don't exist publicly (they die too small to warrant a write-up), so "they died of empty feeds" is inference from category dynamics, not documented founder accounts. Names you may have heard — "DormItems," "Sable," "Sturr," "Reach" — could not be verified as real notable products; treat as unconfirmed.

**The most instructive death is Facebook's own.** Facebook launched **Campus** (.edu-only, college-only) in Fall 2020 and shut it in March 2022, concluding students are better served through ordinary Facebook **Groups**; reporting noted so little attachment that few users even commented on the loss ([TechCrunch](https://techcrunch.com/2022/03/02/facebook-is-shutting-down-its-college-student-only-social-network-campus/)). Even Facebook — with the .edu graph, unlimited money, and college-network DNA — could not make a fenced-off campus product stick against its own free Groups. **Yik Yak** (campus-native, ~$73M raised, shut 2017) is a reminder that campus-viral ≠ durable, and graduation churn (~25%+ of your users leave yearly) is a structural headwind ([EdSurge](https://www.edsurge.com/news/2021-02-05-first-came-juicycampus-then-yik-yak-now-new-anonymous-websites-are-growing-on-campuses)).

**Survivors won by not being single-campus generic marketplaces.** Wallapop (Spain) scaled on **hyperlocal geolocation** into a post-recession secondhand tailwind, reaching 19M+ MAU and a Naver acquisition — but note its roots are hyperlocal/city-scale, *not* campus ([TechCrunch](https://techcrunch.com/2023/01/18/wallapop-the-circular-marketplace-out-of-spain-raised-87m-more-at-a-832m-valuation-led-by-koreas-naver/)). Depop and Poshmark won on identity/community (Gen-Z fashion, social selling), not local generic goods. Kaiyo (secondhand furniture, $36M raised) abruptly wound down in 2024 — a warning that logistics-heavy secondhand is fragile, which your cash/in-person model correctly avoids, at the cost of capturing none of the logistics value ([Modern Retail](https://www.modernretail.co/operations/online-furniture-platform-kaiyo-says-it-will-wind-down-by-the-end-of-the-month-after-sellers-file-complaints/)).

**Incumbents students actually use — and which of your features they already have:**

| Platform | Campus/local scope | In-app chat | Bids/offers | Ratings | Local meetup | Buyer+seller | Mark-sold |
|---|---|---|---|---|---|---|---|
| FB Marketplace + campus Groups | Radius; Groups ≈ campus | Yes (Messenger) | Informal | Yes | Yes | Yes | Yes |
| GroupMe (class/dorm threads) | De-facto campus | It *is* chat | No | No | Implied | Yes | No |
| Depop | No (national) | Yes | Yes | Yes | Ship-first | Yes | Yes |
| Mercari | No | Yes | Yes | Yes | Ship-first | Yes | Yes |
| OfferUp | Yes (local core) | Yes | Yes | Yes | Both | Yes | Yes |
| Poshmark | No | Yes | Yes | Yes | Ship-first | Yes | Yes |
| Vinted | No | Yes | Yes | Yes | Ship-first | Yes | Yes |

Sources: [FB Marketplace help](https://www.facebook.com/help/1680504982210398), [OfferUp overview](https://www.apptunix.com/blog/how-does-offerup-work-business-and-revenue-model-revealed/), [Depop/Mercari/Poshmark/Vinted comparison](https://www.voolist.com/blog/poshmark-vs-mercari-vs-depop), [GroupMe on campus](https://www.theutcecho.com/features/what-role-does-groupme-play-at-utc/article_271e021a-954c-11ed-b54a-4fa2b9be8195.html). Every mechanic you'd build already exists in mature form somewhere; you are rebundling, not filling a missing capability. The one real gap none serve well is **verified, campus-scoped trust + structured listings** — but Facebook Campus proved that alone doesn't pull people off Groups.

**Swipe-for-commerce verdict (medium-high confidence, pattern-based not a controlled study):** a novelty that decays. The whole 2014 "Tinder-for-shopping" cohort is dead or pivoted — Mallzee pivoted to B2B analytics and its founder called the consumer concept a "horrible idea"; Kwoller/Stylect/Grabble/Polyvore left no durable footprint ([TechCrunch Mallzee](https://techcrunch.com/2014/05/22/mallzee-seed/), [FutureScot pivot](http://futurescot.com/shopping-app-mallzee-pivots-provide-retailer-intelligence/), [Fashionista roundup](https://fashionista.com/2014/05/tinder-for-fashion-apps)). Even the mechanic's advocates admitted the weak link was *conversion*, not swiping. Novelty-effect literature predicts exactly the "great week one, dead by week two" shape ([VWO](https://vwo.com/glossary/novelty-effect/)). There's a steelman — swipe can raise engagement/"cognitive absorption" *if* paired with frictionless checkout — but campus commerce is search-intent, and a swipe-only feed with weak search will frustrate your highest-converting users.

### 2) Liquidity and cold start

**How many listings before a swipe feed stops feeling empty? No reliable public number exists — this is the thinnest-evidence item here.** Liquidity is properly defined as "probability a buyer finds what they need," per *category*, not a raw total ([Point Nine](https://medium.com/point-nine-news/wtf-is-marketplace-liquidity-f2caca3802c0)). A loose analyst benchmark (~500 completed transactions in a geo/category cell before matching is reliable) comes from ride-share/SaaS marketplaces and shouldn't be ported directly. **Reasoned estimate (label: inference, low-medium confidence, instrument don't trust):** a swipe feed likely needs on the order of **150–400 active, visually distinct, in-category listings live at any moment on one campus** to avoid the "I've seen everything, this is dead" feeling in the first session; below ~100 it feels empty almost immediately. The important structural point: **swipe raises your liquidity bar vs. a search/list format**, which is an argument against leading with swipe on a cold campus.

**Feed exhaustion churns the one-sitting user.** A user who swipes all inventory and hits a wall is the textbook churn setup. Mitigations: **"wanted"/wishlist posts** so the catalog has demand entries even with no supply, and to notify buyers when supply lands ([Knock](https://knock.app/blog/how-to-inventory-notifications-marketplace)); **saved searches + reliable new-inventory push** (and reliability is a real wedge — Facebook's own alerts are notoriously flaky); **cross-category widening** and graceful "end of feed" states instead of a hard wall; and **rationing the feed** so daily returns still surface novelty.

**Cold-start playbook is a physical ground game.** Facebook went one campus at a time (Harvard → Yale/Columbia/Stanford). Tinder — the most transferable — ran **sorority parties at USC**, installed the app on every attendee's phone, then walked to the paired fraternity ([case study](https://medium.com/scott-d-clary/sorority-parties-to-50-million-users-the-tinder-go-to-market-strategy-marketing-case-study-9c003b48dc8d)). Seed the harder side (supply) manually before demand arrives; concentrate one node to density before expanding; expand sequentially, never simultaneously ([internetmango](https://internetmango.com/insights/marketplace-cold-start-strategy/)). **Your first 100 listings realistically come from:** (1) you personally listing dozens of real items; (2) intercepting move-out dumps; (3) hand-recruiting a seller cohort and listing *for* them on the spot; (4) migrating existing GroupMe/FB Group listings with permission.

**Seasonality dominates timing.** Fall move-in is the biggest *demand* spike (new/international/first-years furnishing a room in ~48 hours); spring move-out (Apr–May) is the biggest *supply* spike (curbside inventory floods in); textbooks spike each semester start; **summer is near-dead for a single-campus app** ([Lugg move-out guide](https://lugg.com/blog/this-is-actually-the-ultimate-college-dorm-move-out-guide)). **Ideal launch: seed supply at spring move-out (Apr/May), capture demand at fall move-in (Aug/Sep).** Launching mid-semester misses both peaks and hits thin liquidity when the feed can least afford to look empty. Plan for a dead summer explicitly.

### 3) Verification and identity

**`.edu` email verification proves one thing: control of a mailbox on an institution's domain at one moment.** It says nothing about current enrollment. SheerID states plainly that a `.edu` email "confirms domain access but does not reliably confirm active enrollment" ([SheerID](https://www.sheerid.com/business/blog/prevent-student-offer-abuse-replace-edu-email-verification/)). The `.edu` TLD (administered by EDUCAUSE for accredited US institutions) maps to an *institution*, never to a *person's role*, and is US-only.

**Where "domain = university" breaks:**
- **Multiple domains/subdomains per school** directly threatens your same-university hard filter. UCLA users have both `@ucla.edu` and `@g.ucla.edu` plus departmental subdomains; a naive exact-match hides `alice@ucla.edu` from `bob@g.ucla.edu`. You need a **hand-maintained institution → {domain set} mapping** plus an appeals/override path from day one (the clean algorithm is inferred, not a cited reference).
- **Community colleges** hold valid `.edu` but are 2-year; the domain doesn't encode institution type.
- **Alumni are the biggest leak** — many schools keep `@university.edu` (or forwards) alive for years or life. A widely-cited 2017 study found ~51% of alumni keep their `.edu` indefinitely and ~1 in 5 use it to claim student benefits ([GlobeNewswire](https://www.globenewswire.com/fr/news-release/2017/05/02/975477/0/en/Study-Illustrates-Vulnerability-in-Digital-Email-Verifications.html); figures dated, verify).
- **Staff/faculty, retirees, admitted-not-enrolled applicants, dual-enrolled high schoolers** all commonly sit on the same domain — so "everyone here is a peer student" is quietly false.
- **International students / non-`.edu` institutions** (`.ac.uk`, `.edu.au`, ccTLDs) are excluded by a hard `.edu` requirement; any overseas expansion needs per-country domain lists.

**Roll-your-own vs third-party:**

| | DIY `.edu` email | SheerID | UNiDAYS / Student Beans |
|---|---|---|---|
| Proves | Mailbox ownership only | Current enrollment (authoritative data) | Enrollment (email + card + registry) |
| Fraud resistance | Low | High | Medium-high |
| Cost | ~Free | Enterprise; no public pricing (aggregator estimates ~$25k–$150k ACV — treat as rumor, get a quote) | Tiered |
| Re-verification | You build it | ~11-month best practice | Annual |

SheerID publishes no public pricing ([pricing = contact form](https://www.sheerid.com/pricing/)); the dollar figures are aggregator estimates ([Vendr](https://www.vendr.com/buyer-guides/sheerid)) and should not be relied on.

**Abuse vectors:** alumni reselling/self-dealing; a real **black market in `.edu` emails** driven by the ~$12k+ GitHub Student Developer Pack (GitHub itself moved away from `.edu`-only verification because of it — [GitHub](https://github.blog/developer-skills/career-growth/how-to-get-the-github-student-developer-pack-without-a-student-id/)); account sharing/scalping that email verification does nothing against. **Re-verification cadence:** "never" is how alumni leak in; per-semester is highest-integrity but high-friction; **annual (~11-month) re-verification is the industry norm** and a sensible v1 target — it sheds graduates within a year and matches what students already tolerate for Spotify/Prime Student.

**Bottom line:** `.edu` email is fine as a *cheap first gate* for v1, but treat it as weak. The same-university filter is only as good as your hand-maintained domain map. Budget for annual re-verification and an override/appeals path. Don't claim "students only" as a safety guarantee — it isn't one.

### 4) Trust, safety, and physical meetups

**Frame it honestly: your core loop is "pair two strangers → send them to meet with cash," the highest-physical-risk primitive in consumer software.** Campus scoping cuts some fraud (fewer overseas bots) but *raises* harassment/stalking risk (real names, faces, locatable people).

**Scams (who's targeted — Buyer/Seller):** counterfeit goods [B]; **counterfeit cash** [S] (the one that bites hardest in a cash-only v1 — students won't check bills); overpayment and **digital-payment reversal** even in "cash" deals [S] (buyers improvise Zelle/Venmo at the meetup; Zelle is near-irreversible; your "cash-only" claim is aspirational and you'll get blamed); bait-and-switch [B]; "is this available" phishing [S]; the **Google Voice verification-code scam** which specifically targets sellers ([FTC](https://consumer.ftc.gov/consumer-alerts/2021/10/google-voice-scam-how-verification-code-scam-works-how-avoid-it)); and the serious one — **robbery/violence via meetup.** ProPublica tied at least 13 homicides to Facebook Marketplace transactions plus numerous armed robberies and serial "lure" schemes ([ProPublica](https://www.propublica.org/article/facebook-grew-marketplace-to-1-billion-users-now-scammers-are-using-it-to-target-people-around-the-world), [ABC13](https://abc13.com/post/facebook-marketplace-scheme-robbery-suspects-large-least-15-victims-lured-social-media-police-say/15596986/)). Both roles get hurt: buyers carrying cash get robbed; sellers get strangers sent to their dorm.

**Harassment via auto-opened chat** is a documented, gendered pattern (women selling clothing hit with escalating "offers," fetish requests, propositions — [Tyla](https://www.tyla.com/style/fashion/warning-women-facebook-marketplace-selling-clothes-866030-20240411); eBay sellers told the platform can't stop messages — [eBay community](https://community.ebay.com/t5/Selling/Inappropriate-Messaging-from-Buyer/m-p/27657042)). On a real-name campus a harasser can often identify the target IRL, so unwanted contact escalates to stalking with near-zero effort. (Prevalence is anecdotal; no hard rates found.)

**Risk profile and your benchmark for "reasonable care":** OfferUp responded to real killings by launching **Community MeetUp Spots** (grew to ~1,900 monitored/lit locations) and disclaiming liability in its Terms; marketplaces have been *sued* over real-world violence regardless of ultimate outcome ([PRNewswire](https://www.prnewswire.com/news-releases/offerups-community-meetup-spots-program-grows-to-nearly-1-900-locations-across-the-us-300854777.html), [Insurance Journal](https://www.insurancejournal.com/news/west/2022/04/18/663560.htm)). For a solo founder, **being sued is itself the harm** (cost, discovery, reputation, app-store fallout), and reputational risk is asymmetric and fast — local/campus press will name the app and you. You are also a single point of failure at 2am; "the founder was busy" is not a defense.

**Campus safe-exchange zones are real and are your best safety lever.** Documented university police safe-exchange/transaction zones (CCTV, lit, often 24/7) exist at Cleveland State, Auburn, CU Boulder, Michigan, Nebraska, Yale, UIC, Buffalo State, and many more ([CSU](https://www.csuohio.edu/police/safe-transaction-zone), [UMich](https://dpss.umich.edu/services/safe-exchange-zone/)). Realistic path for a solo student founder: **integrating the existing zone as the default suggested meetup costs nothing and needs no permission — do it now.** Getting *listed* alongside campus PD messaging is a plausible medium ask. A *formal* Dean-of-Students endorsement or "official app" status is likely a bureaucratic dead-end for v1 (universities won't put their name on a stranger-meetup app they don't control). **Treat safe zones as a feature you integrate, not a partnership you need.**

**Moderation queue for a one-person op** must lean on automation + hard prioritization, because you can't offer a fast human SLA. Report action on every surface (listing, profile, **individual chat message**); short safety-first categories (physical threat → sexual harassment → scam → prohibited item → harassment → stolen → spam); safety reports page you immediately, the rest are a daily/48–72h batch. **Load-bearing automated tripwires:** keyword flags (weapons, drugs, threats, "Zelle/Venmo," "verification code"), rate limits (new-contact messages, offers, listings per hour), **auto-hide on N distinct reports** so bad content dies while you sleep, and new-account throttles. Instant mutual block, evidence retention (snapshot thread/listing/IDs/timestamps for a fixed 90–180 day window), and a pre-decided police-escalation path (advise 911/campus PD, preserve evidence, don't play detective). EU DSA / UK OSA likely don't reach a single-US-campus app, but their design norms (easy reporting, illegal-content removal, appeals) are now app-store table stakes — build to them.

**Draft campus prohibited-items list** (ban categorically unless noted; several also protect your *app-store survival*):
1. **Alcohol** — underage user base; stores bar apps encouraging alcohol sale to minors.
2. **Tobacco / vapes / nicotine** — **Google Play flatly prohibits facilitating sale**; can get the Android build removed ([Google](https://support.google.com/googleplay/android-developer/answer/9878810)).
3. **Prescription/controlled substances + bulk OTC/supplements** — illegal diversion (incl. ADHD stimulants); high priority.
4. **Weapons — ban all categorically** (guns/ammo hard-ban; knives/tasers/pepper spray vary by school/state — simpler and safer to ban all than track blade-length rules).
5. **Recreational drugs & paraphernalia (incl. cannabis)** — Play prohibits marijuana-sale facilitation regardless of local legality.
6. **Event tickets / scalping** — anti-scalping law varies wildly by state; a solo op can't track 50 states — prohibit resale, or cap at face value with a disclaimer (also fraud-heavy).
7. **Subletting / housing / leases** — landlord-tenant + fair-housing + deposit-fraud minefield; prohibit v1.
8. **Meal swipes / dining dollars / campus cash** — nearly universally non-transferable per meal-plan terms; facilitating it puts you crosswise with the university you depend on ([UChicago terms](https://dining.uchicago.edu/meal-plans-and-faqs/meal-plans-terms-and-conditions)).
9. **Academic materials that enable cheating** (essays, test banks, answer keys) — contract cheating; reputational poison with the administration. Allow legitimate textbooks.
10. **Recalled items; live animals; gift cards/financial instruments/crypto; counterfeit/replica goods; adult content/services; stolen goods** — safety, fraud, IP, and (adult content) app-store-rating reasons.

### 5) The auto-opened chat and anonymity model

Auto-opening a DM the instant a buyer bids collapses "expressing purchase intent" into "obtaining a private channel to a specific person" — the exact mechanic abusers exploit (§4). Marketplaces make chat buyer-initiated but *not* consent-gated; their safety net is reactive (block, report, auto-grey the message button when sold). **Dating apps gate messaging before contact** — Bumble/Hinge require the recipient to reply/acknowledge before a conversation opens. The transferable primitive is **seller-side accept before the chat opens**, treating a bid like a connection request.

**What you lose with accept-first:** friction, slower time-to-first-message, fewer total conversations, worse cold-start conversion (auto-open exists on big marketplaces precisely because frictionless contact maximizes GMV). Magnitude is uncertain/inferred. **What you gain:** spam/harassment bids cost the abuser something and can be declined before any channel opens; sellers get consent and control; the DM-backdoor vector largely closes; threads carry higher intent. **Recommendation for v1:** don't auto-open. Make a bid a structured action (price + optional *fixed-length preset* note, not free text); open chat only on seller accept/counter. Rate-limit bids per buyer per seller. Ship block/mute/report/archive alongside as table stakes. Revisit auto-open later only if data shows the accept step is strangling liquidity.

### 6) Marking things sold

**How incumbents handle staleness:** all use a **time-based clock as backstop + explicit human "sold/delete" as the accurate signal** — none infer "sold" from chat content. Craigslist auto-expires (~30 days most categories), no mark-sold ([Craigslist FAQ](https://www.craigslist.org/about/help/faqs/lifespan)); Facebook ~7-day listings with renewals + explicit "Mark as sold," and the known failure mode is sellers forgetting to mark sold; OfferUp keeps items until sold/deleted but auto-removes inactive after ~30 days, with free bumps; Mercari sinks stale listings so sellers relist, and uses Smart Pricing drops to re-notify likers. (Exact windows are secondary-sourced — verify against each help center.)

**The accuracy problem with inferring sold from chat text:** false positives ("I'll take it" / "meet at 5" constantly appear in deals that never close — on campus "I want it" is low-commitment); false negatives (cash/in-person settles off-app with no confirming message); and **privacy/legal exposure** — scanning DM content risks federal Wiretap Act/ECPA and state analogs, and courts are *expanding* wiretap liability for content interception ([Frankfurt Kurnit](https://technologylaw.fkks.com/post/102mk4t/courts-expand-ecpa-wiretapping-liability-through-crime-tort-exception)); it's also a toxic user-perception signal (see the Meta-DM backlash). **Defensible low-effort version (do this):** (1) explicit **"Mark as sold"** button on the listing and in the thread; (2) **time-based nudges** starting ~14 days ("Still available? Keep / Mark sold / Remove") as a scheduled job; (3) a **lightweight post-chat prompt to the seller only** ("Did this sell?") triggered by *metadata* (thread goes quiet after activity, or a scheduled meetup time passes) — never by reading message bodies. This captures off-app cash sales at near-zero build cost and zero DM-scanning risk. **If you ever analyze content,** your privacy policy must disclose that content is processed, for what purpose, retention, any third-party/AI processor, that both parties' messages are processed (two-party-consent states), and an opt-out — with explicit signup consent. Get counsel; the case law is unsettled.

### 7) Seller analytics

**What sellers act on (vs vanity):** impressions/search appearances (discoverability → fix title/photo/category), CTR (thumbnail/price/title), conversion (the money metric), **watchers/saves + no sale** (interest exists but price blocks → drop price), offers received (→ counter), response time, and price-drop→visibility loops ([eBay Seller Hub metrics](https://crazylister.com/blog/ebay-seller-hub-metrics-to-measure/), [Sellbrite](https://www.sellbrite.com/blog/ebay-sales-conversion-rate/)). **Vanity/weak:** raw likes (a Depop listing can get instant likes and zero buyers while the same item sells full-price on Poshmark with fewer likes).

**Proposed seller dashboard — 4–5 metrics, each paired with a next action:**

| Metric | Framing | Why |
|---|---|---|
| Impressions | "Seen by 120 students this week" | Discoverability; low → fix title/photo/category |
| Saves/interest | "8 people saved this" | Interest signal; feeds the price nudge |
| Chats opened | "3 people messaged you" | Real intent, closer to conversion |
| Days listed + age nudge | "Listed 15 days — items usually sell in week one. Drop price or refresh?" | Turns staleness into action |
| Price suggestion | "Similar items sold for $X" (once you have data) | Actionable pricing |

**Deliberately withhold:** raw **swipe-left/pass counts** (demoralizing and ambiguous — a left-swipe often means "wrong category," not "bad item"); absolute conversion on tiny denominators (suppress percentages until ≥~20 views); competitor/leaderboard comparisons early (gameable, discouraging); watcher identities (privacy).

### 8) Ratings

**The research is the strongest-evidence part of this report.** Reputation *inflation* is real and corrosive: across five marketplaces over 10+ years, average ratings drift upward without rising satisfaction, because raters feel social pressure not to harm the rated party — "reputation systems sow the seeds of their own irrelevance" ([Filippas, Horton, Golden — NBER w25857](https://www.nber.org/system/files/working_papers/w25857/w25857.pdf)). Bias comes from socially-induced reciprocity; Airbnb's **simultaneous double-blind reveal** (neither party sees the other's review until both submit or a deadline passes) reduced strategic/retaliatory reviewing ([Fradkin, Grewal, Holtz](https://andreyfradkin.com/assets/reviews_paper.pdf)). eBay **removed sellers' ability to leave negative feedback for buyers in 2008** precisely because retaliation scared off honest reviews.

**What a rating even means for cash/off-platform deals:** you can't confirm the transaction happened (no payment/shipping record), so you're really rating a *meetup interaction* (showed up, item as described, wasn't sketchy). Two consequences: users can fabricate deals to farm ratings (gate eligibility on observable app signals — a chat thread + accepted bid + both-sides "mark sold/bought" — not on claimed money changing hands), and don't over-promise ("meetup feedback," not "verified buyer review").

**Recommendation:** (1) **double-blind simultaneous reveal** (best-supported single choice); (2) **coarse signal, not 5 stars** ("Would you deal with them again? 👍/👎" + optional tags: on time, as described, friendly) because inflation crushes 5-star scales into a meaningless 4.8–5.0 band and coarse scales survive low volume; (3) make **seller→buyer direction positive-only or private** (where retaliation historically lived); (4) show **count of positive completed deals** ("12 successful meetups") rather than a fragile average, and hide any ratio until a minimum N (~5); (5) lean on **.edu verification + completed-meetup count** as the primary trust signal early; (6) **log raw data even if you don't display it.**

### 9) Gamification with prizes

**This is the highest-legal-risk feature in the app.** An illegal lottery = **prize + chance + consideration**; remove any one and it's generally legal (a *sweepstakes* removes consideration via free entry; a *contest* removes chance via skill). Only state lotteries may have all three. Two traps for your token idea: **chance** creeps in via any randomness (mystery boxes, spin-to-win, random drops, sweepstakes-entry rewards); and **consideration** is the element that bites — courts/AGs have found even non-monetary effort can count, and **tokens earned by *selling activity* arguably look like consideration** (real effort + transacting to become eligible). If chance is layered on top, a regulator could call the whole thing an unregistered lottery. Purely deterministic (hit X tokens → guaranteed defined prize, no randomness) reads more like a **loyalty/rebate reward** — the safer structure, still subject to loyalty-program/unfair-practices review. Sources: [Social Media Law Firm](https://thesocialmedialawfirm.com/blog/sweepstakes-law/the-three-elements-of-an-illegal-lottery-prize-chance-and-consideration/), [Holland & Knight](https://www.hklaw.com/en/insights/publications/2022/05/marketers-beware-your-social-media-sweepstakes-or-contests-could-be).

**If any chance element ships:** aggregate prize pools over ~$5,000 trigger **registration + surety bond in NY and FL** (RI retail-specific), plus **Official Rules, "No Purchase Necessary," and an equal-dignity AMOE** ([RallyUp](https://rallyup.com/learn/understand-sweepstakes-registration-and-bonding-2/)). Note the tension: an AMOE means non-sellers must be able to win equally, which undercuts "reward sellers" — a strong signal to structure as a **deterministic, no-chance loyalty reward** and sidestep sweepstakes law. **Ohio:** ORC Ch. 2915 defines a "scheme of chance" as consideration for a chance to win ([ORC 2915.01](https://codes.ohio.gov/ohio-revised-code/section-2915.01)); keep consideration OR chance out. Watch **ORC 1333.91** (pyramid) — keep rewards tied to real sales, not recruiting other users.

**Does it actually drive supply?** Evidence is mixed and mostly from loyalty literature (thin for campus marketplaces). Reward programs are heavily exploited by fake accounts, bots, and farming; for token-for-selling the analog is **fake/wash listings and sham sales between colluding accounts to farm tokens**, which pollutes your supply metrics rather than creating real inventory ([Open Loyalty on loyalty fraud](https://www.openloyalty.io/insider/loyalty-fraud)). Expect activity that *looks like* supply but includes meaningful fraud. **Recommendation: defer prizes from v1; if you ship them, deterministic-only, no chance, no token-selling, with counsel review and collusion detection.**

### 10) Legal and policy

*(Research to hand to counsel, not advice; statute cites may be imprecise — verify.)*

**Section 230** shields you from most claims based on *users' content* (listings, chat, ratings) and your moderation decisions ([CRS R46751](https://www.congress.gov/crs-product/R46751)). It does **not** cover your own conduct/content, federal criminal law, IP claims (hence DMCA), FOSTA-SESTA (sex-trafficking), or **product-liability/negligent-design theories** — the real erosion. *Lemmon v. Snap* (9th Cir. 2021) let a negligent-*design* claim proceed past 230; *Bolger v. Amazon* (Cal. 2020) held a marketplace strictly liable for a defective third-party product because it was in the distribution/payment chain. **Your best protection is factual distance from Bolger:** you never touch money or goods — you only introduce two students. The more plausible vector is **Lemmon-style negligent design** (a swipe UI / gamification that pushes strangers to risky meetups); not a plaintiff slam-dunk, but the theory that sidesteps 230, which is exactly why safety-by-design matters. Don't treat "I'm just one founder" as a shield. **Risk-shifting that helps:** neutral-venue disclaimers, assumption-of-risk + "meet safely" warnings, limitation of liability, arbitration + class waiver (enforceability varies — verify under Ohio + FAA), user indemnification (often uncollectable). Disclaimers reduce but don't eliminate tort exposure and can't bind injured non-users. **Get an LLC and insurance quotes — often more protective than contract language.**

**ToS must-haves:** acceptable-use/prohibited items tied to your removal workflow; conduct rules + no-tolerance for objectionable content/harassment; disclaimers + limitation of liability; arbitration + class waiver; **registered DMCA agent** (register with the Copyright Office, renew every 3 years, or lose the §512 safe harbor); termination/suspension rights; an App Store **EULA**; and the UGC controls the stores require (report, block, filter, published contact, in-app account deletion).

**Privacy policy:** disclose `.edu` email, device/meetup location, chat content, ratings, identifiers. **CCPA/CPRA** generally applies only above thresholds (~$26.6M revenue, or PI of 100,000+ CA consumers/devices, or ≥50% revenue from selling PI) — a new campus app is almost certainly under, and likely under other state laws too, but **write to good practice anyway** because the stores require a policy regardless. Analyzing chat content changes disclosure duties (wiretap/two-party consent) — verify.

**COPPA and the 17-year-old first-year problem:** COPPA currently governs under-13 data; some incoming freshmen are **17 (minors, but over 13)**, so classic COPPA usually won't apply *if* you keep under-13s out — but **COPPA 2.0** (in flux, verify status) proposes raising the age to under 17, which would sweep in 17-year-old freshmen. Use a **neutral date-of-birth age gate**, set the age rating accordingly, and **seriously consider gating the app to 18+** to sidestep the minor-data + marketplace + in-person-meetup combination entirely. This is a "get counsel now" item.

**INFORM Consumers Act — likely OUT of scope, with real ambiguity.** It burdens "online marketplaces" re: "high-volume third-party sellers" (**≥200 transactions AND ≥$5,000 revenue in 12 months**), but **only sales for which the marketplace/its processor processed payment count** toward the threshold ([FTC](https://www.ftc.gov/business-guidance/resources/what-third-party-sellers-need-know-about-inform-consumers-act)). Since you never process payment, no seller can cross the revenue prong — a strong argument you're effectively unburdened. The "online marketplace" definition is broad, so you might be *in-definition but with no high-volume sellers*; don't assume categorical exemption, but the payment-processing language is a solid out. Verify with counsel.

**University names/logos/mascots — real, easy-to-trip exposure.** Schools aggressively license marks; Ohio State requires prior written permission and prohibits implying endorsement ([OSU Trademark & Licensing](https://trademarklicensing.osu.edu/page/about-us)). Using "[University] Marketplace," school colors + mascot, or anything implying endorsement risks trademark infringement + false-association claims. **Use a neutral brand, let users self-select their school from a list, and add a conspicuous "not affiliated with / endorsed by any university" disclaimer.** Nominative reference to a school's *name* to describe scope is more defensible than adopting its marks. Campus **solicitation policies** mostly restrict *how you market on campus* (no tabling/flyering/dorm-email without approval), not your right to operate — realistic risk **low-to-moderate**, likeliest consequence a cease-and-desist over branding.

### 11) App Store and Play Store review

**Apple Guideline 1.2 (UGC safety)** is the #1 marketplace/social rejection reason and requires all five: (1) content filtering, (2) in-app reporting with timely response, (3) block abusive users, (4) published contact, (5) act on reports — the cited standard is **removing content and ejecting the offender within 24 hours** ([Apple guidelines](https://developer.apple.com/app-store/review/guidelines/)). **Guideline 5.1.1(v):** in-app account deletion (deactivation-only is insufficient). **EULA** required. **Age rating:** a swipe UI + open UGC + chat + possible mature listings typically pushes to **17+ / higher maturity** under Apple's system and Google's IARC questionnaire — rate honestly (under-rating UGC/chat gets apps pulled), and note the tension with allowing 17-year-old users. **Google Play** mirrors the UGC requirements and also requires account deletion (in-app + web URL) and a Data Safety form matching your privacy policy.

**IAP — confirmed:** physical goods sold peer-to-peer are **outside** the Apple/Google in-app-purchase requirement and **must not use IAP**. Your cash/in-person, no-in-app-payment v1 is cleanly outside IAP. Don't accidentally add an in-app digital purchase (e.g., **selling tokens for cash** would flip that into IAP territory *and* worsen the sweepstakes "consideration" analysis — avoid).

**Pre-submission checklist (both stores):** content filtering (listings + chat); report button on every listing/chat/profile; block user; published contact; documented 24-hour takedown + ejection workflow; in-app account deletion (Apple 5.1.1(v); Google in-app + web); EULA; honest age rating; privacy policy URL + accurate Apple privacy labels / Google Data Safety (chat, location, email, identifiers); **no IAP** for goods; "not affiliated with [university]" disclaimer, no unlicensed marks; reviewer demo account + notes explaining `.edu` verification and the cash/in-person model; if gamification ships with any chance element, official rules / no-purchase-necessary language.

### 12) Features you haven't prioritized (ranked by impact vs solo-dev effort)

| Feature | Effort | Impact | Note |
|---|---|---|---|
| Explicit mark-sold + stale nudges | Low | High | Feed accuracy; universal incumbent pattern |
| **Free/giveaway section** | Low | High | Cheapest liquidity hack; "free stuff" is a proven supply+engagement magnet on campus |
| Category taxonomy | Low-Med | Med-High | Enables search/filter/saved-searches; low CTR is often a category problem |
| Search + filters | Med | High | Serves the high-intent buyer the swipe feed frustrates |
| Saved searches & alerts | Med | High | Turns exhausted/one-time users into returners; reliability beats FB's flaky alerts |
| Counteroffers | Med | Med-High | Core conversion mechanic on Poshmark/Mercari/OfferUp |
| Listing bumps | Low | Med | Standard staleness fix |
| Reserve/hold state | Low | Med | Reduces double-selling and ghosting in cash deals |
| Meetup scheduling (to safe zone) | Med | Med | Serves in-person v1; safety upside; reduces flake |
| "Wanted"/requests board | Med | Med (uncertain) | Demand capture softens cold-start; unproven at campus scale |
| Price guidance | Med (needs data) | Med | Actionable once you have sold-price density |
| Bundles | Med | Low-Med | Niche for v1 |
| Cross-campus expansion | High | High-later / Low-now | Dilutes the campus trust moat; premature pre-liquidity |

### 13) Instrumentation (log from day one)

**Events:** `signup_completed`, `edu_verified`, `listing_created` (category, price, has_photo), `first_listing_created`; `feed_impression`, `swipe_right`/`save`, `swipe_left`/`pass`, `listing_detail_view`, **`feed_exhausted`**, `search_performed`, `saved_search_created`, `alert_sent`/`alert_opened`; `bid_made`, `bid_accepted`, `chat_opened`, `first_message_sent`, `message_reply` (+ time-to-reply), `counter_made`, `meetup_scheduled`, `mark_sold`, `mark_bought`, `sold_confirmed_both_sides`, `rating_submitted`; session events for D1/D7/D30 cohorts.

**"It's working" metrics:** activation (% new users who create OR save a listing in session 1; % completing a first transaction within 7 days — the strongest retention predictor); **liquidity as the single best health metric** — sell-through rate (% of listings sold within N days), time-to-first-transaction, and buyer:seller balance ([Point Nine](https://medium.com/point-nine-news/wtf-is-marketplace-liquidity-f2caca3802c0)); funnel rates (view→chat, chat→reply, reply→meetup, meetup→sold); swipe depth/session; D1/D7/D30 retention (D7 is the earliest reliable predictor of D30).

**Leading indicators of FAILURE:** high **feed-exhaustion rate** (watch first — supply starving the swipe format); low sell-through (listings pile up unsold → sellers churn next); falling listings-per-active-seller / new-listings per day; chat-open but low reply rate or high time-to-reply (ghosting kills trust); skewed buyer:seller ratio; D1 below ~15–20%; rising share of listings marked sold via *timeout/nudge* rather than active mark (deals dying off-app or listings abandoned).

---

## 3. Decision Table

| Decision | Options | Tradeoff | Recommendation |
|---|---|---|---|
| Lead UX | Swipe-only vs swipe + first-class search/filters | Swipe = novelty/delight but low-intent and raises liquidity bar; search serves high-intent buyers | **Swipe as top-of-funnel; search, filters, categories first-class.** Don't bet retention on the gesture. |
| Bid → chat | Auto-open chat vs seller-accept-first | Auto-open maximizes conversations/GMV; accept-first cuts harassment/spam | **Seller-accept-first**, structured bid (price + preset note), block/report from day one. Revisit if data shows it strangles liquidity. |
| "Sold" detection | Explicit + metadata nudges vs chat-content NLP | NLP has false pos/neg + wiretap/privacy risk | **Explicit mark-sold + time nudges + metadata-triggered seller prompt. No content scanning in v1.** |
| Identity | DIY `.edu` email vs SheerID/third-party | DIY ~free but weak; SheerID strong but enterprise-priced | **DIY `.edu` for v1** as a cheap gate + hand-maintained domain map + **annual re-verification**; reassess third-party if fraud/alumni leakage bites. |
| Ratings | 5-star average vs coarse 👍/👎 double-blind | 5-star inflates to noise; coarse survives low volume | **Coarse 👍/👎 + tags, double-blind simultaneous reveal, positive/private seller→buyer, show completed-deal count not average.** |
| Gamification prizes | Ship now / deterministic-only / defer | Prizes may drive farming + lottery/sweepstakes exposure | **Defer from v1.** If shipped: deterministic, no chance, no token-selling, counsel review, collusion detection. |
| Age gating | 18+ only vs allow 17-year-olds | 17-year-olds are minors (COPPA 2.0 risk) + minors-meeting-strangers sensitivity | **Strongly consider 18+ gate** via neutral DOB; if allowing 17, minimize their data, no targeted ads, re-check COPPA 2.0. Counsel decision. |
| Branding | "[University] Marketplace" vs neutral brand | School marks = trademark/endorsement exposure | **Neutral brand + self-select school + "not affiliated" disclaimer.** |
| Meetup safety | Nothing / integrate safe zone / seek official partnership | Partnership is slow/uncertain; integration is free and unilateral | **Integrate the existing campus police safe-exchange zone as default meetup now;** pursue listing-alongside-PD as a bonus; don't gate launch on official endorsement. |
| Entity/insurance | Sole proprietor vs LLC + insurance | Solo founder personally exposed to tort/reputational risk | **Form an LLC and price E&O/general liability before launch.** |
| Launch timing | Mid-semester vs seasonal | Mid-semester hits thin liquidity; seasonal rides supply→demand | **Seed supply at spring move-out, capture demand at fall move-in.** Plan a dead summer. |

---

## 4. Prioritized Feature List

**Must-have for v1** (safety + liquidity + store-approval floor):
- `.edu` signup + verification + hand-maintained same-university domain map + appeals path
- Listing creation (photos to R2, name, price, condition, meetup location) + category taxonomy
- Swipe feed **plus** search + filters
- Structured bid → **seller accept** → chat (not auto-open)
- Instant mutual **block**, **report** on listing/profile/**message**, **archive/close thread**
- Automated tripwires: keyword flags, rate limits, **auto-hide on N reports**, new-account throttles
- Explicit **mark-sold** + time-based stale nudges (no content scanning)
- Default meetup = **campus safe-exchange zone**, plus in-app safety guidance
- **Free/giveaway section** (cheap liquidity)
- In-app **account deletion**, ToS/EULA, privacy policy, published contact, honest age rating, no IAP
- Neutral brand + "not affiliated" disclaimer
- Day-one instrumentation (events above)

**v1.5** (retention + conversion once one campus shows life):
- Saved searches + reliable new-inventory push
- Counteroffers; reserve/hold state; listing bumps
- Coarse double-blind ratings + completed-deal count
- Seller dashboard (impressions, saves, chats, age-nudge, price hint)
- Meetup scheduling to the safe zone

**Later** (only after one campus is liquid):
- Price guidance (needs sold-price density); bundles; "wanted"/requests board
- Card payments (architecture shouldn't foreclose — but adding in-app payment reopens IAP, INFORM Act, and Bolger-style liability questions; revisit deliberately)
- Deterministic, counsel-reviewed rewards (if at all)
- Cross-campus expansion

---

## 5. Risk Register

| Risk | Likelihood | Severity | Mitigation |
|---|---|---|---|
| **Empty-feed cold-start failure** (the category killer) | High | High | Manual supply seeding; seasonal launch (spring-seed→fall-capture); free section; concentrate one campus to density; instrument feed-exhaustion first. |
| **Physical harm at a meetup** tied to your app | Low-Med | Catastrophic (product- and founder-ending) | Default safe-exchange zone; safety education; block/report; LLC + insurance; assumption-of-risk Terms; pre-decided police-escalation path. |
| **Harassment via chat/bids** (esp. gendered, real-name campus) | Med-High | High | Seller-accept-first; structured bids; instant mutual block; message-level reporting; rate limits; don't expose exact location/full legal name. |
| **Swipe novelty decays; no retention** | High | Med-High | Treat swipe as delight, not engine; first-class search/saved-searches/alerts; "wanted" posts. |
| **Sole-moderator overwhelm / slow safety response** | Med | High | Automated tripwires + auto-hide on N reports; safety-first triage; honest (not over-promised) SLA; push/SMS alerts for category-1 reports. |
| **Chat-content "sold" analysis → wiretap/privacy exposure** | Low (if avoided) | High | Don't scan content in v1; use explicit + metadata signals; if ever scanning, disclose + consent + counsel. |
| **Real-prize gamification → lottery/sweepstakes violation** | Med (if shipped) | High | Defer; deterministic-only, no chance, no token-selling; NY/FL registration if any chance element; counsel review. |
| **App Store/Play rejection** (UGC 1.2, account deletion, age rating) | Med | Med (delay) | Build all five UGC controls + deletion pre-submission; honest rating; reviewer demo notes; no IAP for goods. |
| **`.edu` identity leakage** (alumni/staff/bought emails) | High | Med | Annual re-verification; domain map; don't market "students-only" as a safety guarantee; watch for account-sharing. |
| **Minor (17-yo) users + marketplace + meetups** | Med | Med-High | Strongly consider 18+ gate; if not, minimize data, no targeted ads; re-check COPPA 2.0; counsel. |
| **University trademark / solicitation friction** | Low-Med | Low-Med | Neutral brand + disclaimer; self-select school; avoid marks/mascots; follow campus marketing rules. |
| **Negligent-design / product-liability theory** (Lemmon/Bolger) | Low | High | Never touch money/goods (factual distance from Bolger); safety-by-design; disclaimers; LLC + insurance. |
| **Digital-payment fraud despite "cash-only"** | Med | Med | In-app warnings (no Zelle/Venmo at meetup, no "verification codes"); scam-education; don't imply the app secures payment. |
| **Summer/graduation churn** | High | Med | Seasonal expectations; re-engagement at move-in; plan runway around a dead summer. |

---

## 6. Open Questions (and what would resolve them)

1. **How many active listings does *your* swipe feed need to not feel empty?** No reliable public number; the 150–400 estimate is inference. *Resolve by:* instrumenting `feed_exhausted` and session depth in a single-campus soft launch and watching where retention breaks.
2. **Does seller-accept-first actually strangle liquidity, and by how much?** Magnitude is inferred from marketplace-design consensus. *Resolve by:* A/B or staged test of accept-first vs auto-open once you have baseline volume.
3. **Do tokens earned by selling constitute "consideration" (lottery law)?** Genuinely unsettled for activity-earned tokens. *Resolve by:* a promotions/sweepstakes attorney before building any prize feature.
4. **Exact NY/FL sweepstakes thresholds, deadlines, bond mechanics, and the precise Ohio prize-disclosure section.** Least-confident numbers. *Resolve by:* counsel / current statute text.
5. **INFORM Act "online marketplace" reach for a zero-payment platform.** Strong out via payment-processing language, but not litigated for this model. *Resolve by:* counsel.
6. **COPPA 2.0 status/effective date** and whether it now covers 17-year-old freshmen. Actively changing. *Resolve by:* current-law check + counsel at build time.
7. **SheerID real pricing** and institutional coverage for your target schools. Public numbers are aggregator guesses. *Resolve by:* a direct quote.
8. **How hard is an official campus-police / student-affairs partnership at your specific school?** Inferred as slow/uncertain. *Resolve by:* one conversation with the campus PD community-outreach officer.
9. **Alumni-email leak rate at your target campus** (does it kill lifetime email? how long do addresses stay live?). *Resolve by:* your school's IT/alumni email policy.
10. **Does gamification create real supply or farmed activity in a campus context?** Evidence is loyalty-general, not campus-specific. *Resolve by:* if piloted, instrument for wash-listing/collusion before scaling.

---

*Sourcing note: this report synthesizes five parallel research passes against primarily secondary and some primary sources. The strongest-evidence sections are ratings (Filippas/Horton/Golden; Fradkin/Grewal/Holtz — primary papers) and the instrumentation framework. The weakest are exact single-campus liquidity numbers, incumbent expiry-window specifics, and campus-app post-mortems (largely unavailable — inferred from category patterns). Legal/statute cites and app-store policy details should be verified against primary sources and licensed counsel before you rely on them; several are in active flux as of August 2026.*
