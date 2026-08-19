// Ties raw cell inputs to the formula evaluator, with memoization and
// circular-reference detection, plus display formatting.

import {
  CellValue,
  FormulaError,
  err,
  evaluate,
  isError,
  parseFormula,
} from './formula'
import type { Cell, CellFormat, NumberFmt } from './spreadsheet'

export type ComputedCell = {
  value: CellValue
  display: string
}

export type Sheet = Record<string, Cell>

type EvalCache = Map<string, CellValue>

const parseCache = new Map<string, ReturnType<typeof parseFormula> | FormulaError>()

function getParsed(src: string) {
  const cached = parseCache.get(src)
  if (cached) return cached
  try {
    const p = parseFormula(src)
    parseCache.set(src, p)
    return p
  } catch {
    const e = err('#ERROR!')
    parseCache.set(src, e)
    return e
  }
}

/** Interpret a raw (non-formula) cell string into a scalar value. */
export function coerceLiteral(raw: string): CellValue {
  const t = raw.trim()
  if (t === '') return null
  const up = t.toUpperCase()
  if (up === 'TRUE') return true
  if (up === 'FALSE') return false
  // Percent literal like "50%"
  if (/^-?\d*\.?\d+%$/.test(t)) {
    return parseFloat(t) / 100
  }
  // Currency-ish literal like "$1,200.50"
  const cleaned = t.replace(/^\$/, '').replace(/,/g, '')
  if (/^-?\d*\.?\d+$/.test(cleaned) && cleaned !== '' && cleaned !== '-') {
    return Number(cleaned)
  }
  if (/^-?\d*\.?\d+(e[+-]?\d+)?$/i.test(t)) {
    const n = Number(t)
    if (!Number.isNaN(n)) return n
  }
  return raw
}

function computeCell(
  id: string,
  cells: Sheet,
  cache: EvalCache,
  visiting: Set<string>,
): CellValue {
  if (cache.has(id)) return cache.get(id)!

  const cell = cells[id]
  if (!cell || cell.raw === '') {
    cache.set(id, null)
    return null
  }

  const raw = cell.raw
  if (!raw.startsWith('=')) {
    const v = coerceLiteral(raw)
    cache.set(id, v)
    return v
  }

  // Formula
  if (visiting.has(id)) {
    return err('#CIRC!')
  }
  visiting.add(id)

  const parsed = getParsed(raw.slice(1))
  let result: CellValue
  if (isError(parsed)) {
    result = parsed
  } else {
    result = evaluate(parsed.ast, (refId) => {
      const norm = refId.replace(/\$/g, '').toUpperCase()
      if (visiting.has(norm)) return err('#CIRC!')
      return computeCell(norm, cells, cache, visiting)
    })
  }

  visiting.delete(id)
  cache.set(id, result)
  return result
}

export type SheetComputation = {
  get: (id: string) => CellValue
  display: (id: string) => string
}

/** Build a lazy evaluator over a sheet's cells. */
export function computeSheet(cells: Sheet): SheetComputation {
  const cache: EvalCache = new Map()
  return {
    get(id: string) {
      return computeCell(id, cells, cache, new Set())
    },
    display(id: string) {
      const v = computeCell(id, cells, cache, new Set())
      const fmt = cells[id]?.fmt
      return formatValue(v, fmt)
    },
  }
}

// ---------------------------------------------------------------------------
// Display formatting
// ---------------------------------------------------------------------------

export function formatValue(v: CellValue, fmt?: CellFormat): string {
  if (v === null) return ''
  if (isError(v)) return v.code
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  if (typeof v === 'string') return v

  // number
  const numberFmt = fmt?.numberFmt ?? 'auto'
  return formatNumber(v, numberFmt)
}

export function formatNumber(v: number, fmt: NumberFmt): string {
  if (!Number.isFinite(v)) return v > 0 ? '∞' : '-∞'
  switch (fmt) {
    case 'currency':
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
      }).format(v)
    case 'percent':
      return new Intl.NumberFormat('en-US', {
        style: 'percent',
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(v)
    case 'comma':
      return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(v)
    case 'number':
      return new Intl.NumberFormat('en-US', {
        maximumFractionDigits: 10,
      }).format(v)
    case 'plain':
      return String(v)
    case 'auto':
    default:
      return formatAuto(v)
  }
}

function formatAuto(v: number): string {
  if (Number.isInteger(v)) return String(v)
  // Trim floating point noise but keep reasonable precision.
  const rounded = Math.round(v * 1e10) / 1e10
  let s = String(rounded)
  if (s.includes('.') && s.replace('-', '').split('.')[1]?.length > 10) {
    s = rounded.toFixed(10).replace(/0+$/, '').replace(/\.$/, '')
  }
  return s
}

export function isFormula(raw: string | undefined): boolean {
  return !!raw && raw.startsWith('=')
}

export function isNumericValue(v: CellValue): boolean {
  return typeof v === 'number'
}
