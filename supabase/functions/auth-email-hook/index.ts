import { logError } from "../_shared/logger.ts";

type LovableEmailPayload = {
  version?: string
  run_id?: string
  data?: Record<string, any>
}

type LovableEmailMessage = {
  run_id: string
  to: string
  from: string
  sender_domain: string
  subject: string
  html: string
  text: string
  purpose: 'transactional'
}

function parseEmailWebhookPayload(body: any): LovableEmailPayload {
  if (!body || typeof body !== 'object' || !body.data || typeof body.data !== 'object') {
    throw new WebhookError('invalid_payload', 'Webhook payload is missing data')
  }
  return body as LovableEmailPayload
}

async function sendLovableEmail(
  message: LovableEmailMessage,
  options: { apiKey: string; sendUrl: string },
): Promise<{ message_id?: string }> {
  const response = await fetch(options.sendUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(message),
  })

  const text = await response.text()
  const data = text ? JSON.parse(text) : {}
  if (!response.ok) throw new Error(data?.error || data?.message || `Email API returned ${response.status}`)
  return data
}
// Webhook verification - inline HMAC-SHA256 implementation
// (Lovable's edge-runtime package is unavailable in Deno; reimplemented using Web Crypto API)
class WebhookError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

async function verifyWebhookRequest({ req, secret, parser }: { req: Request; secret: string; parser: (body: any) => any }) {
  const timestamp = req.headers.get('x-lovable-timestamp')
  const signature = req.headers.get('x-lovable-signature')

  if (!timestamp) throw new WebhookError('missing_timestamp', 'Missing x-lovable-timestamp header')

  const ts = parseInt(timestamp, 10)
  if (isNaN(ts)) throw new WebhookError('invalid_timestamp', 'Invalid x-lovable-timestamp header')

  // Reject requests older than 5 minutes (anti-replay)
  const nowSec = Math.floor(Date.now() / 1000)
  if (Math.abs(nowSec - ts) > 300) throw new WebhookError('stale_timestamp', 'Request timestamp is too old')

  const rawBody = await req.text()

  // Compute expected HMAC-SHA256 signature over "<timestamp>.<body>"
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${rawBody}`))
  const expected = 'sha256=' + Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  if (!signature || signature !== expected) {
    throw new WebhookError('invalid_signature', 'Webhook signature verification failed')
  }

  let body: any
  try {
    body = JSON.parse(rawBody)
  } catch {
    throw new WebhookError('invalid_json', 'Webhook body is not valid JSON')
  }

  const payload = parser(body)
  return { payload }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-lovable-signature, x-lovable-timestamp, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const EMAIL_SUBJECTS: Record<string, string> = {
  signup: 'Confirm your email',
  invite: "You've been invited",
  magiclink: 'Your login link',
  recovery: 'Reset your password',
  email_change: 'Confirm your new email',
  reauthentication: 'Your verification code',
}

// Configuration
const SITE_NAME = "swift-link-story"
const SENDER_DOMAIN = "books.grx10.com"
const ROOT_DOMAIN = "grx10.com"
const FROM_DOMAIN = "books.grx10.com" // Domain shown in From address (may be root or sender subdomain)

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function emailContent(type: string, data: Record<string, any>) {
  const url = escapeHtml(data.confirmationUrl || data.siteUrl || `https://${ROOT_DOMAIN}`)
  const token = escapeHtml(data.token)
  switch (type) {
    case 'signup':
      return { preview: 'Verify your email for GRX10', title: 'Welcome to GRX10', body: `Thanks for signing up! Please verify your email address (${escapeHtml(data.recipient)}) to access your dashboard.`, cta: 'Verify Email', url }
    case 'invite':
      return { preview: "You've been invited to GRX10", title: "You've been invited", body: "You've been invited to join GRX10 Business Suite. Click below to accept and set up your account.", cta: 'Accept Invitation', url }
    case 'magiclink':
      return { preview: 'Your GRX10 login link', title: 'Your login link', body: 'Click below to securely sign in to GRX10.', cta: 'Sign In', url }
    case 'recovery':
      return { preview: 'Reset your password for GRX10', title: 'Reset your password', body: 'We received a request to reset your password. Click the button below to choose a new one.', cta: 'Reset Password', url }
    case 'email_change':
      return { preview: 'Confirm your new email for GRX10', title: 'Confirm your new email', body: `Confirm changing your GRX10 email from ${escapeHtml(data.email)} to ${escapeHtml(data.newEmail)}.`, cta: 'Confirm Email', url }
    case 'reauthentication':
      return { preview: 'Your GRX10 verification code', title: 'Verification code', body: `Use this code to continue: ${token}`, cta: '', url: '' }
    default:
      return null
  }
}

