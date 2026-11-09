"use client";

import { useEffect } from "react";
import { useEditor, EditorContent, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import { Table, TableRow, TableHeader, TableCell } from "@tiptap/extension-table";
import {
  Bold,
  Italic,
  Strikethrough,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  Quote,
  Table as TableIcon,
  Link as LinkIcon,
  Undo,
  Redo,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Docs-style rich text editor (Tiptap) shared by Global Notes and per-task
 * notes, so SEO/content writers can write articles, tables, etc. directly in
 * the app instead of Google Docs. `content` is Tiptap's JSON document shape;
 * `onChange` fires on every edit with the latest JSON so the caller can
 * autosave or hold it for an explicit Save button.
 */
export function RichTextEditor({
  content,
  onChange,
  editable = true,
  placeholder = "Start writing…",
  className,
}: {
  content: Record<string, unknown>;
  onChange?: (json: JSONContent) => void;
  editable?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: false }),
      Placeholder.configure({ placeholder }),
      Link.configure({ openOnClick: false, autolink: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: Object.keys(content ?? {}).length > 0 ? (content as JSONContent) : "",
    editable,
    immediatelyRender: false,
    onUpdate: ({ editor }) => onChange?.(editor.getJSON()),
    editorProps: {
      attributes: { class: "rte-content" },
    },
  });

  useEffect(() => {
    if (editor) editor.setEditable(editable);
  }, [editor, editable]);

  if (!editor) return null;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {editable && (
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-base-700/60 bg-base-900 p-1.5">
          <ToolbarButton active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold">
            <Bold size={14} />
          </ToolbarButton>
          <ToolbarButton active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic">
            <Italic size={14} />
          </ToolbarButton>
          <ToolbarButton active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()} title="Strikethrough">
            <Strikethrough size={14} />
          </ToolbarButton>
          <Divider />
          <ToolbarButton
            active={editor.isActive("heading", { level: 1 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            title="Heading 1"
          >
            <Heading1 size={14} />
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive("heading", { level: 2 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            title="Heading 2"
          >
            <Heading2 size={14} />
          </ToolbarButton>
          <Divider />
          <ToolbarButton active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bullet list">
            <List size={14} />
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive("orderedList")}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            title="Numbered list"
          >
            <ListOrdered size={14} />
          </ToolbarButton>
          <ToolbarButton active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Quote">
            <Quote size={14} />
          </ToolbarButton>
          <Divider />
          <ToolbarButton
            onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
            title="Insert table"
          >
            <TableIcon size={14} />
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive("link")}
            onClick={() => {
              const url = window.prompt("Link URL");
              if (url) editor.chain().focus().setLink({ href: url }).run();
              else if (url === "") editor.chain().focus().unsetLink().run();
            }}
            title="Link"
          >
            <LinkIcon size={14} />
          </ToolbarButton>
          <Divider />
          <ToolbarButton onClick={() => editor.chain().focus().undo().run()} title="Undo">
            <Undo size={14} />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().redo().run()} title="Redo">
            <Redo size={14} />
          </ToolbarButton>
        </div>
      )}
      <div className="rounded-lg border border-base-700/60 bg-base-900 px-3.5 py-3">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function Divider() {
  return <span className="mx-0.5 h-4 w-px bg-base-700/60" />;
}

function ToolbarButton({
  children,
  onClick,
  active,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 hover:bg-base-800 hover:text-neutral-100",
        active && "bg-accent-500/15 text-accent-300",
      )}
    >
      {children}
    </button>
  );
}
