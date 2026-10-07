import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { CAMPAIGN_DEFAULTS_KEY, DEFAULT_CAMPAIGN_DEFAULTS, normalizeCampaignDefaults } from '@/lib/campaign-settings'

export async function GET() {
  try {
    const saved = await prisma.setting.findUnique({ where: { key: CAMPAIGN_DEFAULTS_KEY } })
    const defaults = saved ? normalizeCampaignDefaults(JSON.parse(saved.value)) : DEFAULT_CAMPAIGN_DEFAULTS
    const configured = (process.env.EMAIL_PROVIDER || 'disabled').toLowerCase()
    const provider = ['mock', 'ses'].includes(configured) ? configured : 'disabled'
    return NextResponse.json({ defaults, delivery: { provider } }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Settings could not be loaded. Please try again.' }, { status: 503 })
  }
}

export async function PUT(request: NextRequest) {
  // Admin routes remain behind the authentication gate; reject cross-site writes too.
  const origin = request.headers.get('origin')
  // Next may normalize a loopback nextUrl to localhost. Compare the browser
  // Origin against its actual Host instead; neither is a writable form field.
  let sameHost = !origin
  try { if (origin) sameHost = new URL(origin).host === request.headers.get('host') } catch { sameHost = false }
  if (request.headers.get('sec-fetch-site') === 'cross-site' || !sameHost) {
    return NextResponse.json({ error: 'Open Settings in the CRM to save changes.' }, { status: 403 })
  }
  let defaults
  try {
    defaults = normalizeCampaignDefaults(await request.json())
  } catch (error) {
    return NextResponse.json({ error: error instanceof SyntaxError ? 'Invalid settings data.' : error instanceof Error ? error.message : 'Invalid settings data.' }, { status: 400 })
  }
  try {
    await prisma.setting.upsert({
      where: { key: CAMPAIGN_DEFAULTS_KEY },
      create: { key: CAMPAIGN_DEFAULTS_KEY, value: JSON.stringify(defaults) },
      update: { value: JSON.stringify(defaults) },
    })
    return NextResponse.json({ defaults })
  } catch {
    return NextResponse.json({ error: 'Your changes were not saved. Please try again.' }, { status: 503 })
  }
}
