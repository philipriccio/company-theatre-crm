/**
 * Company Theatre branded email template
 * Wraps campaign content in a clean, responsive template
 */

interface TemplateOptions {
  content: string
  previewText?: string
  unsubscribeUrl: string
  physicalAddress?: string
}

export function wrapInTemplate({
  content,
  previewText,
  unsubscribeUrl,
  physicalAddress = 'Toronto, ON, Canada',
}: TemplateOptions): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>The Company Theatre</title>
  ${previewText ? `<!--[if !mso]><!--><meta name="x-apple-disable-message-reformatting"><!--<![endif]-->
  <span style="display:none !important;visibility:hidden;mso-hide:all;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${previewText}</span>` : ''}
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #f4f4f5;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      background-color: #f4f4f5;
      padding: 40px 0;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 8px;
      overflow: hidden;
    }
    .header {
      background-color: #18181b;
      color: #ffffff;
      padding: 32px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 700;
      letter-spacing: -0.5px;
    }
    .content {
      padding: 32px;
      color: #27272a;
      font-size: 16px;
      line-height: 1.6;
    }
    .content p {
      margin: 0 0 16px 0;
    }
    .content a {
      color: #4f46e5;
    }
    .footer {
      background-color: #fafafa;
      padding: 24px 32px;
      text-align: center;
      font-size: 12px;
      color: #71717a;
    }
    .footer a {
      color: #71717a;
    }
    .footer p {
      margin: 0 0 8px 0;
    }
    @media only screen and (max-width: 620px) {
      .container {
        width: 100% !important;
        border-radius: 0 !important;
      }
      .content, .header, .footer {
        padding: 24px !important;
      }
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <h1>THE COMPANY THEATRE</h1>
      </div>
      <div class="content">
        ${content}
      </div>
      <div class="footer">
        <p>© ${new Date().getFullYear()} The Company Theatre</p>
        <p>${physicalAddress}</p>
        <p>
          <a href="${unsubscribeUrl}">Unsubscribe</a>
        </p>
      </div>
    </div>
  </div>
</body>
</html>
`.trim()
}

/**
 * Replace template variables with contact data
 */
export function personalizeContent(
  content: string,
  contact: {
    email: string
    firstName?: string | null
    lastName?: string | null
    fullName?: string | null
  }
): string {
  return content
    .replace(/\{\{email\}\}/g, contact.email)
    .replace(/\{\{firstName\}\}/g, contact.firstName || 'there')
    .replace(/\{\{lastName\}\}/g, contact.lastName || '')
    .replace(/\{\{fullName\}\}/g, contact.fullName || contact.firstName || 'Friend')
}
