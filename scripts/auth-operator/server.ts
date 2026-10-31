import http from 'node:http'
import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { operatorAction, operatorMetadata } from '../../src/lib/auth/operator'
import { AuthError } from '../../src/lib/auth/store'
export function createOperatorServer() {
 if(!process.env.DATABASE_URL)throw new Error('A protected operator database connection must already be configured.')
 const server=http.createServer(async (request,response)=>{
  const address=server.address()
  if(!address||typeof address==='string'){response.writeHead(503);response.end();return}
  const authority=`127.0.0.1:${address.port}`
  const origin=`http://${authority}`
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer'}
  const json=(status:number,value:unknown)=>{response.writeHead(status,{...headers,'Content-Type':'application/json'});response.end(JSON.stringify(value))}
  if(request.headers.host!==authority){json(403,{error:'Invalid host.'});return}
  try {
   if(request.method==='GET'&&request.url==='/') {
    const nonce=randomBytes(24).toString('base64')
    const html=(await readFile(path.join(process.cwd(),'scripts/auth-operator/index.html'),'utf8')).replaceAll('__NONCE__',nonce)
    response.writeHead(200,{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':`default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`});response.end(html);return
   }
   if(request.method!=='POST'||request.url!=='/operation'){json(404,{error:'Not found.'});return}
   if(request.headers.origin!==origin || request.headers['sec-fetch-site']==='cross-site'||request.headers['sec-fetch-site']==='same-site'||request.headers['content-type']!=='application/json'){json(403,{error:'Private same-origin form required.'});return}
   const chunks:Buffer[]=[];let size=0
   const timer=setTimeout(()=>request.destroy(),5000)
   try {for await(const chunk of request){size+=chunk.length;if(size>8192)throw new AuthError(413,'Form too large.');chunks.push(Buffer.from(chunk))}}finally{clearTimeout(timer)}
   let body:Record<string,unknown>
   try {body=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!body||Array.isArray(body)||typeof body!=='object')throw Error()}catch{throw new AuthError(400,'Invalid form.')}
   json(200,body.action==='metadata'?await operatorMetadata():await operatorAction(body,os.userInfo().username))
  }catch(error){json(error instanceof AuthError?error.status:503,{error:error instanceof AuthError?error.message:'Operation failed. No secret or database details are logged. Verify state before retrying.'})}
 })
 server.requestTimeout=6000;server.headersTimeout=6000;server.maxConnections=8
 return server
}
