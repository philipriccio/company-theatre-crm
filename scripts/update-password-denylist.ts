// Maintenance input is a public corpus, never a user's chosen password.
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
const source=process.argv[2]
if(!source||process.argv.length!==3)throw new Error('Pass one reviewed local UTF-8 corpus path; no URLs or credentials.')
const raw=readFileSync(source)
if(raw.length>25*1024*1024)throw new Error('Corpus exceeds 25MiB review limit.')
const entries=[...new Set(raw.toString('utf8').split(/\r?\n/).map(v=>v.normalize('NFC').toLowerCase()).filter(v=>v.length>0&&[...v].length<=128))].sort()
if(entries.length<10000||entries.length>1000000)throw new Error('Expected 10,000–1,000,000 unique common passwords.')
writeFileSync('security/common-passwords.json',JSON.stringify(entries,null,2)+'\n')
console.log(JSON.stringify({entries:entries.length,sourceSha256:createHash('sha256').update(raw).digest('hex'),next:'Review provenance/license, run password tests, commit and deploy normally. Runtime never downloads lists.'}))
