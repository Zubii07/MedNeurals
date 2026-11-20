import { FileCheck2 } from 'lucide-react'
import DefinitionList from '@/components/common/DefinitionList'
import StaleBanner from '@/components/common/StaleBanner'
import StatTile from '@/components/common/StatTile'
import ToneBadge from '@/components/common/ToneBadge'
import SectionCard from '@/components/product/SectionCard'
import RejectedSampleTable from '@/components/data/RejectedSampleTable'
import { IMPORT_DATASETS } from '@/lib/enums'
import { formatDate, formatNumber } from '@/lib/format'

/** ImportResult.status: "completed", or "partial" when rows were rejected (§6.3). */
const STATUS_META = {
  completed: { label: 'Completed', tone: 'success' },
  partial: { label: 'Partial', tone: 'warning' },
}

/**
 * Result of POST /data/import (§7.11 step 3): row counts, the rejected-row summary and sample, and the
 * reminder that predictions only change after a refresh.
 * @param {{ result: import('@/api/shapes').ImportResult }} props
 */
export default function ImportResultCard({ result }) {
  const datasetLabel = IMPORT_DATASETS.find((entry) => entry.value === result.dataset)?.label ?? result.dataset
  const status = STATUS_META[result.status] ?? { label: result.status ?? 'Unknown', tone: 'neutral' }
  const rejected = result.rows_rejected ?? 0
  const sample = Array.isArray(result.rejected_sample) ? result.rejected_sample : []

  return (
    <SectionCard
      icon={FileCheck2}
      tone={status.tone === 'warning' ? 'warning' : 'success'}
      title="Upload result"
      description={result.filename}
      action={<ToneBadge label={status.label} tone={status.tone} />}
    >
      <div className="space-y-4">
        <DefinitionList
          columns={3}
          items={[
            { label: 'File contains', value: datasetLabel },
            { label: 'Rows up to', value: result.cutoff_date ? formatDate(result.cutoff_date) : 'All rows' },
            { label: 'Rows added', value: formatNumber(result.rows_written) },
          ]}
        />

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <StatTile label="Rows in the file" value={formatNumber(result.rows_received)} />
          <StatTile label="Added or updated" value={formatNumber(result.rows_written)} />
          <StatTile label="Already present" value={formatNumber(result.rows_unchanged)} hint="left unchanged" />
          <StatTile label="After the date limit" value={formatNumber(result.rows_skipped)} hint="not imported" />
          <StatTile label="Rejected" value={formatNumber(rejected)} hint="could not be read" tone={rejected > 0 ? 'danger' : undefined} />
        </div>

        {result.rejected_summary ? <StaleBanner title="Some rows were rejected." description={result.rejected_summary} /> : null}
        {sample.length > 0 ? <RejectedSampleTable rows={sample} /> : null}
        {result.rejected_report ? (
          <p className="text-xs text-muted-foreground">
            The full list of rejected rows was saved on the server at <code className="break-all font-mono text-foreground">{result.rejected_report}</code>
          </p>
        ) : null}

        <p className="rounded-lg bg-accent px-3 py-2 text-xs font-medium text-primary">
          Now update the predictions (step 2) so they include this data.
        </p>
      </div>
    </SectionCard>
  )
}
