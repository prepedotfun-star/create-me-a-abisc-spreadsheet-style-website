// Workbook state: a reducer with undo/redo history + localStorage persistence.

import { useCallback, useEffect, useReducer } from 'react'
import {
  type Cell,
  type CellFormat,
  type SheetData,
  type Workbook,
  emptySheet,
  makeId,
} from '../lib/spreadsheet'

const STORAGE_KEY = 'gridsheet:workbook:v1'
const HISTORY_LIMIT = 100

type HistoryState = {
  present: Workbook
  past: Workbook[]
  future: Workbook[]
}

export type CellEntry = { id: string; raw: string }

export type Action =
  | { type: 'setCell'; id: string; raw: string }
  | { type: 'setCells'; entries: CellEntry[] }
  | { type: 'clearCells'; ids: string[] }
  | { type: 'setFormat'; ids: string[]; patch: Partial<CellFormat> }
  | { type: 'clearFormat'; ids: string[] }
  | { type: 'setColWidth'; col: number; width: number }
  | { type: 'setRowHeight'; row: number; height: number }
  | { type: 'addSheet' }
  | { type: 'deleteSheet'; id: string }
  | { type: 'renameSheet'; id: string; name: string }
  | { type: 'setActiveSheet'; id: string }
  | { type: 'reorderSheet'; id: string; toIndex: number }
  | { type: 'loadWorkbook'; workbook: Workbook }
  | { type: 'undo' }
  | { type: 'redo' }

function activeSheet(wb: Workbook): SheetData {
  return wb.sheets.find((s) => s.id === wb.activeSheetId) ?? wb.sheets[0]
}

function updateActiveSheet(
  wb: Workbook,
  fn: (sheet: SheetData) => SheetData,
): Workbook {
  return {
    ...wb,
    sheets: wb.sheets.map((s) => (s.id === wb.activeSheetId ? fn(s) : s)),
  }
}

