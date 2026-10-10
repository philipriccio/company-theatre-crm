import { Prisma } from '@prisma/client';
import { prisma } from './db';
export const permissionLabels = { suppressed: 'Suppressed', unsubscribed: 'Unsubscribed', dnc: 'Do not contact', recorded: 'Opt-in recorded', review: 'Consent review', unknown: 'No recorded consent' } as const;
export type Permission = keyof typeof permissionLabels;
export type AudienceParams = Record<string, string | string[] | undefined>;
export function parseAudience(params: AudienceParams) {
    const str = (key: string) => typeof params[key] === 'string' ? (params[key] as string).trim().slice(0, 200) : '';
    const status = str('status');
    const sort = str('sort');
    const quality = str('quality');
    return { quality: ['missing_name','missing_city'].includes(quality) ? quality : '', search: str('search'), tag: str('tag'), source: str('source'), status: Object.hasOwn(permissionLabels, status) ? status : '', vip: str('vip') === '1' ? '1' : '', review: str('review') === '1' ? '1' : '', sort: ['name', 'oldest', 'recent'].includes(sort) ? sort : 'recent', page: /^\d{1,7}$/.test(str('page')) ? Math.max(1, Number(str('page'))) : 1 };
}
export type AudienceFilters = ReturnType<typeof parseAudience>;
export function audienceUrl(filters: Partial<AudienceFilters>, base = '/contacts') {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(filters))
        if (value !== '' && value !== undefined)
            query.set(key, String(value));
    return `${base}?${query}`;
}
// Shared, parameterized database projection: list, counts and export cannot drift.
const projection = Prisma.sql `SELECT c.*, CASE
 WHEN EXISTS (SELECT 1 FROM "GlobalSuppression" s WHERE lower(s.email)=lower(c.email)) THEN 'suppressed'
 WHEN c."unsubscribedAt" IS NOT NULL THEN 'unsubscribed'
 WHEN NOT c.solicitation THEN 'dnc'
 WHEN e.status='express_opt_in_recorded' THEN 'recorded'
 WHEN e.status IS NOT NULL THEN 'review'
 ELSE 'unknown' END AS permission,
 e.source AS "latestSource", e.status AS "latestConsentStatus"
 FROM "Contact" c LEFT JOIN LATERAL (SELECT status, source FROM "ConsentEvidence" WHERE "contactId"=c.id AND lower(email)=lower(c.email) ORDER BY "recordedAt" DESC,id DESC LIMIT 1) e ON true`;
function predicate(f: AudienceFilters) {
    const parts: Prisma.Sql[] = [Prisma.sql `true`];
    if (f.search)
        parts.push(Prisma.sql `strpos(lower(concat_ws(' ',a.email,a."firstName",a."lastName",a."fullName",a.organization,a.context)),lower(${f.search}))>0`);
    if (f.tag)
        parts.push(Prisma.sql `EXISTS(SELECT 1 FROM "ContactTag" ct JOIN "Tag" t ON t.id=ct."tagId" WHERE ct."contactId"=a.id AND t.name=${f.tag})`);
    if (f.source)
        parts.push(Prisma.sql `EXISTS(SELECT 1 FROM "ConsentEvidence" ce WHERE ce."contactId"=a.id AND lower(ce.email)=lower(a.email) AND ce.source=${f.source})`);
    if (f.status)
        parts.push(Prisma.sql `a.permission=${f.status}`);
    if (f.review)
        parts.push(Prisma.sql `a."latestConsentStatus"='express_opt_in_needs_review'`);
    if (f.vip)
        parts.push(Prisma.sql `a.vip=true`);
    if (f.quality === 'missing_name')
        parts.push(Prisma.sql `coalesce(a."fullName",'') ~ '^[[:space:]]*$' AND coalesce(a."firstName",'') ~ '^[[:space:]]*$' AND coalesce(a."lastName",'') ~ '^[[:space:]]*$'`);
    if (f.quality === 'missing_city')
        parts.push(Prisma.sql `coalesce(a.city,'') ~ '^[[:space:]]*$'`);
    return Prisma.join(parts, ' AND ');
}
export async function audienceCount(f: AudienceFilters) {
    const rows = await prisma.$queryRaw<{
        count: bigint;
    }[]>(Prisma.sql `SELECT count(*) FROM (${projection}) a WHERE ${predicate(f)}`);
    return Number(rows[0].count);
}
export async function audienceRows(f: AudienceFilters, page?: number) {
    const order = f.sort === 'name' ? Prisma.sql `lower(coalesce(nullif(a."fullName",''),a.email)) ASC,a.id ASC` : f.sort === 'oldest' ? Prisma.sql `a."createdAt" ASC,a.id ASC` : Prisma.sql `a."createdAt" DESC,a.id ASC`;
    const ids = await prisma.$queryRaw<{
        id: string;
        permission: Permission;
        latestSource: string | null;
    }[]>(Prisma.sql `SELECT a.id,a.permission,a."latestSource" FROM (${projection}) a WHERE ${predicate(f)} ORDER BY ${order} ${page ? Prisma.sql `LIMIT 50 OFFSET ${(page - 1) * 50}` : Prisma.empty}`);
    const contacts = await prisma.contact.findMany({ where: { id: { in: ids.map(r => r.id) } }, include: { tags: { include: { tag: true } } } });
    const map = new Map(contacts.map(c => [c.id, c]));
    return ids.flatMap(row => { const c = map.get(row.id); return c ? [{ ...c, ...row }] : []; });
}
export const presets = [
    { label: 'All people', filters: {} }, { label: 'JT website', filters: { tag: 'Jackpot Website' } }, { label: 'Company website', filters: { tag: 'Website Signup' } }, { label: 'VIPs', filters: { vip: '1' } }, { label: 'Opt-in requests to review', filters: { review: '1' } }, { label: 'No recorded consent', filters: { status: 'unknown' } }, { label: 'Unsubscribed', filters: { status: 'unsubscribed' } }, { label: 'Suppressed', filters: { status: 'suppressed' } },
];
export async function audiencePresets() { return Promise.all(presets.map(async (p) => ({ ...p, count: await audienceCount(parseAudience(p.filters)) }))); }
export function csvCell(value: unknown) { const text = String(value ?? ''); const safe = /^[\s]*[=+@-]|^[\t\r\n]/.test(text) ? `'${text}` : text; return `"${safe.replaceAll('"', '""')}"`; }
export async function audiencePermission(id: string) { const rows = await prisma.$queryRaw<{
    permission: Permission;
}[]>(Prisma.sql `SELECT a.permission FROM (${projection}) a WHERE a.id=${id}`); return rows[0]?.permission; }
