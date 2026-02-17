'use client'

import { ReactNode } from 'react'
import { Block } from './types'

interface BlockRendererProps {
  block: Block
  isSelected?: boolean
  onClick?: () => void
  onUpdate?: (block: Block) => void
  editable?: boolean
}

export function BlockRenderer({ 
  block, 
  isSelected, 
  onClick,
  onUpdate,
  editable = false 
}: BlockRendererProps) {
  const wrapperClass = `
    relative transition-all duration-150
    ${isSelected ? 'ring-2 ring-amber-500 ring-offset-2' : ''}
    ${onClick ? 'cursor-pointer hover:ring-2 hover:ring-amber-300 hover:ring-offset-2' : ''}
  `

  const handleContentChange = (content: string) => {
    if (onUpdate && 'content' in block) {
      onUpdate({ ...block, content } as Block)
    }
  }

  return (
    <div className={wrapperClass} onClick={onClick}>
      {renderBlock(block, editable, handleContentChange)}
    </div>
  )
}

function renderBlock(
  block: Block, 
  editable: boolean,
  onContentChange: (content: string) => void
) {
  switch (block.type) {
    case 'text':
      return (
        <div
          style={{
            textAlign: block.align,
            fontSize: block.fontSize,
            color: block.color,
            lineHeight: 1.6,
          }}
        >
          {editable ? (
            <div
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) => onContentChange(e.currentTarget.textContent || '')}
              className="outline-none min-h-[1.6em]"
            >
              {block.content}
            </div>
          ) : (
            <p style={{ margin: 0 }}>{block.content}</p>
          )}
        </div>
      )

    case 'heading':
      const HeadingTag = `h${block.level}` as 'h1' | 'h2' | 'h3'
      const headingSizes = { 1: 32, 2: 24, 3: 20 }
      return (
        <HeadingTag
          style={{
            textAlign: block.align,
            fontSize: headingSizes[block.level],
            fontWeight: 700,
            color: block.color,
            margin: 0,
            lineHeight: 1.3,
          }}
        >
          {editable ? (
            <span
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) => onContentChange(e.currentTarget.textContent || '')}
              className="outline-none"
            >
              {block.content}
            </span>
          ) : (
            block.content
          )}
        </HeadingTag>
      )

    case 'image':
      const imageWidths = { full: '100%', medium: '75%', small: '50%' }
      return (
        <div style={{ textAlign: block.align }}>
          {block.src ? (
            <img
              src={block.src}
              alt={block.alt}
              style={{
                width: imageWidths[block.width],
                maxWidth: '100%',
                height: 'auto',
                display: 'inline-block',
              }}
            />
          ) : (
            <div 
              className="bg-stone-100 border-2 border-dashed border-stone-300 rounded-lg flex items-center justify-center text-stone-400"
              style={{
                width: imageWidths[block.width],
                height: 200,
                display: 'inline-flex',
              }}
            >
              <span>Click to add image</span>
            </div>
          )}
        </div>
      )

    case 'button':
      return (
        <div style={{ textAlign: block.align }}>
          <a
            href={block.url}
            style={{
              display: block.fullWidth ? 'block' : 'inline-block',
              backgroundColor: block.backgroundColor,
              color: block.textColor,
              padding: '14px 28px',
              borderRadius: block.borderRadius,
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: 16,
              textAlign: 'center',
            }}
          >
            {block.text}
          </a>
        </div>
      )

    case 'divider':
      return (
        <hr
          style={{
            border: 'none',
            borderTop: `${block.thickness}px ${block.style} ${block.color}`,
            margin: '8px 0',
          }}
        />
      )

    case 'spacer':
      return (
        <div 
          style={{ height: block.height }}
          className="bg-stone-50/50 border border-dashed border-stone-200 rounded"
        />
      )

    case 'columns':
      return (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${block.columns}, 1fr)`,
            gap: block.gap,
          }}
        >
          {block.content.map((columnBlocks, i) => (
            <div key={i} className="min-h-[60px] bg-stone-50/30 rounded p-2 border border-dashed border-stone-200">
              {columnBlocks.length === 0 ? (
                <div className="text-stone-400 text-sm text-center py-4">
                  Drop blocks here
                </div>
              ) : (
                columnBlocks.map((b) => (
                  <BlockRenderer key={b.id} block={b} editable={editable} />
                ))
              )}
            </div>
          ))}
        </div>
      )

    case 'social':
      return (
        <div style={{ textAlign: block.align }}>
          <div style={{ display: 'inline-flex', gap: 12 }}>
            {block.icons.map((icon, i) => (
              <a
                key={i}
                href={icon.url}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 40,
                  height: 40,
                  backgroundColor: '#27272a',
                  borderRadius: '50%',
                  color: 'white',
                  textDecoration: 'none',
                }}
              >
                <SocialIcon platform={icon.platform} />
              </a>
            ))}
          </div>
        </div>
      )

    default:
      return <div>Unknown block type</div>
  }
}

function SocialIcon({ platform }: { platform: string }) {
  const icons: Record<string, ReactNode> = {
    facebook: (
      <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
        <path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z" />
      </svg>
    ),
    twitter: (
      <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
        <path d="M23 3a10.9 10.9 0 01-3.14 1.53 4.48 4.48 0 00-7.86 3v1A10.66 10.66 0 013 4s-4 9 5 13a11.64 11.64 0 01-7 2c9 5 20 0 20-11.5a4.5 4.5 0 00-.08-.83A7.72 7.72 0 0023 3z" />
      </svg>
    ),
    instagram: (
      <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
        <rect x="2" y="2" width="20" height="20" rx="5" ry="5" fill="none" stroke="currentColor" strokeWidth="2" />
        <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
        <circle cx="18" cy="6" r="1" />
      </svg>
    ),
    linkedin: (
      <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
        <path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2zM4 2a2 2 0 110 4 2 2 0 010-4z" />
      </svg>
    ),
    youtube: (
      <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
        <path d="M22.54 6.42a2.78 2.78 0 00-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 00-1.94 2A29 29 0 001 11.75a29 29 0 00.46 5.33A2.78 2.78 0 003.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 001.94-2 29 29 0 00.46-5.25 29 29 0 00-.46-5.33z" />
        <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" fill="white" />
      </svg>
    ),
  }
  return icons[platform] || null
}
