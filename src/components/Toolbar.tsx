import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { CellFormat, NumberFmt } from '../lib/spreadsheet'
import {
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  BoldIcon,
  ChevronDownIcon,
  CommaIcon,
  DollarIcon,
  EraserIcon,
  ItalicIcon,
  PaintIcon,
  PercentIcon,
  RedoIcon,
  SigmaIcon,
  StrikeIcon,
  TextColorIcon,
  UnderlineIcon,
  UndoIcon,
} from './Icons'

type ToolbarProps = {
  activeFmt: CellFormat
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onToggle: (key: 'bold' | 'italic' | 'underline' | 'strike') => void
  onAlign: (align: 'left' | 'center' | 'right') => void
  onColor: (color: string | undefined) => void
  onFill: (color: string | undefined) => void
  onNumberFmt: (fmt: NumberFmt) => void
  onClearFormat: () => void
  onAutoSum: () => void
}

function Btn({
  children,
  onClick,
  active,
  disabled,
  title,
}: {
  children: ReactNode
  onClick?: () => void
  active?: boolean
  disabled?: boolean
  title?: string
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={
        'flex h-8 min-w-8 items-center justify-center gap-1 rounded-md px-1.5 text-slate-600 transition-colors ' +
        (disabled
          ? 'cursor-not-allowed opacity-40'
          : active
            ? 'bg-emerald-100 text-emerald-700'
            : 'hover:bg-slate-100 hover:text-slate-900')
      }
    >
      {children}
    </button>
  )
}

function Sep() {
  return <div className="mx-1 h-6 w-px shrink-0 self-center bg-slate-200" />
}

const PALETTE = [
  '#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#ffffff',
  '#e11d48', '#f97316', '#eab308', '#22c55e', '#0ea5e9', '#6366f1', '#a855f7',
  '#fca5a5', '#fdba74', '#fde047', '#86efac', '#7dd3fc', '#a5b4fc', '#d8b4fe',
  '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0284c7', '#4f46e5', '#9333ea',
]

function ColorMenu({
  icon,
  title,
  current,
  onPick,
}: {
  icon: ReactNode
  title: string
  current?: string
  onPick: (color: string | undefined) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        title={title}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 items-center gap-0.5 rounded-md px-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      >
        <span className="relative flex flex-col items-center">
          {icon}
          <span
            className="mt-[1px] h-[3px] w-4 rounded-full"
            style={{ backgroundColor: current ?? '#94a3b8' }}
          />
        </span>
        <ChevronDownIcon width={12} height={12} />
      </button>
      {open && (
        <div className="absolute left-0 top-9 z-50 w-[184px] rounded-lg border border-slate-200 bg-white p-2 shadow-xl">
          <div className="grid grid-cols-7 gap-1">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                title={c}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(c)
                  setOpen(false)
                }}
                className="h-5 w-5 rounded border border-slate-300/70 transition-transform hover:scale-110"
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onPick(undefined)
              setOpen(false)
            }}
            className="mt-2 flex w-full items-center justify-center gap-1 rounded border border-slate-200 py-1 text-xs text-slate-600 hover:bg-slate-50"
          >
            <EraserIcon width={13} height={13} /> Reset
          </button>
        </div>
      )}
    </div>
  )
}

export function Toolbar(props: ToolbarProps) {
  const {
    activeFmt,
    canUndo,
    canRedo,
    onUndo,
    onRedo,
    onToggle,
    onAlign,
    onColor,
    onFill,
    onNumberFmt,
    onClearFormat,
    onAutoSum,
  } = props

  const align = activeFmt.align ?? 'left'
  const numberFmt = activeFmt.numberFmt ?? 'auto'

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-white px-2 py-1">
      <Btn title="Undo (Ctrl+Z)" onClick={onUndo} disabled={!canUndo}>
        <UndoIcon />
      </Btn>
      <Btn title="Redo (Ctrl+Y)" onClick={onRedo} disabled={!canRedo}>
        <RedoIcon />
      </Btn>

      <Sep />

      <Btn title="Bold (Ctrl+B)" active={activeFmt.bold} onClick={() => onToggle('bold')}>
        <BoldIcon />
      </Btn>
      <Btn title="Italic (Ctrl+I)" active={activeFmt.italic} onClick={() => onToggle('italic')}>
        <ItalicIcon />
      </Btn>
      <Btn
        title="Underline (Ctrl+U)"
        active={activeFmt.underline}
        onClick={() => onToggle('underline')}
      >
        <UnderlineIcon />
      </Btn>
      <Btn title="Strikethrough" active={activeFmt.strike} onClick={() => onToggle('strike')}>
        <StrikeIcon />
      </Btn>

      <Sep />

      <ColorMenu
        icon={<TextColorIcon />}
        title="Text color"
        current={activeFmt.color}
        onPick={onColor}
      />
      <ColorMenu
        icon={<PaintIcon />}
        title="Fill color"
        current={activeFmt.bg}
        onPick={onFill}
      />

      <Sep />

      <Btn title="Align left" active={align === 'left'} onClick={() => onAlign('left')}>
        <AlignLeftIcon />
      </Btn>
      <Btn title="Align center" active={align === 'center'} onClick={() => onAlign('center')}>
        <AlignCenterIcon />
      </Btn>
      <Btn title="Align right" active={align === 'right'} onClick={() => onAlign('right')}>
        <AlignRightIcon />
      </Btn>

      <Sep />

      <Btn
        title="Currency format"
        active={numberFmt === 'currency'}
        onClick={() => onNumberFmt(numberFmt === 'currency' ? 'auto' : 'currency')}
      >
        <DollarIcon />
      </Btn>
      <Btn
        title="Percent format"
        active={numberFmt === 'percent'}
        onClick={() => onNumberFmt(numberFmt === 'percent' ? 'auto' : 'percent')}
      >
        <PercentIcon />
      </Btn>
      <Btn
        title="Thousands separator"
        active={numberFmt === 'comma'}
        onClick={() => onNumberFmt(numberFmt === 'comma' ? 'auto' : 'comma')}
      >
        <CommaIcon />
      </Btn>

      <Sep />

      <Btn title="Sum (Σ)" onClick={onAutoSum}>
        <SigmaIcon />
      </Btn>
      <Btn title="Clear formatting" onClick={onClearFormat}>
        <EraserIcon />
      </Btn>
    </div>
  )
}
