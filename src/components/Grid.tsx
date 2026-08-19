import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react'
import {
  DEFAULT_COL_WIDTH,
  DEFAULT_ROW_HEIGHT,
  HEADER_WIDTH,
  addrToId,
  colToLetter,
  normalizeRange,
  type CellAddr,
  type CellFormat,
  type Selection,
  type SheetData,
} from '../lib/spreadsheet'
import type { SheetComputation } from '../lib/engine'
import { isError } from '../lib/formula'

const COL_HEADER_HEIGHT = 28

export type EditingState = {
  id: string
  value: string
  caretAtEnd: boolean
  source: 'grid' | 'bar'
}

type GridProps = {
  sheet: SheetData
  comp: SheetComputation
  rows: number
  cols: number
  selection: Selection
  editing: EditingState | null
  onSelect: (anchor: CellAddr, focus: CellAddr) => void
  onBeginEdit: (id: string, value: string, caretAtEnd: boolean) => void
  onEditChange: (value: string) => void
  onCommitEdit: (move: 'down' | 'up' | 'right' | 'left' | 'none') => void
  onCancelEdit: () => void
  onKeyNav: (e: React.KeyboardEvent) => void
  onResizeCol: (col: number, width: number) => void
  onResizeRow: (row: number, height: number) => void
  gridRef: React.RefObject<HTMLDivElement>
}

function styleFromFormat(fmt: CellFormat | undefined): React.CSSProperties {
  if (!fmt) return {}
  const s: React.CSSProperties = {}
  if (fmt.bold) s.fontWeight = 700
  if (fmt.italic) s.fontStyle = 'italic'
  const deco: string[] = []
  if (fmt.underline) deco.push('underline')
  if (fmt.strike) deco.push('line-through')
  if (deco.length) s.textDecoration = deco.join(' ')
  if (fmt.color) s.color = fmt.color
  if (fmt.bg) s.backgroundColor = fmt.bg
  if (fmt.align) s.textAlign = fmt.align
  return s
}

// ---------------------------------------------------------------------------
// Cells layer (memoized so it does not re-render on selection/edit changes)
// ---------------------------------------------------------------------------

type CellsLayerProps = {
  sheet: SheetData
  comp: SheetComputation
  rows: number
  cols: number
  colX: number[]
  rowY: number[]
  version: number
}

const CellsLayer = memo(function CellsLayer({
  sheet,
  comp,
  rows,
  cols,
  colX,
  rowY,
}: CellsLayerProps) {
  const colEls: React.ReactNode[] = []
  for (let c = 0; c < cols; c++) {
    colEls.push(
      <div
        key={c}
        data-colhdr={c}
        className="relative flex select-none items-center justify-center border-b border-r border-slate-300 bg-slate-100 text-[11px] font-semibold text-slate-500"
        style={{ width: colX[c + 1] - colX[c], height: COL_HEADER_HEIGHT }}
      >
        {colToLetter(c)}
        <span
          data-resizecol={c}
          className="absolute right-0 top-0 h-full w-[6px] translate-x-1/2 cursor-col-resize hover:bg-emerald-400/60"
        />
      </div>,
    )
  }

  const rowEls: React.ReactNode[] = []
  for (let r = 0; r < rows; r++) {
    const rowHeight = rowY[r + 1] - rowY[r]
    const cells: React.ReactNode[] = []
    for (let c = 0; c < cols; c++) {
      const id = addrToId(r, c)
      const cell = sheet.cells[id]
      const value = comp.get(id)
      const display = comp.display(id)
      const errorCell = isError(value)
      const numeric = typeof value === 'number'
      const fmt = cell?.fmt
      const st = styleFromFormat(fmt)
      if (!fmt?.align && numeric) st.textAlign = 'right'
      cells.push(
        <div
          key={c}
          data-cell={id}
          className={
            'flex items-center overflow-hidden whitespace-nowrap border-b border-r border-emerald-200 bg-emerald-100 px-1.5 text-[13px] leading-none text-slate-800' +
            (errorCell ? ' text-red-600' : '')
          }
          style={{ width: colX[c + 1] - colX[c], height: rowHeight, ...st }}
          title={errorCell ? String(display) : undefined}
        >
          {display}
        </div>,
      )
    }
    rowEls.push(
      <div key={r} className="flex" style={{ height: rowHeight }}>
        <div
          data-rowhdr={r}
          className="sticky left-0 z-20 flex select-none items-center justify-center border-b border-r border-slate-300 bg-slate-100 text-[11px] font-semibold text-slate-500"
          style={{ width: HEADER_WIDTH, height: rowHeight }}
        >
          {r + 1}
          <span
            data-resizerow={r}
            className="absolute bottom-0 left-0 h-[6px] w-full translate-y-1/2 cursor-row-resize hover:bg-emerald-400/60"
          />
        </div>
        {cells}
      </div>,
    )
  }

  return (
    <div className="relative" style={{ width: colX[cols], minWidth: 'max-content' }}>
      <div className="sticky top-0 z-30 flex">
        <div
          className="sticky left-0 z-40 border-b border-r border-slate-300 bg-slate-200"
          style={{ width: HEADER_WIDTH, height: COL_HEADER_HEIGHT }}
        />
        {colEls}
      </div>
      {rowEls}
    </div>
  )
})

