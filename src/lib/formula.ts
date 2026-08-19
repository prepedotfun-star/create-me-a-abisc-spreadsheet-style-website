// A small but capable spreadsheet formula engine:
// tokenizer -> Pratt/recursive-descent parser -> evaluator.
// Supports numbers, strings, booleans, cell refs (A1), ranges (A1:B3),
// arithmetic/comparison/concat operators, and a library of functions.

import { idToAddr, letterToCol } from './spreadsheet'

export type FormulaError = {
  error: true
  code: string
}

export type ScalarValue = number | string | boolean | null
export type CellValue = ScalarValue | FormulaError

export function isError(v: unknown): v is FormulaError {
  return typeof v === 'object' && v !== null && (v as FormulaError).error === true
}

export function err(code: string): FormulaError {
  return { error: true, code }
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

type TokType =
  | 'num'
  | 'str'
  | 'ident'
  | 'op'
  | 'lparen'
  | 'rparen'
  | 'comma'
  | 'colon'
  | 'eof'

type Token = { type: TokType; value: string; pos: number }

function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  const n = input.length

  const isDigit = (c: string) => c >= '0' && c <= '9'
  const isAlpha = (c: string) =>
    (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_' || c === '$'
  const isAlphaNum = (c: string) => isAlpha(c) || isDigit(c) || c === '.'

  while (i < n) {
    const c = input[i]

    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++
      continue
    }

    // String literal (double quotes, "" escapes a quote)
    if (c === '"') {
      let s = ''
      i++
      while (i < n) {
        if (input[i] === '"') {
          if (input[i + 1] === '"') {
            s += '"'
            i += 2
            continue
          }
          i++
          break
        }
        s += input[i]
        i++
      }
      tokens.push({ type: 'str', value: s, pos: i })
      continue
    }

    // Number
    if (isDigit(c) || (c === '.' && isDigit(input[i + 1]))) {
      let s = ''
      while (i < n && (isDigit(input[i]) || input[i] === '.')) {
        s += input[i]
        i++
      }
      // exponent
      if (input[i] === 'e' || input[i] === 'E') {
        s += input[i]
        i++
        if (input[i] === '+' || input[i] === '-') {
          s += input[i]
          i++
        }
        while (i < n && isDigit(input[i])) {
          s += input[i]
          i++
        }
      }
      tokens.push({ type: 'num', value: s, pos: i })
      continue
    }

    // Identifier (function name, cell ref, boolean, named token)
    if (isAlpha(c)) {
      let s = ''
      while (i < n && isAlphaNum(input[i])) {
        s += input[i]
        i++
      }
      tokens.push({ type: 'ident', value: s, pos: i })
      continue
    }

    // Multi-char operators
    const two = input.slice(i, i + 2)
    if (two === '<=' || two === '>=' || two === '<>') {
      tokens.push({ type: 'op', value: two, pos: i })
      i += 2
      continue
    }

    if ('+-*/^%&=<>'.includes(c)) {
      tokens.push({ type: 'op', value: c, pos: i })
      i++
      continue
    }
    if (c === '(') {
      tokens.push({ type: 'lparen', value: c, pos: i })
      i++
      continue
    }
    if (c === ')') {
      tokens.push({ type: 'rparen', value: c, pos: i })
      i++
      continue
    }
    if (c === ',') {
      tokens.push({ type: 'comma', value: c, pos: i })
      i++
      continue
    }
    if (c === ':') {
      tokens.push({ type: 'colon', value: c, pos: i })
      i++
      continue
    }

    throw new ParseError(`Unexpected character "${c}"`)
  }

  tokens.push({ type: 'eof', value: '', pos: i })
  return tokens
}

class ParseError extends Error {}

// ---------------------------------------------------------------------------
// AST
// ---------------------------------------------------------------------------

type Node =
  | { kind: 'num'; value: number }
  | { kind: 'str'; value: string }
  | { kind: 'bool'; value: boolean }
  | { kind: 'ref'; id: string }
  | { kind: 'range'; from: string; to: string }
  | { kind: 'unary'; op: string; expr: Node }
  | { kind: 'postfix'; op: string; expr: Node }
  | { kind: 'binary'; op: string; left: Node; right: Node }
  | { kind: 'call'; name: string; args: Node[] }

