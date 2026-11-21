import test from 'node:test'
import assert from 'node:assert/strict'
import { taskInput } from '../src/lib/jt-tasks'
import { requiredMachineScope } from '../src/lib/auth/machine-scopes'
test('task validation rejects malformed dates, unsafe links, unknown fields and unbounded text',()=>{
 const requestId='test-request-001'
 for(const data of [{title:''},{title:'x',dueDate:'2027-02-30'},{title:'x',dueDate:'banana'},{title:'x',owner:'Else'},{title:'x',status:'BLOCKED'},{title:'x',sourceLinks:['javascript:alert(1)']},{title:'x',sourceLinks:['https://user:pass@example.com']},{title:'x',actor:'Philip'},{title:'x',latestUpdate:'x'.repeat(1001)}])assert.throws(()=>taskInput({requestId,...data},true))
 assert.equal(taskInput({requestId,title:'  Fit wigs ',dueDate:'2027-03-01',sourceLinks:['https://example.invalid/doc']},true).data.title,'Fit wigs')
 assert.throws(()=>taskInput({requestId,title:'x'},false));assert.throws(()=>taskInput({requestId,version:0,title:'x'},false))
})
test('tasks scopes are narrow and do not expand campaign or contact rights',()=>{
 assert.equal(requiredMachineScope('/api/jt-tasks','GET'),'tasks:read');assert.equal(requiredMachineScope('/api/jt-tasks/task-1','PATCH'),'tasks:write');assert.equal(requiredMachineScope('/api/jt-tasks','POST'),'tasks:write')
 for(const [path,method] of [['/api/jt-tasks/task-1','DELETE'],['/api/jt-tasks/export','POST'],['/api/jt-tasks/../contacts','GET'],['/api/jt-tasks%2fsecret','GET'],['/api/jt-tasks//x','GET']])assert.equal(requiredMachineScope(path,method),null)
})
