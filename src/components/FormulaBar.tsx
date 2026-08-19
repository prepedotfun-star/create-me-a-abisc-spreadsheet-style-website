import { useEffect, useRef, useState } from 'react'
import { SigmaIcon } from './Icons'

type FormulaBarProps = {
  nameLabel: string
  value: string
  editing: boolean
  onChange: (value: string) => void
  onCommit: (move: 'down' | 'none') => void
  onCancel: () => void
  onNavigateTo: (ref: string) => void
}

export function FormulaBar({
  nameLabel,
  value,
  editing,
  onChange,
  onCommit,
  onCancel,
  onNavigateTo,
}: FormulaBarProps) {
  const [nameDraft, setNameDraft] = useState(nameLabel)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setNameDraft(nameLabel)
  }, [nameLabel])

  return (
    <div className="flex items-stretch border-b border-slate-200 bg-white">
      <div className="flex w-[120px] shrink-0 items-center border-r border-slate-200 px-1">
        <input
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onNavigateTo(nameDraft)
              ;(e.target as HTMLInputElement).blur()
            } else if (e.key === 'Escape') {
              setNameDraft(nameLabel)
              ;(e.target as HTMLInputElement).blur()
            }
          }}
          onBlur={() => setNameDraft(nameLabel)}
          className="w-full rounded px-2 py-1 text-center text-[13px] font-semibold text-slate-700 outline-none focus:bg-slate-100"
          aria-label="Name box"
          spellCheck={false}
        />
      </div>
      <div className="flex items-center gap-1 px-2 text-slate-400">
        <SigmaIcon width={15} height={15} />
      </div>
      <input
        ref={inputRef}
        value={value}
        placeholder="Enter a value or =formula"
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (!editing) return
          if (e.key === 'Enter') {
            e.preventDefault()
            onCommit('down')
            ;(e.target as HTMLInputElement).blur()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            onCancel()
            ;(e.target as HTMLInputElement).blur()
          }
        }}
        className="min-w-0 flex-1 px-2 py-1.5 font-mono text-[13px] text-slate-800 outline-none placeholder:font-sans placeholder:text-slate-400"
      />
    </div>
  )
}
