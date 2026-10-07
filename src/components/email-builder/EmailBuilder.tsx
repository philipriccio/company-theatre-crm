"use client";

import { useState, useCallback, useEffect, useId, useRef } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { generateHtml } from "./render";
import { CSS } from "@dnd-kit/utilities";

import {
  Block,
  BlockType,
  EmailTemplate,
  createBlock,
  defaultStyles,
} from "./types";
import { BlockRenderer } from "./BlockRenderer";
import { BlocksPalette } from "./BlocksPalette";
import { PropertiesPanel } from "./PropertiesPanel";

interface EmailBuilderProps {
  initialTemplate?: EmailTemplate;
  onChange?: (template: EmailTemplate) => void;
  saveLabel?: string;
  onSave?: (template: EmailTemplate) => void;
  onExportHtml?: (html: string) => void;
}

export function EmailBuilder({
  initialTemplate,
  onSave,
  onExportHtml,
  onChange,
  saveLabel = "Save Template",
}: EmailBuilderProps) {
  const dndId = useId();
  const [blocks, setBlocks] = useState<Block[]>(initialTemplate?.blocks || []);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState(
    initialTemplate?.name || "Untitled Template",
  );
  const [styles] = useState(initialTemplate?.styles || defaultStyles);
  const [previewMode, setPreviewMode] = useState(false);

  const lastReportedDesign = useRef(
    JSON.stringify({ name: templateName, blocks, styles }),
  );
  useEffect(() => {
    const design = { name: templateName, blocks, styles };
    const snapshot = JSON.stringify(design);
    // Hydration/mount and object-key ordering are not user edits.
    if (lastReportedDesign.current === snapshot) return;
    lastReportedDesign.current = snapshot;
    onChange?.(design);
  }, [templateName, blocks, styles, onChange]);

  const selectedBlock = blocks.find((b) => b.id === selectedBlockId) || null;

  const sensors = useSensors(
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    // If dragging from palette, add new block
    if (active.data.current?.fromPalette) {
      const newBlock = createBlock(active.data.current.type as BlockType);

      if (over.id === "canvas") {
        setBlocks([...blocks, newBlock]);
      } else {
        const overIndex = blocks.findIndex((b) => b.id === over.id);
        if (overIndex !== -1) {
          const newBlocks = [...blocks];
          newBlocks.splice(overIndex, 0, newBlock);
          setBlocks(newBlocks);
        }
      }
      setSelectedBlockId(newBlock.id);
      return;
    }

    // Reordering existing blocks
    if (active.id !== over.id) {
      const oldIndex = blocks.findIndex((b) => b.id === active.id);
      const newIndex = blocks.findIndex((b) => b.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        setBlocks(arrayMove(blocks, oldIndex, newIndex));
      }
    }
  };

  const handleAddBlock = useCallback((type: BlockType) => {
    const newBlock = createBlock(type);
    setBlocks((prev) => [...prev, newBlock]);
    setSelectedBlockId(newBlock.id);
  }, []);

  const handleUpdateBlock = useCallback((updatedBlock: Block) => {
    setBlocks((prev) =>
      prev.map((b) => (b.id === updatedBlock.id ? updatedBlock : b)),
    );
  }, []);

  const handleDeleteBlock = useCallback(() => {
    if (selectedBlockId) {
      setBlocks((prev) => prev.filter((b) => b.id !== selectedBlockId));
      setSelectedBlockId(null);
    }
  }, [selectedBlockId]);

  const handleSave = () => {
    const template: EmailTemplate = {
      name: templateName,
      blocks,
      styles,
    };
    onSave?.(template);
  };

  const handleExport = () => {
    const html = generateHtml(blocks, styles);
    onExportHtml?.(html);
  };

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="h-full flex flex-col">
        {/* Toolbar */}
        <div className="flex flex-wrap gap-3 items-center justify-between px-4 py-3 border-b border-stone-200 bg-white">
          <div className="flex items-center gap-4">
            <input
              type="text"
              aria-label="Design name"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              className="text-lg font-semibold text-stone-900 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-[#ff3b1d] rounded px-2 py-1 -ml-2"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPreviewMode(!previewMode)}
              className={`btn btn-sm ${previewMode ? "btn-primary" : "btn-secondary"}`}
            >
              {previewMode ? "Edit" : "Preview"}
            </button>
            {onExportHtml && (
              <button
                onClick={handleExport}
                className="btn btn-secondary btn-sm"
              >
                Export HTML
              </button>
            )}
            <button onClick={handleSave} className="btn btn-primary btn-sm">
              {saveLabel}
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col xl:flex-row min-w-0">
          {/* Left Sidebar - Blocks Palette */}
          {!previewMode && (
            <div className="w-full xl:w-48 shrink-0 border-r border-stone-200 bg-white overflow-y-auto">
              <BlocksPalette onAddBlock={handleAddBlock} />
            </div>
          )}

          {/* Canvas */}
          <div className="flex-1 min-w-0 overflow-y-auto bg-stone-100 p-3 sm:p-6">
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
                  <h2 className="text-lg font-semibold tracking-wider">
                    THE COMPANY THEATRE
                  </h2>
                </div>

                {/* Content Area */}
                <div className="p-8">
                  {blocks.length === 0 ? (
                    <div className="border-2 border-dashed border-stone-300 rounded-xl p-12 text-center">
                      <p className="text-stone-400 mb-2">
                        {previewMode
                          ? "No content yet"
                          : "Click a block in the palette to add it"}
                      </p>
                      {!previewMode && (
                        <p className="text-sm text-stone-300">
                          Start building your email template
                        </p>
                      )}
                    </div>
                  ) : (
                    <SortableContext
                      items={blocks.map((b) => b.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-4">
                        {blocks.map((block) => (
                          <SortableBlock
                            key={block.id}
                            block={block}
                            isSelected={block.id === selectedBlockId}
                            onClick={() =>
                              !previewMode && setSelectedBlockId(block.id)
                            }
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
                  <p className="mt-1">companytheatre.ca · jackpottwins.ca</p>
                  <p className="mt-1">hello@companytheatre.ca</p>
                  <p className="mt-2">
                    <a href="#" className="text-stone-400 hover:text-stone-600">
                      Unsubscribe
                    </a>
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Sidebar - Properties */}
          {!previewMode && (
            <div className="w-full xl:w-64 shrink-0 border-l border-stone-200 bg-white overflow-y-auto">
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
            <p className="text-sm font-medium text-stone-700">
              Moving block...
            </p>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function SortableBlock({
  block,
  isSelected,
  onClick,
  onUpdate,
  disabled,
}: {
  block: Block;
  isSelected: boolean;
  onClick: () => void;
  onUpdate: (block: Block) => void;
  disabled: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      {!disabled && (
        <div className="flex gap-2 mb-2">
          <button
            type="button"
            onClick={onClick}
            aria-pressed={isSelected}
            className="text-xs px-2 py-1 rounded border border-stone-300"
          >
            Edit {block.type} block
          </button>
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label={`Move ${block.type} block. Press space, then arrow keys to reorder.`}
            className="text-xs px-2 py-1 rounded border border-stone-300 cursor-grab"
          >
            Move
          </button>
        </div>
      )}
      <BlockRenderer
        block={block}
        isSelected={isSelected}
        onClick={onClick}
        onUpdate={onUpdate}
        editable={isSelected && !disabled}
      />
    </div>
  );
}
