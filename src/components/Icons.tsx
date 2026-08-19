// Minimal inline SVG icon set (no external dependency).
import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement>

const base = (props: P) => ({
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  ...props,
})

export const BoldIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M6 4h8a4 4 0 0 1 0 8H6z" />
    <path d="M6 12h9a4 4 0 0 1 0 8H6z" />
  </svg>
)

export const ItalicIcon = (p: P) => (
  <svg {...base(p)}>
    <line x1="19" y1="4" x2="10" y2="4" />
    <line x1="14" y1="20" x2="5" y2="20" />
    <line x1="15" y1="4" x2="9" y2="20" />
  </svg>
)

export const UnderlineIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M6 3v7a6 6 0 0 0 12 0V3" />
    <line x1="4" y1="21" x2="20" y2="21" />
  </svg>
)

export const StrikeIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M16 4H9a3 3 0 0 0-2.83 4" />
    <path d="M14 12a4 4 0 0 1 0 8H6" />
    <line x1="4" y1="12" x2="20" y2="12" />
  </svg>
)

export const AlignLeftIcon = (p: P) => (
  <svg {...base(p)}>
    <line x1="4" y1="6" x2="20" y2="6" />
    <line x1="4" y1="12" x2="14" y2="12" />
    <line x1="4" y1="18" x2="18" y2="18" />
  </svg>
)

export const AlignCenterIcon = (p: P) => (
  <svg {...base(p)}>
    <line x1="4" y1="6" x2="20" y2="6" />
    <line x1="7" y1="12" x2="17" y2="12" />
    <line x1="5" y1="18" x2="19" y2="18" />
  </svg>
)

export const AlignRightIcon = (p: P) => (
  <svg {...base(p)}>
    <line x1="4" y1="6" x2="20" y2="6" />
    <line x1="10" y1="12" x2="20" y2="12" />
    <line x1="6" y1="18" x2="20" y2="18" />
  </svg>
)

export const UndoIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h11a5 5 0 0 1 0 10h-1" />
  </svg>
)

export const RedoIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="m15 14 5-5-5-5" />
    <path d="M20 9H9a5 5 0 0 0 0 10h1" />
  </svg>
)

export const TrashIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 6h18" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
)

export const PlusIcon = (p: P) => (
  <svg {...base(p)}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
)

export const DownloadIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
)

export const UploadIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
)

export const PaintIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M19 11V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v7" />
    <path d="M3 11h18v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <path d="M12 16v3a2 2 0 0 0 2 2h1" />
  </svg>
)

export const TextColorIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 20h16" />
    <path d="m7 16 5-11 5 11" />
    <path d="M9.5 12h5" />
  </svg>
)

export const SigmaIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M18 5V4H6l6 8-6 8h12v-1" />
  </svg>
)

export const GridIcon = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <line x1="3" y1="9" x2="21" y2="9" />
    <line x1="3" y1="15" x2="21" y2="15" />
    <line x1="9" y1="3" x2="9" y2="21" />
    <line x1="15" y1="3" x2="15" y2="21" />
  </svg>
)

export const PercentIcon = (p: P) => (
  <svg {...base(p)}>
    <line x1="19" y1="5" x2="5" y2="19" />
    <circle cx="6.5" cy="6.5" r="2.5" />
    <circle cx="17.5" cy="17.5" r="2.5" />
  </svg>
)

export const DollarIcon = (p: P) => (
  <svg {...base(p)}>
    <line x1="12" y1="1" x2="12" y2="23" />
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
)

export const CommaIcon = (p: P) => (
  <svg {...base(p)} strokeWidth={1.6}>
    <text
      x="12"
      y="16"
      textAnchor="middle"
      fontSize="12"
      fontFamily="sans-serif"
      fontWeight="700"
      fill="currentColor"
      stroke="none"
    >
      1,0
    </text>
  </svg>
)

export const EraserIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="m7 21-4-4a2 2 0 0 1 0-2.83l9-9a2 2 0 0 1 2.83 0l4 4a2 2 0 0 1 0 2.83L12 21z" />
    <line x1="9" y1="12" x2="15" y2="18" />
    <line x1="13" y1="21" x2="21" y2="21" />
  </svg>
)

export const CopyIcon = (p: P) => (
  <svg {...base(p)}>
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
)

export const ChevronDownIcon = (p: P) => (
  <svg {...base(p)}>
    <polyline points="6 9 12 15 18 9" />
  </svg>
)
