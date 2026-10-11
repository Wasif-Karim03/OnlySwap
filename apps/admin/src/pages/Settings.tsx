import { Link } from '@tanstack/react-router';

import { STAGING } from '../env';
import { settingsTabs, type SettingsTab } from '../nav';
import { useIsOwner } from '../session';
import { EmptyState, Page } from '../ui';
import { BannedEmailsSection } from './BannedEmails';
import { BannedWordsSection } from './BannedWords';
import { CategoriesSection } from './Categories';
import { SwitchesSection } from './Config';
import { DataRequestsSection } from './DataRequests';
import { HealthSection } from './Health';
import { ReviewAccountsSection } from './ReviewAccounts';
import { StagingSection } from './Staging';
import { TeamSection } from './Team';

const CRUMBS: Record<SettingsTab, string> = {
  team: 'Who can use this console',
  words: 'Words held or blocked in listings, chats and Quad',
  switches: 'App switches and limits',
  data: 'Account deletions and data exports',
  health: 'Email, push, scheduled jobs and database size',
  review: 'App Store and Google Play reviewer logins',
  'blocked-emails': 'Emails of banned accounts',
  categories: 'Listing categories',
  staging: 'Mock data and the mock seller bot (staging only)',
};

/** Settings with a sub-nav (one route per section). Owner-only sections are hidden for moderators. */
export function SettingsPage({ tab }: { tab: SettingsTab }) {
  const owner = useIsOwner();
  const tabs = settingsTabs(owner, STAGING);
  const current = settingsTabs(true, STAGING).find((t) => t.id === tab);
  const blocked = !current || (current.ownerOnly && !owner);
  return (
    <Page title="Settings" crumb={CRUMBS[tab]}>
      <nav className="tabs card subnav" aria-label="Settings sections" style={{ borderRadius: 12 }}>
        {tabs.map((t) => (
          <Link
            key={t.id}
            to={t.to}
            className={t.id === tab ? 'on' : ''}
            aria-current={t.id === tab ? 'page' : undefined}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {blocked ? (
        <div className="card">
          <EmptyState title="Only the owner can open this section." />
        </div>
      ) : (
        <>
          {tab === 'team' ? <TeamSection /> : null}
          {tab === 'words' ? <BannedWordsSection /> : null}
          {tab === 'switches' ? <SwitchesSection /> : null}
          {tab === 'data' ? <DataRequestsSection /> : null}
          {tab === 'health' ? <HealthSection /> : null}
          {tab === 'review' ? <ReviewAccountsSection /> : null}
          {tab === 'blocked-emails' ? <BannedEmailsSection /> : null}
          {tab === 'categories' ? <CategoriesSection /> : null}
          {tab === 'staging' && STAGING ? <StagingSection /> : null}
        </>
      )}
    </Page>
  );
}
