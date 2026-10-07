import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {copyFields,patchCopy} from '../src/lib/campaign-copy'
test('copy edit keeps template bytes and emphasis while escaping text and preserving links',()=>{
 const html='<style>p{color:red}</style><p>Hello <strong>friends</strong>, welcome <a href="https://example.com">home</a>!</p><img src="a.jpg">'
 const fields=copyFields(html);assert.equal(fields.length,1);assert.equal(fields[0].text,'Hello friends, welcome home!')
 const updated=patchCopy(html,[{id:fields[0].id,text:'Hello friends, welcome <everyone> & home!'}],'')
 assert.equal(updated,'<style>p{color:red}</style><p>Hello <strong>friends</strong>, welcome &lt;everyone&gt; &amp; <a href="https://example.com">home</a>!</p><img src="a.jpg">')
 assert.equal(copyFields(updated)[0].text,'Hello friends, welcome <everyone> & home!')
 assert.equal(patchCopy(html,[],''),html)
})
test('line breaks, entities, empty text and unsupported field IDs',()=>{
 const html='<h1>Some people have<br>all the luck.</h1><p>A &amp; B</p>'
 const f=copyFields(html)
 assert.equal(f[0].text,'Some people have\nall the luck.')
 const edited=patchCopy(html,[{id:f[0].id,text:'Everyone\ncan win.'},{id:f[1].id,text:'C & D'}],'')
 assert.equal(copyFields(edited)[0].text,'Everyone\ncan win.')
 assert.match(edited,/C &amp; D/)
 assert.throws(()=>patchCopy(html,[{id:'fake',text:'bad'}],''),/no longer/)
 assert.throws(()=>patchCopy(html,[{id:f[0].id,text:'a'},{id:f[0].id,text:'b'}],''),/Invalid/)
 assert.equal(patchCopy('<p>abc</p>',[{id:copyFields('<p>abc</p>')[0].id,text:''}],''),'<p></p>')
})
test('real review email retains assets, style, links and synchronized hidden preview',()=>{
 const html=readFileSync('email-drafts/jackpot-twins-review-2026-10-07.html','utf8')
 const fields=copyFields(html)
 assert.ok(fields.some(f=>f.text.includes('Winning the lottery once')))
 assert.ok(!fields.some(f=>f.text.includes('One impossibly lucky new comedy.')))
 const headline=fields.find(f=>f.label==='Headline')!
 const updated=patchCopy(html,[{id:headline.id,text:'A little luck.\nA lot of trouble.'}],'New preview <safe>')
 assert.match(updated,/New preview &lt;safe&gt;/)
 assert.equal(updated.match(/<img[^>]*>/g)?.join(''),html.match(/<img[^>]*>/g)?.join(''))
 assert.equal(updated.match(/href="[^"]*"/g)?.join(''),html.match(/href="[^"]*"/g)?.join(''))
 assert.equal(updated.match(/<style>[\s\S]*?<\/style>/)?.[0],html.match(/<style>[\s\S]*?<\/style>/)?.[0])
})

test('cleared paragraphs remain editable and nested hidden content is never exposed',()=>{
 const html='<p>Text <span style="display:none">secret</span></p>'
 const field=copyFields(html)[0];assert.equal(field.text,'Text ')
 const cleared=patchCopy(html,[{id:field.id,text:''}],'')
 const empty=copyFields(cleared)[0];assert.equal(empty.text,'')
 const restored=patchCopy(cleared,[{id:empty.id,text:'New words'}],'')
 assert.equal(copyFields(restored)[0].text,'New words')
 assert.match(restored,/<span style="display:none">secret<\/span>/)
 const blank='<p></p>';assert.equal(patchCopy(blank,[{id:copyFields(blank)[0].id,text:'Back'}],''),'<p>Back</p>')
})
