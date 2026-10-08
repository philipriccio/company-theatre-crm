import { parse, parseFragment, serialize, type DefaultTreeAdapterMap } from 'parse5'

type Node = DefaultTreeAdapterMap['node']
type Run = { start:number; end:number; text:string; br:boolean }
type Block = { id:string; label:string; text:string; runs:Run[]; preheader:boolean; elementStart:number }
export type CopyField = { id:string; label:string; text:string }
const escape = (s:string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>')
const tag = (n:Node) => 'tagName' in n ? n.tagName : ''
const children = (n:Node):Node[] => 'childNodes' in n ? n.childNodes : []
const attr = (n:Node,key:string) => 'attrs' in n ? n.attrs.find(a=>a.name===key)?.value||'' : ''
const excluded = new Set(['head','script','style','template','noscript','svg','textarea','title'])
function blocks(html:string):Block[] {
 const tree = /<html[\s>]/i.test(html) ? parse(html,{sourceCodeLocationInfo:true}) : parseFragment(html,{sourceCodeLocationInfo:true})
 const result:Block[]=[]
 function visit(n:Node,hidden=false) {
  if(excluded.has(tag(n))) return
  const preheader = /display\s*:\s*none/i.test(attr(n,'style')) && /mso-hide\s*:\s*all/i.test(attr(n,'style'))
  const invisible = hidden || (!preheader && (/display\s*:\s*none|visibility\s*:\s*hidden/i.test(attr(n,'style')) || ('attrs' in n && n.attrs.some(a=>a.name==='hidden'))))
  if(invisible)return
  const isBlock = /^(p|h[1-6]|li)$/.test(tag(n)) || preheader || (/^(td|div|a)$/.test(tag(n)) && !children(n).some(c=>!['','br','em','strong','b','i','span','a'].includes(tag(c))))
  if(isBlock) {
   const runs:Run[]=[]
   function collect(c:Node) {
    if(excluded.has(tag(c)) || /^(img|input)$/.test(tag(c)) || (c!==n && (/display\s*:\s*none|visibility\s*:\s*hidden/i.test(attr(c,'style')) || ('attrs' in c && c.attrs.some(a=>a.name==='hidden'))))) return
    const loc=c.sourceCodeLocation
    if(c.nodeName==='#text' && 'value' in c && loc)runs.push({start:loc.startOffset,end:loc.endOffset,text:c.value,br:false})
    else if(tag(c)==='br'&&loc)runs.push({start:loc.startOffset,end:loc.endOffset,text:'\n',br:true})
    else children(c).forEach(collect)
   }
   collect(n)
   const text=runs.map(r=>r.text).join('')
   const editableEmpty=/^(p|h[1-6]|li)$/.test(tag(n)) || preheader
   if(!runs.length && editableEmpty && n.sourceCodeLocation && 'startTag' in n.sourceCodeLocation && n.sourceCodeLocation.startTag) { const at=n.sourceCodeLocation.startTag.endOffset;runs.push({start:at,end:at,text:'',br:false}) }
   if(runs.length && (text.trim() || editableEmpty))result.push({id:`text-${runs[0].start}`,label:preheader?'Inbox preview':/^h/.test(tag(n))?'Headline':tag(n)==='a'?'Button or link':`Text ${result.filter(b=>!b.preheader).length+1}`,text,runs,preheader,elementStart:n.sourceCodeLocation?.startOffset ?? -1})
  } else children(n).forEach(c=>visit(c,invisible))
 }
 visit(tree)
 return result
}
export function copyFields(content:string):CopyField[] { return blocks(content).filter(b=>!b.preheader).map(({id,label,text})=>({id,label,text})) }
export function patchCopy(content:string, edits:unknown, previewText:string) {
 if(!Array.isArray(edits)||edits.length>200)throw Error('Invalid text changes')
 const parsed=blocks(content);const known=new Map(parsed.filter(b=>!b.preheader).map(b=>[b.id,b]));const seen=new Set<string>()
 const requested:{block:Block;text:string}[]=[]
 for(const edit of edits) {
  if(!edit || typeof edit.id!=='string'||typeof edit.text!=='string'||edit.text.length>10000||seen.has(edit.id))throw Error('Invalid text change')
  const block=known.get(edit.id);if(!block)throw Error('This text is no longer available. Reload the draft.')
  seen.add(edit.id);requested.push({block,text:edit.text.replace(/\r\n?/g,'\n')})
 }
 parsed.filter(b=>b.preheader).forEach(block=>requested.push({block,text:previewText}))
 const patches:{start:number;end:number;text:string}[]=[]
 for(const {block,text} of requested) {
  if(block.text===text)continue
  let prefix=0;while(prefix<block.text.length&&prefix<text.length&&block.text[prefix]===text[prefix])prefix++
  let suffix=0;while(suffix<block.text.length-prefix&&suffix<text.length-prefix&&block.text[block.text.length-1-suffix]===text[text.length-1-suffix])suffix++
  const end=block.text.length-suffix;const inserted=text.slice(prefix,text.length-suffix)
  let offset=0,done=false
  for(const run of block.runs) {
   const runEnd=offset+run.text.length
   if(runEnd>=prefix&&offset<=end) {
    const left=Math.max(0,Math.min(run.text.length,prefix-offset));const right=Math.max(left,Math.min(run.text.length,end-offset))
    const value=run.text.slice(0,left)+(!done?inserted:'')+run.text.slice(right)
    if(value!==run.text)patches.push({start:run.start,end:run.end,text:escape(value)})
    done=true
   }
   offset=runEnd
  }
 }
 let updated=content
 for(const patch of patches.sort((a,b)=>b.start-a.start)) updated=updated.slice(0,patch.start)+patch.text+updated.slice(patch.end)
 return updated
}

// IDs come from the original source, before template wrapping or serialization.
export function markCopyFields(content:string):string {
 const known=new Map(blocks(content).filter(b=>!b.preheader).map(b=>[b.elementStart,b.id]))
 const tree=/<html[\s>]/i.test(content) ? parse(content,{sourceCodeLocationInfo:true}) : parseFragment(content,{sourceCodeLocationInfo:true})
 function visit(n:Node) {
  if('attrs' in n) {
   n.attrs=n.attrs.filter(a=>a.name!=='data-crm-copy')
   const id=known.get(n.sourceCodeLocation?.startOffset ?? -1)
   if(id)n.attrs.push({name:'data-crm-copy',value:id})
  }
  children(n).forEach(visit)
 }
 visit(tree)
 return serialize(tree)
}
