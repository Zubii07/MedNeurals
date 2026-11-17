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
      title="Import result"
      description={`Upload #${result.upload_id} · ${result.filename}`}
      action={<ToneBadge label={status.label} tone={status.tone} />}
    >
      <div className="space-y-4">
        <DefinitionList
          columns={3}
          items={[
            { label: 'Dataset', value: datasetLabel },
            { label: 'File', value: <span className="break-all">{result.filename}</span> },
            { label: 'Cutoff date', value: result.cutoff_date ? formatDate(result.cutoff_date) : 'None' },
          ]}
        />

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <StatTile label="Received" value={formatNumber(result.rows_received)} hint="rows in the file" />
          <StatTile label="Skipped" value={formatNumber(result.rows_skipped)} hint="dated after the cutoff" />
          <StatTile label="Rejected" value={formatNumber(rejected)} hint="failed validation" tone={rejected > 0 ? 'danger' : undefined} />
          <StatTile label="Accepted" value={formatNumber(result.rows_accepted)} hint="passed validation" />
          <StatTile label="Written" value={formatNumber(result.rows_written)} hint="inserted or updated" />
          <StatTile label="Unchanged" value={formatNumber(result.rows_unchanged)} hint="already in the database" />
        </div>

        {result.rejected_summary ? <StaleBanner title="Some rows were rejected." description={result.rejected_summary} /> : null}
        {sample.length > 0 ? <RejectedSampleTable rows={sample} /> : null}
        {result.rejected_report ? (
          <p className="text-xs text-muted-foreground">
            Full rejected-row report saved on the server at <code className="break-all font-mono text-foreground">{result.rejected_report}</code>
          </p>
        ) : null}

        <p className="rounded-lg bg-accent px-3 py-2 text-xs font-medium text-primary">
          After importing, run a prediction refresh – predictions do not update automatically.
        </p>
      </div>
    </SectionCard>
  )
}
