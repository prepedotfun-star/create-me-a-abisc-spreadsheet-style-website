import { useState } from 'react'
import type { SheetData } from '../lib/spreadsheet'
import { PlusIcon, TrashIcon } from './Icons'

type SheetTabsProps = {
  sheets: SheetData[]
  activeId: string
  onSelect: (id: string) => void
  onAdd: () => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
}

export function SheetTabs({
  sheets,
  activeId,
  onSelect,
  onAdd,
  onRename,
  onDelete,
}: SheetTabsProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const startRename = (s: SheetData) => {
    setEditingId(s.id)
    setDraft(s.name)
  }

  const commit = () => {
    if (editingId) onRename(editingId, draft)
    setEditingId(null)
  }

  return (
    <div className="flex items-center gap-1 border-t border-slate-200 bg-slate-50 px-2 py-1">
      <button
        type="button"
        title="Add sheet"
        onClick={onAdd}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-200 hover:text-slate-800"
      >
        <PlusIcon width={16} height={16} />
      </button>
      <div className="flex items-center gap-1 overflow-x-auto">
        {sheets.map((s) => {
          const active = s.id === activeId
          return (
            <div
              key={s.id}
              className={
                'group flex shrink-0 items-center rounded-md text-[13px] transition-colors ' +
                (active
                  ? 'bg-white text-yellow-700 shadow-sm ring-1 ring-slate-200'
                  : 'text-slate-600 hover:bg-slate-200/70')
              }
            >
              {editingId === s.id ? (
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commit()
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                  className="w-24 rounded-md bg-white px-2 py-1 font-medium outline-none ring-1 ring-yellow-400"
                  spellCheck={false}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => onSelect(s.id)}
                  onDoubleClick={() => startRename(s)}
                  className={
                    'px-3 py-1 font-medium ' + (active ? '' : '')
                  }
                >
                  {s.name}
                </button>
              )}
              {sheets.length > 1 && editingId !== s.id && (
                <button
                  type="button"
                  title="Delete sheet"
                  onClick={() => {
                    if (confirm(`Delete "${s.name}"? This cannot be undone.`)) {
                      onDelete(s.id)
                    }
                  }}
                  className="mr-1 hidden h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-red-100 hover:text-red-600 group-hover:flex"
                >
                  <TrashIcon width={13} height={13} />
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