// ---------------------------------------------------------------------------
// Grid
// ---------------------------------------------------------------------------

export function Grid(props: GridProps) {
  const {
    sheet,
    comp,
    rows,
    cols,
    selection,
    editing,
    onSelect,
    onBeginEdit,
    onEditChange,
    onCommitEdit,
    onCancelEdit,
    onKeyNav,
    onResizeCol,
    onResizeRow,
    gridRef,
  } = props

  const colWidths = sheet.colWidths
  const rowHeights = sheet.rowHeights

  const colX = useMemo(() => {
    const arr = new Array(cols + 1)
    arr[0] = HEADER_WIDTH
    for (let c = 0; c < cols; c++) {
      arr[c + 1] = arr[c] + (colWidths[c] ?? DEFAULT_COL_WIDTH)
    }
    return arr
  }, [cols, colWidths])

  const rowY = useMemo(() => {
    const arr = new Array(rows + 1)
    arr[0] = COL_HEADER_HEIGHT
    for (let r = 0; r < rows; r++) {
      arr[r + 1] = arr[r] + (rowHeights[r] ?? DEFAULT_ROW_HEIGHT)
    }
    return arr
  }, [rows, rowHeights])

  const dragging = useRef(false)

  const cellFromEvent = useCallback((target: EventTarget | null): CellAddr | null => {
    if (!(target instanceof HTMLElement)) return null
    const el = target.closest('[data-cell]') as HTMLElement | null
    if (!el) return null
    const id = el.getAttribute('data-cell')!
    const m = /^([A-Z]+)(\d+)$/.exec(id)
    if (!m) return null
    let col = 0
    for (let i = 0; i < m[1].length; i++) col = col * 26 + (m[1].charCodeAt(i) - 64)
    return { col: col - 1, row: parseInt(m[2], 10) - 1 }
  }, [])

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement

      // Column / row resize
      const rc = target.getAttribute('data-resizecol')
      if (rc !== null) {
        e.preventDefault()
        startResizeCol(parseInt(rc, 10), e.clientX)
        return
      }
      const rr = target.getAttribute('data-resizerow')
      if (rr !== null) {
        e.preventDefault()
        startResizeRow(parseInt(rr, 10), e.clientY)
        return
      }

      // Column header -> select whole column
      const ch = target.closest('[data-colhdr]') as HTMLElement | null
      if (ch) {
        const c = parseInt(ch.getAttribute('data-colhdr')!, 10)
        if (e.shiftKey) {
          onSelect(selection.anchor, { row: rows - 1, col: c })
        } else {
          onSelect({ row: 0, col: c }, { row: rows - 1, col: c })
        }
        dragging.current = true
        gridRef.current?.focus()
        return
      }
      // Row header -> select whole row
      const rh = target.closest('[data-rowhdr]') as HTMLElement | null
      if (rh) {
        const r = parseInt(rh.getAttribute('data-rowhdr')!, 10)
        if (e.shiftKey) {
          onSelect(selection.anchor, { row: r, col: cols - 1 })
        } else {
          onSelect({ row: r, col: 0 }, { row: r, col: cols - 1 })
        }
        dragging.current = true
        gridRef.current?.focus()
        return
      }

      const addr = cellFromEvent(e.target)
      if (!addr) return
      if (editing) onCommitEdit('none')
      gridRef.current?.focus()
      if (e.shiftKey) {
        onSelect(selection.anchor, addr)
      } else {
        onSelect(addr, addr)
      }
      dragging.current = true
    },
    [cellFromEvent, editing, onCommitEdit, onSelect, selection.anchor, rows, cols, gridRef],
  )

  const handleMouseOver = useCallback(
    (e: React.MouseEvent) => {
      if (!dragging.current) return
      const addr = cellFromEvent(e.target)
      if (!addr) return
      onSelect(selection.anchor, addr)
    },
    [cellFromEvent, onSelect, selection.anchor],
  )

  useEffect(() => {
    const up = () => {
      dragging.current = false
    }
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [])

  // Resize handlers via window listeners
  const startResizeCol = useCallback(
    (col: number, startX: number) => {
      const startWidth = colWidths[col] ?? DEFAULT_COL_WIDTH
      const move = (ev: MouseEvent) => {
        const w = Math.max(40, startWidth + (ev.clientX - startX))
        onResizeCol(col, Math.round(w))
      }
      const up = () => {
        window.removeEventListener('mousemove', move)
        window.removeEventListener('mouseup', up)
        document.body.style.cursor = ''
      }
      document.body.style.cursor = 'col-resize'
      window.addEventListener('mousemove', move)
      window.addEventListener('mouseup', up)
    },
    [colWidths, onResizeCol],
  )

  const startResizeRow = useCallback(
    (row: number, startY: number) => {
      const startHeight = rowHeights[row] ?? DEFAULT_ROW_HEIGHT
      const move = (ev: MouseEvent) => {
        const h = Math.max(20, startHeight + (ev.clientY - startY))
        onResizeRow(row, Math.round(h))
      }
      const up = () => {
        window.removeEventListener('mousemove', move)
        window.removeEventListener('mouseup', up)
        document.body.style.cursor = ''
      }
      document.body.style.cursor = 'row-resize'
      window.addEventListener('mousemove', move)
      window.addEventListener('mouseup', up)
    },
    [rowHeights, onResizeRow],
  )

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const addr = cellFromEvent(e.target)
      if (!addr) return
      const id = addrToId(addr.row, addr.col)
      onBeginEdit(id, sheet.cells[id]?.raw ?? '', true)
    },
    [cellFromEvent, onBeginEdit, sheet.cells],
  )

  // Selection geometry
  const rect = normalizeRange(selection.anchor, selection.focus)
  const selLeft = colX[rect.left]
  const selTop = rowY[rect.top]
  const selWidth = colX[Math.min(rect.right + 1, cols)] - selLeft
  const selHeight = rowY[Math.min(rect.bottom + 1, rows)] - selTop

  const activeId = addrToId(selection.anchor.row, selection.anchor.col)
  const aLeft = colX[selection.anchor.col]
  const aTop = rowY[selection.anchor.row]
  const aWidth = colX[selection.anchor.col + 1] - aLeft
  const aHeight = rowY[selection.anchor.row + 1] - aTop

  const version = useCellVersion(sheet)

  return (
    <div
      ref={gridRef}
      tabIndex={0}
      className="grid-scroll no-select relative h-full w-full overflow-auto bg-emerald-100 outline-none"
      onMouseDown={handleMouseDown}
      onMouseOver={handleMouseOver}
      onDoubleClick={handleDoubleClick}
      onKeyDown={onKeyNav}
    >
      <CellsLayer
        sheet={sheet}
        comp={comp}
        rows={rows}
        cols={cols}
        colX={colX}
        rowY={rowY}
        version={version}
      />

      {/* Selection tint */}
      {(selWidth > 0 || selHeight > 0) && (
        <div
          className="pointer-events-none absolute z-10 border-2 border-emerald-500 bg-emerald-500/10"
          style={{ left: selLeft, top: selTop, width: selWidth, height: selHeight }}
        />
      )}

      {/* Active cell outline (white interior to distinguish anchor) */}
      {!editing && (
        <div
          className="pointer-events-none absolute z-10 border-2 border-emerald-600"
          style={{ left: aLeft, top: aTop, width: aWidth, height: aHeight }}
        />
      )}

      {/* Editing input */}
      {editing && (
        <EditingInput
          key={editing.id}
          left={aLeft}
          top={aTop}
          width={aWidth}
          height={aHeight}
          fmt={sheet.cells[activeId]?.fmt}
          value={editing.value}
          caretAtEnd={editing.caretAtEnd}
          autoFocus={editing.source === 'grid'}
          onChange={onEditChange}
          onCommit={onCommitEdit}
          onCancel={onCancelEdit}
        />
      )}
    </div>
  )
}

