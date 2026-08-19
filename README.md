# Gridsheet

A fast, keyboard-friendly **spreadsheet in the browser** — built with Vite + React +
TypeScript + Tailwind CSS. No backend required; your work is auto-saved to
`localStorage`.

## Features

- **Real formula engine** — `=` formulas with cell references (`A1`), ranges
  (`A1:B5`), arithmetic (`+ - * / ^ %`), comparison, and text concatenation (`&`).
  Handles dependency chains and reports errors (`#DIV/0!`, `#NAME?`, `#CIRC!`, …).
- **50+ functions** — `SUM`, `AVERAGE`, `MIN`, `MAX`, `COUNT`, `COUNTA`, `IF`,
  `IFERROR`, `AND`, `OR`, `ROUND`, `SQRT`, `POWER`, `MOD`, `MEDIAN`, `STDEV`,
  `CONCAT`, `LEFT`/`RIGHT`/`MID`, `UPPER`/`LOWER`/`TRIM`, `SUMIF`, `COUNTIF`,
  `AVERAGEIF`, and more.
- **Spreadsheet UX** — click & drag selection, `Shift`-extend, full row/column
  selection, keyboard navigation (arrows, `Ctrl`+arrow to jump, `Tab`, `Enter`),
  in-cell editing, and a formula bar with a jump-to-cell name box.
- **Formatting** — bold / italic / underline / strikethrough, text & fill colors,
  alignment, and number formats (currency, percent, thousands separator).
- **Copy / cut / paste** — works internally (preserving formulas with relative
  reference shifting) and with external apps like Excel / Google Sheets.
- **Multiple sheets**, column/row resizing, undo/redo, and a live status bar
  (sum / average / count of the selection).
- **CSV import & export**.

## Keyboard shortcuts

| Action | Shortcut |
| --- | --- |
| Edit cell | `Enter`, `F2`, or just start typing |
| Move / extend selection | Arrows / `Shift`+Arrows |
| Jump to data edge | `Ctrl`+Arrow |
| Select all | `Ctrl`+`A` |
| Bold / Italic / Underline | `Ctrl`+`B` / `I` / `U` |
| Undo / Redo | `Ctrl`+`Z` / `Ctrl`+`Y` |
| Copy / Cut / Paste | `Ctrl`+`C` / `X` / `V` |
| Clear cells | `Delete` / `Backspace` |

## Develop

```bash
npm install
npm run dev        # start the dev server
npm run build      # type-check + production build
npm test           # run the formula-engine unit tests
```

## Single-file preview

```bash
npm run build:preview   # emits dist-single/index.html (everything inlined)
```

This produces one self-contained `index.html` with all JS/CSS inlined and zero
external asset requests — open it directly in any browser.
