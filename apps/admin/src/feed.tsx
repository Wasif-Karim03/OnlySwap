// One activity event as a row ("Theo M. offered $40 on [Studio headphones]  12 s ago").
// Used by the Overview feed; the Activity and person pages can reuse it.
import { Link } from '@tanstack/react-router';

import { eventKind, eventVerb } from './labels';
import { timeAgo } from './logic';
import type { ActivityEvent } from './types';
import { Avatar, EventIcon, ListingCell } from './ui';

export function FeedRow({ e, now = Date.now() }: { e: ActivityEvent; now?: number }) {
  const style = eventKind(e.kind);
  const name = e.person?.display_name ?? 'Deleted account';
  return (
    <div className="ev">
      <EventIcon tone={style.tone} icon={style.icon} />
      <Avatar initial={e.person?.initial} seed={e.person?.id} />
      <span className="row ev-text" style={{ gap: 5, flexWrap: 'nowrap', minWidth: 0 }}>
        {e.person ? (
          <Link className="strong" to="/people/$id" params={{ id: e.person.id }}>
            {name}
          </Link>
        ) : (
          <span className="muted">{name}</span>
        )}
        {e.kind === 'deal_done' && e.other ? (
          <>
            <span>and</span>
            <Link className="strong" to="/people/$id" params={{ id: e.other.id }}>
              {e.other.display_name}
            </Link>
          </>
        ) : null}
        <span className="ink2" style={{ whiteSpace: 'nowrap' }}>
          {eventVerb(e.kind, e.details)}
        </span>
        {e.listing ? (
          <Link className="item-link" to="/listings/$id" params={{ id: e.listing.id }}>
            <ListingCell listing={e.listing} showPrice={false} />
          </Link>
        ) : null}
      </span>
      <span className="t" title={new Date(e.at).toLocaleString()}>
        {timeAgo(e.at, now)}
      </span>
    </div>
  );
}
