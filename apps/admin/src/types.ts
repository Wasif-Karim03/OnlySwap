// Shapes of the admin v2 RPCs (docs/API.md §4.1). Shared by pages.

export type Person = { id: string; display_name: string | null; initial: string | null } | null;

export type ListingBrief = {
  id: string;
  title: string;
  price_cents: number | null;
  status: string;
  photo: string | null;
};

export type CampusBrief = {
  id: string;
  name: string;
  short_name: string;
  slug: string;
  status: string;
} | null;

export type Series = { value: number; series: number[] };

export type OverviewV2 = {
  campus_id: string | null;
  timezone: string;
  generated_at: string;
  kpis: {
    students: Series & { new_7d: number };
    active_today: Series & { same_day_last_week: number };
    listings_live: Series & { new_7d: number };
    offers_today: Series & { same_day_last_week: number };
    deals_7d: Series & { agreed_cents: number; prev_7d: number };
    open_reports: { value: number; priority: number; oldest_at: string | null };
  };
  needs_attention: {
    reports: {
      id: string;
      reason: string;
      priority: number;
      target_type: string;
      campus: CampusBrief;
      created_at: string;
    }[];
    held_listings: number;
    quad_held: number;
    support_open: number;
    appeals_open: number;
  };
  campuses: {
    id: string;
    name: string;
    short_name: string;
    slug: string;
    status: string;
    is_demo: boolean;
    students: number;
    waitlist: number;
    unlock_threshold: number;
    live_listings: number;
    deals_7d: number;
  }[];
};

export type ActivityEvent = {
  id: string;
  kind: string;
  at: string;
  person: Person;
  other: Person;
  listing: ListingBrief | null;
  campus_id: string | null;
  details: Record<string, unknown> | null;
  platform: string | null;
};

export type ActivityFeed = {
  items: ActivityEvent[];
  next_cursor: { at: string; id: string } | null;
};

export type UserV2 = {
  id: string;
  display_name: string | null;
  initial: string | null;
  status: string;
  campus: CampusBrief;
  email: string | null;
  year: string | null;
  avatar_path: string | null;
  swipes: number;
  offers: number;
  deals: number;
  reports: number;
  strike_count: number;
  noshow_count: number;
  joined_at: string;
  last_active_at: string | null;
  last_platform: string | null;
};

export type AuditV2 = {
  id: number;
  at: string;
  actor: Person;
  action: string;
  target_type: string | null;
  target_id: string | null;
  target_label: string | null;
  campus_id: string | null;
  reason: string | null;
  case_ref: string | null;
  meta: Record<string, unknown> | null;
};

export type SearchResult = {
  people: (NonNullable<Person> & { status: string; campus: CampusBrief; email: string | null })[];
  listings: (ListingBrief & { campus: CampusBrief })[];
  reports: {
    id: string;
    reason: string;
    status: string;
    target_type: string;
    created_at: string;
  }[];
};

// ---------------------------------------------------------------------------
// Student page (admin_person and its tabs)

export type PersonFull = {
  person: {
    id: string;
    display_name: string | null;
    first_name: string | null;
    initial: string | null;
    status: string;
    status_reason: string | null;
    paused_until: string | null;
    year: string | null;
    avatar_path: string | null;
    campus: CampusBrief;
    email: string | null;
    email_masked: string | null;
    joined_at: string;
    last_active_at: string | null;
    last_platform: string | null;
    last_app_version: string | null;
    age_method: string | null;
    adult_confirmed_at: string | null;
    verified_until: string | null;
    invited_by: Person;
    strikes: number;
    no_shows: number;
    admin_role: string | null;
    push_on: boolean;
    tips_on: boolean;
  };
  counts: {
    swipes: number;
    left: number;
    saves: number;
    offers_made: number;
    offers_received: number;
    deals: number;
    listings: number;
    chats: number;
    meetups: number;
    rating: { up: number; down: number };
    reports_on_them: number;
    reports_by_them: number;
    blocks_made: number;
    blocks_received: number;
  };
  affinity: { category_id: number; slug: string; name: string; n: number; share: number }[];
  hourly: number[];
  blocks: {
    made: (NonNullable<Person> & { at: string })[];
    received: (NonNullable<Person> & { at: string })[];
  };
};

