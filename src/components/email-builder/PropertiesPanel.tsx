'use client'

import { Block, TextBlock, HeadingBlock, ImageBlock, ButtonBlock, DividerBlock, SpacerBlock, SocialBlock } from './types'

interface PropertiesPanelProps {
  block: Block | null
  onUpdate: (block: Block) => void
  onDelete: () => void
}

export function PropertiesPanel({ block, onUpdate, onDelete }: PropertiesPanelProps) {
  if (!block) {
    return (
      <div className="p-6 text-center text-stone-400">
        <p className="text-sm">Select a block to edit its properties</p>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-stone-900 capitalize">{block.type} Block</h3>
        <button
          onClick={onDelete}
          className="text-red-500 hover:text-red-700 text-sm font-medium"
        >
          Delete
        </button>
      </div>

      <div className="space-y-4">
        {renderProperties(block, onUpdate)}
      </div>
    </div>
  )
}

function renderProperties(block: Block, onUpdate: (block: Block) => void) {
  switch (block.type) {
    case 'text':
      return <TextProperties block={block} onUpdate={onUpdate} />
    case 'heading':
      return <HeadingProperties block={block} onUpdate={onUpdate} />
    case 'image':
      return <ImageProperties block={block} onUpdate={onUpdate} />
    case 'button':
      return <ButtonProperties block={block} onUpdate={onUpdate} />
    case 'divider':
      return <DividerProperties block={block} onUpdate={onUpdate} />
    case 'spacer':
      return <SpacerProperties block={block} onUpdate={onUpdate} />
    case 'social':
      return <SocialProperties block={block} onUpdate={onUpdate} />
    default:
      return <p className="text-stone-400 text-sm">No properties available</p>
  }
}

function TextProperties({ block, onUpdate }: { block: TextBlock; onUpdate: (b: Block) => void }) {
  return (
    <>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Content</label>
        <textarea
          value={block.content}
          onChange={(e) => onUpdate({ ...block, content: e.target.value })}
          rows={4}
          className="w-full text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Alignment</label>
        <AlignmentSelect value={block.align} onChange={(align) => onUpdate({ ...block, align })} />
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Font Size</label>
        <input
          type="range"
          min="12"
          max="24"
          value={block.fontSize}
          onChange={(e) => onUpdate({ ...block, fontSize: parseInt(e.target.value) })}
          className="w-full"
        />
        <span className="text-xs text-stone-500">{block.fontSize}px</span>
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Color</label>
        <ColorPicker value={block.color} onChange={(color) => onUpdate({ ...block, color })} />
      </div>
    </>
  )
}

function HeadingProperties({ block, onUpdate }: { block: HeadingBlock; onUpdate: (b: Block) => void }) {
  return (
    <>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Content</label>
        <input
          type="text"
          value={block.content}
          onChange={(e) => onUpdate({ ...block, content: e.target.value })}
          className="input text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Level</label>
        <select
          value={block.level}
          onChange={(e) => onUpdate({ ...block, level: parseInt(e.target.value) as 1 | 2 | 3 })}
          className="w-full text-sm"
        >
          <option value="1">Heading 1 (Large)</option>
          <option value="2">Heading 2 (Medium)</option>
          <option value="3">Heading 3 (Small)</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Alignment</label>
        <AlignmentSelect value={block.align} onChange={(align) => onUpdate({ ...block, align })} />
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Color</label>
        <ColorPicker value={block.color} onChange={(color) => onUpdate({ ...block, color })} />
      </div>
    </>
  )
}

function ImageProperties({ block, onUpdate }: { block: ImageBlock; onUpdate: (b: Block) => void }) {
  return (
    <>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Image URL</label>
        <input
          type="url"
          value={block.src}
          onChange={(e) => onUpdate({ ...block, src: e.target.value })}
          placeholder="https://..."
          className="input text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Alt Text</label>
        <input
          type="text"
          value={block.alt}
          onChange={(e) => onUpdate({ ...block, alt: e.target.value })}
          className="input text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Width</label>
        <select
          value={block.width}
          onChange={(e) => onUpdate({ ...block, width: e.target.value as 'full' | 'medium' | 'small' })}
          className="w-full text-sm"
        >
          <option value="full">Full Width</option>
          <option value="medium">Medium (75%)</option>
          <option value="small">Small (50%)</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Alignment</label>
        <AlignmentSelect value={block.align} onChange={(align) => onUpdate({ ...block, align })} />
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Link (optional)</label>
        <input
          type="url"
          value={block.link || ''}
          onChange={(e) => onUpdate({ ...block, link: e.target.value || undefined })}
          placeholder="https://..."
          className="input text-sm"
        />
      </div>
    </>
  )
}

function ButtonProperties({ block, onUpdate }: { block: ButtonBlock; onUpdate: (b: Block) => void }) {
  return (
    <>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Button Text</label>
        <input
          type="text"
          value={block.text}
          onChange={(e) => onUpdate({ ...block, text: e.target.value })}
          className="input text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Link URL</label>
        <input
          type="url"
          value={block.url}
          onChange={(e) => onUpdate({ ...block, url: e.target.value })}
          placeholder="https://..."
          className="input text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Background Color</label>
        <ColorPicker value={block.backgroundColor} onChange={(backgroundColor) => onUpdate({ ...block, backgroundColor })} />
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Text Color</label>
        <ColorPicker value={block.textColor} onChange={(textColor) => onUpdate({ ...block, textColor })} />
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Border Radius</label>
        <input
          type="range"
          min="0"
          max="24"
          value={block.borderRadius}
          onChange={(e) => onUpdate({ ...block, borderRadius: parseInt(e.target.value) })}
          className="w-full"
        />
        <span className="text-xs text-stone-500">{block.borderRadius}px</span>
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Alignment</label>
        <AlignmentSelect value={block.align} onChange={(align) => onUpdate({ ...block, align })} />
      </div>
      <div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={block.fullWidth}
            onChange={(e) => onUpdate({ ...block, fullWidth: e.target.checked })}
          />
          <span>Full Width</span>
        </label>
      </div>
    </>
  )
}

function DividerProperties({ block, onUpdate }: { block: DividerBlock; onUpdate: (b: Block) => void }) {
  return (
    <>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Style</label>
        <select
          value={block.style}
          onChange={(e) => onUpdate({ ...block, style: e.target.value as 'solid' | 'dashed' | 'dotted' })}
          className="w-full text-sm"
        >
          <option value="solid">Solid</option>
          <option value="dashed">Dashed</option>
          <option value="dotted">Dotted</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Color</label>
        <ColorPicker value={block.color} onChange={(color) => onUpdate({ ...block, color })} />
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Thickness</label>
        <input
          type="range"
          min="1"
          max="5"
          value={block.thickness}
          onChange={(e) => onUpdate({ ...block, thickness: parseInt(e.target.value) })}
          className="w-full"
        />
        <span className="text-xs text-stone-500">{block.thickness}px</span>
      </div>
    </>
  )
}

function SpacerProperties({ block, onUpdate }: { block: SpacerBlock; onUpdate: (b: Block) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium text-stone-700 mb-1">Height</label>
      <input
        type="range"
        min="8"
        max="96"
        step="8"
        value={block.height}
        onChange={(e) => onUpdate({ ...block, height: parseInt(e.target.value) })}
        className="w-full"
      />
      <span className="text-xs text-stone-500">{block.height}px</span>
    </div>
  )
}

function SocialProperties({ block, onUpdate }: { block: SocialBlock; onUpdate: (b: Block) => void }) {
  const platforms = ['facebook', 'twitter', 'instagram', 'linkedin', 'youtube'] as const

  const togglePlatform = (platform: typeof platforms[number]) => {
    const existing = block.icons.find(i => i.platform === platform)
    if (existing) {
      onUpdate({ ...block, icons: block.icons.filter(i => i.platform !== platform) })
    } else {
      onUpdate({ ...block, icons: [...block.icons, { platform, url: `https://${platform}.com/` }] })
    }
  }

  const updateUrl = (platform: string, url: string) => {
    onUpdate({
      ...block,
      icons: block.icons.map(i => i.platform === platform ? { ...i, url } : i)
    })
  }

  return (
    <>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-2">Platforms</label>
        <div className="space-y-2">
          {platforms.map(platform => {
            const icon = block.icons.find(i => i.platform === platform)
            return (
              <div key={platform}>
                <label className="flex items-center gap-2 text-sm capitalize">
                  <input
                    type="checkbox"
                    checked={!!icon}
                    onChange={() => togglePlatform(platform)}
                  />
                  {platform}
                </label>
                {icon && (
                  <input
                    type="url"
                    value={icon.url}
                    onChange={(e) => updateUrl(platform, e.target.value)}
                    className="input text-sm mt-1"
                    placeholder={`${platform} URL`}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Alignment</label>
        <AlignmentSelect value={block.align} onChange={(align) => onUpdate({ ...block, align })} />
      </div>
    </>
  )
}

// Helper Components
function AlignmentSelect({ value, onChange }: { value: 'left' | 'center' | 'right'; onChange: (v: 'left' | 'center' | 'right') => void }) {
  return (
    <div className="flex gap-1">
      {(['left', 'center', 'right'] as const).map((align) => (
        <button
          key={align}
          onClick={() => onChange(align)}
          className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
            value === align
              ? 'bg-stone-900 text-white'
              : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
          }`}
        >
          {align.charAt(0).toUpperCase() + align.slice(1)}
        </button>
      ))}
    </div>
  )
}

function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const presets = ['#18181b', '#27272a', '#71717a', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#2563eb', '#7c3aed']
  
  return (
    <div className="space-y-2">
      <div className="flex gap-1 flex-wrap">
        {presets.map((color) => (
          <button
            key={color}
            onClick={() => onChange(color)}
            className={`w-7 h-7 rounded-lg border-2 transition-transform hover:scale-110 ${
              value === color ? 'border-amber-500 scale-110' : 'border-transparent'
            }`}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-8 rounded cursor-pointer"
      />
    </div>
  )
}
