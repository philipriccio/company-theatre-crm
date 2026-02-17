'use client'

import { ReactNode } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { BlockType } from './types'

interface BlocksPaletteProps {
  onAddBlock: (type: BlockType) => void
}

const blockTypes: { type: BlockType; label: string; icon: ReactNode; description: string }[] = [
  {
    type: 'heading',
    label: 'Heading',
    icon: <HeadingIcon />,
    description: 'Title or section header',
  },
  {
    type: 'text',
    label: 'Text',
    icon: <TextIcon />,
    description: 'Paragraph content',
  },
  {
    type: 'image',
    label: 'Image',
    icon: <ImageIcon />,
    description: 'Photo or graphic',
  },
  {
    type: 'button',
    label: 'Button',
    icon: <ButtonIcon />,
    description: 'Call to action link',
  },
  {
    type: 'divider',
    label: 'Divider',
    icon: <DividerIcon />,
    description: 'Horizontal line',
  },
  {
    type: 'spacer',
    label: 'Spacer',
    icon: <SpacerIcon />,
    description: 'Empty space',
  },
  {
    type: 'columns',
    label: 'Columns',
    icon: <ColumnsIcon />,
    description: 'Side by side layout',
  },
  {
    type: 'social',
    label: 'Social',
    icon: <SocialIcon />,
    description: 'Social media links',
  },
]

export function BlocksPalette({ onAddBlock }: BlocksPaletteProps) {
  return (
    <div className="p-4">
      <h3 className="text-sm font-semibold text-stone-500 uppercase tracking-wider mb-4">
        Blocks
      </h3>
      <div className="grid grid-cols-2 gap-2">
        {blockTypes.map((block) => (
          <DraggableBlock key={block.type} block={block} onAddBlock={onAddBlock} />
        ))}
      </div>
    </div>
  )
}

function DraggableBlock({ 
  block, 
  onAddBlock 
}: { 
  block: typeof blockTypes[number]
  onAddBlock: (type: BlockType) => void 
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${block.type}`,
    data: { type: block.type, fromPalette: true },
  })

  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() => onAddBlock(block.type)}
      className={`
        flex flex-col items-center gap-2 p-3 rounded-xl border-2 border-dashed
        transition-all duration-150 text-center
        ${isDragging 
          ? 'border-amber-500 bg-amber-50 opacity-50' 
          : 'border-stone-200 hover:border-amber-400 hover:bg-amber-50/50'
        }
      `}
    >
      <div className="w-8 h-8 flex items-center justify-center text-stone-500">
        {block.icon}
      </div>
      <div>
        <p className="text-sm font-medium text-stone-700">{block.label}</p>
        <p className="text-[10px] text-stone-400 leading-tight">{block.description}</p>
      </div>
    </button>
  )
}

// Icons
function HeadingIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 6h16M4 12h10M4 18h14" strokeLinecap="round" />
    </svg>
  )
}

function TextIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 7h16M4 12h16M4 17h10" strokeLinecap="round" />
    </svg>
  )
}

function ImageIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  )
}

function ButtonIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="7" width="18" height="10" rx="2" />
      <path d="M8 12h8" strokeLinecap="round" />
    </svg>
  )
}

function DividerIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 12h18" strokeLinecap="round" />
    </svg>
  )
}

function SpacerIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 8h18M3 16h18" strokeLinecap="round" strokeDasharray="2 2" />
      <path d="M12 10v4" strokeLinecap="round" />
    </svg>
  )
}

function ColumnsIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="7" height="18" rx="1" />
      <rect x="14" y="3" width="7" height="18" rx="1" />
    </svg>
  )
}

function SocialIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="6" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="18" cy="12" r="2" />
    </svg>
  )
}
