import sgMail from '@sendgrid/mail'

// Legacy single-message compatibility only. Campaign execution must use src/lib/email providers + worker.
const apiKey = process.env.SENDGRID_API_KEY
if (apiKey) {
  sgMail.setApiKey(apiKey)
}

export interface EmailParams {
  to: string
  from: {
    email: string
    name: string
  }
  replyTo?: string
  subject: string
  html: string
  trackingSettings?: {
    clickTracking?: { enable: boolean }
    openTracking?: { enable: boolean }
  }
  customArgs?: Record<string, string>
}

export async function sendEmail(params: EmailParams): Promise<boolean> {
  if (!apiKey) {
    console.error('SendGrid API key not configured')
    return false
  }

  try {
    await sgMail.send({
      to: params.to,
      from: params.from,
      replyTo: params.replyTo || params.from.email,
      subject: params.subject,
      html: params.html,
      trackingSettings: params.trackingSettings || {
        clickTracking: { enable: true },
        openTracking: { enable: true },
      },
      customArgs: params.customArgs,
    })
    return true
  } catch (error) {
    console.error('SendGrid error:', error)
    return false
  }
}
