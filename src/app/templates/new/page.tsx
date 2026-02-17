'use client'

import { useRouter } from 'next/navigation'
import { EmailBuilder, EmailTemplate } from '@/components/email-builder'

export default function NewTemplatePage() {
  const router = useRouter()

  const handleSave = async (template: EmailTemplate) => {
    try {
      const response = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: template.name,
          content: JSON.stringify({ blocks: template.blocks, styles: template.styles }),
        }),
      })

      if (!response.ok) throw new Error('Failed to save template')
      
      const saved = await response.json()
      router.push(`/templates/${saved.id}`)
    } catch (error) {
      console.error('Error saving template:', error)
      alert('Failed to save template')
    }
  }

  const handleExportHtml = (html: string) => {
    // Copy to clipboard
    navigator.clipboard.writeText(html)
    alert('HTML copied to clipboard!')
  }

  return (
    <div className="h-screen flex flex-col">
      <EmailBuilder
        onSave={handleSave}
        onExportHtml={handleExportHtml}
      />
    </div>
  )
}
