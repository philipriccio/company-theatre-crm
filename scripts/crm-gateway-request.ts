import { gatewayRequest, INPUT_LIMIT } from './crm-gateway-transport'

async function main() {
  if (process.stdin.isTTY || process.argv.length !== 2) throw Error('Unsupported invocation')
  const timer = setTimeout(() => process.stdin.destroy(new Error('Input timeout')), 5000)
  let size = 0
  const chunks: Buffer[] = []
  try {
    for await (const chunk of process.stdin) {
      size += chunk.length
      if (size > INPUT_LIMIT) throw Error('Input limit')
      chunks.push(Buffer.from(chunk))
    }
  } finally { clearTimeout(timer) }
  process.stdout.write(await gatewayRequest(Buffer.concat(chunks).toString('utf8'), process.env))
}
main().catch(() => {
  console.error('CRM gateway request failed; verify protected gateway context, scope, expiry and CRM availability.')
  process.exitCode = 1
})
