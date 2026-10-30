import { cn } from '@/lib/utils'

/**
 * Page title block: title + description on the left, optional actions on the right.
 * @param {{ title: import('react').ReactNode, description?: import('react').ReactNode, eyebrow?: import('react').ReactNode, actions?: import('react').ReactNode, className?: string, children?: import('react').ReactNode }} props
 */
export default function PageHeader({ title, description, eyebrow, actions, className, children }) {
  return (
    <div className={cn('flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between', className)}>
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1 text-xs font-medium text-muted-foreground">{eyebrow}</div> : null}
        <h1 className="text-[1.65rem] leading-tight font-semibold tracking-tight text-foreground">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        {children}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}
