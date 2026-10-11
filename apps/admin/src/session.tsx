// Signed-in admin, the sidebar campus picker and the nav counts, shared with
// every page through React context (useWho, useCampusId, useSession).
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import type { Whoami } from './logic';
import { rpc } from './supabase';
import type { CampusOption } from './ui';
import type { OverviewV2 } from './types';

/** Badge numbers in the sidebar (from admin_overview_v2). */
export type NavCounts = {
  open_reports: number;
  priority_reports: number;
  held_listings: number;
  quad_held: number;
  appeals_open: number;
  support_open: number;
};

type SessionValue = {
  who: Whoami;
  signOut: () => void;
  /** '' means all campuses (owner). Moderators always get their own campus. */
  campusId: string;
  setCampusId: (id: string) => void;
  campuses: CampusOption[];
  counts: NavCounts | null;
  refreshCounts: () => void;
};

const Ctx = createContext<SessionValue | null>(null);
const CAMPUS_KEY = 'onlyswap-admin-campus';

export function SessionProvider({
  who,
  signOut,
  children,
}: {
  who: Whoami;
  signOut: () => void;
  children: ReactNode;
}) {
  const owner = who.role === 'owner';
  const [picked, setPicked] = useState(() =>
    owner ? (localStorage.getItem(CAMPUS_KEY) ?? '') : '',
  );
  const [campuses, setCampuses] = useState<CampusOption[]>([]);
  const [counts, setCounts] = useState<NavCounts | null>(null);
  const campusId = owner ? picked : (who.campus_id ?? '');

  useEffect(() => {
    rpc<CampusOption[]>('admin_list_campuses')
      .then((c) => {
        setCampuses(c);
        if (owner && picked && !c.some((x) => x.id === picked)) setPicked('');
      })
      .catch(() => setCampuses([]));
  }, []); // once per sign-in

  const refreshCounts = useCallback(() => {
    rpc<OverviewV2>('admin_overview_v2', { campus_id: campusId || null })
      .then((o) =>
        setCounts({
          open_reports: o.kpis.open_reports.value,
          priority_reports: o.kpis.open_reports.priority,
          held_listings: o.needs_attention.held_listings,
          quad_held: o.needs_attention.quad_held,
          appeals_open: o.needs_attention.appeals_open,
          support_open: o.needs_attention.support_open,
        }),
      )
      .catch(() => setCounts(null));
  }, [campusId]);

  useEffect(() => {
    refreshCounts();
    const t = setInterval(refreshCounts, 60_000);
    return () => clearInterval(t);
  }, [refreshCounts]);

  const setCampusId = (id: string) => {
    if (!owner) return;
    setPicked(id);
    localStorage.setItem(CAMPUS_KEY, id);
  };

  return (
    <Ctx.Provider value={{ who, signOut, campusId, setCampusId, campuses, counts, refreshCounts }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSession(): SessionValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession outside SessionProvider');
  return v;
}

export const useWho = () => useSession().who;
export const useIsOwner = () => useSession().who.role === 'owner';

/** The sidebar campus for RPC args: null means all campuses (owner) or "mine" (moderator). */
export const useCampusId = (): string | null => useSession().campusId || null;
