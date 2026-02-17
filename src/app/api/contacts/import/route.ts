import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const mappingStr = formData.get('mapping') as string

    if (!file) {
      return NextResponse.json({ 
        success: false, 
        imported: 0, 
        skipped: 0, 
        errors: ['No file provided'] 
      })
    }

    const mapping = JSON.parse(mappingStr) as Record<string, string>
    
    // Find which columns map to what
    const columnMap: Record<number, string> = {}
    for (const [colIndex, field] of Object.entries(mapping)) {
      if (field !== 'skip') {
        columnMap[parseInt(colIndex)] = field
      }
    }

    // Check email column exists
    const emailColIndex = Object.entries(columnMap).find(([_, field]) => field === 'email')?.[0]
    if (emailColIndex === undefined) {
      return NextResponse.json({
        success: false,
        imported: 0,
        skipped: 0,
        errors: ['No email column mapped'],
      })
    }

    // Parse CSV
    const text = await file.text()
    const lines = text.split('\n')
    
    let imported = 0
    let skipped = 0
    let newContacts = 0
    let updatedContacts = 0
    let newTags = 0
    const errors: string[] = []
    const tagCache: Map<string, string> = new Map() // name -> id

    // Skip header row
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue

      try {
        const cells = parseCSVLine(line)
        const data: Record<string, string | string[]> = {}

        // Extract data according to mapping
        for (const [colIndex, field] of Object.entries(columnMap)) {
          const value = cells[parseInt(colIndex)]?.trim()
          if (value) {
            if (field === 'tags') {
              // Split tags by comma
              data.tags = value.split(',').map(t => t.trim()).filter(Boolean)
            } else {
              data[field] = value
            }
          }
        }

        // Validate email
        const email = data.email as string
        if (!email || !isValidEmail(email)) {
          skipped++
          if (email) errors.push(`Row ${i + 1}: Invalid email "${email}"`)
          continue
        }

        // Prepare contact data
        const contactData: Record<string, unknown> = {
          email: email.toLowerCase(),
        }
        if (data.firstName) contactData.firstName = data.firstName
        if (data.lastName) contactData.lastName = data.lastName
        if (data.fullName) contactData.fullName = data.fullName
        if (data.phone) contactData.phone = data.phone
        if (data.city) contactData.city = data.city
        if (data.state) contactData.state = data.state
        if (data.country) contactData.country = data.country

        // Upsert contact
        const existingContact = await prisma.contact.findUnique({
          where: { email: email.toLowerCase() },
        })

        let contact
        if (existingContact) {
          contact = await prisma.contact.update({
            where: { email: email.toLowerCase() },
            data: contactData,
          })
          updatedContacts++
        } else {
          contact = await prisma.contact.create({
            data: contactData as { email: string; firstName?: string; lastName?: string; fullName?: string; phone?: string; city?: string; state?: string; country?: string },
          })
          newContacts++
        }

        // Handle tags
        const tags = data.tags as string[] | undefined
        if (tags && tags.length > 0) {
          for (const tagName of tags) {
            let tagId = tagCache.get(tagName)
            
            if (!tagId) {
              // Find or create tag
              let tag = await prisma.tag.findUnique({ where: { name: tagName } })
              if (!tag) {
                tag = await prisma.tag.create({ data: { name: tagName } })
                newTags++
              }
              tagId = tag.id
              tagCache.set(tagName, tagId)
            }

            // Create contact-tag relationship (skip if exists)
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
      } catch (error) {
        skipped++
        errors.push(`Row ${i + 1}: ${error instanceof Error ? error.message : 'Parse error'}`)
      }
    }

    return NextResponse.json({
      success: true,
      imported,
      skipped,
      errors: errors.slice(0, 50), // Limit errors returned
      details: {
        newContacts,
        updatedContacts,
        newTags,
      },
    })
  } catch (error) {
    console.error('Import error:', error)
    return NextResponse.json({
      success: false,
      imported: 0,
      skipped: 0,
      errors: [error instanceof Error ? error.message : 'Unknown error'],
    })
  }
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  result.push(current.trim())
  return result
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}