// ---------------------------------------------------------------------------
// Parser (recursive descent with precedence)
// ---------------------------------------------------------------------------

class Parser {
  private toks: Token[]
  private pos = 0

  constructor(toks: Token[]) {
    this.toks = toks
  }

  private peek(): Token {
    return this.toks[this.pos]
  }
  private next(): Token {
    return this.toks[this.pos++]
  }
  private expect(type: TokType): Token {
    const t = this.next()
    if (t.type !== type) throw new ParseError(`Expected ${type}`)
    return t
  }

  parse(): Node {
    const node = this.parseComparison()
    if (this.peek().type !== 'eof') throw new ParseError('Unexpected trailing input')
    return node
  }

  // comparison: = <> < > <= >=
  private parseComparison(): Node {
    let left = this.parseConcat()
    while (
      this.peek().type === 'op' &&
      ['=', '<>', '<', '>', '<=', '>='].includes(this.peek().value)
    ) {
      const op = this.next().value
      const right = this.parseConcat()
      left = { kind: 'binary', op, left, right }
    }
    return left
  }

  // concatenation: &
  private parseConcat(): Node {
    let left = this.parseAddSub()
    while (this.peek().type === 'op' && this.peek().value === '&') {
      this.next()
      const right = this.parseAddSub()
      left = { kind: 'binary', op: '&', left, right }
    }
    return left
  }

  private parseAddSub(): Node {
    let left = this.parseMulDiv()
    while (
      this.peek().type === 'op' &&
      (this.peek().value === '+' || this.peek().value === '-')
    ) {
      const op = this.next().value
      const right = this.parseMulDiv()
      left = { kind: 'binary', op, left, right }
    }
    return left
  }

  private parseMulDiv(): Node {
    let left = this.parseUnary()
    while (
      this.peek().type === 'op' &&
      (this.peek().value === '*' || this.peek().value === '/')
    ) {
      const op = this.next().value
      const right = this.parseUnary()
      left = { kind: 'binary', op, left, right }
    }
    return left
  }

  private parseUnary(): Node {
    if (
      this.peek().type === 'op' &&
      (this.peek().value === '-' || this.peek().value === '+')
    ) {
      const op = this.next().value
      const expr = this.parseUnary()
      return { kind: 'unary', op, expr }
    }
    return this.parsePower()
  }

  private parsePower(): Node {
    const left = this.parsePostfix()
    if (this.peek().type === 'op' && this.peek().value === '^') {
      this.next()
      // right-associative
      const right = this.parseUnary()
      return { kind: 'binary', op: '^', left, right }
    }
    return left
  }

  private parsePostfix(): Node {
    let expr = this.parsePrimary()
    while (this.peek().type === 'op' && this.peek().value === '%') {
      this.next()
      expr = { kind: 'postfix', op: '%', expr }
    }
    return expr
  }

  private parsePrimary(): Node {
    const t = this.peek()

    if (t.type === 'num') {
      this.next()
      return { kind: 'num', value: parseFloat(t.value) }
    }

    if (t.type === 'str') {
      this.next()
      return { kind: 'str', value: t.value }
    }

    if (t.type === 'lparen') {
      this.next()
      const inner = this.parseComparison()
      this.expect('rparen')
      return inner
    }

    if (t.type === 'ident') {
      this.next()
      const name = t.value

      // Function call
      if (this.peek().type === 'lparen') {
        this.next()
        const args: Node[] = []
        if (this.peek().type !== 'rparen') {
          args.push(this.parseComparison())
          while (this.peek().type === 'comma') {
            this.next()
            args.push(this.parseComparison())
          }
        }
        this.expect('rparen')
        return { kind: 'call', name: name.toUpperCase(), args }
      }

      // Boolean literals
      const upper = name.toUpperCase()
      if (upper === 'TRUE') return { kind: 'bool', value: true }
      if (upper === 'FALSE') return { kind: 'bool', value: false }

      // Cell ref, possibly a range A1:B2
      if (this.peek().type === 'colon') {
        this.next()
        const to = this.expect('ident').value
        return { kind: 'range', from: name, to }
      }

      if (isCellRef(name)) {
        return { kind: 'ref', id: name }
      }

      throw new ParseError(`Unknown name "${name}"`)
    }

    throw new ParseError('Unexpected token')
  }
}

