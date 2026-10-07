"use client";

import { Block } from "./types";

interface BlockRendererProps {
  block: Block;
  isSelected?: boolean;
  onClick?: () => void;
  onUpdate?: (block: Block) => void;
  editable?: boolean;
}

export function BlockRenderer({
  block,
  isSelected,
  onClick,
  onUpdate,
  editable = false,
}: BlockRendererProps) {
  const wrapperClass = `
    relative transition-all duration-150
    ${isSelected ? "ring-2 ring-[#ff3b1d] ring-offset-2" : ""}
    ${onClick ? "cursor-pointer hover:ring-2 hover:ring-[#ff3b1d]/50 hover:ring-offset-2" : ""}
  `;

  const handleContentChange = (content: string) => {
    if (onUpdate && "content" in block) {
      onUpdate({ ...block, content } as Block);
    }
  };

  return (
    <div className={wrapperClass} onClick={onClick}>
      {renderBlock(block, editable, handleContentChange)}
    </div>
  );
}

function renderBlock(
  block: Block,
  editable: boolean,
  onContentChange: (content: string) => void,
) {
  switch (block.type) {
    case "text":
      return (
        <div
          style={{
            textAlign: block.align,
            fontSize: block.fontSize,
            color: block.color,
            lineHeight: 1.6,
            whiteSpace: "pre-line",
          }}
        >
          {editable ? (
            <div
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) => onContentChange(e.currentTarget.textContent || "")}
              className="outline-none min-h-[1.6em]"
            >
              {block.content}
            </div>
          ) : (
            <p style={{ margin: 0 }}>{block.content}</p>
          )}
        </div>
      );

    case "heading":
      const HeadingTag = `h${block.level}` as "h1" | "h2" | "h3";
      const headingSizes = { 1: 32, 2: 24, 3: 20 };
      return (
        <HeadingTag
          style={{
            textAlign: block.align,
            fontSize: headingSizes[block.level],
            fontWeight: 700,
            color: block.color,
            margin: 0,
            lineHeight: 1.3,
            whiteSpace: "pre-line",
          }}
        >
          {editable ? (
            <span
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) => onContentChange(e.currentTarget.textContent || "")}
              className="outline-none"
            >
              {block.content}
            </span>
          ) : (
            block.content
          )}
        </HeadingTag>
      );

    case "image":
      const imageWidths = { full: "100%", medium: "75%", small: "50%" };
      return (
        <div style={{ textAlign: block.align }}>
          {block.src ? (
            <img
              src={block.src}
              alt={block.alt}
              style={{
                width: imageWidths[block.width],
                maxWidth: "100%",
                height: "auto",
                display: "inline-block",
              }}
            />
          ) : (
            <div
              className="bg-stone-100 border-2 border-dashed border-stone-300 rounded-lg flex items-center justify-center text-stone-400"
              style={{
                width: imageWidths[block.width],
                height: 200,
                display: "inline-flex",
              }}
            >
              <span>Click to add image</span>
            </div>
          )}
        </div>
      );

    case "button":
      return (
        <div style={{ textAlign: block.align }}>
          <a
            href={block.url}
            onClick={(event) => event.preventDefault()}
            style={{
              display: block.fullWidth ? "block" : "inline-block",
              backgroundColor: block.backgroundColor,
              color: block.textColor,
              padding: "14px 28px",
              borderRadius: block.borderRadius,
              textDecoration: "none",
              fontWeight: 600,
              fontSize: 16,
              textAlign: "center",
            }}
          >
            {block.text}
          </a>
        </div>
      );

    case "divider":
      return (
        <hr
          style={{
            border: "none",
            borderTop: `${block.thickness}px ${block.style} ${block.color}`,
            margin: "8px 0",
          }}
        />
      );

    case "spacer":
      return (
        <div
          style={{ height: block.height }}
          className="bg-stone-50/50 border border-dashed border-stone-200 rounded"
        />
      );

    case "columns":
      return (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${block.columns}, 1fr)`,
            gap: block.gap,
          }}
        >
          {block.content.map((columnBlocks, i) => (
            <div
              key={i}
              className="min-h-[60px] bg-stone-50/30 rounded p-2 border border-dashed border-stone-200"
            >
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
      );

    case "social":
      return (
        <p style={{ textAlign: block.align, margin: 0 }}>
          {block.icons.map((icon, index) => (
            <span key={icon.platform}>
              {index > 0 && " · "}
              <a href={icon.url} onClick={(event) => event.preventDefault()}>
                {icon.platform}
              </a>
            </span>
          ))}
        </p>
      );

    default:
      return <div>Unknown block type</div>;
  }
}
