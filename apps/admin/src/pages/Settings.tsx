import { Link } from '@tanstack/react-router';

import { Page } from '../ui';
import { BannedWordsSection } from './BannedWords';
import { SwitchesSection } from './Config';
import { TeamSection } from './Team';

export type SettingsTab = 'team' | 'words' | 'switches';

const TABS: { id: SettingsTab; to: string; label: string }[] = [
  { id: 'team', to: '/settings/team', label: 'Team' },
  { id: 'words', to: '/settings/words', label: 'Banned words' },
  { id: 'switches', to: '/settings/switches', label: 'App switches and limits' },
];

/** Settings: team, banned words, app switches and limits (one route per tab). */
export function SettingsPage({ tab }: { tab: SettingsTab }) {
  return (
    <Page title="Settings" crumb="Team, words and app switches">
      <nav className="tabs card" aria-label="Settings sections" style={{ borderRadius: 12 }}>
        {TABS.map((t) => (
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
      {tab === 'team' ? <TeamSection /> : null}
      {tab === 'words' ? <BannedWordsSection /> : null}
      {tab === 'switches' ? <SwitchesSection /> : null}
    </Page>
  );
}
