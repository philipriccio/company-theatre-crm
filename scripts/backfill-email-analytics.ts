import { prisma } from '../src/lib/db'
import { backfillAnalyticsBatch } from '../src/lib/email/analytics-history'
// Default is a read-only count. --apply is an explicit database mutation and
// must only be invoked after the operator approves that exact production action.
async function main() {
  const apply=process.argv.includes('--apply')
  let cursor:string|undefined,scanned=0,recoverable=0,inserted=0
  do {
    const result=await backfillAnalyticsBatch(cursor,apply)
    scanned+=result.scanned;recoverable+=result.recoverable;inserted+=result.inserted
    cursor=result.scanned ? result.cursor : undefined
  } while(cursor)
  console.log(JSON.stringify({mode:apply?'applied':'read-only preview',scanned,recoverable,inserted}))
}
main().catch(()=>{console.error('Analytics history recovery failed; no raw payloads logged. Review database connectivity/schema.');process.exitCode=1}).finally(()=>prisma.$disconnect())
