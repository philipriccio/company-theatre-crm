/**
 * Import contacts from Keela CSV export
 * 
 * Usage: npx tsx scripts/import-keela.ts [path-to-csv]
 */

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import { parse } from 'csv-parse'
import * as fs from 'fs'
import * as path from 'path'

// Set up Prisma with pg adapter for Prisma 7
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

interface KeelaContact {
  'Contact ID': string
  'Title': string
  'Full Name': string
  'First Name': string
  'Last Name': string
  'Email': string
  'Phone': string
  'Primary Address - City': string
  'Primary Address - State/Province': string
  'Primary Address - Country': string
  'Tags': string
  'Solicitation': string
  'Total Donations': string
}

async function main() {
  const csvPath = process.argv[2] || path.join(process.env.HOME || '', 'Downloads', 'keela-contacts.csv')
  
  if (!fs.existsSync(csvPath)) {
    console.error(`CSV file not found: ${csvPath}`)
    process.exit(1)
  }

  console.log(`📂 Reading CSV from: ${csvPath}`)
  
  const fileContent = fs.readFileSync(csvPath, 'utf-8')
  
  const records: KeelaContact[] = await new Promise((resolve, reject) => {
    parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }, (err, records: KeelaContact[]) => {
      if (err) reject(err)
      else resolve(records)
    })
  })

  console.log(`📊 Found ${records.length} records in CSV`)

  // Filter to only contacts with email addresses
  const contactsWithEmail = records.filter(r => r['Email'] && r['Email'].trim())
  console.log(`📧 ${contactsWithEmail.length} contacts have email addresses`)

  // Extract all unique tags
  const allTags = new Set<string>()
  contactsWithEmail.forEach(contact => {
    const tags = contact['Tags']?.split(';').map(t => t.trim()).filter(Boolean) || []
    tags.forEach(tag => allTags.add(tag))
  })

  console.log(`🏷️  Found ${allTags.size} unique tags`)

  // Create tags first
  console.log('\n📝 Creating tags...')
  const tagMap = new Map<string, string>() // name -> id
  
  for (const tagName of allTags) {
    const tag = await prisma.tag.upsert({
      where: { name: tagName },
      update: {},
      create: { name: tagName },
    })
    tagMap.set(tagName, tag.id)
  }
  console.log(`✅ Created/found ${tagMap.size} tags`)

  // Import contacts
  console.log('\n👥 Importing contacts...')
  let imported = 0
  let skipped = 0
  let errors = 0

  for (const record of contactsWithEmail) {
    const email = record['Email'].trim().toLowerCase()
    
    try {
      // Determine solicitation status
      const tags = record['Tags']?.split(';').map(t => t.trim()).filter(Boolean) || []
      const noSolicitation = tags.includes('No Solicitation') || record['Solicitation'] === 'No'
      
      // Parse total donations
      const totalDonations = parseFloat(record['Total Donations']?.replace(/[^0-9.]/g, '') || '0') || 0

      // Upsert contact
      const contact = await prisma.contact.upsert({
        where: { email },
        update: {
          firstName: record['First Name'] || null,
          lastName: record['Last Name'] || null,
          fullName: record['Full Name'] || null,
          title: record['Title'] || null,
          phone: record['Phone'] || null,
          city: record['Primary Address - City'] || null,
          state: record['Primary Address - State/Province'] || null,
          country: record['Primary Address - Country'] || null,
          totalDonations,
          solicitation: !noSolicitation,
          externalId: record['Contact ID'] || null,
        },
        create: {
          email,
          firstName: record['First Name'] || null,
          lastName: record['Last Name'] || null,
          fullName: record['Full Name'] || null,
          title: record['Title'] || null,
          phone: record['Phone'] || null,
          city: record['Primary Address - City'] || null,
          state: record['Primary Address - State/Province'] || null,
          country: record['Primary Address - Country'] || null,
          totalDonations,
          solicitation: !noSolicitation,
          externalId: record['Contact ID'] || null,
        },
      })

      // Associate tags (excluding "No Solicitation" which is handled as a field)
      const contactTags = tags.filter(t => t !== 'No Solicitation')
      for (const tagName of contactTags) {
        const tagId = tagMap.get(tagName)
        if (tagId) {
          await prisma.contactTag.upsert({
            where: {
              contactId_tagId: {
                contactId: contact.id,
                tagId: tagId,
              },
            },
            update: {},
            create: {
              contactId: contact.id,
              tagId: tagId,
            },
          })
        }
      }

      imported++
      if (imported % 500 === 0) {
        console.log(`  ... ${imported} contacts imported`)
      }
    } catch (err) {
      errors++
      if (errors <= 10) {
        console.error(`  ❌ Error importing ${email}:`, err)
      }
    }
  }

  console.log(`\n✅ Import complete!`)
  console.log(`   Imported: ${imported}`)
  console.log(`   Skipped: ${skipped}`)
  console.log(`   Errors: ${errors}`)

  // Print summary
  const contactCount = await prisma.contact.count()
  const tagCount = await prisma.tag.count()
  const unsubscribedCount = await prisma.contact.count({ where: { solicitation: false } })

  console.log(`\n📊 Database summary:`)
  console.log(`   Total contacts: ${contactCount}`)
  console.log(`   Total tags: ${tagCount}`)
  console.log(`   No solicitation: ${unsubscribedCount}`)
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
  })
