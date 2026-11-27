import { createHash } from 'node:crypto'
import { prisma } from '@/lib/db'
import { financeActor,financeFailure } from '@/lib/jt-finance/server'
import { FinanceError,type State } from '@/lib/jt-finance/model'
const LIMIT=5*1024*1024
export async function GET(request:Request){try{await financeActor(request);return Response.json({receipts:await prisma.jtFinanceReceipt.findMany({select:{id:true,expenseId:true,filename:true,mime:true,createdAt:true},orderBy:{createdAt:'desc'}})},{headers:{'Cache-Control':'no-store'}})}catch(e){return financeFailure(e)}}
export async function POST(request:Request){try{
 const actor=await financeActor(request),mime=request.headers.get('content-type')||'',expenseId=new URL(request.url).searchParams.get('expenseId')||'',filename=(request.headers.get('x-filename')||'receipt').replace(/[^a-zA-Z0-9._ -]/g,'_').slice(0,160)
 if(!['application/pdf','image/jpeg','image/png'].includes(mime))throw new FinanceError(400,'Use PDF, JPEG or PNG receipts.')
 if(Number(request.headers.get('content-length'))>LIMIT)throw new FinanceError(413,'Receipt limit is 5 MB.')
 const reader=request.body?.getReader();if(!reader)throw new FinanceError(400,'Receipt is empty.');let size=0;const chunks:Uint8Array[]=[];while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>LIMIT){await reader.cancel();throw new FinanceError(413,'Receipt limit is 5 MB.')}chunks.push(value)}
 const bytes=Buffer.concat(chunks);if(!size)throw new FinanceError(400,'Receipt is empty.')
 if((mime==='application/pdf'&&bytes.subarray(0,5).toString()!=='%PDF-')||(mime==='image/png'&&!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))||(mime==='image/jpeg'&&!(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)))throw new FinanceError(400,'Receipt contents do not match its file type.')
 const receiptId=createHash('sha256').update(expenseId).update(bytes).digest('hex')
 const receipt=await prisma.$transaction(async tx=>{await tx.$executeRaw`SELECT pg_advisory_xact_lock(72120261127::bigint)`;const workspace=await tx.jtFinanceWorkspace.findUnique({where:{id:'JT'}});if(!(workspace?.data as unknown as State)?.expenses.some(x=>x.id===expenseId&&!x.archived))throw new FinanceError(404,'Active cost not found.');const existing=await tx.jtFinanceReceipt.findUnique({where:{id:receiptId},select:{id:true,filename:true,expenseId:true,createdAt:true}});if(existing)return existing;return tx.jtFinanceReceipt.create({data:{id:receiptId,expenseId,filename,mime,bytes,actorId:actor.id},select:{id:true,filename:true,expenseId:true,createdAt:true}})})
 return Response.json(receipt,{status:201,headers:{'Cache-Control':'no-store'}})
 }catch(e){return financeFailure(e)}}
