// Core spreadsheet types and cell-address helpers.

export type CellFormat = {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  align?: 'left' | 'center' | 'right'
  color?: string
  bg?: string
  numberFmt?: NumberFmt
}

export type NumberFmt =
  | 'auto'
  | 'number'
  | 'currency'
  | 'percent'
  | 'comma'
  | 'plain'

export type Cell = {
  /** Raw user input, e.g. "=SUM(A1:A3)" or "42" or "Hello". */
  raw: string
  fmt?: CellFormat
}

export type SheetData = {
  id: string
  name: string
  cells: Record<string, Cell>
  colWidths: Record<number, number>
  rowHeights: Record<number, number>
}

export type Workbook = {
  sheets: SheetData[]
  activeSheetId: string
}

export const DEFAULT_COLS = 26
export const DEFAULT_ROWS = 100
export const DEFAULT_COL_WIDTH = 104
export const DEFAULT_ROW_HEIGHT = 26
export const HEADER_WIDTH = 48

/** 0 -> "A", 25 -> "Z", 26 -> "AA" */
export function colToLetter(col: number): string {
  let n = col
  let s = ''
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s
    n = Math.floor(n / 26) - 1
  }
  return s
}

/** "A" -> 0, "Z" -> 25, "AA" -> 26 */
export function letterToCol(letters: string): number {
  let n = 0
  for (let i = 0; i < letters.length; i++) {
    n = n * 26 + (letters.charCodeAt(i) - 64)
  }
  return n - 1
}

export type CellAddr = { row: number; col: number }

export type Selection = { anchor: CellAddr; focus: CellAddr }

/** row/col are 0-based. Returns e.g. "A1". */
export function addrToId(row: number, col: number): string {
  return `${colToLetter(col)}${row + 1}`
}

const REF_RE = /^\$?([A-Za-z]+)\$?(\d+)$/

/** "A1" -> { row: 0, col: 0 }.  Returns null if malformed. */
export function idToAddr(id: string): CellAddr | null {
  const m = REF_RE.exec(id.trim())
  if (!m) return null
  const col = letterToCol(m[1].toUpperCase())
  const row = parseInt(m[2], 10) - 1
  if (row < 0 || col < 0) return null
  return { row, col }
}

export function sameAddr(a: CellAddr, b: CellAddr): boolean {
  return a.row === b.row && a.col === b.col
}

export type RangeRect = {
  top: number
  left: number
  bottom: number
  right: number
}

export function normalizeRange(a: CellAddr, b: CellAddr): RangeRect {
  return {
    top: Math.min(a.row, b.row),
    bottom: Math.max(a.row, b.row),
    left: Math.min(a.col, b.col),
    right: Math.max(a.col, b.col),
  }
}

export function rectContains(rect: RangeRect, addr: CellAddr): boolean {
  return (
    addr.row >= rect.top &&
    addr.row <= rect.bottom &&
    addr.col >= rect.left &&
    addr.col <= rect.right
  )
}

export function makeId(): string {
  return Math.random().toString(36).slice(2, 10)
}

export function emptySheet(name: string): SheetData {
  return {
    id: makeId(),
    name,
    cells: {},
    colWidths: {},
    rowHeights: {},
  }
}
