import { ArrowLeftRight, CircleAlert, CircleCheck, Minus, ShoppingCart, TriangleAlert, Zap } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ACTION_META, PRIORITY_META, RISK_LEVEL_META, TONE_CLASSES, enumMeta } from '@/lib/enums'
import { cn } from '@/lib/utils'

/** Default icon per tone (plan §3.2: "pill shape, tinted background, small icon + text"). */
const TONE_ICONS = {
  danger: TriangleAlert,
  warning: CircleAlert,
  success: CircleCheck,
}

/**
 * Tinted pill for any enum value.
 * @param {{ label: string, tone: string, icon?: import('react').ElementType | null, className?: string }} props
 */
export default function ToneBadge({ label, tone, icon, className }) {
  const Icon = icon === undefined ? TONE_ICONS[tone] : icon
  return (
    <Badge
      variant="outline"
      className={cn('h-6 gap-1 border-transparent px-2.5 text-xs font-semibold', TONE_CLASSES[tone] ?? TONE_CLASSES.neutral, className)}
    >
      {Icon ? <Icon aria-hidden="true" strokeWidth={2.5} /> : null}
      {label}
    </Badge>
  )
}

/** URGENT / REVIEW / LOW */
export function RiskBadge({ level, className }) {
  const { label, tone } = enumMeta(RISK_LEVEL_META, level)
  return <ToneBadge label={label} tone={tone} className={className} />
}

/** HIGH / MODERATE / LOW */
export function PriorityBadge({ priority, className }) {
  const { label, tone } = enumMeta(PRIORITY_META, priority)
  return <ToneBadge label={label} tone={tone} className={className} />
}

const ACTION_ICONS = {
  PURCHASE: ShoppingCart,
  TRANSFER: ArrowLeftRight,
  EXPEDITE_PO: Zap,
  NONE: Minus,
}

/** PURCHASE / TRANSFER / EXPEDITE_PO / NONE */
export function ActionBadge({ action, className }) {
  const { label, tone } = enumMeta(ACTION_META, action)
  return <ToneBadge label={label} tone={tone} icon={ACTION_ICONS[action] ?? null} className={className} />
}
