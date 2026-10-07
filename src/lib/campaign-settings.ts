export interface CampaignDefaults {
  fromName: string
  fromEmail: string
  replyToEmail: string
}

export const CAMPAIGN_DEFAULTS_KEY = 'campaign_defaults_v1'
export const DEFAULT_CAMPAIGN_DEFAULTS: CampaignDefaults = {
  fromName: 'The Company Theatre',
  fromEmail: 'philip@companytheatre.ca',
  replyToEmail: 'philip@companytheatre.ca',
}

export function normalizeCampaignDefaults(input: unknown): CampaignDefaults {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Enter sender details.')
  const data = input as Record<string, unknown>
  const allowed = Object.keys(DEFAULT_CAMPAIGN_DEFAULTS)
  if (Object.keys(data).some(key => !allowed.includes(key))) throw new Error('Only sender defaults can be saved here.')
  const normalized = {} as CampaignDefaults
  for (const key of allowed as (keyof CampaignDefaults)[]) {
    const value = data[key]
    if (typeof value !== 'string' || /[\x00-\x1f\x7f]/.test(value)) throw new Error('Enter valid sender details without line breaks.')
    normalized[key] = value.trim()
  }
  if (!normalized.fromName || normalized.fromName.length > 100) throw new Error('Sender name must be between 1 and 100 characters.')
  for (const key of ['fromEmail', 'replyToEmail'] as const) {
    normalized[key] = normalized[key].toLowerCase()
    const [local, domain, extra] = normalized[key].split('@')
    if (extra !== undefined || !local || local.length > 64 || normalized[key].length > 254 ||
      !/^[a-z0-9_+-]+(?:\.[a-z0-9_+-]+)*$/.test(local) || !domain ||
      domain.split('.').length < 2 || domain.split('.').some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
      throw new Error('Use a single valid email address for sender and replies.')
    }
  }
  if (!normalized.fromEmail.endsWith('@companytheatre.ca')) throw new Error('Use a Company Theatre sender address.')
  return normalized
}