function isCellRef(s: string): boolean {
  return /^\$?[A-Za-z]+\$?\d+$/.test(s)
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

export type CellResolver = (id: string) => CellValue

type EvalCtx = {
  resolve: CellResolver
}

function toNumber(v: CellValue): number | FormulaError {
  if (isError(v)) return v
  if (v === null || v === '') return 0
  if (typeof v === 'number') return v
  if (typeof v === 'boolean') return v ? 1 : 0
  const n = Number(String(v).trim())
  if (Number.isNaN(n)) return err('#VALUE!')
  return n
}

function toStr(v: CellValue): string {
  if (isError(v)) return v.code
  if (v === null) return ''
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  return String(v)
}

function toBool(v: CellValue): boolean | FormulaError {
  if (isError(v)) return v
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v !== 0
  if (v === null || v === '') return false
  const s = String(v).trim().toUpperCase()
  if (s === 'TRUE') return true
  if (s === 'FALSE') return false
  const n = Number(s)
  if (!Number.isNaN(n)) return n !== 0
  return err('#VALUE!')
}

function evalNode(node: Node, ctx: EvalCtx): CellValue {
  switch (node.kind) {
    case 'num':
      return node.value
    case 'str':
      return node.value
    case 'bool':
      return node.value
    case 'ref':
      return ctx.resolve(node.id)
    case 'range':
      // A bare range only makes sense inside a function; as a scalar it errors.
      return err('#VALUE!')
    case 'unary': {
      const v = toNumber(evalNode(node.expr, ctx))
      if (isError(v)) return v
      return node.op === '-' ? -v : +v
    }
    case 'postfix': {
      const v = toNumber(evalNode(node.expr, ctx))
      if (isError(v)) return v
      return v / 100
    }
    case 'binary':
      return evalBinary(node, ctx)
    case 'call':
      return evalCall(node, ctx)
  }
}

function evalBinary(
  node: Extract<Node, { kind: 'binary' }>,
  ctx: EvalCtx,
): CellValue {
  const op = node.op

  if (op === '&') {
    const l = evalNode(node.left, ctx)
    if (isError(l)) return l
    const r = evalNode(node.right, ctx)
    if (isError(r)) return r
    return toStr(l) + toStr(r)
  }

  if (['=', '<>', '<', '>', '<=', '>='].includes(op)) {
    const l = evalNode(node.left, ctx)
    if (isError(l)) return l
    const r = evalNode(node.right, ctx)
    if (isError(r)) return r
    return compare(op, l, r)
  }

  const l = toNumber(evalNode(node.left, ctx))
  if (isError(l)) return l
  const r = toNumber(evalNode(node.right, ctx))
  if (isError(r)) return r

  switch (op) {
    case '+':
      return l + r
    case '-':
      return l - r
    case '*':
      return l * r
    case '/':
      return r === 0 ? err('#DIV/0!') : l / r
    case '^':
      return Math.pow(l, r)
    default:
      return err('#VALUE!')
  }
}

function compare(op: string, l: ScalarValue | FormulaError, r: ScalarValue | FormulaError): CellValue {
  if (isError(l)) return l
  if (isError(r)) return r
  let cmp: number
  if (typeof l === 'number' && typeof r === 'number') {
    cmp = l < r ? -1 : l > r ? 1 : 0
  } else if (typeof l === 'boolean' || typeof r === 'boolean') {
    const ln = l ? 1 : 0
    const rn = r ? 1 : 0
    cmp = ln < rn ? -1 : ln > rn ? 1 : 0
  } else {
    const ls = toStr(l).toLowerCase()
    const rs = toStr(r).toLowerCase()
    cmp = ls < rs ? -1 : ls > rs ? 1 : 0
  }
  switch (op) {
    case '=':
      return cmp === 0
    case '<>':
      return cmp !== 0
    case '<':
      return cmp < 0
    case '>':
      return cmp > 0
    case '<=':
      return cmp <= 0
    case '>=':
      return cmp >= 0
    default:
      return err('#VALUE!')
  }
}

// Expand a range node into the list of its cell values.
function expandRange(from: string, to: string, ctx: EvalCtx): CellValue[] {
  const a = idToAddr(from)
  const b = idToAddr(to)
  if (!a || !b) return [err('#REF!')]
  const top = Math.min(a.row, b.row)
  const bottom = Math.max(a.row, b.row)
  const left = Math.min(a.col, b.col)
  const right = Math.max(a.col, b.col)
  const out: CellValue[] = []
  for (let r = top; r <= bottom; r++) {
    for (let c = left; c <= right; c++) {
      const id = `${colToLetterLocal(c)}${r + 1}`
      out.push(ctx.resolve(id))
    }
  }
  return out
}

function colToLetterLocal(col: number): string {
  let n = col
  let s = ''
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s
    n = Math.floor(n / 26) - 1
  }
  return s
}

