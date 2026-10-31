// Standalone host-side transport. Requires Node, Docker permission, and a reviewed
// operator container ID; never accepts credentials or publishes a public socket.
import net from 'node:net'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export const CONTAINER_PIPE = String.raw`
const net=require('node:net');
const port=Number(process.argv[1]);
if(!Number.isInteger(port)||port<1024||port>65535)process.exit(1);
const socket=net.connect({host:'127.0.0.1',port});
const stop=()=>{socket.destroy();process.exit(0)};
const lifetime=setTimeout(stop,30000);
socket.setTimeout(10000,stop);
let incoming=0,outgoing=0;
process.stdin.on('data',b=>{incoming+=b.length;if(incoming>1048576)stop()});
socket.on('data',b=>{outgoing+=b.length;if(outgoing>1048576)stop()});
socket.on('error',stop);process.stdin.on('error',stop);process.stdout.on('error',stop);
process.stdin.pipe(socket);socket.pipe(process.stdout);
socket.on('close',()=>{clearTimeout(lifetime);process.stdout.end(()=>process.exit(0))});
process.on('SIGTERM',stop);process.on('SIGINT',stop);
`

export function validateTarget(container, port) {
  // Immutable full ID prevents accidental container-name reuse during enrollment.
  if (!/^[a-f0-9]{64}$/.test(container) || !Number.isInteger(port) || port<1024 || port>65535) throw new Error('Expected full container ID and unprivileged operator port.')
}

// Injection is for synthetic local transport tests only; the CLI always uses docker.
export function createRelay({container, port, connect = () => spawn('docker', ['exec','-i',container,'node','-e',CONTAINER_PIPE,String(port)], {stdio:['pipe','pipe','ignore']}), lifetimeMs=900000, connectionMs=30000, idleMs=10000, maxConnections=8, maxBytes=1048576}) {
  validateTarget(container, port)
  const active = new Set()
  let stopped=false
  const server=net.createServer(socket=>{
    if(stopped || active.size>=maxConnections){socket.destroy();return}
    let child
    let ended=false
    const close=()=>{
      if(ended)return
      ended=true;clearTimeout(deadline);active.delete(close);socket.destroy()
      if(child){
        child.stdin.destroy();child.stdout.destroy();child.kill('SIGTERM')
        const reap=setTimeout(()=>{if(child.exitCode===null)child.kill('SIGKILL')},1000)
        reap.unref();child.once('close',()=>clearTimeout(reap))
      }
    }
    const deadline=setTimeout(close,connectionMs)
    active.add(close);socket.setTimeout(idleMs,close);socket.on('error',close);socket.on('close',close)
    try {child=connect()}catch{close();return}
    child.on('error',close);child.on('close',code=>{if(code===0)socket.end();else close()})
    child.stdin.on('error',close);child.stdout.on('error',close)
    let incoming=0,outgoing=0
    socket.on('data',chunk=>{incoming+=chunk.length;if(incoming>maxBytes)close()})
    child.stdout.on('data',chunk=>{outgoing+=chunk.length;if(outgoing>maxBytes)close()})
    socket.pipe(child.stdin);child.stdout.pipe(socket)
  })
  const stop=()=>{stopped=true;clearTimeout(lifetime);for(const close of active)close();if(server.listening)server.close()}
  const lifetime=setTimeout(stop,lifetimeMs)
  server.on('error',stop);server.on('close',()=>clearTimeout(lifetime))
  return {server,stop}
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  try {
    if(process.argv.length!==4)throw new Error()
    const container=process.argv[2],port=Number(process.argv[3])
    const {server,stop}=createRelay({container,port})
    process.on('SIGTERM',stop);process.on('SIGINT',stop)
    server.on('error',()=>{console.error('Private relay unavailable; no payload logged.');process.exitCode=1})
    server.listen(port,'127.0.0.1',()=>console.log(`Private relay: http://127.0.0.1:${port}/; closes after 15 minutes. Stop operator container separately.`))
  }catch{console.error('Usage: node relay.mjs FULL_CONTAINER_ID OPERATOR_PORT (no credentials).');process.exitCode=1}
}
