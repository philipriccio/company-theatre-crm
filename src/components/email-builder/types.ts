export type BlockType = 
  | 'text'
  | 'heading'
  | 'image'
  | 'button'
  | 'divider'
  | 'spacer'
  | 'columns'
  | 'social'

export interface BlockBase {
  id: string
  type: BlockType
}

export interface TextBlock extends BlockBase {
  type: 'text'
  content: string
  align: 'left' | 'center' | 'right'
  fontSize: number
  color: string
}

export interface HeadingBlock extends BlockBase {
  type: 'heading'
  content: string
  level: 1 | 2 | 3
  align: 'left' | 'center' | 'right'
  color: string
}

export interface ImageBlock extends BlockBase {
  type: 'image'
  src: string
  alt: string
  width: 'full' | 'medium' | 'small'
  align: 'left' | 'center' | 'right'
  link?: string
}

export interface ButtonBlock extends BlockBase {
  type: 'button'
  text: string
  url: string
  align: 'left' | 'center' | 'right'
  backgroundColor: string
  textColor: string
  borderRadius: number
  fullWidth: boolean
}

export interface DividerBlock extends BlockBase {
  type: 'divider'
  style: 'solid' | 'dashed' | 'dotted'
  color: string
  thickness: number
}

export interface SpacerBlock extends BlockBase {
  type: 'spacer'
  height: number
}

export interface ColumnsBlock extends BlockBase {
  type: 'columns'
  columns: 2 | 3
  gap: number
  content: Block[][]
}

export interface SocialBlock extends BlockBase {
  type: 'social'
  align: 'left' | 'center' | 'right'
  icons: {
    platform: 'facebook' | 'twitter' | 'instagram' | 'linkedin' | 'youtube'
    url: string
  }[]
}

export type Block = 
  | TextBlock 
  | HeadingBlock 
  | ImageBlock 
  | ButtonBlock 
  | DividerBlock 
  | SpacerBlock 
  | ColumnsBlock
  | SocialBlock

export interface EmailTemplate {
  id?: string
  name: string
  blocks: Block[]
  styles: {
    backgroundColor: string
    contentBackgroundColor: string
    fontFamily: string
    maxWidth: number
  }
}

export const defaultStyles: EmailTemplate['styles'] = {
  backgroundColor: '#f4f4f5',
  contentBackgroundColor: '#ffffff',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  maxWidth: 600,
}

export function createBlock(type: BlockType): Block {
  const id = crypto.randomUUID()
  
  switch (type) {
    case 'text':
      return {
        id,
        type: 'text',
        content: 'Enter your text here...',
        align: 'left',
        fontSize: 16,
        color: '#27272a',
      }
    case 'heading':
      return {
        id,
        type: 'heading',
        content: 'Heading',
        level: 2,
        align: 'left',
        color: '#18181b',
      }
    case 'image':
      return {
        id,
        type: 'image',
        src: '',
        alt: 'Image',
        width: 'full',
        align: 'center',
      }
    case 'button':
      return {
        id,
        type: 'button',
        text: 'Click Here',
        url: 'https://',
        align: 'center',
        backgroundColor: '#18181b',
        textColor: '#ffffff',
        borderRadius: 8,
        fullWidth: false,
      }
    case 'divider':
      return {
        id,
        type: 'divider',
        style: 'solid',
        color: '#e4e4e7',
        thickness: 1,
      }
    case 'spacer':
      return {
        id,
        type: 'spacer',
        height: 32,
      }
    case 'columns':
      return {
        id,
        type: 'columns',
        columns: 2,
        gap: 16,
        content: [[], []],
      }
    case 'social':
      return {
        id,
        type: 'social',
        align: 'center',
        icons: [
          { platform: 'instagram', url: 'https://instagram.com/companytheatre' },
          { platform: 'twitter', url: 'https://twitter.com/companytheatre' },
        ],
      }
    default:
      throw new Error(`Unknown block type: ${type}`)
  }
}
