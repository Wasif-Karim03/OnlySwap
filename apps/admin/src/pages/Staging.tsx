import { botState, cronStatus, mockAction } from '../labels';
import { cronLabel, isMissingFunction, mockBotState, timeAgo, whenLabel } from '../logic';
import type { MockLogRow, MockStatus } from '../types';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Kpi,
  Loading,
  Pill,
  StatusPill,
  Table,
  useRpc,
} from '../ui';

/**
 * Staging tools (owner, staging builds only, DEC 92): the mock data on the OWU
 * campus and the mock seller bot. Read only; admin_mock_status exists only on
 * a server where supabase/campuses/owu-mock.sql was applied.
 */
export function StagingSection() {
  const state = useRpc<MockStatus>('admin_mock_status');
  const missing = isMissingFunction(state.error);
  return (
    <>
      <div className="row">
        <span className="muted">
          {state.data
            ? `Checked ${timeAgo(state.data.generated_at).toLowerCase()}`
            : missing
              ? 'Not installed'
              : 'Checking…'}
        </span>
        <span className="spacer" />
        <Button icon="refresh" disabled={state.loading} onClick={state.reload}>
          {state.loading ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>
      {missing ? (
        <div className="card">
          <EmptyState title="Mock data isn't installed on this server.">
            <p className="muted">
              Add it from the Mac with <code>bash scripts/deploy/mock-data.command owu</code>, then
              refresh.
            </p>
          </EmptyState>
        </div>
      ) : state.error ? (
        <div className="card">
          <ErrorState message={state.error} onRetry={state.reload} />
        </div>
      ) : state.loading && !state.data ? (
        <div className="card">
          <Loading rows={8} />
        </div>
      ) : state.data ? (
        <MockStatusView s={state.data} />
      ) : null}
    </>
  );
}

function MockStatusView({ s }: { s: MockStatus }) {
  const now = Date.parse(s.generated_at) || Date.now();
  const bot = s.bot;
  const st = mockBotState(bot, now);
  return (
    <>
      <div className="kpis k4">
        <Kpi
          label="Mock students"
          value={s.users.active}
          delta={
            s.users.total > s.users.active
              ? `${s.users.total - s.users.active} switched off`
              : 'all active'
          }
        />
        <Kpi
          label="Mock listings in Discover"
          value={s.listings.discover}
          delta={`${s.listings.total} in total · ${s.listings.sold} sold`}
        />
        <Kpi
          label="Around campus"
          value={s.listings.food_live + s.listings.wanted}
          delta={`${s.listings.food_live} free food live · ${s.listings.wanted} wanted`}
        />
        <Kpi
          label="Bot actions, 24 h"
          value={s.actions.ok_24h}
          delta={
            s.actions.failed_24h ? (
              <span className="error">{s.actions.failed_24h} failed</span>
            ) : (
              'none failed'
            )
          }
          dir={s.actions.failed_24h ? 'down' : 'flat'}
        />
      </div>

      <Card title="Mock seller bot" right={<StatusPill {...botState(st)} />}>
        {bot ? (
          <dl className="kv">
            <dt>Job</dt>
            <dd>
              <span className="mono">{bot.jobname}</span> ·{' '}
              <span className="ink2">{cronLabel(bot.schedule)}</span>
              {bot.active ? '' : ' (off)'}
            </dd>
            <dt>Last run</dt>
            <dd>
              {bot.last_run?.start_time ? (
                <>
                  {whenLabel(bot.last_run.start_time, now)}{' '}
                  <span className="muted">
                    ({timeAgo(bot.last_run.start_time, now).toLowerCase()})
                  </span>{' '}
                  <StatusPill {...cronStatus(bot.last_run.status)} />
                </>
              ) : (
                'Never'
              )}
              {bot.last_run?.status === 'failed' && bot.last_run.message ? (
                <div className="error small wrap">{bot.last_run.message}</div>
              ) : null}
            </dd>
            <dt>Runs, 24 h</dt>
            <dd className="tnum">
              {bot.runs_24h}
              {bot.failures_24h ? (
                <span className="error"> · {bot.failures_24h} failed</span>
              ) : null}
            </dd>
            <dt>All actions</dt>
            <dd className="tnum">
              {s.actions.ok_total} done
              {s.actions.failed_total ? (
                <span className="error"> · {s.actions.failed_total} failed</span>
              ) : null}{' '}
              <span className="muted">(log keeps 7 days)</span>
            </dd>
            <dt>Photos</dt>
            <dd className="tnum">{s.photos}</dd>
          </dl>
        ) : (
          <EmptyState title="The bot isn't scheduled. Run the mock data command again to start it." />
        )}
      </Card>

      <div className="grid2">
        <Card title="What the bot did lately">
          <LogTable rows={s.recent} empty="The bot hasn't done anything yet." showResult />
        </Card>
        <Card title="Failures">
          <LogTable rows={s.recent_failures} empty="No failed actions." />
        </Card>
      </div>
      <p className="note">
        Remove everything with <code>bash scripts/deploy/mock-data.command owu --remove</code>. Real
        people&apos;s deal data is never deleted.
      </p>
    </>
  );
}

function LogTable({
  rows,
  empty,
  showResult,
}: {
  rows: MockLogRow[];
  empty: string;
  showResult?: boolean;
}) {
  if (!rows.length) return <EmptyState title={empty} />;
  return (
    <Table
      compact
      label={showResult ? 'Recent bot actions' : 'Recent bot failures'}
      columns={
        showResult
          ? ['When', 'Mock student', 'Action', 'Result']
          : ['When', 'Mock student', 'Action', 'Error']
      }
    >
      {rows.map((r) => (
        <tr key={r.id}>
          <td className="muted">{timeAgo(r.at)}</td>
          <td>{r.actor_name ?? 'Mock student'}</td>
          <td>{mockAction(r.action)}</td>
          {showResult ? (
            <td>
              {r.ok ? (
                <Pill tone="green" label="Done" />
              ) : (
                <Pill tone="red" label="Failed" title={r.detail ?? undefined} />
              )}
            </td>
          ) : (
            <td className="ink2 wrap" style={{ maxWidth: 280 }}>
              {r.detail}
            </td>
          )}
        </tr>
      ))}
    </Table>
  );
}
