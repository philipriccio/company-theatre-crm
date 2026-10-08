import { parse, serialize, type DefaultTreeAdapterMap } from 'parse5'
import { markCopyFields } from './campaign-copy'
import { wrapInTemplate } from './email-template'

type Node = DefaultTreeAdapterMap['node']
const allowed = new Set('html head body title style div span p h1 h2 h3 h4 h5 h6 table thead tbody tfoot tr td th caption colgroup col a img br hr strong em b i u s small center font ul ol li blockquote'.split(' '))
const attributes = new Set('style class width height align valign bgcolor border cellpadding cellspacing colspan rowspan alt src role aria-label lang dir color size face data-crm-copy'.split(' '))
// The only script-capable context is the trusted parent. The child never runs scripts.
export function inlineEmailPreview(content:string,previewText:string):string {
 const marked=markCopyFields(content)
 const tree=parse(wrapInTemplate({content:marked,previewText,unsubscribeUrl:'#'}))
 function clean(n:Node) {
  if('childNodes' in n) {
   n.childNodes=n.childNodes.filter(c=>c.nodeName!=='#comment'&&(!('tagName' in c)||allowed.has(c.tagName)&&c.namespaceURI==='http://www.w3.org/1999/xhtml'))
   n.childNodes.forEach(clean)
  }
  if('attrs' in n)n.attrs=n.attrs.filter(a=>attributes.has(a.name)&&!a.namespace&&(a.name!=='src'||n.tagName==='img'&&/^https:\/\//i.test(a.value)))
 }
 clean(tree)
 const csp="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src https:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"
 return serialize(tree).replace('<head>',`<head><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="referrer" content="no-referrer"><style>[data-crm-copy]{cursor:text;min-height:1em}[data-crm-copy]:hover{outline:1px dashed #2563eb;outline-offset:3px}[data-crm-copy]:focus{outline:2px solid #2563eb;outline-offset:3px}body{overflow-wrap:break-word}</style>`)
}
