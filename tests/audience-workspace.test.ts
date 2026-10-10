import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { createRequire } from 'node:module';
import { parseAudience, audienceCount, audienceRows, audienceUrl, csvCell, audiencePermission, audiencePresets } from '../src/lib/audience-workspace';
test('audience inputs are bounded; URLs and spreadsheet cells stay literal', () => {
    assert.equal(parseAudience({ page: '-1', search: ['x'], status: 'constructor' }).page, 1);
    assert.equal(parseAudience({ page: 'Infinity' }).page, 1);
    assert.equal(parseAudience({ status: 'constructor' }).status, '');
    assert.match(audienceUrl({ tag: 'Artists & friends #1', search: 'a+b@example.com' }), /Artists\+%26\+friends\+%231/);
    assert.equal(new URL(audienceUrl({ tag: 'Artists & friends #1' }, 'https://example.test')).searchParams.get('tag'), 'Artists & friends #1');
    for (const s of ['=SUM(1,2)', ' +3', '@evil', '-2', '\tword'])
        assert.ok(csvCell(s).startsWith('"\''));
    assert.equal(csvCell('A "quote"\r\nB'), '"A ""quote""\r\nB"');
});
test('isolated audience workspace', { skip: process.env.CRM_ISOLATED_PROOF !== '1' }, async (t) => {
    const u = new URL(process.env.DATABASE_URL || '');
    assert.equal(u.pathname, '/crm_readiness_test');
    assert.match(u.searchParams.get('host') || '', /^\/tmp\/company-crm-readiness\.[A-Za-z0-9]+$/);
    const { prisma } = await import('../src/lib/db');
    const { POST: create } = await import('../src/app/api/contacts/route');
    const { PUT: update } = await import('../src/app/api/contacts/[id]/route');
    const { PATCH: complete } = await import('../src/app/api/contacts/[id]/follow-ups/route');
    const { GET: exportCsv } = await import('../src/app/api/contacts/export/route');
    const req = (body: object) => new NextRequest('http://localhost/api/contacts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    try {
        const people = await Promise.all(['recorded', 'review', 'unknown', 'dnc', 'unsubscribed', 'suppressed'].map((kind, i) => prisma.contact.create({ data: { email: `${kind}@example.com`, fullName: `${['Amelia', 'Ben', 'Clara', 'Devon', 'Ellie', 'Farah'][i]} Audience`, organization: i === 0 ? 'Arts & friends #1' : null, solicitation: kind !== 'dnc', unsubscribedAt: kind === 'unsubscribed' ? new Date() : null, vip: kind === 'recorded' } })));
        const by = (kind: string) => people.find(p => p.email === `${kind}@example.com`)!;
        for (const kind of ['recorded', 'review', 'dnc', 'unsubscribed', 'suppressed'])
            await prisma.consentEvidence.create({ data: { contactId: by(kind).id, email: by(kind).email, source: 'jackpottwins.ca', status: kind === 'recorded' ? 'express_opt_in_recorded' : 'express_opt_in_needs_review' } });
        await prisma.globalSuppression.create({ data: { email: 'SUPPRESSED@example.com', emailHash: 'test-suppressed', reason: 'complaint', source: 'proof' } });
        const tag = await prisma.tag.create({ data: { name: 'Jackpot Website' } });
        await prisma.contactTag.create({ data: { contactId: by('unknown').id, tagId: tag.id } });
        await t.test('permission precedence, unknown evidence and blocked opt-in review remain distinct', async () => {
            for (const kind of ['recorded', 'review', 'unknown', 'dnc', 'unsubscribed', 'suppressed']) {
                assert.equal(await audiencePermission(by(kind).id), kind);
                assert.equal(await audienceCount(parseAudience({ status: kind })), 1);
            }
            assert.equal(await audienceCount(parseAudience({ review: '1' })), 4);
            assert.equal(await audienceCount(parseAudience({ review: '1', status: 'suppressed' })), 1);
            const segments = await audiencePresets();
            assert.equal(segments.find(s => s.label === 'JT website')?.count, 1);
        });
        await t.test('count/list/export use same organization, source, VIP and tag predicates', async () => {
            for (const f of [{ search: 'Arts & friends #1' }, { source: 'jackpottwins.ca', vip: '1' }, { tag: 'Jackpot Website' }, { review: '1', status: 'dnc' }]) {
                const filters = parseAudience(f);
                const rows = await audienceRows(filters, 1);
                assert.equal(rows.length, await audienceCount(filters));
                const response = await exportCsv(new NextRequest(audienceUrl(filters, 'http://localhost/api/contacts/export')));
                const text = await response.text();
                assert.equal(response.status, 200);
                assert.equal(text.split('\r\n').length, rows.length + 1);
                for (const r of rows)
                    assert.ok(text.includes(r.email));
            }
            assert.equal(await audienceCount(parseAudience({ search: "' OR true --" })), 0);
        });
        await t.test('resolved latest evidence clears review without weakening suppression precedence', async () => {
            const resolved = await prisma.consentEvidence.create({data:{contactId:by('review').id,email:by('review').email,source:'jackpottwins.ca',status:'express_opt_in_recorded',recordedAt:new Date(Date.now()+1000)}});
            const blocked = await prisma.consentEvidence.create({data:{contactId:by('suppressed').id,email:by('suppressed').email,source:'jackpottwins.ca',status:'express_opt_in_recorded',recordedAt:new Date(Date.now()+1000)}});
            const oldAddress = await prisma.consentEvidence.create({data:{contactId:by('review').id,email:'old-address@example.com',source:'jackpottwins.ca',status:'express_opt_in_needs_review',recordedAt:new Date(Date.now()+2000)}});
            try {
                assert.equal(await audienceCount(parseAudience({review:'1'})),2);
                assert.equal(await audiencePermission(by('review').id),'recorded');
                assert.equal(await audiencePermission(by('suppressed').id),'suppressed');
                assert.equal(await audienceCount(parseAudience({review:'1',status:'suppressed'})),0);
            } finally {await prisma.consentEvidence.deleteMany({where:{id:{in:[resolved.id,blocked.id,oldAddress.id]}}});}
        });
        await t.test('quality filters count/list/export only real missing fields, including whitespace', async () => {
            const fixtures = await Promise.all([
                prisma.contact.create({data:{email:'quality-blank@example.com',fullName:'  ',firstName:'\t',lastName:null,city:' '}}),
                prisma.contact.create({data:{email:'quality-first@example.com',firstName:'Real',city:'Toronto'}}),
                prisma.contact.create({data:{email:'quality-full@example.com',fullName:'Real Person',city:null}}),
            ]);
            try {
                for (const [quality, expected] of [['missing_name',1],['missing_city',2]] as const) {
                    const filters=parseAudience({search:'quality-',quality});
                    assert.equal(await audienceCount(filters),expected);
                    const rows=await audienceRows(filters,1);assert.equal(rows.length,expected);
                    const response=await exportCsv(new NextRequest(audienceUrl(filters,'http://localhost/api/contacts/export')));
                    const csv=await response.text();assert.equal(csv.split('\r\n').length,expected+1);
                    for(const row of rows)assert.ok(csv.includes(row.email));
                }
            } finally {await prisma.contact.deleteMany({where:{id:{in:fixtures.map(f=>f.id)}}});}
        });
        await t.test('creation validates, is case-insensitive and never opts anyone in', async () => {
            assert.equal((await create(req({ email: 'invalid' }))).status, 400);
            const responses = await Promise.all([create(req({ email: 'New@Example.com', firstName: 'Nora', solicitation: true })), create(req({ email: 'new@example.com' }))]);
            assert.deepEqual(responses.map(r => r.status).sort(), [201, 409]);
            assert.equal((await prisma.contact.findUniqueOrThrow({ where: { email: 'new@example.com' } })).solicitation, false);
        });
        await t.test('patch-only notes preserve concurrent permission; follow-up completion is contact scoped', async () => {
            await prisma.contact.update({ where: { id: by('recorded').id }, data: { solicitation: false } });
            assert.equal((await update(req({ personalNotes: 'Remember the next rehearsal.' }), { params: Promise.resolve({ id: by('recorded').id }) })).status, 200);
            assert.equal((await prisma.contact.findUniqueOrThrow({ where: { id: by('recorded').id } })).solicitation, false);
            const f = await prisma.contactFollowUp.create({ data: { contactId: by('recorded').id, description: 'Call about opening night', dueDate: new Date(Date.now() - 86400000) } });
            assert.equal((await complete(req({ id: f.id }), { params: Promise.resolve({ id: by('unknown').id }) })).status, 404);
            assert.equal((await prisma.contactFollowUp.findUniqueOrThrow({ where: { id: f.id } })).completedAt, null);
            assert.equal((await complete(req({ id: f.id }), { params: Promise.resolve({ id: by('recorded').id }) })).status, 200);
            await prisma.contactFollowUp.update({ where: { id: f.id }, data: { completedAt: null } });
        });
        await t.test('stable pagination and 14k-contact query timing', async () => {
            await prisma.contact.createMany({ data: Array.from({ length: 14100 }, (_, i) => ({ email: `audience-${i}@example.com`, fullName: `Audience Person ${i}`, solicitation: true })) });
            const start = performance.now();
            const segments = await audiencePresets();
            const first = await audienceRows(parseAudience({ sort: 'name' }), 1);
            const second = await audienceRows(parseAudience({ sort: 'name' }), 2);
            assert.equal(first.length, 50);
            assert.equal(second.length, 50);
            assert.equal(new Set([...first, ...second].map(c => c.id)).size, 100);
            assert.equal(segments[0].count, 14107);
            console.log(`14k audience preset counts + two pages: ${Math.round(performance.now() - start)}ms`);
        });
        if (process.env.CRM_BROWSER_PROOF === '1')
            await t.test('real browser audience journeys', async () => { await createRequire(import.meta.url)('./audience-browser-proof.cjs')(prisma, by('recorded').id); });
    }
    finally {
        await prisma.$disconnect();
        await (globalThis as unknown as {
            pool?: {
                end(): Promise<void>;
            };
        }).pool?.end();
    }
});