export type Paged<T> = { items: T[]; next_cursor: number | null };

export type PersonOffer = {
  id: string;
  role: 'buyer' | 'seller';
  other: Person;
  listing: ListingBrief | null;
  amount_cents: number;
  asking_cents: number | null;
  status: string;
  round: number;
  last_actor: string | null;
  created_at: string;
  responded_at: string | null;
  expires_at: string | null;
};

export type PersonListing = ListingBrief & {
  kind: string;
  created_at: string;
  sold_at: string | null;
  views: number;
  saves: number;
  offers: number;
  left: number;
  reports: number;
};

export type PersonChat = {
  id: string;
  role: 'buyer' | 'seller';
  other: Person;
  listing: { id: string | null; title: string; price_cents: number | null } | null;
  agreed_cents: number | null;
  status: string;
  message_count: number;
  their_message_count: number;
  archived: boolean;
  last_message_at: string | null;
  created_at: string;
  closed_at: string | null;
  buyer_outcome: string | null;
  seller_outcome: string | null;
  /** A report names this chat or a message in it. */
  reported: boolean;
};

export type PersonMeetup = {
  id: string;
  chat_id: string;
  role: 'buyer' | 'seller';
  other: Person;
  listing: { id: string | null; title: string } | null;
  starts_at: string;
  status: string;
  place: string | null;
  spot_id: string | null;
  proposed_by_them: boolean;
  confirmed_at: string | null;
  their_check_in: string | null;
  other_check_in: string | null;
  no_shows: { id: string; by_them: boolean; status: string; created_at: string }[];
  created_at: string;
};

export type PersonReports = {
  against: {
    id: string;
    reason: string;
    status: string;
    priority: number;
    target_type: string;
    target_id: string;
    reporter: Person;
    action_taken: string | null;
    created_at: string;
    resolved_at: string | null;
  }[];
  by_them: {
    id: string;
    reason: string;
    status: string;
    target_type: string;
    target_id: string;
    about: Person;
    created_at: string;
    resolved_at: string | null;
  }[];
  strikes: {
    id: string;
    reason: string;
    report_id: string | null;
    created_at: string;
    expires_at: string | null;
    cleared_at: string | null;
  }[];
  appeals: {
    id: string;
    subject_type: string;
    status: string;
    created_at: string;
    decided_at: string | null;
  }[];
  no_shows: {
    id: string;
    meetup_id: string;
    status: string;
    by_them: boolean;
    other: Person;
    created_at: string;
  }[];
};

export type AccessRow = {
  id: number;
  at: string;
  actor: Person;
  action: string;
  reason: string | null;
  case_ref: string | null;
  meta: Record<string, unknown> | null;
};

// ---------------------------------------------------------------------------
// Listing page (admin_listing_activity)

export type ListingActivity = {
  listing: ListingBrief & {
    kind: string;
    condition: string | null;
    description: string | null;
    category: { id: number; slug: string; name: string } | null;
    seller: Person;
    campus: CampusBrief;
    created_at: string;
    bumped_at: string | null;
    sold_at: string | null;
    buyer: Person;
    expires_at: string | null;
    views: number;
    saves: number;
    offers: number;
    spots: string[];
    reports: number;
  };
  funnel: { shown: number; viewed: number; saved: number; offered: number; sold: boolean };
  swipes: { right: number; left: number; hidden: number };
  who_swiped: {
    person: Person;
    direction: 'offered' | 'saved' | 'left';
    at: string;
    dwell_ms: number | null;
    viewed_first: boolean;
    offer: { id: string; amount_cents: number; status: string; round: number } | null;
    saved: boolean;
  }[];
  offers: {
    id: string;
    buyer: Person;
    amount_cents: number;
    status: string;
    round: number;
    last_actor: string | null;
    created_at: string;
    responded_at: string | null;
  }[];
  views: {
    person: Person;
    at: string;
    dwell_ms: number | null;
    source: string | null;
    platform: string | null;
  }[];
  price_history: { old_cents: number; new_cents: number; at: string }[];
  comparison: {
    right_rate: number | null;
    category_right_rate: number | null;
    category_swipes: number;
  } | null;
};

