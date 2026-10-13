import { decodeHTMLAttribute } from 'entities'
import { safeHttpUrl } from './tokens'
export function linkInventory(html: string) {
  let position=0
  const links: Array<{ linkKey: string; targetUrl: string; label: string }> = []
  for (const [anchor] of html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a\s*>/gi)) {
    const href=/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(anchor)
    if (!href) continue
    const safe=safeHttpUrl(decodeHTMLAttribute(href[1]??href[2]??href[3]))
    if (!safe || safe.pathname.startsWith('/unsubscribe/') || safe.pathname.startsWith('/api/unsubscribe/')) continue
    position++
    const image=/<img\b/i.test(anchor), alt=/\balt=["']([^"']*)["']/i.exec(anchor)?.[1]
    const text=decodeHTMLAttribute(anchor.replace(/<[^>]*>/g,'')).replace(/\s+/g,' ').trim()
    links.push({linkKey:`placement-${position}`,targetUrl:safe.toString(),label:`${image?'Image':'Link'} ${position}: ${(image?alt:text)||safe.hostname}`.slice(0,180)})
  }
  return links
}
