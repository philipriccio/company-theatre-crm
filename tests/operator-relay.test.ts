import test from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createRelay, CONTAINER_PIPE, validateTarget } from '../scripts/auth-operator/relay.mjs'

const container='a'.repeat(64)
async function listen(server:net.Server) {
  server.listen(0,'127.0.0.1');await once(server,'listening')
  const address=server.address();assert.ok(address&&typeof address!=='string');assert.equal(address.address,'127.0.0.1');return address.port
}
test('relay copies HTTP bytes through real child stdin/stdout and TCP without rewriting Host/Origin',async()=>{
  const seen: Array<{host?:string,origin?:string,body:string}>=[]
  const upstream=http.createServer(async(req,res)=>{let body='';for await(const b of req)body+=b;seen.push({host:req.headers.host,origin:req.headers.origin,body});res.end('x'.repeat(524288))})
  const port=await listen(upstream)
  const children:ReturnType<typeof spawn>[]=[]
  const relay=createRelay({container,port,connect:()=>{const child=spawn(process.execPath,['-e',CONTAINER_PIPE,String(port)],{stdio:['pipe','pipe','ignore']});children.push(child);return child}})
  try{
    const local=await listen(relay.server)
    const response=await new Promise<string>((resolve,reject)=>{
      const req=http.request(`http://127.0.0.1:${local}/operation`,{method:'POST',headers:{host:`127.0.0.1:${port}`,origin:`http://127.0.0.1:${port}`}},res=>{let text='';res.on('data',b=>text+=b);res.on('end',()=>resolve(text))});req.on('error',reject);req.end('synthetic payload')
    })
    assert.equal(response.length,524288);assert.ok(/^x+$/.test(response))
    assert.deepEqual(seen,[{host:`127.0.0.1:${port}`,origin:`http://127.0.0.1:${port}`,body:'synthetic payload'}])
  }finally{relay.stop();upstream.closeAllConnections();await new Promise<void>(r=>upstream.close(()=>r()));await Promise.all(children.filter(c=>c.exitCode===null).map(c=>once(c,'close')))}
})

test('relay rejects unsafe target arguments',()=>{
  for(const id of ['--privileged','named-container','a;echo bad'])assert.throws(()=>validateTarget(id,12345))
  for(const port of [0,80,65536,1.5,NaN])assert.throws(()=>validateTarget(container,port))
})

test('relay bounds connections, input/output bytes, lifetime and reaps children',async()=>{
  for(const mode of ['input','output','idle','deadline','lifetime','concurrency','spawn-error']){
    const children:ReturnType<typeof spawn>[]=[]
    const code=mode==='output'?"process.stdout.write(Buffer.alloc(4096));setInterval(()=>{},1000)":"process.stdin.resume();setInterval(()=>{},1000)"
    const relay=createRelay({container,port:12345,maxBytes:1024,maxConnections:1,
      lifetimeMs:mode==='lifetime'?150:5000,connectionMs:mode==='deadline'?150:4000,idleMs:mode==='idle'?150:3000,
      connect:()=>{const c=spawn(mode==='spawn-error'?'/nonexistent/crm-relay-test':process.execPath,['-e',code],{stdio:['pipe','pipe','ignore']});children.push(c);return c}})
    const local=await listen(relay.server)
    const socket=net.connect(local,'127.0.0.1');socket.on('error',()=>{});socket.resume()
    try{
      const closed=once(socket,'close')
      await once(socket,'connect')
      if(mode==='input')socket.write(Buffer.alloc(2048))
      if(mode==='concurrency'){
        const extra=net.connect(local,'127.0.0.1');extra.on('error',()=>{});extra.resume();await once(extra,'close');assert.equal(children.length,1);relay.stop()
      }
      await closed
      if(mode==='lifetime')assert.equal(relay.server.listening,false)
    }finally{socket.destroy();relay.stop();await Promise.all(children.filter(c=>c.exitCode===null && c.signalCode===null).map(c=>new Promise<void>(r=>{c.once('close',()=>r());setTimeout(r,1200)})))}
    for(const child of children)assert.ok(child.exitCode!==null || child.signalCode!==null || mode==='spawn-error')
  }
})

test('child pipe exits on unavailable destination, with no payload output',async()=>{
  const server=net.createServer();const port=await listen(server);await new Promise<void>(r=>server.close(()=>r()))
  const child=spawn(process.execPath,['-e',CONTAINER_PIPE,String(port)],{stdio:['pipe','pipe','pipe']})
  let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b)
  child.stdin.on('error',()=>{});child.stdin.end('synthetic private bytes')
  await once(child,'close');assert.equal(output,'')
})
