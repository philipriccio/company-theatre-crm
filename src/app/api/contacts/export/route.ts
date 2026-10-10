import { NextRequest, NextResponse } from 'next/server';
import { audienceRows, csvCell, parseAudience, permissionLabels } from '@/lib/audience-workspace';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
    try {
        const contacts = await audienceRows(parseAudience(Object.fromEntries(request.nextUrl.searchParams)));
        const headers = ['email', 'firstName', 'lastName', 'fullName', 'organization', 'context', 'city', 'state', 'country', 'solicitation', 'permission', 'source', 'vip', 'tags', 'createdAt'];
        const rows = contacts.map(c => [c.email, c.firstName, c.lastName, c.fullName, c.organization, c.context, c.city, c.state, c.country, c.solicitation, permissionLabels[c.permission], c.latestSource, c.vip, c.tags.map(t => t.tag.name).join(', '), c.createdAt.toISOString()].map(csvCell).join(','));
        return new NextResponse([headers.join(','), ...rows].join('\r\n'), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="audience-export.csv"', 'Cache-Control': 'no-store' } });
    }
    catch {
        return NextResponse.json({ error: 'Could not export audience. Please try again.' }, { status: 500 });
    }
}
