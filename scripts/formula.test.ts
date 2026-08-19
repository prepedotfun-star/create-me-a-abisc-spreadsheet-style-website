import { computeSheet } from '../src/lib/engine'
import type { Cell } from '../src/lib/spreadsheet'

let pass = 0
let fail = 0
function check(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got)
  const w = JSON.stringify(want)
  if (g === w) {
    pass++
  } else {
    fail++
    console.log(`FAIL: ${name} -> got ${g}, want ${w}`)
  }
}

function sheet(cells: Record<string, string>) {
  const c: Record<string, Cell> = {}
  for (const [k, v] of Object.entries(cells)) c[k] = { raw: v }
  return computeSheet(c)
}

// Arithmetic & precedence
let s = sheet({ A1: '=1+2*3', A2: '=(1+2)*3', A3: '=2^10', A4: '=10/4', A5: '=-3+2', A6: '=10%' })
check('1+2*3', s.get('A1'), 7)
check('(1+2)*3', s.get('A2'), 9)
check('2^10', s.get('A3'), 1024)
check('10/4', s.get('A4'), 2.5)
check('-3+2', s.get('A5'), -1)
check('10%', s.get('A6'), 0.1)

// References and ranges
s = sheet({ A1: '10', A2: '20', A3: '30', B1: '=A1+A2+A3', B2: '=SUM(A1:A3)', B3: '=AVERAGE(A1:A3)', B4: '=MAX(A1:A3)', B5: '=MIN(A1:A3)', B6: '=COUNT(A1:A3)' })
check('A1+A2+A3', s.get('B1'), 60)
check('SUM', s.get('B2'), 60)
check('AVERAGE', s.get('B3'), 20)
check('MAX', s.get('B4'), 30)
check('MIN', s.get('B5'), 10)
check('COUNT', s.get('B6'), 3)

// Strings & concat
s = sheet({ A1: 'Hello', A2: 'World', B1: '=A1&" "&A2', B2: '=CONCAT(A1,A2)', B3: '=UPPER(A1)', B4: '=LEN(A1)', B5: '=LEFT(A1,3)' })
check('concat &', s.get('B1'), 'Hello World')
check('CONCAT', s.get('B2'), 'HelloWorld')
check('UPPER', s.get('B3'), 'HELLO')
check('LEN', s.get('B4'), 5)
check('LEFT', s.get('B5'), 'Hel')

// IF / logic / comparisons
s = sheet({ A1: '5', B1: '=IF(A1>3,"big","small")', B2: '=IF(A1=5,1,0)', B3: '=AND(A1>1,A1<10)', B4: '=OR(FALSE,TRUE)', B5: '=NOT(TRUE)' })
check('IF big', s.get('B1'), 'big')
check('IF eq', s.get('B2'), 1)
check('AND', s.get('B3'), true)
check('OR', s.get('B4'), true)
check('NOT', s.get('B5'), false)

// Errors
s = sheet({ A1: '=1/0', A2: '=FOO(1)', A3: '=A3', A4: '=SUM(', A5: '=IFERROR(1/0,"safe")' })
check('DIV0', s.get('A1'), { error: true, code: '#DIV/0!' })
check('NAME', s.get('A2'), { error: true, code: '#NAME?' })
check('CIRC', s.get('A3'), { error: true, code: '#CIRC!' })
check('syntax', s.get('A4'), { error: true, code: '#ERROR!' })
check('IFERROR', s.get('A5'), 'safe')

// Chained dependencies
s = sheet({ A1: '2', A2: '=A1*3', A3: '=A2+A1', A4: '=A3*A2' })
check('chain A2', s.get('A2'), 6)
check('chain A3', s.get('A3'), 8)
check('chain A4', s.get('A4'), 48)

// Conditional aggregates
s = sheet({ A1: '5', A2: '15', A3: '25', B1: 'x', B2: 'y', B3: 'x', C1: '=SUMIF(A1:A3,">10")', C2: '=COUNTIF(B1:B3,"x")', C3: '=SUMIF(B1:B3,"x",A1:A3)' })
check('SUMIF', s.get('C1'), 40)
check('COUNTIF', s.get('C2'), 2)
check('SUMIF criteria range', s.get('C3'), 30)

// Number coercion of text literals
s = sheet({ A1: '10', A2: '$1,200.50', A3: '50%', B1: '=A1*2', B2: '=A2+0', B3: '=A3*100' })
check('num literal', s.get('B1'), 20)
check('currency literal', s.get('B2'), 1200.5)
check('percent literal', s.get('B3'), 50)

// Rounding
s = sheet({ A1: '=ROUND(3.14159,2)', A2: '=ROUNDUP(1.1,0)', A3: '=ROUNDDOWN(1.9,0)', A4: '=MOD(10,3)', A5: '=SQRT(16)' })
check('ROUND', s.get('A1'), 3.14)
check('ROUNDUP', s.get('A2'), 2)
check('ROUNDDOWN', s.get('A3'), 1)
check('MOD', s.get('A4'), 1)
check('SQRT', s.get('A5'), 4)

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
