import { useMemo } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EM_DASH, formatNumber } from '@/lib/format'

const HEAD = 'h-9 bg-muted/60 px-2 text-xs font-medium text-muted-foreground first:rounded-l-lg last:rounded-r-lg'

function cellText(value) {
  if (value === null || value === undefined || value === '') return EM_DASH
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

/**
 * `rejected_sample` of an ImportResult (§6.3): up to 20 rejected CSV rows whose columns differ per dataset,
 * so the header is the union of the row keys in first-seen order. Scrolls horizontally inside its card.
 * @param {{ rows: Record<string, unknown>[] }} props
 */
export default function RejectedSampleTable({ rows }) {
  const columns = useMemo(() => {
    const keys = []
    for (const row of rows) {
      for (const key of Object.keys(row ?? {})) if (!keys.includes(key)) keys.push(key)
    }
    return keys
  }, [rows])

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border border-border/70">
        <Table className="min-w-max">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {columns.map((column) => (
                <TableHead key={column} className={HEAD}>
                  {column}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={index}>
                {columns.map((column) => (
                  <TableCell key={column} className="px-2 py-1.5 font-mono text-xs whitespace-nowrap">
                    {cellText(row?.[column])}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">First {formatNumber(rows.length)} rejected rows (the backend returns at most 20).</p>
    </div>
  )
}
