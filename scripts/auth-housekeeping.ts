import { authPool, cleanupAuth } from '../src/lib/auth/store'
async function main(){if(!process.env.DATABASE_URL||process.argv.length!==2)throw Error();console.log(JSON.stringify(await cleanupAuth()))}
main().catch(()=>{console.error('Auth housekeeping failed; inspect service health. No credential details emitted.');process.exitCode=1}).finally(()=>authPool.end())