function reduceWorkbook(wb: Workbook, action: Action): Workbook {
  switch (action.type) {
    case 'setCell': {
      return updateActiveSheet(wb, (sheet) => {
        const cells = { ...sheet.cells }
        const existing = cells[action.id]
        if (action.raw === '') {
          if (existing && existing.fmt) {
            cells[action.id] = { raw: '', fmt: existing.fmt }
          } else {
            delete cells[action.id]
          }
        } else {
          cells[action.id] = { raw: action.raw, fmt: existing?.fmt }
        }
        return { ...sheet, cells }
      })
    }
    case 'setCells': {
      return updateActiveSheet(wb, (sheet) => {
        const cells = { ...sheet.cells }
        for (const { id, raw } of action.entries) {
          const existing = cells[id]
          if (raw === '') {
            if (existing?.fmt) cells[id] = { raw: '', fmt: existing.fmt }
            else delete cells[id]
          } else {
            cells[id] = { raw, fmt: existing?.fmt }
          }
        }
        return { ...sheet, cells }
      })
    }
    case 'clearCells': {
      return updateActiveSheet(wb, (sheet) => {
        const cells = { ...sheet.cells }
        for (const id of action.ids) {
          const existing = cells[id]
          if (existing?.fmt) cells[id] = { raw: '', fmt: existing.fmt }
          else delete cells[id]
        }
        return { ...sheet, cells }
      })
    }
    case 'setFormat': {
      return updateActiveSheet(wb, (sheet) => {
        const cells = { ...sheet.cells }
        for (const id of action.ids) {
          const existing: Cell = cells[id] ?? { raw: '' }
          const fmt: CellFormat = { ...(existing.fmt ?? {}), ...action.patch }
          // strip undefined keys
          for (const k of Object.keys(fmt) as (keyof CellFormat)[]) {
            if (fmt[k] === undefined) delete fmt[k]
          }
          cells[id] = { raw: existing.raw, fmt }
        }
        return { ...sheet, cells }
      })
    }
    case 'clearFormat': {
      return updateActiveSheet(wb, (sheet) => {
        const cells = { ...sheet.cells }
        for (const id of action.ids) {
          const existing = cells[id]
          if (!existing) continue
          if (existing.raw === '') delete cells[id]
          else cells[id] = { raw: existing.raw }
        }
        return { ...sheet, cells }
      })
    }
    case 'setColWidth': {
      return updateActiveSheet(wb, (sheet) => ({
        ...sheet,
        colWidths: { ...sheet.colWidths, [action.col]: action.width },
      }))
    }
    case 'setRowHeight': {
      return updateActiveSheet(wb, (sheet) => ({
        ...sheet,
        rowHeights: { ...sheet.rowHeights, [action.row]: action.height },
      }))
    }
    case 'addSheet': {
      const n = wb.sheets.length + 1
      const names = new Set(wb.sheets.map((s) => s.name))
      let name = `Sheet${n}`
      let k = n
      while (names.has(name)) name = `Sheet${++k}`
      const sheet = emptySheet(name)
      return {
        activeSheetId: sheet.id,
        sheets: [...wb.sheets, sheet],
      }
    }
    case 'deleteSheet': {
      if (wb.sheets.length <= 1) return wb
      const idx = wb.sheets.findIndex((s) => s.id === action.id)
      const sheets = wb.sheets.filter((s) => s.id !== action.id)
      let activeSheetId = wb.activeSheetId
      if (activeSheetId === action.id) {
        const next = sheets[Math.max(0, idx - 1)]
        activeSheetId = next.id
      }
      return { sheets, activeSheetId }
    }
    case 'renameSheet': {
      const name = action.name.trim() || 'Sheet'
      return {
        ...wb,
        sheets: wb.sheets.map((s) =>
          s.id === action.id ? { ...s, name } : s,
        ),
      }
    }
    case 'setActiveSheet': {
      return { ...wb, activeSheetId: action.id }
    }
    case 'reorderSheet': {
      const idx = wb.sheets.findIndex((s) => s.id === action.id)
      if (idx < 0) return wb
      const sheets = [...wb.sheets]
      const [moved] = sheets.splice(idx, 1)
      const to = Math.max(0, Math.min(sheets.length, action.toIndex))
      sheets.splice(to, 0, moved)
      return { ...wb, sheets }
    }
    case 'loadWorkbook': {
      return action.workbook
    }
    default:
      return wb
  }
}

const MUTATING = new Set<Action['type']>([
  'setCell',
  'setCells',
  'clearCells',
  'setFormat',
  'clearFormat',
  'setColWidth',
  'setRowHeight',
  'addSheet',
  'deleteSheet',
  'renameSheet',
  'reorderSheet',
])

function reducer(state: HistoryState, action: Action): HistoryState {
  if (action.type === 'undo') {
    if (state.past.length === 0) return state
    const previous = state.past[state.past.length - 1]
    return {
      present: previous,
      past: state.past.slice(0, -1),
      future: [state.present, ...state.future],
    }
  }
  if (action.type === 'redo') {
    if (state.future.length === 0) return state
    const next = state.future[0]
    return {
      present: next,
      past: [...state.past, state.present],
      future: state.future.slice(1),
    }
  }

  const nextPresent = reduceWorkbook(state.present, action)
  if (nextPresent === state.present) return state

  if (action.type === 'setActiveSheet' || action.type === 'loadWorkbook') {
    // Not an undoable content edit.
    return { ...state, present: nextPresent }
  }

  if (MUTATING.has(action.type)) {
    const past = [...state.past, state.present]
    if (past.length > HISTORY_LIMIT) past.shift()
    return { present: nextPresent, past, future: [] }
  }

  return { ...state, present: nextPresent }
}