// Flatten a function argument into a list of scalar values.
// Ranges expand to all their cells; scalars become a single value.
function argValues(node: Node, ctx: EvalCtx): CellValue[] {
  if (node.kind === 'range') {
    return expandRange(node.from, node.to, ctx)
  }
  return [evalNode(node, ctx)]
}

// Numeric list, ignoring blanks and non-numeric text (spreadsheet convention).
function numericList(nodes: Node[], ctx: EvalCtx): number[] | FormulaError {
  const out: number[] = []
  for (const node of nodes) {
    const vals = argValues(node, ctx)
    for (const v of vals) {
      if (isError(v)) return v
      if (v === null || v === '') continue
      if (typeof v === 'boolean') {
        out.push(v ? 1 : 0)
        continue
      }
      if (typeof v === 'number') {
        out.push(v)
        continue
      }
      const n = Number(String(v).trim())
      if (!Number.isNaN(n)) out.push(n)
      // non-numeric text is ignored, matching SUM/AVERAGE behaviour
    }
  }
  return out
}

type FnImpl = (args: Node[], ctx: EvalCtx) => CellValue

function reduceNums(
  args: Node[],
  ctx: EvalCtx,
  seed: number,
  fn: (acc: number, x: number) => number,
  finalize?: (acc: number, count: number) => CellValue,
): CellValue {
  const nums = numericList(args, ctx)
  if (isError(nums)) return nums
  let acc = seed
  for (const n of nums) acc = fn(acc, n)
  return finalize ? finalize(acc, nums.length) : acc
}

