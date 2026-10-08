import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parse, type DefaultTreeAdapterMap } from 'parse5'
import { copyFields, markCopyFields, patchCopy } from '../src/lib/campaign-copy'
import { inlineEmailPreview } from '../src/lib/inline-email-preview'
import { readFileSync } from 'node:fs'

test('inline markers map to original source fields, including quoted > and empty paragraphs',()=>{
 const html='<p title="a > b">Hello <strong>friend</strong></p><p></p><a href="https://example.com">Tickets</a>'
 const fields=copyFields(html)
 const marked=markCopyFields(html)
 for(const field of fields)assert.ok(marked.includes(`data-crm-copy="${field.id}"`))
 assert.equal((marked.match(/data-crm-copy=/g)||[]).length,fields.length)
 assert.match(patchCopy(html,[{id:fields[0].id,text:'Hello <world>'}],''),/&lt;world&gt;/)
})
test('preview removes executable and navigation surfaces and forged field markers',()=>{
 const html='<html><head><base href="https://evil.example"><meta http-equiv="refresh" content="0;url=https://evil.example"><script>parent.alert(1)</script></head><body onload="alert(1)"><p data-crm-copy="forged">Safe</p><a href="javascript:alert(1)" ping="https://evil.example">Link</a><iframe srcdoc="bad"></iframe><svg onload="alert(1)"><foreignObject>bad</foreignObject></svg><form action="https://evil.example"><input autofocus></form><img src="/api/mutate" onerror="alert(1)"><object data="x"></object><embed src="x"></body></html>'
 const result=inlineEmailPreview(html,'')
 assert.match(result,/script-src 'none'/)
 assert.doesNotMatch(result,/<script|<base|<iframe|<svg|<form|<input|<object|<embed|onload=|onerror=|href=|ping=|srcdoc=|forged|http-equiv="refresh"|src="\/api/)
 const tree=parse(result)
 function visit(n:DefaultTreeAdapterMap['node']) {if('attrs' in n)assert.ok(!n.attrs.some(a=>a.name.startsWith('on')));if('childNodes' in n)n.childNodes.forEach(visit)}
 visit(tree)
})
test('real draft mapping preserves image/design and text-only saving preserves source',()=>{
 const html=readFileSync('email-drafts/jackpot-twins-review-2026-10-07.html','utf8')
 const result=inlineEmailPreview(html,'Preview')
 const fields=copyFields(html)
 for(const field of fields)assert.ok(result.includes(`data-crm-copy="${field.id}"`))
 assert.match(result,/<img/)
 assert.match(result,/<style/)
 const updated=patchCopy(html,[{id:fields[0].id,text:'Changed words'}],'Preview')
 assert.deepEqual(updated.match(/<img[^>]*>/g),html.match(/<img[^>]*>/g))
 assert.deepEqual(updated.match(/href="[^"]*"/g),html.match(/href="[^"]*"/g))
})
