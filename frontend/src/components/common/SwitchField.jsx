import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

/**
 * Labelled on/off toggle for boolean filters (stockout only, active only, include emergency orders).
 * @param {{ id: string, label: string, checked: boolean, onCheckedChange: (checked: boolean) => void, disabled?: boolean, className?: string }} props
 */
export default function SwitchField({ id, label, checked, onCheckedChange, disabled = false, className }) {
  return (
    <div className={cn('flex h-9 items-center gap-2', className)}>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
      <Label htmlFor={id} className="text-sm font-normal text-foreground">
        {label}
      </Label>
    </div>
  )
}