const FUNCTIONS: Record<string, FnImpl> = {
  SUM: (a, c) => reduceNums(a, c, 0, (acc, x) => acc + x),
  PRODUCT: (a, c) =>
    reduceNums(a, c, 1, (acc, x) => acc * x, (acc, n) => (n === 0 ? 0 : acc)),
  AVERAGE: (a, c) =>
    reduceNums(a, c, 0, (acc, x) => acc + x, (acc, n) =>
      n === 0 ? err('#DIV/0!') : acc / n,
    ),
  AVG: (a, c) => FUNCTIONS.AVERAGE(a, c),
  MIN: (a, c) => {
    const nums = numericList(a, c)
    if (isError(nums)) return nums
    return nums.length ? Math.min(...nums) : 0
  },
  MAX: (a, c) => {
    const nums = numericList(a, c)
    if (isError(nums)) return nums
    return nums.length ? Math.max(...nums) : 0
  },
  COUNT: (a, c) => {
    const nums = numericList(a, c)
    if (isError(nums)) return nums
    return nums.length
  },
  COUNTA: (a, c) => {
    let count = 0
    for (const node of a) {
      for (const v of argValues(node, c)) {
        if (isError(v)) return v
        if (v !== null && v !== '') count++
      }
    }
    return count
  },
  COUNTBLANK: (a, c) => {
    let count = 0
    for (const node of a) {
      for (const v of argValues(node, c)) {
        if (isError(v)) return v
        if (v === null || v === '') count++
      }
    }
    return count
  },
  MEDIAN: (a, c) => {
    const nums = numericList(a, c)
    if (isError(nums)) return nums
    if (!nums.length) return err('#NUM!')
    const s = [...nums].sort((x, y) => x - y)
    const mid = Math.floor(s.length / 2)
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
  },
  MODE: (a, c) => {
    const nums = numericList(a, c)
    if (isError(nums)) return nums
    const counts = new Map<number, number>()
    let best: number | null = null
    let bestCount = 0
    for (const n of nums) {
      const cnt = (counts.get(n) ?? 0) + 1
      counts.set(n, cnt)
      if (cnt > bestCount) {
        bestCount = cnt
        best = n
      }
    }
    return bestCount > 1 && best !== null ? best : err('#N/A')
  },
  STDEV: (a, c) => sampleStat(a, c, false),
  VAR: (a, c) => sampleStat(a, c, true),
  ROUND: (a, c) => roundFn(a, c, 'round'),
  ROUNDUP: (a, c) => roundFn(a, c, 'up'),
  ROUNDDOWN: (a, c) => roundFn(a, c, 'down'),
  ABS: (a, c) => unaryMath(a, c, Math.abs),
  SQRT: (a, c) =>
    unaryMath(a, c, (x) => (x < 0 ? NaN : Math.sqrt(x))),
  EXP: (a, c) => unaryMath(a, c, Math.exp),
  LN: (a, c) => unaryMath(a, c, (x) => (x <= 0 ? NaN : Math.log(x))),
  LOG10: (a, c) => unaryMath(a, c, (x) => (x <= 0 ? NaN : Math.log10(x))),
  LOG: (a, c) => {
    if (a.length === 1) return unaryMath(a, c, (x) => (x <= 0 ? NaN : Math.log10(x)))
    const num = toNumber(evalNode(a[0], c))
    if (isError(num)) return num
    const base = toNumber(evalNode(a[1], c))
    if (isError(base)) return base
    if (num <= 0 || base <= 0 || base === 1) return err('#NUM!')
    return Math.log(num) / Math.log(base)
  },
  INT: (a, c) => unaryMath(a, c, Math.floor),
  SIGN: (a, c) => unaryMath(a, c, Math.sign),
  FLOOR: (a, c) => unaryMath(a, c, Math.floor),
  CEILING: (a, c) => unaryMath(a, c, Math.ceil),
  TRUNC: (a, c) => unaryMath(a, c, Math.trunc),
  SIN: (a, c) => unaryMath(a, c, Math.sin),
  COS: (a, c) => unaryMath(a, c, Math.cos),
  TAN: (a, c) => unaryMath(a, c, Math.tan),
  PI: () => Math.PI,
  POWER: (a, c) => {
    const base = toNumber(evalNode(a[0], c))
    if (isError(base)) return base
    const exp = toNumber(evalNode(a[1], c))
    if (isError(exp)) return exp
    return Math.pow(base, exp)
  },
  MOD: (a, c) => {
    const x = toNumber(evalNode(a[0], c))
    if (isError(x)) return x
    const y = toNumber(evalNode(a[1], c))
    if (isError(y)) return y
    if (y === 0) return err('#DIV/0!')
    return ((x % y) + y) % y
  },
  IF: (a, c) => {
    if (a.length < 2) return err('#N/A')
    const cond = toBool(evalNode(a[0], c))
    if (isError(cond)) return cond
    if (cond) return evalNode(a[1], c)
    return a.length >= 3 ? evalNode(a[2], c) : false
  },
  IFERROR: (a, c) => {
    const v = evalNode(a[0], c)
    if (isError(v)) return a.length >= 2 ? evalNode(a[1], c) : ''
    return v
  },
  IFS: (a, c) => {
    for (let i = 0; i + 1 < a.length; i += 2) {
      const cond = toBool(evalNode(a[i], c))
      if (isError(cond)) return cond
      if (cond) return evalNode(a[i + 1], c)
    }
    return err('#N/A')
  },
  AND: (a, c) => {
    for (const node of a) {
      for (const v of argValues(node, c)) {
        const b = toBool(v)
        if (isError(b)) return b
        if (!b) return false
      }
    }
    return true
  },
  OR: (a, c) => {
    for (const node of a) {
      for (const v of argValues(node, c)) {
        const b = toBool(v)
        if (isError(b)) return b
        if (b) return true
      }
    }
    return false
  },
  NOT: (a, c) => {
    const b = toBool(evalNode(a[0], c))
    if (isError(b)) return b
    return !b
  },
  XOR: (a, c) => {
    let count = 0
    for (const node of a) {
      for (const v of argValues(node, c)) {
        const b = toBool(v)
        if (isError(b)) return b
        if (b) count++
      }
    }
    return count % 2 === 1
  },
  TRUE: () => true,
  FALSE: () => false,
  CONCAT: (a, c) => concatFn(a, c),
  CONCATENATE: (a, c) => concatFn(a, c),
  TEXTJOIN: (a, c) => {
    const delim = toStr(evalNode(a[0], c))
    const ignoreEmpty = toBool(evalNode(a[1], c))
    if (isError(ignoreEmpty)) return ignoreEmpty
    const parts: string[] = []
    for (let i = 2; i < a.length; i++) {
      for (const v of argValues(a[i], c)) {
        if (isError(v)) return v
        const s = toStr(v)
        if (ignoreEmpty && s === '') continue
        parts.push(s)
      }
    }
    return parts.join(delim)
  },
  LEN: (a, c) => toStr(evalNode(a[0], c)).length,
  LEFT: (a, c) => {
    const s = toStr(evalNode(a[0], c))
    const n = a.length >= 2 ? toNumber(evalNode(a[1], c)) : 1
    if (isError(n)) return n
    return s.slice(0, Math.max(0, Math.floor(n)))
  },
  RIGHT: (a, c) => {
    const s = toStr(evalNode(a[0], c))
    const n = a.length >= 2 ? toNumber(evalNode(a[1], c)) : 1
    if (isError(n)) return n
    const k = Math.max(0, Math.floor(n))
    return k === 0 ? '' : s.slice(-k)
  },
  MID: (a, c) => {
    const s = toStr(evalNode(a[0], c))
    const start = toNumber(evalNode(a[1], c))
    if (isError(start)) return start
    const len = toNumber(evalNode(a[2], c))
    if (isError(len)) return len
    const from = Math.max(0, Math.floor(start) - 1)
    return s.slice(from, from + Math.max(0, Math.floor(len)))
  },
  UPPER: (a, c) => toStr(evalNode(a[0], c)).toUpperCase(),
  LOWER: (a, c) => toStr(evalNode(a[0], c)).toLowerCase(),
  TRIM: (a, c) => toStr(evalNode(a[0], c)).trim().replace(/\s+/g, ' '),
  PROPER: (a, c) =>
    toStr(evalNode(a[0], c)).replace(
      /\w\S*/g,
      (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
    ),
  SUBSTITUTE: (a, c) => {
    const s = toStr(evalNode(a[0], c))
    const oldT = toStr(evalNode(a[1], c))
    const newT = toStr(evalNode(a[2], c))
    if (oldT === '') return s
    return s.split(oldT).join(newT)
  },
  REPT: (a, c) => {
    const s = toStr(evalNode(a[0], c))
    const n = toNumber(evalNode(a[1], c))
    if (isError(n)) return n
    return s.repeat(Math.max(0, Math.floor(n)))
  },
  VALUE: (a, c) => {
    const n = toNumber(evalNode(a[0], c))
    return n
  },
  TEXT: (a, c) => {
    const v = toNumber(evalNode(a[0], c))
    if (isError(v)) return v
    return String(v)
  },
  ROUNDTO: (a, c) => roundFn(a, c, 'round'),
  SUMIF: (a, c) => condAgg(a, c, 'sum'),
  COUNTIF: (a, c) => condAgg(a, c, 'count'),
  AVERAGEIF: (a, c) => condAgg(a, c, 'avg'),
}

function concatFn(a: Node[], c: EvalCtx): CellValue {
  let out = ''
  for (const node of a) {
    for (const v of argValues(node, c)) {
      if (isError(v)) return v
      out += toStr(v)
    }
  }
  return out
}

function unaryMath(a: Node[], c: EvalCtx, fn: (x: number) => number): CellValue {
  const v = toNumber(evalNode(a[0], c))
  if (isError(v)) return v
  const r = fn(v)
  if (Number.isNaN(r)) return err('#NUM!')
  return r
}

function roundFn(a: Node[], c: EvalCtx, mode: 'round' | 'up' | 'down'): CellValue {
  const v = toNumber(evalNode(a[0], c))
  if (isError(v)) return v
  const digits = a.length >= 2 ? toNumber(evalNode(a[1], c)) : 0
  if (isError(digits)) return digits
  const factor = Math.pow(10, Math.floor(digits))
  const scaled = v * factor
  let r: number
  if (mode === 'up') r = scaled >= 0 ? Math.ceil(scaled) : Math.floor(scaled)
  else if (mode === 'down') r = scaled >= 0 ? Math.floor(scaled) : Math.ceil(scaled)
  else r = Math.round(scaled)
  return r / factor
}

function sampleStat(a: Node[], c: EvalCtx, variance: boolean): CellValue {
  const nums = numericList(a, c)
  if (isError(nums)) return nums
  if (nums.length < 2) return err('#DIV/0!')
  const mean = nums.reduce((s, x) => s + x, 0) / nums.length
  const ss = nums.reduce((s, x) => s + (x - mean) ** 2, 0)
  const v = ss / (nums.length - 1)
  return variance ? v : Math.sqrt(v)
}

function matchesCriteria(value: CellValue, criteria: CellValue): boolean {
  if (isError(criteria)) return false
  const cs = toStr(criteria).trim()
  const m = /^(<=|>=|<>|<|>|=)?(.*)$/.exec(cs)
  const opSym = (m?.[1] as string) || '='
  const target = (m?.[2] as string) ?? ''
  const targetNum = Number(target)
  const valNum = typeof value === 'number' ? value : Number(toStr(value))
  const bothNumeric = !Number.isNaN(targetNum) && !Number.isNaN(valNum)

  if (bothNumeric) {
    switch (opSym) {
      case '=':
        return valNum === targetNum
      case '<>':
        return valNum !== targetNum
      case '<':
        return valNum < targetNum
      case '>':
        return valNum > targetNum
      case '<=':
        return valNum <= targetNum
      case '>=':
        return valNum >= targetNum
    }
  }
  const vs = toStr(value).toLowerCase()
  const ts = target.toLowerCase()
  if (opSym === '<>') return vs !== ts
  return vs === ts
}

function condAgg(a: Node[], c: EvalCtx, mode: 'sum' | 'count' | 'avg'): CellValue {
  const rangeVals = argValues(a[0], c)
  const criteria = evalNode(a[1], c)
  const sumVals =
    mode !== 'count' && a.length >= 3 ? argValues(a[2], c) : rangeVals
  let total = 0
  let count = 0
  for (let i = 0; i < rangeVals.length; i++) {
    if (matchesCriteria(rangeVals[i], criteria)) {
      if (mode === 'count') {
        count++
      } else {
        const n = toNumber(sumVals[i] ?? null)
        if (!isError(n)) {
          total += n
          count++
        }
      }
    }
  }
  if (mode === 'count') return count
  if (mode === 'sum') return total
  return count === 0 ? err('#DIV/0!') : total / count
}

function evalCall(node: Extract<Node, { kind: 'call' }>, ctx: EvalCtx): CellValue {
  const fn = FUNCTIONS[node.name]
  if (!fn) return err('#NAME?')
  try {
    return fn(node.args, ctx)
  } catch {
    return err('#ERROR!')
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type ParsedFormula = {
  ast: Node
  refs: string[]
}

/** Parse a formula (without the leading "="). Throws on syntax error. */
export function parseFormula(src: string): ParsedFormula {
  const toks = tokenize(src)
  const ast = new Parser(toks).parse()
  const refs = new Set<string>()
  collectRefs(ast, refs)
  return { ast, refs: [...refs] }
}

function collectRefs(node: Node, out: Set<string>) {
  switch (node.kind) {
    case 'ref':
      out.add(node.id.replace(/\$/g, '').toUpperCase())
      break
    case 'range': {
      const a = idToAddr(node.from)
      const b = idToAddr(node.to)
      if (a && b) {
        const top = Math.min(a.row, b.row)
        const bottom = Math.max(a.row, b.row)
        const left = Math.min(a.col, b.col)
        const right = Math.max(a.col, b.col)
        for (let r = top; r <= bottom; r++) {
          for (let cc = left; cc <= right; cc++) {
            out.add(`${colToLetterLocal(cc)}${r + 1}`)
          }
        }
      }
      break
    }
    case 'unary':
    case 'postfix':
      collectRefs(node.expr, out)
      break
    case 'binary':
      collectRefs(node.left, out)
      collectRefs(node.right, out)
      break
    case 'call':
      node.args.forEach((arg) => collectRefs(arg, out))
      break
    default:
      break
  }
}

/** Evaluate a parsed AST given a resolver for referenced cells. */
export function evaluate(ast: Node, resolve: CellResolver): CellValue {
  return evalNode(ast, { resolve })
}

export const FUNCTION_NAMES = Object.keys(FUNCTIONS).sort()

// Re-export for callers that only need the letter helper here.
export { letterToCol }