function renderEmail(type: string, data: Record<string, any>, plainText = false): string | null {
  const content = emailContent(type, data)
  if (!content) return null
  if (plainText) return `${content.title}\n\n${content.body}${content.url ? `\n\n${content.cta}: ${content.url}` : ''}`
  const button = content.cta && content.url
    ? `<a href="${content.url}" style="display:inline-block;background:#c41572;color:#fff;font-size:14px;font-weight:600;border-radius:12px;padding:12px 24px;text-decoration:none">${content.cta}</a>`
    : ''
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(content.preview)}</title></head><body style="background:#fff;font-family:Archivo,Arial,sans-serif;margin:0"><div style="display:none;max-height:0;overflow:hidden">${escapeHtml(content.preview)}</div><main style="padding:40px 32px;max-width:480px;margin:0 auto"><img src="https://qfgudhbrjfjmbamwsfuj.supabase.co/storage/v1/object/public/email-assets/grx10-icon.png" width="48" height="48" alt="GRX10" style="margin-bottom:24px"><h1 style="font-size:22px;font-weight:bold;color:#1a1625;margin:0 0 16px">${escapeHtml(content.title)}</h1><p style="font-size:14px;color:#605e6b;line-height:1.6;margin:0 0 28px">${content.body}</p>${button}<p style="font-size:12px;color:#999;margin:32px 0 0">If you weren't expecting this email, you can safely ignore it.</p></main></body></html>`
}

// Sample data for preview mode ONLY (not used in actual email sending).
// URLs are baked in at scaffold time from the project's real data.
// The sample email uses a fixed placeholder (RFC 6761 .test TLD) so the Go backend
// can always find-and-replace it with the actual recipient when sending test emails,
// even if the project's domain has changed since the template was scaffolded.
const SAMPLE_PROJECT_URL = "https://swift-link-story.lovable.app"
const SAMPLE_EMAIL = "user@example.test"
const SAMPLE_DATA: Record<string, object> = {
  signup: {
    siteName: SITE_NAME,
    siteUrl: SAMPLE_PROJECT_URL,
    recipient: SAMPLE_EMAIL,
    confirmationUrl: SAMPLE_PROJECT_URL,
  },
  magiclink: {
    siteName: SITE_NAME,
    confirmationUrl: SAMPLE_PROJECT_URL,
  },
  recovery: {
    siteName: SITE_NAME,
    confirmationUrl: SAMPLE_PROJECT_URL,
  },
  invite: {
    siteName: SITE_NAME,
    siteUrl: SAMPLE_PROJECT_URL,
    confirmationUrl: SAMPLE_PROJECT_URL,
  },
  email_change: {
    siteName: SITE_NAME,
    email: SAMPLE_EMAIL,
    newEmail: SAMPLE_EMAIL,
    confirmationUrl: SAMPLE_PROJECT_URL,
  },
  reauthentication: {
    token: '123456',
  },
}

