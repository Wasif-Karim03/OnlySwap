import { Link } from '@tanstack/react-router';

import { Loadable, useRpc } from '../ui';

type Overview = {
  open_reports: number;
  priority_reports: number;
  held_listings: number;
  open_appeals: number;
  today: {
    new_users: number;
    new_listings: number;
    offers: number;
    chats: number;
    meetups: number;
  };
};

/** G02 Overview (P12-ADM-04): open work and the last 24 hours. Metrics are R1.1. */
export function OverviewPage() {
  const state = useRpc<Overview>('admin_overview');
  return (
    <>
      <h1>Overview</h1>
      <Loadable state={state}>
        {(o) => (
          <>
            <h2>Needs attention</h2>
            <div className="grid">
              <Stat label="Open reports" value={o.open_reports} to="/reports" />
              <Stat label="Priority reports" value={o.priority_reports} to="/reports" />
              <Stat label="Held listings" value={o.held_listings} to="/listings" />
              <Stat label="Open appeals" value={o.open_appeals} to="/appeals" />
            </div>
            <h2>Last 24 hours</h2>
            <div className="grid">
              <Stat label="New students" value={o.today.new_users} />
              <Stat label="New listings" value={o.today.new_listings} />
              <Stat label="Offers" value={o.today.offers} />
              <Stat label="Chats" value={o.today.chats} />
              <Stat label="Meetups confirmed" value={o.today.meetups} />
            </div>
          </>
        )}
      </Loadable>
    </>
  );
}

function Stat({
  label,
  value,
  to,
}: {
  label: string;
  value: number;
  to?: '/reports' | '/listings' | '/appeals';
}) {
  const body = (
    <>
      <div className="stat">{value}</div>
      <div className="meta">{label}</div>
    </>
  );
  return (
    <div className="card">
      {to ? (
        <Link to={to} style={{ textDecoration: 'none' }}>
          {body}
        </Link>
      ) : (
        body
      )}
    </div>
  );
}
