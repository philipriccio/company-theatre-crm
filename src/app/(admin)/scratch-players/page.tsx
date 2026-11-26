import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Prisma } from '@prisma/client';
import { identity } from '@/lib/auth/store';
import { cookieName } from '@/lib/auth/access';
import { prisma } from '@/lib/db';
import { getPlayerReport, parsePlayerFilters, playerUrl, type PlayerParams } from '@/lib/scratch-players';
import './players.css';
export const dynamic = 'force-dynamic';
const sourceNames: Record<string, string> = { newsletter: 'Email / newsletter', social: 'Social', direct: 'Direct', partner: 'Partner', other: 'Other', unknown: 'Unknown' };
const prizeNames: Record<string, string> = { '25': '25% offer', '40': '40% offer', '50': '50% offer', free: 'Free ticket pair' };
function time(value: string | null) { return value ? new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Toronto' }).format(new Date(value)) : 'Unknown'; }
export default async function ScratchPlayersPage({ searchParams }: { searchParams: Promise<PlayerParams> }) {
  // Layout and page can execute concurrently; authorize here before any game query.
  if (!await identity((await cookies()).get(cookieName())?.value)) redirect('/login');
  const filters = parsePlayerFilters(await searchParams);
  const report = await getPlayerReport(filters);
  const crmLinks = new Map<string, string>();
  let crmUnavailable = false;
  if (report.state === 'ready' && report.rows.length) {
    try {
      const emails = [...new Set(report.rows.map(p => p.email.trim().toLowerCase()))];
      const matches = await prisma.$queryRaw<{ id: string; email: string }[]>(Prisma.sql`SELECT id,email FROM "Contact" WHERE lower(btrim(email)) IN (${Prisma.join(emails)}) ORDER BY id`);
      // Ambiguous legacy duplicates are intentionally not linked to an arbitrary contact.
      const groups = new Map<string, string[]>();
      for (const c of matches) { const key = c.email.trim().toLowerCase(); groups.set(key, [...(groups.get(key) || []), c.id]); }
      for (const [email, ids] of groups) if (ids.length === 1) crmLinks.set(email, ids[0]);
    } catch { crmUnavailable = true; }
  }
  return <div className="audience-page scratch-players">
    <header className="audience-header"><div><p className="eyebrow">THE COMPANY THEATRE / SCRATCH GAME</p><h1>Scratch players.</h1><p>See who registered, who played, and what they won.</p></div><a className="btn btn-secondary btn-md" href={playerUrl(filters, filters.page)}>Refresh activity</a></header>
    <p className="player-context">Includes existing contacts and people not yet in the CRM. Signup dates come from the game—not the date a contact was added. {filters.sort === 'activity' ? 'Latest activity first.' : 'Newest signups first; unknown signup dates appear last.'} All times and date filters use Toronto time.</p>
    <form method="GET" action="/scratch-players"><div className="player-filters player-search audience-panel">
      <label>Find a player<input type="search" name="search" defaultValue={filters.search} placeholder="Search by name or email" maxLength={120}/></label>
      <label>Sort players<select name="sort" defaultValue={filters.sort}><option value="newest">Newest players (signup date)</option><option value="activity">Latest activity</option></select></label>
      <div className="player-filter-actions"><button className="btn btn-primary btn-md">Search players</button><Link href="/scratch-players">Clear filters</Link></div>
    </div><details className="player-filter-disclosure"><summary>More filters — source, status and dates{(filters.source || filters.status || filters.from || filters.to) ? ' (filters active)' : ''}</summary><div className="player-filters audience-panel">
      <label>Signup source<select aria-label="Signup source" name="source" defaultValue={filters.source}><option value="">All sources</option>{Object.entries(sourceNames).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>Player status<select aria-label="Player status" name="status" defaultValue={filters.status}><option value="">Everyone</option><option value="played">Played (started a card)</option><option value="not_played">Registered, no cards started</option><option value="verified">Email verified</option><option value="unverified">Email unverified</option></select></label>
      <label>Date filter applies to<select aria-label="Date filter applies to" name="dateField" defaultValue={filters.dateField}><option value="last_play">Last gameplay</option><option value="signup">First signup</option></select></label>
      <label>From (inclusive)<input type="date" name="from" defaultValue={filters.from}/></label><label>Through (inclusive)<input type="date" name="to" defaultValue={filters.to}/></label>
      <div className="player-filter-actions"><button className="btn btn-primary btn-md">Apply filters</button><Link href="/scratch-players">Clear filters</Link></div>
    </div></details></form>
    <p className="player-context">Source is the first recorded signup/verification source. “Email / newsletter” is observed attribution, not proof that a particular email caused a signup. Started cards include unfinished games; completed cards are shown separately.</p>
    {report.state === 'invalid_range' ? <p role="alert">Choose a From date on or before the Through date.</p> : report.state === 'unavailable' ? <section className="audience-panel" role="status"><h2>Player activity is unavailable</h2><p>{report.reason === 'configuration' ? 'The read-only game reporting connection has not been configured.' : 'We could not read the game activity right now. Please try again shortly.'}</p><p>This does not mean there are no signups or players. Gameplay and signup are not changed by this report.</p></section> : <>
      <section className="player-stats" aria-label="Totals for current filters"><div><strong>{report.total}</strong><span>Registered people</span></div><div><strong>{report.verified}</strong><span>Email verified</span></div><div><strong>{report.played}</strong><span>Started a card</span></div><div><strong>{report.completed}</strong><span>Cards completed</span></div></section>
      <p className="player-context">Totals match the current filters. Card totals are lifetime public-game totals for those people. Updated {time(report.checkedAt)}. Test cards and test events are excluded.</p>
      {crmUnavailable && <p role="status">CRM profile links are temporarily unavailable; game activity is still shown.</p>}
      {report.rows.length ? <section className="player-list" aria-label="Players">{report.rows.map(p => <article key={p.id} className="audience-panel player-card">
        <div className="player-person"><h2>{p.name || 'Name not recorded'}</h2><p>{p.email}</p><div className="player-badges"><span>{p.started > 0 ? 'Played' : 'Not played yet'}</span><span>{p.verified ? 'Email verified' : 'Email unverified'}</span><span>{sourceNames[p.source]}</span></div>{crmLinks.has(p.email.trim().toLowerCase()) ? <Link href={'/contacts/' + crmLinks.get(p.email.trim().toLowerCase())}>Open CRM profile →</Link> : <small>{crmUnavailable ? 'Profile lookup unavailable' : 'No unique CRM profile linked'}</small>}</div>
        <dl className="player-details"><div><dt>First signup</dt><dd>{time(p.signup_at)}</dd></div><div><dt>First email verification</dt><dd>{time(p.verified_at)}</dd></div><div><dt>Last gameplay</dt><dd>{p.started ? time(p.last_play_at) : 'Not played yet'}</dd></div><div><dt>Cards started / completed</dt><dd>{p.started} started · {p.completed} completed</dd></div><div><dt>Prizes awarded</dt><dd>{p.prizes.length ? p.prizes.map(v => prizeNames[v]).join(', ') : 'None'}</dd></div></dl>
      </article>)}</section> : <section className="audience-panel"><h2>No players match these filters.</h2><p>Try a different name, email, source, date range or status.</p><Link href="/scratch-players">Clear filters</Link></section>}
      <nav className="player-pagination" aria-label="Player pages">{report.page > 1 && <Link href={playerUrl(filters, report.page - 1)}>← Previous</Link>}<span>Page {report.page} of {report.pages} · {report.total} people</span>{report.page < report.pages && <Link href={playerUrl(filters, report.page + 1)}>Next →</Link>}</nav>
    </>}
  </div>;
}
