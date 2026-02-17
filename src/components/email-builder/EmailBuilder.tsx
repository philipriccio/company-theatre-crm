'use client'

import { useState, useCallback } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import { Block, BlockType, EmailTemplate, createBlock, defaultStyles } from './types'
import { BlockRenderer } from './BlockRenderer'
import { BlocksPalette } from './BlocksPalette'
import { PropertiesPanel } from './PropertiesPanel'

interface EmailBuilderProps {
  initialTemplate?: EmailTemplate
  onSave?: (template: EmailTemplate) => void
  onExportHtml?: (html: string) => void
}

export function EmailBuilder({ initialTemplate, onSave, onExportHtml }: EmailBuilderProps) {
  const [blocks, setBlocks] = useState<Block[]>(initialTemplate?.blocks || [])
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [templateName, setTemplateName] = useState(initialTemplate?.name || 'Untitled Template')
  const [styles, setStyles] = useState(initialTemplate?.styles || defaultStyles)
  const [previewMode, setPreviewMode] = useState(false)

  const selectedBlock = blocks.find(b => b.id === selectedBlockId) || null

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  )

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)

    if (!over) return

    // If dragging from palette, add new block
    if (active.data.current?.fromPalette) {
      const newBlock = createBlock(active.data.current.type as BlockType)
      
      if (over.id === 'canvas') {
        setBlocks([...blocks, newBlock])
      } else {
        const overIndex = blocks.findIndex(b => b.id === over.id)
        if (overIndex !== -1) {
          const newBlocks = [...blocks]
          newBlocks.splice(overIndex, 0, newBlock)
          setBlocks(newBlocks)
        }
      }
      setSelectedBlockId(newBlock.id)
      return
    }

    // Reordering existing blocks
    if (active.id !== over.id) {
      const oldIndex = blocks.findIndex(b => b.id === active.id)
      const newIndex = blocks.findIndex(b => b.id === over.id)
      if (oldIndex !== -1 && newIndex !== -1) {
        setBlocks(arrayMove(blocks, oldIndex, newIndex))
      }
    }
  }

  const handleAddBlock = useCallback((type: BlockType) => {
    const newBlock = createBlock(type)
    setBlocks(prev => [...prev, newBlock])
    setSelectedBlockId(newBlock.id)
  }, [])

  const handleUpdateBlock = useCallback((updatedBlock: Block) => {
    setBlocks(prev => prev.map(b => b.id === updatedBlock.id ? updatedBlock : b))
  }, [])

  const handleDeleteBlock = useCallback(() => {
    if (selectedBlockId) {
      setBlocks(prev => prev.filter(b => b.id !== selectedBlockId))
      setSelectedBlockId(null)
    }
  }, [selectedBlockId])

  const handleSave = () => {
    const template: EmailTemplate = {
      name: templateName,
      blocks,
      styles,
    }
    onSave?.(template)
  }

  const handleExport = () => {
    const html = generateHtml(blocks, styles)
    onExportHtml?.(html)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="h-full flex flex-col">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-stone-200 bg-white">
          <div className="flex items-center gap-4">
            <input
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              className="text-lg font-semibold text-stone-900 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-amber-500 rounded px-2 py-1 -ml-2"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPreviewMode(!previewMode)}
              className={`btn btn-sm ${previewMode ? 'btn-primary' : 'btn-secondary'}`}
            >
              {previewMode ? 'Edit' : 'Preview'}
            </button>
            <button onClick={handleExport} className="btn btn-secondary btn-sm">
              Export HTML
            </button>
            <button onClick={handleSave} className="btn btn-gold btn-sm">
              Save Template
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Sidebar - Blocks Palette */}
          {!previewMode && (
            <div className="w-56 border-r border-stone-200 bg-white overflow-y-auto">
              <BlocksPalette onAddBlock={handleAddBlock} />
            </div>
          )}

          {/* Canvas */}
          <div className="flex-1 overflow-y-auto bg-stone-100 p-8">
            <div
              className="mx-auto"
              style={{
                maxWidth: styles.maxWidth,
                backgroundColor: styles.backgroundColor,
              }}
            >
              {/* Email Preview Container */}
              <div
                className="shadow-lg rounded-lg overflow-hidden"
                style={{ backgroundColor: styles.contentBackgroundColor }}
              >
                {/* Header */}
                <div className="bg-stone-900 text-white py-6 text-center">
                  <h2 className="text-lg font-semibold tracking-wider">THE COMPANY THEATRE</h2>
                </div>

                {/* Content Area */}
                <div className="p-8">
                  {blocks.length === 0 ? (
                    <div className="border-2 border-dashed border-stone-300 rounded-xl p-12 text-center">
                      <p className="text-stone-400 mb-2">
                        {previewMode ? 'No content yet' : 'Drag blocks here or click to add'}
                      </p>
                      {!previewMode && (
                        <p className="text-sm text-stone-300">
                          Start building your email template
                        </p>
                      )}
                    </div>
                  ) : (
                    <SortableContext items={blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
                      <div className="space-y-4">
                        {blocks.map((block) => (
                          <SortableBlock
                            key={block.id}
                            block={block}
                            isSelected={block.id === selectedBlockId}
                            onClick={() => !previewMode && setSelectedBlockId(block.id)}
                            onUpdate={handleUpdateBlock}
                            disabled={previewMode}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  )}
                </div>

                {/* Footer */}
                <div className="bg-stone-50 px-8 py-6 text-center text-xs text-stone-500">
                  <p>© {new Date().getFullYear()} The Company Theatre</p>
                  <p className="mt-1">Toronto, ON, Canada</p>
                  <p className="mt-2">
                    <a href="#" className="text-stone-400 hover:text-stone-600">Unsubscribe</a>
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Sidebar - Properties */}
          {!previewMode && (
            <div className="w-72 border-l border-stone-200 bg-white overflow-y-auto">
              <PropertiesPanel
                block={selectedBlock}
                onUpdate={handleUpdateBlock}
                onDelete={handleDeleteBlock}
              />
            </div>
          )}
        </div>
      </div>

      <DragOverlay>
        {activeId ? (
          <div className="bg-white shadow-xl rounded-lg p-4 opacity-80">
            <p className="text-sm font-medium text-stone-700">Moving block...</p>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

function SortableBlock({
  block,
  isSelected,
  onClick,
  onUpdate,
  disabled,
}: {
  block: Block
  isSelected: boolean
  onClick: () => void
  onUpdate: (block: Block) => void
  disabled: boolean
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id, disabled })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <BlockRenderer
        block={block}
        isSelected={isSelected}
        onClick={onClick}
        onUpdate={onUpdate}
        editable={isSelected && !disabled}
      />
    </div>
  )
}

function generateHtml(blocks: Block[], styles: EmailTemplate['styles']): string {
  const blockHtml = blocks.map(block => {
    switch (block.type) {
      case 'text':
        return `<p style="text-align:${block.align};font-size:${block.fontSize}px;color:${block.color};line-height:1.6;margin:0 0 16px 0;">${block.content}</p>`
      case 'heading':
        const sizes = { 1: 32, 2: 24, 3: 20 }
        return `<h${block.level} style="text-align:${block.align};font-size:${sizes[block.level]}px;font-weight:700;color:${block.color};margin:0 0 16px 0;">${block.content}</h${block.level}>`
      case 'image':
        const widths = { full: '100%', medium: '75%', small: '50%' }
        return block.src ? `<div style="text-align:${block.align};"><img src="${block.src}" alt="${block.alt}" style="width:${widths[block.width]};max-width:100%;height:auto;" /></div>` : ''
      case 'button':
        return `<div style="text-align:${block.align};"><a href="${block.url}" style="display:${block.fullWidth ? 'block' : 'inline-block'};background-color:${block.backgroundColor};color:${block.textColor};padding:14px 28px;border-radius:${block.borderRadius}px;text-decoration:none;font-weight:600;font-size:16px;text-align:center;">${block.text}</a></div>`
      case 'divider':
        return `<hr style="border:none;border-top:${block.thickness}px ${block.style} ${block.color};margin:16px 0;" />`
      case 'spacer':
        return `<div style="height:${block.height}px;"></div>`
      default:
        return ''
    }
  }).join('\n')

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:${styles.backgroundColor};font-family:${styles.fontFamily};">
  <div style="max-width:${styles.maxWidth}px;margin:0 auto;background-color:${styles.contentBackgroundColor};">
    <div style="background-color:#18181b;color:#ffffff;padding:24px;text-align:center;">
      <h1 style="margin:0;font-size:18px;font-weight:600;letter-spacing:2px;">THE COMPANY THEATRE</h1>
    </div>
    <div style="padding:32px;">
      ${blockHtml}
    </div>
    <div style="background-color:#fafafa;padding:24px 32px;text-align:center;font-size:12px;color:#71717a;">
      <p style="margin:0;">© ${new Date().getFullYear()} The Company Theatre</p>
      <p style="margin:8px 0 0 0;">Toronto, ON, Canada</p>
      <p style="margin:8px 0 0 0;"><a href="{{unsubscribe_url}}" style="color:#71717a;">Unsubscribe</a></p>
    </div>
  </div>
</body>
</html>`
}
