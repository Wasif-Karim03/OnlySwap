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
