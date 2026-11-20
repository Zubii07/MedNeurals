import { useRef, useState } from 'react'
import { useIsMutating } from '@tanstack/react-query'
import { CircleAlert, FileText, FileUp, Loader2, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import DatePicker from '@/components/common/DatePicker'
import SectionCard from '@/components/product/SectionCard'
import ImportResultCard from '@/components/data/ImportResultCard'
import { useImportData } from '@/api/hooks'
import { errorMessage } from '@/api/client'
import { useElapsedSeconds } from '@/hooks/use-elapsed-seconds'
import { IMPORT_DATASET_GROUPS } from '@/lib/enums'
import { formatBytes, formatElapsed, formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

const LABEL = 'mb-1.5 text-xs text-muted-foreground'

/**
 * "Import data" form (§7.11 step 3): dataset, CSV file (drop zone) and optional cutoff → POST /data/import →
 * result card. Only the file is cleared after a successful import; dataset and cutoff stay for the next file.
 */
export default function ImportDataCard() {
  const [dataset, setDataset] = useState('')
  const [file, setFile] = useState(null)
  const [cutoff, setCutoff] = useState('')
  const [fileKey, setFileKey] = useState(0) // remounts the uncontrolled file input to clear it
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef(null)
  const upload = useImportData()
  const refreshing = useIsMutating({ mutationKey: ['predictions', 'refresh'] }) > 0
  const elapsed = useElapsedSeconds(upload.isPending)

  const fileError = file && !/\.csv$/i.test(file.name) ? 'Choose a .csv file exported from the hospital system.' : null
  const canSubmit = Boolean(dataset && file && !fileError) && !upload.isPending && !refreshing

  const pick = (list) => setFile(list?.[0] ?? null)
  const clearFile = () => {
    setFile(null)
    setFileKey((key) => key + 1)
  }
  const openPicker = () => {
    if (!upload.isPending) inputRef.current?.click()
  }

  const onSubmit = (event) => {
    event.preventDefault()
    if (!canSubmit) return
    upload.mutate(
      { dataset, file, cutoff },
      {
        onSuccess: (result) => {
          const partial = result.status === 'partial'
          toast[partial ? 'warning' : 'success'](partial ? 'Upload finished, some rows were rejected' : 'Upload finished', {
            description: `${result.filename}: ${formatNumber(result.rows_written)} rows added`,
          })
          clearFile()
        },
        onError: (error) => toast.error('Upload failed', { description: errorMessage(error) }),
      },
    )
  }

  return (
    <div className={cn('space-y-6', !upload.isSuccess && 'h-full')}>
      <SectionCard
        icon={Upload}
        tone="info"
        title="Step 1 · Upload new data"
        description="Add the latest inventory, purchase order and transfer files, one file at a time."
        className={cn(!upload.isSuccess && 'h-full')}
        contentClassName="flex flex-1 flex-col"
      >
        <form onSubmit={onSubmit} className="flex flex-1 flex-col gap-4" noValidate>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="import-dataset" className={LABEL}>
                What the file contains
              </Label>
              <Select value={dataset} onValueChange={setDataset} disabled={upload.isPending}>
                <SelectTrigger id="import-dataset" className="h-9 w-full bg-card">
                  <SelectValue placeholder="Choose a file type" />
                </SelectTrigger>
                <SelectContent position="popper">
                  {IMPORT_DATASET_GROUPS.map((group) => (
                    <SelectGroup key={group.label}>
                      <SelectLabel>{group.label}</SelectLabel>
                      {group.datasets.map((entry) => (
                        <SelectItem key={entry.value} value={entry.value}>
                          {entry.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="import-cutoff" className={LABEL}>
                Only rows up to (optional)
              </Label>
              <DatePicker id="import-cutoff" value={cutoff} onChange={setCutoff} placeholder="All rows in the file" />
            </div>
          </div>

          <div>
            <Label htmlFor="import-file" className={LABEL}>
              File
            </Label>
            <input
              key={fileKey}
              ref={inputRef}
              id="import-file"
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              disabled={upload.isPending}
              onChange={(event) => pick(event.target.files)}
            />
            {file ? (
              <div
                className={cn(
                  'flex items-center justify-between gap-3 rounded-xl border bg-card px-3 py-2.5',
                  fileError ? 'border-danger/50 bg-danger-bg/30' : 'border-border',
                )}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', fileError ? 'bg-danger-bg text-danger' : 'bg-accent text-primary')}>
                    <FileText className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">{file.name}</span>
                    <span className={cn('block text-xs', fileError ? 'font-medium text-danger' : 'text-muted-foreground')}>{fileError ?? formatBytes(file.size)}</span>
                  </span>
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  <Button type="button" variant="ghost" size="sm" onClick={openPicker} disabled={upload.isPending}>
                    Change
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove file" onClick={clearFile} disabled={upload.isPending}>
                    <X aria-hidden="true" />
                  </Button>
                </div>
              </div>
            ) : (
              <div
                role="button"
                tabIndex={upload.isPending ? -1 : 0}
                aria-label="Choose a file"
                onClick={openPicker}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    openPicker()
                  }
                }}
                onDragOver={(event) => {
                  event.preventDefault()
                  if (!upload.isPending) setDragging(true)
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault()
                  setDragging(false)
                  if (!upload.isPending) pick(event.dataTransfer.files)
                }}
                className={cn(
                  'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                  dragging ? 'border-primary bg-accent' : 'border-border bg-muted/40 hover:border-primary/50 hover:bg-accent/50',
                  upload.isPending && 'cursor-not-allowed opacity-60',
                )}
              >
                <span className="flex size-10 items-center justify-center rounded-xl bg-card text-primary shadow-[0_1px_2px_rgb(15_42_55/0.08)]">
                  <FileUp className="size-5" aria-hidden="true" />
                </span>
                <p className="text-sm font-medium text-foreground">
                  Drop a file here or <span className="text-primary underline underline-offset-2">browse</span>
                </p>
                <p className="text-xs text-muted-foreground">A .csv export from the hospital system · rows already in the system are not duplicated</p>
              </div>
            )}
          </div>

          <div className="mt-auto flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button type="submit" className="w-full sm:w-auto" disabled={!canSubmit}>
              {upload.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Upload aria-hidden="true" />}
              {upload.isPending ? `Uploading… ${formatElapsed(elapsed)}` : 'Upload file'}
            </Button>
            {upload.isPending ? (
              <p aria-live="polite" className="text-xs text-muted-foreground">
                Large files can take a few minutes. Please keep this page open.
              </p>
            ) : refreshing ? (
              <p className="text-xs text-muted-foreground">Wait for the prediction update to finish first.</p>
            ) : null}
          </div>

          {upload.isError ? (
            <Alert variant="destructive" className="border-danger/30">
              <CircleAlert aria-hidden="true" />
              <AlertTitle>Upload failed</AlertTitle>
              <AlertDescription className="break-words">{errorMessage(upload.error)}</AlertDescription>
            </Alert>
          ) : null}
        </form>
      </SectionCard>

      {upload.isSuccess ? <ImportResultCard result={upload.data} /> : null}
    </div>
  )
}