// Preview endpoint handler - returns rendered HTML without sending email
async function handlePreview(req: Request): Promise<Response> {
  const previewCorsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, content-type',
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: previewCorsHeaders })
  }

  const apiKey = Deno.env.get('LOVABLE_API_KEY')
  const authHeader = req.headers.get('Authorization')

  if (!apiKey || authHeader !== `Bearer ${apiKey}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...previewCorsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let type: string
  try {
    const body = await req.json()
    type = body.type
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Invalid JSON in request body' }), {
      status: 400,
      headers: { ...previewCorsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const sampleData = SAMPLE_DATA[type] || {}
  const html = renderEmail(type, sampleData as Record<string, any>)

  if (!html) {
    return new Response(JSON.stringify({ error: `Unknown email type: ${type}` }), {
      status: 400,
      headers: { ...previewCorsHeaders, 'Content-Type': 'application/json' },
    })
  }

  return new Response(html, {
    status: 200,
    headers: { ...previewCorsHeaders, 'Content-Type': 'text/html; charset=utf-8' },
  })
}

// Webhook handler - verifies signature and sends email
async function handleWebhook(req: Request): Promise<Response> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY')

  if (!apiKey) {
    console.error('LOVABLE_API_KEY not configured')
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Verify signature + timestamp, then parse payload.
  let payload: any
  let run_id = ''
  try {
    const verified = await verifyWebhookRequest({
      req,
      secret: apiKey,
      parser: parseEmailWebhookPayload,
    })
    payload = verified.payload
    run_id = payload.run_id
  } catch (error) {
    if (error instanceof WebhookError) {
      switch (error.code) {
        case 'invalid_signature':
        case 'missing_timestamp':
        case 'invalid_timestamp':
        case 'stale_timestamp':
          logError("auth-email-hook", error, { code: "invalid_signature" });
          return new Response(JSON.stringify({ error: 'Invalid signature' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        case 'invalid_payload':
        case 'invalid_json':
          logError("auth-email-hook", error, { code: "invalid_payload" });
          return new Response(
            JSON.stringify({ error: 'Invalid webhook payload' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
      }
    }

    logError("auth-email-hook", error, { stage: "verification" });
    return new Response(
      JSON.stringify({ error: 'Invalid webhook payload' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  if (!run_id) {
    console.error('Webhook payload missing run_id')
    return new Response(
      JSON.stringify({ error: 'Invalid webhook payload' }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  if (payload.version !== '1') {
    console.error('Unsupported payload version', { version: payload.version, run_id })
    return new Response(
      JSON.stringify({ error: `Unsupported payload version: ${payload.version}` }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // The email action type is in payload.data.action_type (e.g., "signup", "recovery")
  // payload.type is the hook event type ("auth")
  const emailType = payload.data.action_type
  console.log('Received auth event', { emailType, email: payload.data.email, run_id })

  // Build template props from payload.data (HookData structure)
  const templateProps = {
    siteName: SITE_NAME,
    siteUrl: `https://${ROOT_DOMAIN}`,
    recipient: payload.data.email,
    confirmationUrl: payload.data.url,
    token: payload.data.token,
    email: payload.data.email,
    newEmail: payload.data.new_email,
  }

  const html = renderEmail(emailType, templateProps)
  const text = renderEmail(emailType, templateProps, true)
  if (!html || !text) {
    console.error('Unknown email type', { emailType, run_id })
    return new Response(
      JSON.stringify({ error: `Unknown email type: ${emailType}` }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Send email via Lovable Email API
  // The callback URL is provided in the payload by Lovable, ensuring correct routing
  // for both production and local development
  const callbackUrl = payload.data.callback_url
  if (!callbackUrl) {
    console.error('No callback_url in payload', { run_id })
    return new Response(JSON.stringify({ error: 'Missing callback_url in payload' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let result: { message_id?: string }
  try {
    result = await sendLovableEmail(
      {
        run_id,
        to: payload.data.email,
        from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
        sender_domain: SENDER_DOMAIN,
        subject: EMAIL_SUBJECTS[emailType] || 'Notification',
        html,
        text,
        purpose: 'transactional',
      },
      { apiKey, sendUrl: callbackUrl }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send email'
    console.error('Email API error', { error: message, run_id })
    return new Response(JSON.stringify({ error: 'Failed to send email' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  console.log('Email sent successfully', { message_id: result.message_id, run_id })

  return new Response(
    JSON.stringify({ success: true, message_id: result.message_id }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

Deno.serve(async (req) => {
  const url = new URL(req.url)

  // Handle CORS preflight for main endpoint
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Route to preview handler for /preview path
  if (url.pathname.endsWith('/preview')) {
    return handlePreview(req)
  }

  // Main webhook handler
  try {
    return await handleWebhook(req)
  } catch (error) {
    console.error('Webhook handler error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
