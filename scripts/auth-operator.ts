import { createOperatorServer } from './auth-operator/server'
import { authPool } from '../src/lib/auth/store'
if(process.argv.length!==2){console.error('No arguments accepted. Use private masked browser entry.');process.exitCode=1}
else {
 const server=createOperatorServer()
 server.listen(0,'127.0.0.1',()=>{const address=server.address();if(address&&typeof address!=='string')console.log(`Private host operator form: http://127.0.0.1:${address.port}/ — close this process when finished. No credentials are printed.`)})
 const stop=()=>server.close(()=>{void authPool.end().then(()=>process.exit(0))})
 process.on('SIGINT',stop);process.on('SIGTERM',stop)
}
