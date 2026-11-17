// Server-side reporting only. This module is imported exclusively by the authenticated page.
import { Pool, type PoolClient } from 'pg';

export type PlayerParams = Record<string, string | string[] | undefined>;
export type PlayerFilters = { search: string; source: string; status: string; dateField: string; from: string; to: string; page: number };
export type PlayerRow = { id: string; name: string; email: string; verified: boolean; signup_at: string | null; verified_at: string | null; last_play_at: string | null; activity_at: string | null; started: number; completed: number; prizes: string[]; source: string };
export type PlayerReport = { state: 'ready'; rows: PlayerRow[]; total: number; verified: number; played: number; completed: number; page: number; pages: number; checkedAt: string } | { state: 'unavailable'; reason: 'configuration' | 'connection' } | { state: 'invalid_range' };
const sources = ['newsletter', 'social', 'direct', 'partner', 'other', 'unknown'];
function date(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value ? value : ''; }
export function parsePlayerFilters(params: PlayerParams): PlayerFilters {
  const get = (key: string) => typeof params[key] === 'string' ? params[key] as string : '';
  return { search: get('search').trim().slice(0, 120), source: sources.includes(get('source')) ? get('source') : '', status: ['played', 'not_played', 'verified', 'unverified'].includes(get('status')) ? get('status') : '', dateField: get('dateField') === 'signup' ? 'signup' : 'last_play', from: date(get('from')), to: date(get('to')), page: Math.min(100000, Math.max(1, Number.parseInt(get('page'), 10) || 1)) };
}
export function playerUrl(f: PlayerFilters, page: number) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...f, page })) if (value) query.set(key, String(value));
  return '/scratch-players?' + query.toString();
}
// Aggregate events and cards separately so repeat events cannot multiply card counts.
export const PLAYER_CTE = `WITH events AS (
 SELECT e.id,e.player,e.name,e.props,e.created_at FROM public.scratch_event e
 WHERE e.campaign=$1 AND e.authority='server' AND e.props->>'vip_test' IS DISTINCT FROM 'true'
 AND (e.card IS NULL OR EXISTS (SELECT 1 FROM public.scratch_card c WHERE c.id=e.card AND NOT c.is_test))
), event_totals AS (
 SELECT player, min(created_at) FILTER (WHERE name='signup_submitted') AS signup_at,
 min(created_at) FILTER (WHERE name='verified') AS verified_at,
 max(created_at) FILTER (WHERE name IN ('card_started','choice_committed','square_revealed','card_won','card_lost')) AS last_event_at
 FROM events GROUP BY player
), first_source AS (
 SELECT DISTINCT ON (player) player, props->>'source' AS source FROM events
 WHERE name IN ('signup_submitted','verified') ORDER BY player, created_at, id
), cards AS (
 SELECT player,count(*)::int AS started,count(*) FILTER (WHERE finished_at IS NOT NULL)::int AS completed,
 max(GREATEST(created_at,finished_at)) AS last_card_at,
 coalesce(array_agg(DISTINCT prize) FILTER (WHERE prize IN ('25','40','50','free')), ARRAY[]::text[]) AS prizes
 FROM public.scratch_card WHERE NOT is_test AND player IN (SELECT id FROM public.scratch_player WHERE campaign=$1) GROUP BY player
), players AS (
 SELECT p.id,p.name,p.email,p.verified,e.signup_at,e.verified_at,
 GREATEST(e.last_event_at,c.last_card_at) AS last_play_at,
 GREATEST(e.signup_at,e.verified_at,e.last_event_at,c.last_card_at) AS activity_at,
 coalesce(c.started,0) AS started,coalesce(c.completed,0) AS completed,coalesce(c.prizes,ARRAY[]::text[]) AS prizes,
 CASE WHEN s.source IN ('newsletter','social','direct','partner','other') THEN s.source ELSE 'unknown' END AS source
 FROM public.scratch_player p JOIN public.scratch_campaign campaign ON campaign.id=p.campaign AND NOT campaign.synthetic
 LEFT JOIN event_totals e ON e.player=p.id LEFT JOIN cards c ON c.player=p.id LEFT JOIN first_source s ON s.player=p.id
 WHERE p.campaign=$1
), filtered AS (
 SELECT * FROM players WHERE ($2='' OR strpos(lower(name || ' ' || email),lower($2))>0)
 AND ($3='' OR source=$3)
 AND ($4='' OR ($4='played' AND started>0) OR ($4='not_played' AND started=0) OR ($4='verified' AND verified) OR ($4='unverified' AND NOT verified))
 AND ($5::date IS NULL OR (CASE WHEN $7='signup' THEN signup_at ELSE last_play_at END)>=($5::date::timestamp AT TIME ZONE 'America/Toronto'))
 AND ($6::date IS NULL OR (CASE WHEN $7='signup' THEN signup_at ELSE last_play_at END)<(($6::date+1)::timestamp AT TIME ZONE 'America/Toronto'))
)`;
export async function readPlayerReport(db: PoolClient, f: PlayerFilters, campaign: string): Promise<Extract<PlayerReport, { state: 'ready' }>> {
  const args = [campaign, f.search, f.source, f.status, f.from || null, f.to || null, f.dateField];
  const totals = (await db.query(PLAYER_CTE + ` SELECT count(*)::int AS total,count(*) FILTER (WHERE verified)::int AS verified,count(*) FILTER (WHERE started>0)::int AS played,coalesce(sum(completed),0)::int AS completed FROM filtered`, args)).rows[0];
  const pages = Math.max(1, Math.ceil(totals.total / 50));
  const page = Math.min(f.page, pages);
  const rows = (await db.query(PLAYER_CTE + ` SELECT * FROM filtered ORDER BY activity_at DESC NULLS LAST,id LIMIT 50 OFFSET $8`, [...args, (page - 1) * 50])).rows.map((r) => ({ ...r, signup_at: r.signup_at?.toISOString() ?? null, verified_at: r.verified_at?.toISOString() ?? null, last_play_at: r.last_play_at?.toISOString() ?? null, activity_at: r.activity_at?.toISOString() ?? null }));
  return { state: 'ready', ...totals, rows, page, pages, checkedAt: new Date().toISOString() };
}
let reportPool: Pool | undefined;
export async function getPlayerReport(f: PlayerFilters): Promise<PlayerReport> {
  if (f.from && f.to && f.from > f.to) return { state: 'invalid_range' };
  const connectionString = process.env.SCRATCH_REPORT_DATABASE_URL;
  if (!connectionString) return { state: 'unavailable', reason: 'configuration' };
  reportPool ??= new Pool({ connectionString, max: 3, connectionTimeoutMillis: 4000, idleTimeoutMillis: 10000, statement_timeout: 6000, application_name: 'crm-scratch-readonly' });
  // Do not let a disconnected idle connection crash the web process or log credentials.
  if (reportPool.listenerCount('error') === 0) reportPool.on('error', () => {});
  let db: PoolClient | undefined;
  try {
    db = await reportPool.connect();
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await db.query("SET LOCAL statement_timeout='6000ms'");
    await db.query("SET LOCAL idle_in_transaction_session_timeout='10000ms'");
    // Refuse accidentally configured owner/game writer credentials. SELECT-only grants are required.
    const privilege = (await db.query(`SELECT r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolbypassrls OR EXISTS (
      SELECT 1 FROM (VALUES ('scratch_campaign'),('scratch_player'),('scratch_card'),('scratch_event')) t(name)
      WHERE has_table_privilege(current_user, 'public.'||t.name, 'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER')
      OR has_any_column_privilege(current_user, 'public.'||t.name, 'INSERT,UPDATE')
      OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=t.name AND pg_has_role(current_user,c.relowner,'USAGE'))
    ) AS unsafe FROM pg_roles r WHERE r.rolname=current_user`)).rows[0];
    if (!privilege || privilege.unsafe) throw new Error('Restricted reporting role required');
    const campaignId = process.env.SCRATCH_REPORT_CAMPAIGN_ID || 'jt-scratch-20261106';
    const campaign = (await db.query('SELECT synthetic FROM public.scratch_campaign WHERE id=$1', [campaignId])).rows[0];
    if (!campaign || campaign.synthetic) throw new Error('Public campaign required');
    const result = await readPlayerReport(db, f, campaignId);
    await db.query('COMMIT');
    return result;
  } catch {
    if (db) await db.query('ROLLBACK').catch(() => {});
    return { state: 'unavailable', reason: 'connection' };
  } finally { db?.release(); }
}