// ---------------------------------------------------------------------------
// Tools (support, waitlist, meetups, ratings, data, health)

export type SupportItem = {
  id: string;
  email: string | null;
  topic: string;
  status: string;
  campus: CampusBrief;
  created_at: string;
  handled_at: string | null;
  replied_at: string | null;
  reply_count: number;
  preview: string | null;
};

export type SupportDetail = Omit<SupportItem, 'preview'> & {
  body: string | null;
  staff_note: string | null;
  updated_at: string | null;
  updated_by: Person;
  person: Person;
};

export type WaitlistDemand = {
  schools: {
    domain: string;
    school_guess: string | null;
    campus: (NonNullable<CampusBrief> & { unlock_threshold: number }) | null;
    requests: number;
    members_waiting: number;
    total: number;
    newest_at: string | null;
  }[];
  total_requests: number;
};

export type MeetupRow = {
  id: string;
  chat_id: string;
  starts_at: string;
  status: string;
  place: string | null;
  spot_id: string | null;
  campus_id: string | null;
  buyer: Person;
  seller: Person;
  listing: { id: string | null; title: string } | null;
  confirmed_at: string | null;
  buyer_here_at: string | null;
  seller_here_at: string | null;
  no_show_reports: number;
};

export type NoShowSummary = {
  totals: { open: number; confirmed: number; rejected: number };
  people: (NonNullable<Person> & {
    status: string;
    noshow_count: number;
    reports_open: number;
    reports_confirmed: number;
    last_at: string | null;
  })[];
};

export type RatingsSummary = {
  totals: { up: number; down: number };
  low_rated: (NonNullable<Person> & {
    status: string;
    up: number;
    down: number;
    total: number;
    pct_up: number;
  })[];
  recent_down: {
    id: string;
    rater: Person;
    ratee: Person;
    tags: string[] | null;
    comment: string | null;
    chat_id: string | null;
    created_at: string;
  }[];
};

export type AgeBlocks = {
  total: number;
  all_time: number;
  by_campus: { campus: CampusBrief; n: number }[];
  by_day: { day: string; campus_id: string | null; n: number }[];
};

export type DeletionsExports = {
  counts: {
    deletions_30d: number;
    underage_30d: number;
    stuck: number;
    exports_30d: number;
    exports_failed_30d: number;
  };
  deletions: {
    id: string;
    user_id: string | null;
    person: Person;
    campus: CampusBrief;
    underage: boolean;
    status: string;
    stuck: boolean;
    started_at: string;
    finished_at: string | null;
  }[];
  exports: {
    id: string;
    person: Person;
    status: string | null;
    created_at: string;
    expires_at: string | null;
  }[];
  next_cursor: number | null;
};

export type SystemHealth = {
  generated_at: string;
  email: {
    pending: number;
    oldest_pending_at: string | null;
    sent_24h: number;
    failed_24h: number;
    failed_total: number;
    recent_errors: {
      id: number;
      template: string;
      to: string;
      state: string;
      attempts: number;
      error: string | null;
      at: string;
    }[];
  };
  push: {
    tickets_24h: number;
    errors_24h: number;
    pending: number;
    recent_errors: { id: number; status: string; error: string | null; at: string }[];
  };
  cron: {
    jobname: string;
    schedule: string;
    active: boolean;
    last_run: {
      status: string;
      start_time: string | null;
      end_time: string | null;
      message: string | null;
    } | null;
    failures_24h: number;
  }[];
  storage: {
    db_bytes: number;
    db_limit_bytes: number;
    tables: { name: string; bytes: number; rows_estimate: number }[];
  };
  reports: { open: number; oldest_open_at: string | null };
  deletions_stuck: number;
};

export type ReviewAccount = {
  email: string;
  note: string | null;
  user_id: string | null;
  has_account: boolean;
  last_sign_in_at: string | null;
  campus: CampusBrief;
};

export type BannedHashes = {
  items: {
    email_hash: string;
    created_at: string;
    person: (NonNullable<Person> & { status: string }) | null;
  }[];
  total: number;
  next_cursor: number | null;
};

export type Category = {
  id: number;
  slug: string;
  name: string;
  parent_id: number | null;
  sort: number;
};
