// Trusted-host import only. Never exposed through the application API.
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../src/lib/db'
import { validateState } from '../src/lib/jt-finance/model'
async function main(){
 if(process.env.JT_FINANCE_IMPORT_CONFIRMED!=='1')throw new Error('Set JT_FINANCE_IMPORT_CONFIRMED=1 only after backup, source review and authorized import.')
 const path=process.argv[2];if(!path)throw new Error('Provide the reviewed initial-state JSON path.')
 const input=await readFile(path,'utf8'),state=validateState(JSON.parse(input)),hash=createHash('sha256').update(input).digest('hex')
 await prisma.$transaction(async tx=>{await tx.$executeRaw`SELECT pg_advisory_xact_lock(72120261127::bigint)`;const existing=await tx.jtFinanceWorkspace.findUnique({where:{id:'JT'}});if(existing)throw new Error('Finance already exists. Refusing to replace or duplicate it. Reconcile using ordinary edits.');await tx.jtFinanceWorkspace.create({data:{id:'JT',data:JSON.parse(JSON.stringify(state))}});await tx.jtFinanceChange.create({data:{id:`import-${hash}`,actorId:'trusted-operator-import',actorLabel:'Reviewed initial finance import',version:1,before:{} as Prisma.InputJsonValue,after:JSON.parse(JSON.stringify(state))}})})
 console.log('Imported JT finance once. Source SHA-256:',hash);await prisma.$disconnect()
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e instanceof Error?e.message:'Import failed');process.exit(1)})
