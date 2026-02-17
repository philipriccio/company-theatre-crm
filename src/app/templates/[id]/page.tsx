'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { EmailBuilder, EmailTemplate, Block } from '@/components/email-builder'

interface StoredTemplate {
  id: string
  name: string
  content: string
  isDefault: boolean
}

export default function EditTemplatePage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [template, setTemplate] = useState<EmailTemplate | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/templates/${id}`)
      .then(res => res.json())
      .then((data: StoredTemplate) => {
        try {
          const parsed = JSON.parse(data.content) as { blocks: Block[]; styles: EmailTemplate['styles'] }
          setTemplate({
            id: data.id,
            name: data.name,
            blocks: parsed.blocks || [],
            styles: parsed.styles || {
              backgroundColor: '#f4f4f5',
              contentBackgroundColor: '#ffffff',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              maxWidth: 600,
            },
          })
        } catch {
          // Legacy format - content is HTML
          setTemplate({
            id: data.id,
            name: data.name,
            blocks: [],
            styles: {
              backgroundColor: '#f4f4f5',
              contentBackgroundColor: '#ffffff',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              maxWidth: 600,
            },
          })
        }
        setLoading(false)
      })
      .catch(() => {
        setLoading(false)
      })
  }, [id])

  const handleSave = async (updatedTemplate: EmailTemplate) => {
    try {
      const response = await fetch(`/api/templates/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: updatedTemplate.name,
          content: JSON.stringify({ blocks: updatedTemplate.blocks, styles: updatedTemplate.styles }),
        }),
      })

      if (!response.ok) throw new Error('Failed to save template')
      
      alert('Template saved!')
    } catch (error) {
      console.error('Error saving template:', error)
      alert('Failed to save template')
    }
  }

  const handleExportHtml = (html: string) => {
    navigator.clipboard.writeText(html)
    alert('HTML copied to clipboard!')
  }

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="spinner" />
      </div>
    )
  }

  if (!template) {
    return (
      <div className="h-screen flex items-center justify-center">
        <p className="text-stone-500">Template not found</p>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col">
      <EmailBuilder
        initialTemplate={template}
        onSave={handleSave}
        onExportHtml={handleExportHtml}
      />
    </div>
  )
}
