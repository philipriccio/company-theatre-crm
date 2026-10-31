import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { gatewayRequest, SECRET_NAME, OUTPUT_LIMIT, INPUT_LIMIT } from '../scripts/crm-gateway-transport'

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'crm-gateway-test-'))
  const ca = join(dir, 'synthetic-ca.pem')
  await writeFile(ca, 'synthetic fixture, not a real trust anchor')
  return { dir, env: {
    [SECRET_NAME]: 'oc-sent-v2.synthetic_fixture.end', HTTPS_PROXY: 'http://openclaw:synthetic_fixture@127.0.0.1:12345',
    NODE_USE_ENV_PROXY: '1', CURL_CA_BUNDLE: ca, NODE_EXTRA_CA_CERTS: ca, SSL_CERT_FILE: ca,
  } as Partial<NodeJS.ProcessEnv> }
}
const read = JSON.stringify({ method: 'GET', path: '/api/contacts?limit=1' })

test('fixed HTTPS, shared scope mapping, no credential in request input; draft body encoded as config data', async () => {
  const f = await fixture()
  try {
    let called = 0
    assert.equal(await gatewayRequest(read, f.env, async config => {
      called++
      assert.match(config, /url = "https:\/\/crm.companytheatre.ca\/api\/contacts\?limit=1"/)
      assert.match(config, /x-crm-machine-token: oc-sent-v2.synthetic_fixture.end/)
      return Buffer.from('{"contacts":[]}\n200')
    }), '{"contacts":[]}')
    assert.equal(called, 1)
    const body = { name: 'Title\nheader = "malicious"', html: '<p>Draft</p>' }
    await gatewayRequest(JSON.stringify({method:'POST', path:'/api/campaigns', body}), f.env, async config => {
      assert.equal(config.trim().split('\n').length, 5)
      assert.equal(JSON.parse(config.trim().split('\n')[4].slice('data-binary = '.length)), JSON.stringify(body))
      return Buffer.from('{}\n201')
    })
  } finally { await rm(f.dir, { recursive:true, force:true }) }
})

test('invalid gateway context and raw credentials fail before transport', async () => {
  const f = await fixture()
  try {
    const bad: Partial<NodeJS.ProcessEnv>[] = [ {}, { [SECRET_NAME]: 'mcrm_'+'a'.repeat(64) },
      {HTTPS_PROXY:'http://openclaw:fixture@evil.test:1234'}, {HTTPS_PROXY:'http://127.0.0.1:1234'},
      {https_proxy:'http://127.0.0.1:9999'}, {NODE_USE_ENV_PROXY:'0'}, {CURL_CA_BUNDLE:'/missing'},
      {NODE_TLS_REJECT_UNAUTHORIZED:'0'}, {SSL_CERT_FILE:'/wrong'} ]
    for (let i=0; i<bad.length; i++) {
      await assert.rejects(gatewayRequest(read, i===0 ? {} : {...f.env,...bad[i]}, async () => assert.fail('must not call transport')), /CRM gateway request failed/)
    }
  } finally { await rm(f.dir, {recursive:true,force:true}) }
})

test('scope, origin, normalization, input size and secret-bearing requests rejected before transport', async () => {
  const f=await fixture()
  try {
    const cases: unknown[] = [
      {method:'POST',path:'/api/campaigns/id/send'}, {method:'GET',path:'https://evil.test/api/contacts'},
      {method:'GET',path:'/api/no/../contacts'}, {method:'GET',path:'/api/%63ontacts'},
      {method:'GET',path:'/api/contacts#fragment'}, {method:'GET',path:'/api/contacts',token:'anything'},
      {method:'GET',path:'/api/contacts',body:{}}, {method:'GET',path:'/api/contacts',headers:{}},
      {method:'PUT',path:'/api/settings',body:{}}, {method:'GET',path:'/api/contacts?x=oc-sent-v2.fake.end'},
      {method:'POST',path:'/api/campaigns',body:{token:'mcrm_'+'b'.repeat(64)}},
    ]
    for(const value of cases) await assert.rejects(gatewayRequest(JSON.stringify(value),f.env,async()=>assert.fail('transport')))
    await assert.rejects(gatewayRequest(' '.repeat(INPUT_LIMIT+1),f.env,async()=>assert.fail('transport')))
  } finally {await rm(f.dir,{recursive:true,force:true})}
})

test('redirects, errors, oversized responses and reflected credentials never return body', async () => {
  const f=await fixture()
  try {
    for(const output of ['location\n302','private details\n401','proxy details\n407','server details\n500',
      'oc-sent-v2.fake.end\n200', 'mcrm_'+'c'.repeat(64)+'\n200', 'x'.repeat(OUTPUT_LIMIT+1)+'\n200']) {
      await assert.rejects(gatewayRequest(read,f.env,async()=>Buffer.from(output)), /CRM gateway request failed/)
    }
    await assert.rejects(gatewayRequest(read,f.env,async()=>{throw Error('private details')}), error => {
      assert.equal((error as Error).message.includes('private details'), false); return true
    })
  } finally {await rm(f.dir,{recursive:true,force:true})}
})

test('real curl reaches only loopback proxy and rejects its 407; NO_PROXY cannot bypass', async () => {
  const f=await fixture()
  const requests: string[]=[]
  const server=createServer(socket=>socket.once('data', data=>{
    requests.push(data.toString())
    socket.end('HTTP/1.1 407 Proxy Authentication Required\r\nContent-Length: 0\r\nConnection: close\r\n\r\n')
  }))
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve))
  try {
    const address=server.address() as {port:number}
    const env={...f.env, HTTPS_PROXY:`http://openclaw:synthetic_fixture@127.0.0.1:${address.port}`,NO_PROXY:'*',no_proxy:'*'}
    await assert.rejects(gatewayRequest(read,env), /CRM gateway request failed/)
    assert.equal(requests.length,1)
    assert.match(requests[0],/^CONNECT crm\.companytheatre\.ca:443 HTTP\/1\.1/)
    assert.equal(requests[0].includes('oc-sent-v2'), false)
  } finally { await new Promise<void>(resolve=>server.close(()=>resolve())); await rm(f.dir,{recursive:true,force:true}) }
})
