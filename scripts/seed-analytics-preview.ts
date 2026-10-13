import assert from 'node:assert/strict'
import { prisma } from '../src/lib/db'
const url = new URL(process.env.DATABASE_URL || '')
assert.equal(process.env.CRM_ANALYTICS_PROOF,'1')
assert.equal(url.pathname,'/crm_analytics_test')
assert.match(url.searchParams.get('host') || '',/^\/tmp\/company-crm-analytics\.[A-Za-z0-9]+$/)
async function main() {
  const campaign=await prisma.campaign.create({data:{id:'analytics-showcase',name:'Jackpot Twins · opening the conversation',subject:'Synthetic example — not a real campaign',content:'<p>Preview only</p>',status:'COMPLETED_WITH_FAILURES',sentAt:new Date('2026-10-07T14:00:00Z')}})
  const names=['Alex Chen','Morgan Patel','Jordan Rivers','Avery Campbell','Taylor Brooks','Casey Martin','Riley Singh','Sam Bennett','Cameron Lee','Drew Wilson','Quinn Foster','Robin James']
  for(let i=0;i<120;i++) {
    const contact=await prisma.contact.create({data:{id:`showcase-contact-${i}`,email:`person-${String(i+1).padStart(3,'0')}@example.test`,fullName:names[i%names.length]}})
    const at=new Date(Date.UTC(2026,9,7+i%7,14,i%60))
    const delivered=i<90,opened=i<60,clicked=i<30,bounced=i>=100&&i<106,complaint=i>=106&&i<110
    const status=delivered?'DELIVERED':i<100?'ACCEPTED':bounced?'FAILED':complaint?'SUPPRESSED':i<115?'UNKNOWN':'QUEUED'
    const recipient=await prisma.campaignRecipient.create({data:{id:`showcase-recipient-${i}`,contactId:contact.id,campaignId:campaign.id,email:contact.email,fullName:contact.fullName,status,analyticsVersion:1,
      acceptedAt:i<110?at:null,deliveredAt:delivered?at:null,openedAt:opened?at:null,clickedAt:clicked?at:null,bouncedAt:bounced?at:null,bounceType:bounced?(i<103?'Permanent:General':'Transient:MailboxFull'):null,
      complainedAt:complaint?at:null,lastErrorCode:complaint?'complaint':null,unsubscribedAt:i>=4&&i<=6?at:null}})
    const events:Array<{kind:string;source:string;canonical:boolean;linkKey?:string;linkLabel?:string;targetUrl?:string;automation?:string}>=[]
    if(i<110)events.push({kind:'ACCEPTED',source:'ses',canonical:true})
    if(delivered)events.push({kind:'DELIVERED',source:'ses',canonical:true})
    if(opened)for(let n=0;n<(i<20?2:1);n++)events.push({kind:'OPENED',source:'ses',canonical:true,automation:i<10?'likely_automated':i<30?'unlikely_automated':'unknown'})
    if(clicked) {
      events.push({kind:'CLICKED',source:'app',canonical:true,linkKey:'placement-1',linkLabel:'Link 1: GET TICKETS · above story',targetUrl:'https://example.com/tickets?utm_medium=email'})
      events.push({kind:'CLICKED',source:'app',canonical:true,linkKey:i<15?'placement-2':'placement-3',linkLabel:i<15?'Link 2: GET TICKETS · before signature':'Image 3: Seana and Nora',targetUrl:i<15?'https://example.com/tickets?utm_medium=email':'https://example.com/show'})
      events.push({kind:'CLICKED',source:'ses',canonical:false,automation:i<5?'likely_automated':'unknown'})
    }
    if(bounced)events.push({kind:'BOUNCED',source:'ses',canonical:true})
    if(complaint)events.push({kind:'COMPLAINED',source:'ses',canonical:true})
    if(i>=4&&i<=6)events.push({kind:'UNSUBSCRIBED',source:'unsubscribe',canonical:true})
    await prisma.emailAnalyticsEvent.createMany({data:events.map((e,n)=>({...e,eventKey:`showcase-${i}-${n}`,campaignId:campaign.id,recipientId:recipient.id,occurredAt:new Date(at.getTime()+n*60000)}))})
  }
  await prisma.campaign.create({data:{id:'analytics-empty',name:'Your next email · draft',subject:'Draft only',content:'<p>Unsent</p>'}})
  const legacy=await prisma.campaign.create({data:{id:'analytics-legacy',name:'Historical email · partial evidence',subject:'Coverage example',content:'<p>Old sample</p>',status:'COMPLETED'}})
  await prisma.campaignRecipient.createMany({data:Array.from({length:10},(_,i)=>({campaignId:legacy.id,contactId:`showcase-contact-${i}`,email:`person-${String(i+1).padStart(3,'0')}@example.test`,status:'UNKNOWN',openedAt:i<4?new Date('2026-10-01T12:00:00Z'):null,clickedAt:i<2?new Date('2026-10-01T12:05:00Z'):null}))})
  console.log('Synthetic showcase: 120 recipients, 110 accepted, 90 delivered, 60 unique opens / 80 captured opens, 30 unique clicks / 60 captured clicks, 6 bounces, 3 unsubscribes, 4 complaints; 14,000-row volume fixture retained.')
}
main().finally(()=>prisma.$disconnect())
