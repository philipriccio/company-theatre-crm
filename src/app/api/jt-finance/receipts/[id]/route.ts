import { prisma } from '@/lib/db'
import { financeActor,financeFailure } from '@/lib/jt-finance/server'
import { FinanceError } from '@/lib/jt-finance/model'
export async function GET(request:Request,context:{params:Promise<{id:string}>}){try{await financeActor(request);const {id}=await context.params;const receipt=await prisma.jtFinanceReceipt.findUnique({where:{id}});if(!receipt)throw new FinanceError(404,'Receipt not found.');return new Response(new Uint8Array(receipt.bytes),{headers:{'Content-Type':receipt.mime,'Content-Disposition':`attachment; filename="${receipt.filename.replace(/[^a-zA-Z0-9._ -]/g,'_')}"`,'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store','Content-Security-Policy':"sandbox; default-src 'none'"}})}catch(e){return financeFailure(e)}}
