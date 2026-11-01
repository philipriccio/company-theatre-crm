import { actorFor, businessEvent } from '@/lib/security/history'
import { guard } from '@/lib/auth/access'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { CAMPAIGN_DEFAULTS_KEY, DEFAULT_CAMPAIGN_DEFAULTS, normalizeCampaignDefaults } from '@/lib/campaign-settings'

export async function GET(request: Request) {
  const denied = await guard(request)
  if (denied) return denied

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
  const denied = await guard(request)
  if (denied) return denied

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
    const actor=await actorFor(request)
    await prisma.$transaction(async tx=>{
    await tx.setting.upsert({
      where: { key: CAMPAIGN_DEFAULTS_KEY },
      create: { key: CAMPAIGN_DEFAULTS_KEY, value: JSON.stringify(defaults) },
      update: { value: JSON.stringify(defaults) },
    })
    await businessEvent(tx,actor,'campaign_defaults_updated','campaign-defaults')
    })
    return NextResponse.json({ defaults })
  } catch {
    return NextResponse.json({ error: 'Your changes were not saved. Please try again.' }, { status: 503 })
  }
}