function sampleWorkbook(): Workbook {
  const sheet = emptySheet('Budget')
  const c = (raw: string, fmt?: CellFormat): Cell => ({ raw, fmt })
  const headerFmt: CellFormat = {
    bold: true,
    bg: '#111827',
    color: '#ffffff',
    align: 'center',
  }
  const cur: CellFormat = { numberFmt: 'currency' }
  sheet.cells = {
    A1: c('Item', headerFmt),
    B1: c('Qty', headerFmt),
    C1: c('Unit Price', headerFmt),
    D1: c('Total', headerFmt),
    A2: c('Notebooks'),
    B2: c('24'),
    C2: c('3.5'),
    D2: c('=B2*C2', cur),
    A3: c('Pens (box)'),
    B3: c('12'),
    C3: c('8.25'),
    D3: c('=B3*C3', cur),
    A4: c('Markers'),
    B4: c('8'),
    C4: c('5.75'),
    D4: c('=B4*C4', cur),
    A5: c('Sticky notes'),
    B5: c('30'),
    C5: c('1.2'),
    D5: c('=B5*C5', cur),
    A7: c('Subtotal', { bold: true }),
    D7: c('=SUM(D2:D5)', { ...cur, bold: true }),
    A8: c('Tax (8%)'),
    D8: c('=D7*0.08', cur),
    A9: c('Shipping'),
    D9: c('15', cur),
    A10: c('Grand Total', { bold: true }),
    D10: c('=D7+D8+D9', { ...cur, bold: true, bg: '#fef9c3' }),
    F1: c('Quick stats', { bold: true, italic: true }),
    F2: c('Items'),
    G2: c('=COUNTA(A2:A5)'),
    F3: c('Avg price'),
    G3: c('=AVERAGE(C2:C5)', { numberFmt: 'currency' }),
    F4: c('Max total'),
    G4: c('=MAX(D2:D5)', { numberFmt: 'currency' }),
  }
  sheet.colWidths = { 0: 130, 2: 96, 5: 96 }
  return {
    sheets: [sheet],
    activeSheetId: sheet.id,
  }
}

function validateWorkbook(wb: unknown): wb is Workbook {
  if (!wb || typeof wb !== 'object') return false
  const w = wb as Workbook
  if (!Array.isArray(w.sheets) || w.sheets.length === 0) return false
  return w.sheets.every(
    (s) =>
      s &&
      typeof s.id === 'string' &&
      typeof s.name === 'string' &&
      typeof s.cells === 'object',
  )
}

function loadInitial(): HistoryState {
  let present: Workbook
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      present = validateWorkbook(parsed) ? parsed : sampleWorkbook()
    } else {
      present = sampleWorkbook()
    }
  } catch {
    present = sampleWorkbook()
  }
  // Ensure activeSheetId is valid
  if (!present.sheets.some((s) => s.id === present.activeSheetId)) {
    present.activeSheetId = present.sheets[0].id
  }
  return { present, past: [], future: [] }
}

export type WorkbookApi = {
  workbook: Workbook
  activeSheet: SheetData
  canUndo: boolean
  canRedo: boolean
  dispatch: (action: Action) => void
  resetToSample: () => void
  clearSheet: () => void
}

export function useWorkbook(): WorkbookApi {
  const [state, dispatch] = useReducer(reducer, undefined, loadInitial)

  useEffect(() => {
    const id = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state.present))
      } catch {
        /* ignore quota errors */
      }
    }, 250)
    return () => clearTimeout(id)
  }, [state.present])

  const resetToSample = useCallback(() => {
    dispatch({ type: 'loadWorkbook', workbook: sampleWorkbook() })
  }, [])

  const clearSheet = useCallback(() => {
    const blank = emptySheet('Sheet1')
    dispatch({
      type: 'loadWorkbook',
      workbook: { sheets: [blank], activeSheetId: blank.id },
    })
  }, [])

  return {
    workbook: state.present,
    activeSheet: activeSheet(state.present),
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    dispatch,
    resetToSample,
    clearSheet,
  }
}

export { makeId }
