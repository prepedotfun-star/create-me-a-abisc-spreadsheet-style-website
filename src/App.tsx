import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Toolbar } from './components/Toolbar'
import { FormulaBar } from './components/FormulaBar'
import { Grid, type EditingState } from './components/Grid'
import { SheetTabs } from './components/SheetTabs'
import { DownloadIcon, GridIcon, TrashIcon, UploadIcon } from './components/Icons'
import { useWorkbook } from './store/useWorkbook'
import {
  DEFAULT_COLS,
  DEFAULT_ROWS,
  addrToId,
  colToLetter,
  idToAddr,
  letterToCol,
  normalizeRange,
  type CellAddr,
  type CellFormat,
  type NumberFmt,
  type RangeRect,
  type Selection,
} from './lib/spreadsheet'
import { computeSheet } from './lib/engine'
import { isError } from './lib/formula'
import {
  download,
  parseClipboard,
  sheetToCSV,
  toTSV,
  parseCSV,
} from './lib/csv'

const MAX_ROWS = 5000
const MAX_COLS = 260

type Clipboard = { rect: RangeRect; grid: string[][]; text: string }

export default function App() {
  const {
    workbook,
    activeSheet,
    canUndo,
    canRedo,
    dispatch,
    resetToSample,
    clearSheet,
  } = useWorkbook()

  const [selection, setSelection] = useState<Selection>({
    anchor: { row: 0, col: 0 },
    focus: { row: 0, col: 0 },
  })
  const [editing, setEditing] = useState<EditingState | null>(null)
  const [rows, setRows] = useState(DEFAULT_ROWS)
  const [cols, setCols] = useState(DEFAULT_COLS)
  const [toast, setToast] = useState<string | null>(null)

  const gridRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const comp = useMemo(() => computeSheet(activeSheet.cells), [activeSheet.cells])

  const activeId = addrToId(selection.anchor.row, selection.anchor.col)
  const activeCell = activeSheet.cells[activeId]
  const activeFmt: CellFormat = activeCell?.fmt ?? {}

  // Grow row/col counts to fit the active sheet's used range when it changes.
  useEffect(() => {
    let maxR = DEFAULT_ROWS
    let maxC = DEFAULT_COLS
    for (const id of Object.keys(activeSheet.cells)) {
      const m = /^([A-Z]+)(\d+)$/.exec(id)
      if (!m) continue
      const c = letterToCol(m[1])
      const r = parseInt(m[2], 10) - 1
      if (r + 2 > maxR) maxR = r + 2
      if (c + 1 > maxC) maxC = c + 1
    }
    setRows((prev) => Math.min(MAX_ROWS, Math.max(prev, maxR)))
    setCols((prev) => Math.min(MAX_COLS, Math.max(prev, maxC)))
  }, [activeSheet.cells])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2200)
    return () => clearTimeout(t)
  }, [toast])

  // ---- Refs mirroring latest state for global listeners ----
  const stateRef = useRef({ selection, editing, rows, cols, activeSheet })
  stateRef.current = { selection, editing, rows, cols, activeSheet }
  const clipboardRef = useRef<Clipboard | null>(null)
  const pendingCutRef = useRef<RangeRect | null>(null)

  const flash = useCallback((msg: string) => setToast(msg), [])

  const focusGrid = useCallback(() => {
    requestAnimationFrame(() => gridRef.current?.focus())
  }, [])

  // ---- Selection helpers ----
  const clampCol = useCallback(
    (c: number) => Math.max(0, Math.min(c, MAX_COLS - 1)),
    [],
  )
  const clampRow = useCallback(
    (r: number) => Math.max(0, Math.min(r, MAX_ROWS - 1)),
    [],
  )

  const ensureVisibleCounts = useCallback((r: number, c: number) => {
    setRows((prev) => (r + 1 > prev ? Math.min(MAX_ROWS, r + 10) : prev))
    setCols((prev) => (c + 1 > prev ? Math.min(MAX_COLS, c + 3) : prev))
  }, [])

  const selectCell = useCallback(
    (addr: CellAddr) => {
      const a = { row: clampRow(addr.row), col: clampCol(addr.col) }
      ensureVisibleCounts(a.row, a.col)
      setSelection({ anchor: a, focus: a })
    },
    [clampRow, clampCol, ensureVisibleCounts],
  )

  const onSelect = useCallback(
    (anchor: CellAddr, focus: CellAddr) => {
      const f = { row: clampRow(focus.row), col: clampCol(focus.col) }
      ensureVisibleCounts(f.row, f.col)
      setSelection({ anchor, focus: f })
    },
    [clampRow, clampCol, ensureVisibleCounts],
  )

  // ---- Editing ----
  const beginEdit = useCallback(
    (id: string, value: string, caretAtEnd: boolean) => {
      setEditing({ id, value, caretAtEnd, source: 'grid' })
    },
    [],
  )

  const commitEdit = useCallback(
    (move: 'down' | 'up' | 'right' | 'left' | 'none') => {
      const ed = stateRef.current.editing
      if (ed) {
        const addr = idToAddr(ed.id)!
        dispatch({ type: 'setCell', id: ed.id, raw: ed.value })
        setEditing(null)
        const delta: Record<string, [number, number]> = {
          down: [1, 0],
          up: [-1, 0],
          right: [0, 1],
          left: [0, -1],
          none: [0, 0],
        }
        const [dr, dc] = delta[move]
        const next = { row: clampRow(addr.row + dr), col: clampCol(addr.col + dc) }
        ensureVisibleCounts(next.row, next.col)
        setSelection({ anchor: next, focus: next })
      }
      focusGrid()
    },
    [dispatch, clampRow, clampCol, ensureVisibleCounts, focusGrid],
  )

  const cancelEdit = useCallback(() => {
    setEditing(null)
    focusGrid()
  }, [focusGrid])

  const onEditChange = useCallback((value: string) => {
    setEditing((e) => (e ? { ...e, value } : e))
  }, [])

  // Formula bar can also start editing.
  const onFormulaChange = useCallback(
    (value: string) => {
      const ed = stateRef.current.editing
      if (ed) setEditing({ ...ed, value })
      else setEditing({ id: activeId, value, caretAtEnd: true, source: 'bar' })
    },
    [activeId],
  )

  // ---- Formatting ----
  const selRect = useMemo(
    () => normalizeRange(selection.anchor, selection.focus),
    [selection],
  )

  const selectionIds = useCallback((rect: RangeRect): string[] => {
    const ids: string[] = []
    for (let r = rect.top; r <= rect.bottom; r++) {
      for (let c = rect.left; c <= rect.right; c++) {
        ids.push(addrToId(r, c))
      }
    }
    return ids
  }, [])

  const toggleFmt = useCallback(
    (key: 'bold' | 'italic' | 'underline' | 'strike') => {
      const current = !!activeFmt[key]
      const patch: Partial<CellFormat> = { [key]: current ? undefined : true }
      dispatch({ type: 'setFormat', ids: selectionIds(selRect), patch })
    },
    [activeFmt, dispatch, selRect, selectionIds],
  )

  const setAlign = useCallback(
    (align: 'left' | 'center' | 'right') => {
      dispatch({ type: 'setFormat', ids: selectionIds(selRect), patch: { align } })
    },
    [dispatch, selRect, selectionIds],
  )

  const setColor = useCallback(
    (color: string | undefined) => {
      dispatch({ type: 'setFormat', ids: selectionIds(selRect), patch: { color } })
    },
    [dispatch, selRect, selectionIds],
  )

  const setFill = useCallback(
    (bg: string | undefined) => {
      dispatch({ type: 'setFormat', ids: selectionIds(selRect), patch: { bg } })
    },
    [dispatch, selRect, selectionIds],
  )

  const setNumberFmt = useCallback(
    (fmt: NumberFmt) => {
      dispatch({
        type: 'setFormat',
        ids: selectionIds(selRect),
        patch: { numberFmt: fmt === 'auto' ? undefined : fmt },
      })
    },
    [dispatch, selRect, selectionIds],
  )

  const clearFormatting = useCallback(() => {
    dispatch({ type: 'clearFormat', ids: selectionIds(selRect) })
  }, [dispatch, selRect, selectionIds])

  // ---- Auto sum ----
  const autoSum = useCallback(() => {
    const sheet = stateRef.current.activeSheet
    const localComp = computeSheet(sheet.cells)
    const isNum = (id: string) => typeof localComp.get(id) === 'number'
    const rect = selRect

    if (rect.top !== rect.bottom || rect.left !== rect.right) {
      // Range selected: put SUM below (single column) or right (single row),
      // else below the bottom-left.
      let targetR: number
      let targetC: number
      if (rect.left === rect.right) {
        targetR = rect.bottom + 1
        targetC = rect.left
      } else if (rect.top === rect.bottom) {
        targetR = rect.top
        targetC = rect.right + 1
      } else {
        targetR = rect.bottom + 1
        targetC = rect.left
      }
      const range = `${addrToId(rect.top, rect.left)}:${addrToId(rect.bottom, rect.right)}`
      const id = addrToId(targetR, targetC)
      dispatch({ type: 'setCell', id, raw: `=SUM(${range})` })
      selectCell({ row: targetR, col: targetC })
      focusGrid()
      return
    }

    // Single active cell: scan upward, then left, for a contiguous numeric run.
    const { row, col } = selection.anchor
    let r = row - 1
    while (r >= 0 && isNum(addrToId(r, col))) r--
    if (r < row - 1) {
      const range = `${addrToId(r + 1, col)}:${addrToId(row - 1, col)}`
      dispatch({ type: 'setCell', id: activeId, raw: `=SUM(${range})` })
      focusGrid()
      return
    }
    let c = col - 1
    while (c >= 0 && isNum(addrToId(row, c))) c--
    if (c < col - 1) {
      const range = `${addrToId(row, c + 1)}:${addrToId(row, col - 1)}`
      dispatch({ type: 'setCell', id: activeId, raw: `=SUM(${range})` })
      focusGrid()
      return
    }
    beginEdit(activeId, '=SUM()', false)
  }, [selRect, selection.anchor, activeId, dispatch, selectCell, focusGrid, beginEdit])

  // ---- Clipboard ----
  const doCopy = useCallback(
    (cut: boolean): string => {
      const rect = selRect
      const sheet = stateRef.current.activeSheet
      const localComp = computeSheet(sheet.cells)
      const rawGrid: string[][] = []
      const dispGrid: string[][] = []
      for (let r = rect.top; r <= rect.bottom; r++) {
        const rawRow: string[] = []
        const dispRow: string[] = []
        for (let c = rect.left; c <= rect.right; c++) {
          const id = addrToId(r, c)
          rawRow.push(sheet.cells[id]?.raw ?? '')
          dispRow.push(localComp.display(id))
        }
        rawGrid.push(rawRow)
        dispGrid.push(dispRow)
      }
      const text = toTSV(dispGrid)
      clipboardRef.current = { rect, grid: rawGrid, text }
      pendingCutRef.current = cut ? rect : null
      return text
    },
    [selRect],
  )

  const doPaste = useCallback(
    (text: string) => {
      const clip = clipboardRef.current
      const target = stateRef.current.selection.anchor
      const entries: { id: string; raw: string }[] = []

      let grid: string[][]
      let useFormulaShift = false
      let srcRect: RangeRect | null = null

      if (clip && clip.text === text) {
        grid = clip.grid
        useFormulaShift = true
        srcRect = clip.rect
      } else {
        grid = parseClipboard(text)
      }

      if (grid.length === 0) return

      const dRow = srcRect ? target.row - srcRect.top : 0
      const dCol = srcRect ? target.col - srcRect.left : 0

      let maxR = target.row
      let maxC = target.col
      for (let r = 0; r < grid.length; r++) {
        for (let c = 0; c < grid[r].length; c++) {
          const tr = target.row + r
          const tc = target.col + c
          if (tr >= MAX_ROWS || tc >= MAX_COLS) continue
          let raw = grid[r][c]
          if (useFormulaShift && raw.startsWith('=')) {
            raw = shiftFormula(raw, dRow, dCol)
          }
          entries.push({ id: addrToId(tr, tc), raw })
          maxR = Math.max(maxR, tr)
          maxC = Math.max(maxC, tc)
        }
      }

      // Clear source cells for a cut that isn't overwritten by the paste.
      if (pendingCutRef.current) {
        const s = pendingCutRef.current
        const overwritten = new Set(entries.map((e) => e.id))
        for (let r = s.top; r <= s.bottom; r++) {
          for (let c = s.left; c <= s.right; c++) {
            const id = addrToId(r, c)
            if (!overwritten.has(id)) entries.push({ id, raw: '' })
          }
        }
        pendingCutRef.current = null
        clipboardRef.current = null
      }

      dispatch({ type: 'setCells', entries })
      ensureVisibleCounts(maxR, maxC)
      setSelection({
        anchor: target,
        focus: { row: clampRow(maxR), col: clampCol(maxC) },
      })
    },
    [dispatch, ensureVisibleCounts, clampRow, clampCol],
  )

  // Global copy / cut / paste handlers (only when grid — not an input — is focused).
  useEffect(() => {
    const gridFocused = () =>
      gridRef.current &&
      document.activeElement === gridRef.current &&
      !stateRef.current.editing

    const onCopy = (e: ClipboardEvent) => {
      if (!gridFocused()) return
      e.preventDefault()
      const text = doCopy(false)
      e.clipboardData?.setData('text/plain', text)
      flash('Copied')
    }
    const onCut = (e: ClipboardEvent) => {
      if (!gridFocused()) return
      e.preventDefault()
      const text = doCopy(true)
      e.clipboardData?.setData('text/plain', text)
      flash('Cut')
    }
    const onPaste = (e: ClipboardEvent) => {
      if (!gridFocused()) return
      e.preventDefault()
      const text = e.clipboardData?.getData('text/plain') ?? ''
      if (text) doPaste(text)
    }

    document.addEventListener('copy', onCopy)
    document.addEventListener('cut', onCut)
    document.addEventListener('paste', onPaste)
    return () => {
      document.removeEventListener('copy', onCopy)
      document.removeEventListener('cut', onCut)
      document.removeEventListener('paste', onPaste)
    }
  }, [doCopy, doPaste, flash])

  // ---- Keyboard navigation ----
  const onKeyNav = useCallback(
    (e: React.KeyboardEvent) => {
      if (stateRef.current.editing) return

      const mod = e.ctrlKey || e.metaKey
      const key = e.key

      // Undo / redo
      if (mod && (key === 'z' || key === 'Z')) {
        e.preventDefault()
        if (e.shiftKey) dispatch({ type: 'redo' })
        else dispatch({ type: 'undo' })
        return
      }
      if (mod && (key === 'y' || key === 'Y')) {
        e.preventDefault()
        dispatch({ type: 'redo' })
        return
      }
      // Format shortcuts
      if (mod && (key === 'b' || key === 'B')) {
        e.preventDefault()
        toggleFmt('bold')
        return
      }
      if (mod && (key === 'i' || key === 'I')) {
        e.preventDefault()
        toggleFmt('italic')
        return
      }
      if (mod && (key === 'u' || key === 'U')) {
        e.preventDefault()
        toggleFmt('underline')
        return
      }
      if (mod && (key === 'a' || key === 'A')) {
        e.preventDefault()
        setSelection({
          anchor: { row: 0, col: 0 },
          focus: { row: rows - 1, col: cols - 1 },
        })
        return
      }
      // Let browser handle copy/cut/paste events
      if (mod && ['c', 'x', 'v', 'C', 'X', 'V'].includes(key)) return

      const { anchor, focus } = stateRef.current.selection
      const extend = e.shiftKey
      const base = extend ? focus : anchor

      const moveTo = (r: number, c: number) => {
        e.preventDefault()
        const nr = clampRow(r)
        const nc = clampCol(c)
        ensureVisibleCounts(nr, nc)
        if (extend) {
          setSelection({ anchor, focus: { row: nr, col: nc } })
        } else {
          setSelection({ anchor: { row: nr, col: nc }, focus: { row: nr, col: nc } })
        }
      }

      const findEdge = (dr: number, dc: number): [number, number] => {
        const sheet = stateRef.current.activeSheet
        let r = base.row
        let c = base.col
        const has = (rr: number, cc: number) =>
          !!sheet.cells[addrToId(rr, cc)]?.raw
        const startFilled = has(r, c)
        let steps = 0
        while (steps < 5000) {
          const nr = r + dr
          const nc = c + dc
          if (nr < 0 || nc < 0 || nr >= MAX_ROWS || nc >= MAX_COLS) break
          if (startFilled) {
            if (!has(nr, nc)) break
            r = nr
            c = nc
          } else {
            r = nr
            c = nc
            if (has(nr, nc)) break
          }
          steps++
        }
        return [r, c]
      }

      switch (key) {
        case 'ArrowUp':
          if (mod) {
            const [r, c] = findEdge(-1, 0)
            moveTo(r, c)
          } else moveTo(base.row - 1, base.col)
          return
        case 'ArrowDown':
          if (mod) {
            const [r, c] = findEdge(1, 0)
            moveTo(r, c)
          } else moveTo(base.row + 1, base.col)
          return
        case 'ArrowLeft':
          if (mod) {
            const [r, c] = findEdge(0, -1)
            moveTo(r, c)
          } else moveTo(base.row, base.col - 1)
          return
        case 'ArrowRight':
          if (mod) {
            const [r, c] = findEdge(0, 1)
            moveTo(r, c)
          } else moveTo(base.row, base.col + 1)
          return
        case 'Tab':
          e.preventDefault()
          moveTo(anchor.row, anchor.col + (e.shiftKey ? -1 : 1))
          return
        case 'Enter':
          e.preventDefault()
          if (e.altKey) {
            beginEdit(activeId, activeCell?.raw ?? '', true)
          } else {
            const nr = clampRow(anchor.row + (e.shiftKey ? -1 : 1))
            ensureVisibleCounts(nr, anchor.col)
            setSelection({
              anchor: { row: nr, col: anchor.col },
              focus: { row: nr, col: anchor.col },
            })
          }
          return
        case 'F2':
          e.preventDefault()
          beginEdit(activeId, activeCell?.raw ?? '', true)
          return
        case 'Backspace':
        case 'Delete':
          e.preventDefault()
          dispatch({ type: 'clearCells', ids: selectionIds(selRect) })
          return
        case 'Home':
          if (mod) moveTo(0, 0)
          else moveTo(base.row, 0)
          return
        case 'End':
          if (mod) moveTo(rows - 1, cols - 1)
          else moveTo(base.row, cols - 1)
          return
        case 'PageUp':
          moveTo(base.row - 20, base.col)
          return
        case 'PageDown':
          moveTo(base.row + 20, base.col)
          return
        case 'Escape':
          setSelection({ anchor, focus: anchor })
          return
      }

      // Start editing on printable character
      if (!mod && !e.altKey && key.length === 1) {
        e.preventDefault()
        beginEdit(activeId, key, true)
      }
    },
    [
      dispatch,
      toggleFmt,
      rows,
      cols,
      clampRow,
      clampCol,
      ensureVisibleCounts,
      activeId,
      activeCell,
      beginEdit,
      selRect,
      selectionIds,
    ],
  )

  // ---- Import / Export ----
  const exportCSV = useCallback(() => {
    const csv = sheetToCSV(activeSheet)
    download(`${activeSheet.name || 'sheet'}.csv`, csv, 'text/csv;charset=utf-8')
    flash('Exported CSV')
  }, [activeSheet, flash])

  const onImportFile = useCallback(
    async (file: File) => {
      const text = await file.text()
      const grid = parseCSV(text)
      const entries: { id: string; raw: string }[] = []
      let maxR = 0
      let maxC = 0
      for (let r = 0; r < grid.length; r++) {
        for (let c = 0; c < grid[r].length; c++) {
          const raw = grid[r][c]
          if (raw === '') continue
          entries.push({ id: addrToId(r, c), raw })
          maxR = Math.max(maxR, r)
          maxC = Math.max(maxC, c)
        }
      }
      dispatch({ type: 'setCells', entries })
      ensureVisibleCounts(maxR, maxC)
      flash(`Imported ${file.name}`)
    },
    [dispatch, ensureVisibleCounts, flash],
  )

  // ---- Selection stats ----
  const stats = useMemo(() => {
    let count = 0
    let sum = 0
    let numeric = 0
    for (let r = selRect.top; r <= selRect.bottom; r++) {
      for (let c = selRect.left; c <= selRect.right; c++) {
        const v = comp.get(addrToId(r, c))
        if (v === null || v === '') continue
        count++
        if (typeof v === 'number' && !isError(v)) {
          sum += v
          numeric++
        }
      }
    }
    return { count, sum, numeric }
  }, [selRect, comp])

  const selectionLabel = useMemo(() => {
    if (
      selRect.top === selRect.bottom &&
      selRect.left === selRect.right
    ) {
      return activeId
    }
    const nRows = selRect.bottom - selRect.top + 1
    const nCols = selRect.right - selRect.left + 1
    return `${nRows}R × ${nCols}C`
  }, [selRect, activeId])

  const navigateTo = useCallback(
    (ref: string) => {
      const parts = ref.split(':')
      const a = idToAddr(parts[0])
      if (!a) return
      if (parts[1]) {
        const b = idToAddr(parts[1])
        if (b) {
          ensureVisibleCounts(Math.max(a.row, b.row), Math.max(a.col, b.col))
          setSelection({ anchor: a, focus: b })
          focusGrid()
          return
        }
      }
      selectCell(a)
      focusGrid()
    },
    [ensureVisibleCounts, selectCell, focusGrid],
  )

  const formulaValue = editing ? editing.value : activeCell?.raw ?? ''

  return (
    <div className="flex h-full flex-col bg-slate-50 text-slate-900">
      {/* Header */}
      <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-yellow-400 text-slate-900">
            <GridIcon width={18} height={18} />
          </div>
          <div className="leading-tight">
            <h1 className="text-[15px] font-semibold text-slate-800">Gridsheet</h1>
            <p className="text-[11px] text-slate-400">
              A spreadsheet in your browser
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv,text/plain"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onImportFile(f)
              e.target.value = ''
            }}
          />
          <HeaderButton onClick={() => fileInputRef.current?.click()}>
            <UploadIcon width={15} height={15} /> Import
          </HeaderButton>
          <HeaderButton onClick={exportCSV}>
            <DownloadIcon width={15} height={15} /> Export
          </HeaderButton>
          <HeaderButton
            onClick={() => {
              if (confirm('Clear this sheet and start fresh?')) {
                clearSheet()
                selectCell({ row: 0, col: 0 })
              }
            }}
          >
            <TrashIcon width={15} height={15} /> Clear
          </HeaderButton>
          <button
            type="button"
            onClick={() => {
              if (confirm('Reload the sample workbook? Current data will be replaced.')) {
                resetToSample()
                selectCell({ row: 0, col: 0 })
              }
            }}
            className="rounded-md bg-yellow-400 px-3 py-1.5 text-[13px] font-medium text-slate-900 transition-colors hover:bg-yellow-500"
          >
            Sample
          </button>
        </div>
      </header>

      <Toolbar
        activeFmt={activeFmt}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={() => dispatch({ type: 'undo' })}
        onRedo={() => dispatch({ type: 'redo' })}
        onToggle={toggleFmt}
        onAlign={setAlign}
        onColor={setColor}
        onFill={setFill}
        onNumberFmt={setNumberFmt}
        onClearFormat={clearFormatting}
        onAutoSum={autoSum}
      />

      <FormulaBar
        nameLabel={selectionLabel}
        value={formulaValue}
        editing={!!editing}
        onChange={onFormulaChange}
        onCommit={commitEdit}
        onCancel={cancelEdit}
        onNavigateTo={navigateTo}
      />

      {/* Grid */}
      <div className="relative min-h-0 flex-1">
        <Grid
          sheet={activeSheet}
          comp={comp}
          rows={rows}
          cols={cols}
          selection={selection}
          editing={editing}
          onSelect={onSelect}
          onBeginEdit={beginEdit}
          onEditChange={onEditChange}
          onCommitEdit={commitEdit}
          onCancelEdit={cancelEdit}
          onKeyNav={onKeyNav}
          onResizeCol={(col, width) => dispatch({ type: 'setColWidth', col, width })}
          onResizeRow={(row, height) => dispatch({ type: 'setRowHeight', row, height })}
          gridRef={gridRef}
        />
        {toast && (
          <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-slate-900/90 px-4 py-1.5 text-[13px] font-medium text-white shadow-lg">
            {toast}
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between border-t border-slate-200 bg-white px-4 py-1 text-[12px] text-slate-500">
        <div className="flex items-center gap-4">
          <span>
            <span className="font-medium text-slate-600">{selectionLabel}</span>
          </span>
          {stats.numeric > 0 && (
            <>
              <span>Sum: <span className="font-medium text-slate-700">{formatStat(stats.sum)}</span></span>
              <span>Avg: <span className="font-medium text-slate-700">{formatStat(stats.sum / stats.numeric)}</span></span>
              <span>Count: <span className="font-medium text-slate-700">{stats.count}</span></span>
            </>
          )}
          {stats.numeric === 0 && stats.count > 0 && (
            <span>Count: <span className="font-medium text-slate-700">{stats.count}</span></span>
          )}
        </div>
        <div className="hidden items-center gap-3 sm:flex">
          <span className="text-slate-400">Auto-saved locally</span>
        </div>
      </div>

      <SheetTabs
        sheets={workbook.sheets}
        activeId={workbook.activeSheetId}
        onSelect={(id) => {
          dispatch({ type: 'setActiveSheet', id })
          selectCell({ row: 0, col: 0 })
        }}
        onAdd={() => dispatch({ type: 'addSheet' })}
        onRename={(id, name) => dispatch({ type: 'renameSheet', id, name })}
        onDelete={(id) => dispatch({ type: 'deleteSheet', id })}
      />
    </div>
  )
}

