import { createHash } from 'node:crypto'

// Content-bound opt-in: deployed code alone cannot change approved old sends.
export const ATTRIBUTION_MARKER = '<!-- tct-attribution:v1 -->'
export type AttributionContext = { creative: string; batch: string }
const digest = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 12)
export function attributionContext(campaign: { id: string; content: string }): AttributionContext | undefined {
  if (!campaign.content.includes(ATTRIBUTION_MARKER)) return undefined
  return { creative: `creative-${digest(campaign.content)}`, batch: `batch-${digest(campaign.id)}` }
}
export function isProtectedTrackingUrl(url: URL) {
  return /\/(?:api\/)?(?:unsubscribe|track)(?:\/|$)/i.test(url.pathname) ||
    [...url.searchParams.keys()].some(key => /^(?:t|token|signature|sig|expires|x-amz-.+|x-goog-.+)$/i.test(key))
}
export function attributedUrl(original: URL, context: AttributionContext, placement: number): string {
  // Only our public sites and the reviewed ticket destination, never arbitrary
  // personalized third-party links. No recipient data is an input to this API.
  if (!['jackpottwins.ca', 'www.jackpottwins.ca', 'companytheatre.ca', 'www.companytheatre.ca', 'www.mirvish.com', 'mirvish.com'].includes(original.hostname) || isProtectedTrackingUrl(original)) return original.toString()
  const url = new URL(original)
  const tags = { utm_source: 'company_theatre', utm_medium: 'email', utm_campaign: 'company_theatre_email', utm_content: `${context.creative}-placement-${placement}`, utm_id: context.batch }
  for (const [key, value] of Object.entries(tags)) if (!url.searchParams.has(key)) url.searchParams.set(key, value)
  return url.toString()
}
