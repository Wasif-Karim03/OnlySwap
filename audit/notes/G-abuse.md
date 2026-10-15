# G Abuse
Rate limits (private.hit) per write RPC
listings: reserve_listing_id 30/d; create_listing 20/d, new acct 3/d; wanted 5/d; food 3/d; update_listing 50/d; set_listing_share_image 30/d
news: create_news 3/d (0215:133)
offers: make_offer 10/h (campus configurable) + new acct 5/d; counter_offer 30/d
messages: send_message 60/min + 1000/d; send_photo 30/d
quad: post 10/h + 30/d; reply 60/h; vote 600/h
safety: report 20/d; block 50/d; appeal 5/d
meetups: propose 20/d; share 10/d. push token 20/d. save 200/d. swipes 60/h. confirm_age 3/d. update_profile 20/d.
NONE (write RPCs w/o hit): accept_offer, decline_offer, withdraw_offer, mark_sold, delete_listing, relist_listing, hide_listing, undo_swipe, watch_listing, unsave_listing, unblock_user, record_view, saved-search update/delete, mark_unlock_seen, accept_quad_rules. All bounded by owned rows except below.
G-01 | OTP request limits | config.toml:208-246 email_sent 200/h project-wide, sign_in_sign_ups 30 per 5min per IP, max_frequency 1s, otp_expiry 600 | RISK | Medium | max_frequency 1s allows mail-bomb of a victim's .edu and burns shared Gmail SMTP quota (~500/day Plan A); set 60s and verify hosted config matches (config.toml is local) | XS
G-02 | Ban evasion via plus alias | email_hash = sha256(lower(btrim(email))||pepper) (0007_helpers.sql:60-71); hook checks banned_hashes on that hash (0010:30) ; no strip of +tag | FAIL | High | normalise local-part (strip +tag, for gmail-like hosts dots) before hashing in hook + admin ban + age_blocks; also rejects extra accounts. Most .edu are M365/Google which accept +tags | S
G-03 | Device bans | none (email-hash only) | RISK | Low | accept for R1.0; rely on 18+ edu mail | -
G-04 | Fake .edu domains | allow-list table campus_domains, unknown => SCHOOL_UNKNOWN, kind blocked, demo campus restricted to review_accounts (0010:34-47) | PASS | - | - | -
G-05 | Text filters | private.check_text banned_words block/review with leet normalisation (0007:257-300), used for listing, chat(0024:140), quad, offer, profile; admin BannedWords page | PASS | - | - | -
G-06 | Links in chat | no URL filter in chat; pii_check (URL/phone/email) applies to Quad only | RISK | Medium | phishing/off-platform payment scam links in chat; add banned_words regex for payment apps/short links, or review on first links from new accounts | S
G-07 | News link_url | any student, http(s) only up to 300 chars, 3/day (0215:18) ; no domain check, immediate publish? | RISK | Medium | route news with link from accounts <7d to review, or check_text scope; confirm moderation status in create_news | S
G-08 | Price sanity | price_hint exists (R1.1), not enforced; no min/max block seen | RISK | Low | cap price server-side (e.g. <= 5000) | XS
G-09 | Harassment controls | block (50/d), report (20/d), appeal, Quad hide/mute keyword, unblock | PASS | - | - | -
G-10 | record_view / relist_listing unlimited | no hit | RISK | Low | view-count inflation, relist bumping; add hit | XS
G-11 | Admin capacity | admin pages Reports, Users, Listings, Quad, BannedEmails/Words, Audit, Support, bulk remove; report_queue_check cron every 30 min; 24h review promise (RELEASE.md:81) ; single owner reviews | RISK | Medium | no on-call alert if queue stale beyond emails; add second moderator before opening Quad (OWNER_TODO 22) | -
