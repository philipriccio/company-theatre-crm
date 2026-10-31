// Protected-entry adapter: a host credential broker writes JSON to stdin.
// Never pass credentials as command arguments, shell variables, URLs or logs.
import { requiredMachineScope } from '../src/lib/auth/machine'
async function main() {
 if(process.stdin.isTTY||process.argv.length!==2)throw Error('Use a protected host broker pipe; no interactive/argument credential entry.')
 const chunks:Buffer[]=[];let bytes=0
 for await(const chunk of process.stdin){bytes+=chunk.length;if(bytes>65536)throw Error('Input limit exceeded');chunks.push(Buffer.from(chunk))}
 const input=JSON.parse(Buffer.concat(chunks).toString('utf8'))
 const origin=new URL(input.origin)
 if(origin.origin!==input.origin||!(origin.origin==='https://crm.companytheatre.ca'||origin.protocol==='http:'&&origin.hostname==='127.0.0.1'))throw Error('Unapproved CRM origin')
 if(typeof input.token!=='string'||!/^mcrm_[a-f0-9]{64}$/.test(input.token)||!requiredMachineScope(input.path.split('?')[0],input.method))throw Error('Unsupported request')
 const url=new URL(input.path,origin)
 if(url.origin!==origin.origin||!input.path.startsWith('/api/'))throw Error('Invalid path')
 const response=await fetch(url,{method:input.method,headers:{'x-crm-machine-token':input.token,...(input.body?{'Content-Type':'application/json'}:{})},body:input.body?JSON.stringify(input.body):undefined,redirect:'manual',signal:AbortSignal.timeout(15000)})
 if(!response.ok)throw Error('CRM request rejected; no credential details emitted')
 const body=await response.text()
 process.stdout.write(body)
}
main().catch(()=>{console.error('Machine request failed. Check scope, expiry, protected broker and CRM availability; no credential details emitted.');process.exitCode=1})
