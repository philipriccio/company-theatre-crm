import {test} from 'node:test'
import assert from 'node:assert/strict'
import {rebaseCopy} from '../src/lib/campaign-copy-rebase'
const old={hash:'old',subject:'Subject',previewText:'Preview',document:'',fields:[{id:'text-10',label:'Intro',text:'Hello'},{id:'text-30',label:'Footer',text:'Bye'}]}
test('rebase preserves independent server changes and relocates text after formatting',()=>{
 const latest={...old,hash:'new',subject:'Updated elsewhere',fields:[{id:'text-20',label:'Intro',text:'Hello'},{id:'text-40',label:'Footer',text:'New footer'}]}
 assert.deepEqual(rebaseCopy(old,latest,'Subject','Preview',{'text-10':'My paragraph'}),{subject:'Updated elsewhere',preview:'Preview',values:{'text-20':'My paragraph'},conflicts:[]})
})
test('both-side changes, duplicate matches and removed fields fail closed',()=>{
 assert.deepEqual(rebaseCopy(old,{...old,fields:[{id:'text-10',label:'Intro',text:'Other edit'}]},'Subject','Preview',{'text-10':'Mine'}).conflicts,['Intro'])
 assert.deepEqual(rebaseCopy(old,{...old,fields:[...old.fields,{id:'text-50',label:'Duplicate',text:'Hello'}]},'Subject','Preview',{'text-10':'Mine'}).conflicts,['Intro'])
 assert.deepEqual(rebaseCopy(old,{...old,subject:'Other subject'},'Mine','Preview',{}).conflicts,['Subject'])
})
test('already-saved text and untouched fields do not overwrite current copy',()=>{
 const latest={...old,fields:[{id:'text-11',label:'Intro',text:'Mine'}]}
 assert.deepEqual(rebaseCopy(old,latest,'Subject','Preview',{'text-10':'Mine'}).values,{})
})