function HeaderButton({
  children,
  onClick,
}: {
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[13px] font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
    >
      {children}
    </button>
  )
}

function formatStat(n: number): string {
  if (Number.isInteger(n)) return String(n)
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(n)
}

// Shift relative cell references in a formula string by (dRow, dCol),
// preserving $-absolute parts and string literals.
function shiftFormula(formula: string, dRow: number, dCol: number): string {
  if (dRow === 0 && dCol === 0) return formula
  let out = ''
  let i = 0
  const n = formula.length
  while (i < n) {
    const ch = formula[i]
    if (ch === '"') {
      out += ch
      i++
      while (i < n) {
        out += formula[i]
        if (formula[i] === '"') {
          if (formula[i + 1] === '"') {
            out += formula[i + 1]
            i += 2
            continue
          }
          i++
          break
        }
        i++
      }
      continue
    }
    const rest = formula.slice(i)
    const m = /^(\$?)([A-Za-z]+)(\$?)(\d+)/.exec(rest)
    if (m) {
      const full = m[0]
      const after = formula[i + full.length]
      const before = i > 0 ? formula[i - 1] : ''
      if (after === '(' || /[A-Za-z0-9_$.]/.test(before)) {
        out += full
        i += full.length
        continue
      }
      const [, absCol, letters, absRow, digits] = m
      let col = letterToCol(letters.toUpperCase())
      let row = parseInt(digits, 10) - 1
      if (!absCol) col += dCol
      if (!absRow) row += dRow
      if (col < 0 || row < 0) {
        out += '#REF!'
      } else {
        out +=
          (absCol ? '$' : '') +
          colToLetter(col) +
          (absRow ? '$' : '') +
          (row + 1)
      }
      i += full.length
      continue
    }
    out += ch
    i++
  }
  return out
}
