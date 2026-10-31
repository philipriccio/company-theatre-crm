import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import { requiredMachineScope } from '../src/lib/auth/machine-scopes'

export const SECRET_NAME = 'COMPANY_CRM_MACHINE_TOKEN'
export const INPUT_LIMIT = 65536
export const OUTPUT_LIMIT = 4 * 1024 * 1024
const FAILURE = 'CRM gateway request failed; verify protected gateway context, scope, expiry and CRM availability.'
const ORIGIN = 'https://crm.companytheatre.ca'
type Runner = (config: string, env: Partial<NodeJS.ProcessEnv>) => Promise<Buffer>
function reject(): never { throw new Error(FAILURE) }
const quote = (value: string) => JSON.stringify(value)

/** The trusted Gateway owns these inherited values; never accept overrides from input. */
export async function gatewayRequest(input: string, env: Partial<NodeJS.ProcessEnv>, runner: Runner = runCurl): Promise<string> {
  try {
    if (Buffer.byteLength(input) > INPUT_LIMIT) reject()
    const token = env[SECRET_NAME] ?? ''
    if (!/^oc-sent-v2\.[A-Za-z0-9_-]+\.end$/.test(token) || token.length > 16384) reject()
    const proxy = new URL(env.HTTPS_PROXY ?? '')
    if (proxy.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(proxy.hostname) ||
      proxy.username !== 'openclaw' || !proxy.password || !proxy.port || proxy.pathname !== '/' || proxy.search || proxy.hash) reject()
    if (env.https_proxy && env.https_proxy !== env.HTTPS_PROXY) reject()
    if (env.NODE_USE_ENV_PROXY !== '1' || env.NODE_TLS_REJECT_UNAUTHORIZED === '0') reject()
    const ca = env.CURL_CA_BUNDLE
    if (!ca || !isAbsolute(ca) || ca !== env.NODE_EXTRA_CA_CERTS || ca !== env.SSL_CERT_FILE) reject()
    await access(ca)
    const request = JSON.parse(input)
    if (!request || typeof request !== 'object' || Array.isArray(request) ||
      Object.keys(request).some(key => !['method', 'path', 'body'].includes(key))) reject()
    const { method, path, body } = request
    if (typeof method !== 'string' || typeof path !== 'string' || path.length > 4096 ||
      /[\s#\\]/.test(path) || !path.startsWith('/api/')) reject()
    const url = new URL(path, ORIGIN)
    // Check the raw path first: URL normalization must not turn an unsafe path into an admitted route.
    if (url.origin !== ORIGIN || !requiredMachineScope(path.split('?')[0], method)) reject()
    if (method === 'GET' && body !== undefined) reject()
    if (body !== undefined && (!body || typeof body !== 'object' || Array.isArray(body))) reject()
    // No secret-bearing input channel, even within a request body/query.
    if (/oc-sent-v2\.|mcrm_[a-f0-9]{64}/.test(input)) reject()
    const config = [
      `url = ${quote(url.href)}`, `request = ${quote(method)}`,
      `header = ${quote('x-crm-machine-token: ' + token)}`,
      ...(body === undefined ? [] : ['header = "Content-Type: application/json"', `data-binary = ${quote(JSON.stringify(body))}`]),
    ].join('\n') + '\n'
    const result = await runner(config, env)
    if (result.length > OUTPUT_LIMIT) reject()
    const text = result.toString('utf8')
    const status = text.slice(-4)
    if (!/^\n2[0-9]{2}$/.test(status)) reject()
    const output = text.slice(0, -4)
    // Defense in depth against accidental credential reflection by an upstream service.
    if (/oc-sent-v2\.|mcrm_[a-f0-9]{64}/.test(output)) reject()
    return output
  } catch { return reject() }
}

/** Absolute system curl, no user config, explicit HTTPS-only and no redirects or bypass. */
export function runCurl(config: string, env: Partial<NodeJS.ProcessEnv>): Promise<Buffer> {
  return new Promise((resolve, fail) => {
    const child = spawn('/usr/bin/curl', [
      '--disable', '--silent', '--fail', '--proto', '=https', '--proto-redir', '=https',
      '--noproxy', '', '--connect-timeout', '5', '--max-time', '15',
      '--max-filesize', String(OUTPUT_LIMIT), '--write-out', '\n%{http_code}', '--config', '-',
    ], { env: { NODE_ENV: 'production', HTTPS_PROXY: env.HTTPS_PROXY, CURL_CA_BUNDLE: env.CURL_CA_BUNDLE }, stdio: ['pipe', 'pipe', 'ignore'] })
    const chunks: Buffer[] = []
    let size = 0
    let failed = false
    const abort = () => { failed = true; child.kill('SIGKILL'); fail(new Error(FAILURE)) }
    const timer = setTimeout(abort, 16000)
    child.on('error', abort)
    child.stdin.on('error', abort)
    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > OUTPUT_LIMIT) abort()
      else chunks.push(chunk)
    })
    child.on('close', code => {
      clearTimeout(timer)
      if (failed || code !== 0) fail(new Error(FAILURE))
      else resolve(Buffer.concat(chunks))
    })
    child.stdin.end(config)
  })
}
