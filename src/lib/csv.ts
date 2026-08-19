// CSV import/export helpers.

import { addrToId, colToLetter, type SheetData } from './spreadsheet'
import { computeSheet, formatValue } from './engine'

/** Parse CSV text into a 2D array of strings (handles quotes and newlines). */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  const n = text.length

  while (i < n) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += c
      i++
      continue
    }
    if (c === '"') {
      inQuotes = true
      i++
      continue
    }
    if (c === ',') {
      row.push(field)
      field = ''
      i++
      continue
    }
    if (c === '\r') {
      i++
      continue
    }
    if (c === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i++
      continue
    }
    field += c
    i++
  }
  // last field
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

function escapeCSV(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return '"' + value.replace(/"/g, '""') + '"'
  }
  return value
}

/** Export a sheet's computed values as CSV, trimming trailing empty area. */
export function sheetToCSV(sheet: SheetData): string {
  const comp = computeSheet(sheet.cells)
  let maxRow = -1
  let maxCol = -1
  for (const id of Object.keys(sheet.cells)) {
    const cell = sheet.cells[id]
    if (!cell.raw) continue
    const m = /^([A-Z]+)(\d+)$/.exec(id)
    if (!m) continue
    const col = lettersToNum(m[1])
    const row = parseInt(m[2], 10) - 1
    if (row > maxRow) maxRow = row
    if (col > maxCol) maxCol = col
  }
  if (maxRow < 0) return ''

  const lines: string[] = []
  for (let r = 0; r <= maxRow; r++) {
    const cells: string[] = []
    for (let c = 0; c <= maxCol; c++) {
      const id = addrToId(r, c)
      const v = comp.get(id)
      cells.push(escapeCSV(formatValue(v, sheet.cells[id]?.fmt)))
    }
    lines.push(cells.join(','))
  }
  return lines.join('\n')
}

function lettersToNum(letters: string): number {
  let n = 0
  for (let i = 0; i < letters.length; i++) {
    n = n * 26 + (letters.charCodeAt(i) - 64)
  }
  return n - 1
}

/** Build a TSV blob from a 2D array (for clipboard copy). */
export function toTSV(grid: string[][]): string {
  return grid
    .map((row) => row.map((cell) => cell.replace(/\t/g, ' ')).join('\t'))
    .join('\n')
}

/** Parse clipboard text as a 2D grid (TSV first, else CSV, else single cell). */
export function parseClipboard(text: string): string[][] {
  if (text.includes('\t')) {
    return text
      .replace(/\r/g, '')
      .split('\n')
      .map((line) => line.split('\t'))
  }
  if (text.includes(',') || text.includes('\n')) {
    return parseCSV(text)
  }
  return [[text]]
}

export function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export { colToLetter }