// Small counter that changes whenever the cells object changes identity,
// used to bust the memo on CellsLayer.
function useCellVersion(sheet: SheetData): number {
  const ref = useRef({ cells: sheet.cells, v: 0 })
  if (ref.current.cells !== sheet.cells) {
    ref.current = { cells: sheet.cells, v: ref.current.v + 1 }
  }
  return ref.current.v
}

type EditingInputProps = {
  left: number
  top: number
  width: number
  height: number
  fmt: CellFormat | undefined
  value: string
  caretAtEnd: boolean
  autoFocus: boolean
  onChange: (v: string) => void
  onCommit: (move: 'down' | 'up' | 'right' | 'left' | 'none') => void
  onCancel: () => void
}

function EditingInput({
  left,
  top,
  width,
  height,
  fmt,
  value,
  caretAtEnd,
  autoFocus,
  onChange,
  onCommit,
  onCancel,
}: EditingInputProps) {
  const ref = useRef<HTMLInputElement>(null)

  useLayoutEffect(() => {
    if (!autoFocus) return
    const el = ref.current
    if (!el) return
    el.focus()
    if (caretAtEnd) {
      const len = el.value.length
      el.setSelectionRange(len, len)
    } else {
      el.select()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const st = styleFromFormat(fmt)

  return (
    <input
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          onCommit(e.shiftKey ? 'up' : 'down')
        } else if (e.key === 'Tab') {
          e.preventDefault()
          onCommit(e.shiftKey ? 'left' : 'right')
        } else if (e.key === 'Escape') {
          e.preventDefault()
          onCancel()
        }
        // otherwise let the input handle it
        e.stopPropagation()
      }}
      className="absolute z-20 box-border border-2 border-emerald-600 bg-emerald-100 px-1.5 text-[13px] leading-none text-slate-900 outline-none"
      style={{
        left,
        top,
        width: Math.max(width, 120),
        height,
        fontWeight: st.fontWeight,
        fontStyle: st.fontStyle,
        textAlign: (st.textAlign as React.CSSProperties['textAlign']) ?? 'left',
      }}
    />
  )
}
