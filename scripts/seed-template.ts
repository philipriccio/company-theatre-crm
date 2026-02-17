/**
 * Seed a default email template
 */

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

const defaultTemplate = `<p>Dear {{firstName}},</p>

<p>We're thrilled to share some exciting news with you.</p>

<p>[Your content here]</p>

<p>We hope to see you soon!</p>

<p>Warmly,<br>
<strong>The Company Theatre</strong></p>

<p style="font-size: 14px; color: #666;">
<a href="https://companytheatre.ca">companytheatre.ca</a> | 
<a href="https://instagram.com/companytheatre">Instagram</a> | 
<a href="https://twitter.com/companytheatre">Twitter</a>
</p>`

async function main() {
  const existing = await prisma.template.findFirst({
    where: { isDefault: true },
  })

  if (existing) {
    console.log('Default template already exists')
    return
  }

  const template = await prisma.template.create({
    data: {
      name: 'Standard Newsletter',
      content: defaultTemplate,
      isDefault: true,
    },
  })

  console.log('Created default template:', template.id)
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
  })
