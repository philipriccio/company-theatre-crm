import { guard, authFailure, requestToken } from '@/lib/auth/access'
import { history, reviewAlert } from '@/lib/security/history'
import { AuthError } from '@/lib/auth/store'
export const dynamic='force-dynamic'
export async function GET(request:Request){
 const denied=await guard(request);if(denied)return denied
 try{return Response.json(await history(new URL(request.url).searchParams),{headers:{'Cache-Control':'no-store, private'}})}catch(error){return authFailure(error)}
}
export async function POST(request:Request){
 const denied=await guard(request);if(denied)return denied
 try{
  const reader=request.body?.getReader();if(!reader)throw new AuthError(400,'Missing alert.')
  let text='',length=0;const decoder=new TextDecoder();const timer=setTimeout(()=>void reader.cancel(),5000)
  try{while(true){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>512){await reader.cancel();throw new AuthError(413,'Request too large.')}text+=decoder.decode(part.value,{stream:true})}}finally{clearTimeout(timer)}
  let body;try{body=JSON.parse(text)}catch{throw new AuthError(400,'Invalid request.')}
  if(!body||typeof body.id!=='string'||Object.keys(body).some(k=>k!=='id'))throw new AuthError(400,'Only an alert ID is accepted.')
  await reviewAlert(requestToken(request)??'',body.id)
  return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}})
 }catch(error){return authFailure(error)}
}
