import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Check, Pencil, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import DatePicker from '@/components/common/DatePicker'
import ToneBadge from '@/components/common/ToneBadge'
import { useDecideRecommendation, useRecommendationDecisions } from '@/api/hooks'
import { errorMessage } from '@/api/client'
import { useAuth } from '@/auth/AuthProvider'
import { OFFICER_ROLE, RECOMMENDATION_STATUS_META, enumMeta, storeName } from '@/lib/enums'
import { EM_DASH, formatDate, formatDateTime, formatNumber, formatQuantity, parseDate, toISODate } from '@/lib/format'
import { actionSentence, actionShort } from '@/lib/recommendation-text'

const REASON_MAX = 1000
const EARLIER_LIMIT = 5

const DONE_TOAST = {
  ACCEPTED: 'Recommendation accepted',
  ADJUSTED: 'Recommendation adjusted',
  REJECTED: 'Recommendation rejected',
}

/** What the officer can change on this row: a quantity, a delivery date, or nothing (NONE rows). */
function adjustKind(row) {
  if (row.action === 'PURCHASE' || row.action === 'TRANSFER') return 'quantity'
  if (row.action === 'EXPEDITE_PO') return 'date'
  return null
}

function originalQuantity(row) {
  return row.action === 'TRANSFER' ? row.transfer_quantity : row.recommended_purchase_quantity
}

/** Red one-line message under a form. */
function FormError({ message }) {
  if (!message) return null
  return (
    <p role="alert" className="text-sm font-medium text-danger">
      {message}
    </p>
  )
}

/** Shared mutation handling for the three dialogs: toast on success, inline message on failure. */
function useDecision(row, onDone) {
  const decide = useDecideRecommendation()
  const queryClient = useQueryClient()
  const submit = (body) =>
    decide.mutate(
      { id: row.id, ...body },
      {
        onSuccess: (saved) => {
          toast.success(DONE_TOAST[saved.status] ?? 'Decision saved', { description: `${saved.product_name}. Nothing was ordered or moved.` })
          onDone()
        },
        onError: (error) => {
          // Already decided elsewhere, or a newer set replaced this one: reload so the panel shows the real state.
          if (error?.status === 409) queryClient.invalidateQueries({ queryKey: ['recommendations'] })
        },
      },
    )
  return { submit, busy: decide.isPending, error: decide.isError ? errorMessage(decide.error) : null, reset: decide.reset }
}

/** Accept: one confirmation that restates the recommendation. Decisions are final, so a plain click is not enough. */
function AcceptDialog({ row, onClose }) {
  const { submit, busy, error } = useDecision(row, onClose)
  return (
    <Dialog open onOpenChange={(next) => (!next && !busy ? onClose() : null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Accept this recommendation?</DialogTitle>
          <DialogDescription>You agree with: {actionSentence(row)}</DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          This records your agreement under your name. No purchase order is created and no stock is moved. The decision cannot be changed afterwards.
        </p>
        <FormError message={error} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={() => submit({ decision: 'ACCEPTED' })} disabled={busy}>
            <Check aria-hidden="true" />
            {busy ? 'Saving…' : 'Accept'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Adjust: the original value read-only, the new quantity (PURCHASE / TRANSFER) or requested delivery date
 * (EXPEDITE_PO), and a required reason. Both values are kept by the backend.
 */
function AdjustDialog({ row, onClose }) {
  const kind = adjustKind(row)
  const { submit, busy, error } = useDecision(row, onClose)
  const [quantity, setQuantity] = useState('')
  const [date, setDate] = useState('')
  const [reason, setReason] = useState('')
  const [localError, setLocalError] = useState(null)
  const d = row.details ?? {}
  const original = originalQuantity(row)
  const originalDate = d.purchase_order_expected_delivery_date
  const dayAfterPrediction = parseDate(row.prediction_date)
  if (dayAfterPrediction) dayAfterPrediction.setDate(dayAfterPrediction.getDate() + 1)
  const minDate = dayAfterPrediction ? toISODate(dayAfterPrediction) : undefined

  const handleSubmit = (event) => {
    event.preventDefault()
    const body = { decision: 'ADJUSTED', reason: reason.trim() }
    if (kind === 'quantity') {
      const value = Number(quantity)
      if (quantity.trim() === '' || !Number.isInteger(value) || value < 0) {
        setLocalError('Enter a whole number of units (0 or more).')
        return
      }
      if (value === original) {
        setLocalError('The new quantity is the same as the recommended quantity. Use Accept instead.')
        return
      }
      body.adjusted_quantity = value
    } else {
      if (!date) {
        setLocalError('Choose the delivery date you want to ask the supplier for.')
        return
      }
      if (date === originalDate) {
        setLocalError("That is already the supplier's expected date. Use Accept instead.")
        return
      }
      body.adjusted_expected_date = date
    }
    if (!body.reason) {
      setLocalError('Give a short reason for the change.')
      return
    }
    setLocalError(null)
    submit(body)
  }

  const packNote =
    kind === 'quantity' && row.action === 'PURCHASE' && d.pack_size > 1 && quantity.trim() !== '' && Number(quantity) % d.pack_size !== 0
      ? `Not a whole number of packs (${formatNumber(d.pack_size)} per pack).`
      : null

  return (
    <Dialog open onOpenChange={(next) => (!next && !busy ? onClose() : null)}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>Adjust this recommendation</DialogTitle>
            <DialogDescription>{actionSentence(row)}</DialogDescription>
          </DialogHeader>

          {kind === 'quantity' ? (
            <>
              <div className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/40 px-3 py-2 text-sm">
                <span className="text-muted-foreground">Recommended</span>
                <span className="font-semibold tabular-nums">{formatQuantity(original, row.unit)}</span>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="adjust-quantity">{row.action === 'TRANSFER' ? 'Quantity to move' : 'Quantity to order'}</Label>
                <Input
                  id="adjust-quantity"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  disabled={busy}
                  autoFocus
                  required
                  className="h-9"
                />
                <p className="text-xs text-muted-foreground">{packNote ?? `In ${row.unit}. Enter 0 if nothing should be ${row.action === 'TRANSFER' ? 'moved' : 'ordered'}.`}</p>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/40 px-3 py-2 text-sm">
                <span className="text-muted-foreground">Supplier&apos;s expected delivery</span>
                <span className="font-semibold tabular-nums">{originalDate ? formatDate(originalDate) : 'Not known'}</span>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="adjust-date">Delivery date to ask for</Label>
                <DatePicker id="adjust-date" value={date} onChange={setDate} placeholder="Choose a date" minDate={minDate} />
                <p className="text-xs text-muted-foreground">Must be after the prediction date ({formatDate(row.prediction_date)}).</p>
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="adjust-reason">Reason</Label>
            <Textarea
              id="adjust-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value.slice(0, REASON_MAX))}
              disabled={busy}
              required
              rows={3}
              placeholder="For example: more stock arrives next week."
            />
          </div>

          <FormError message={localError ?? error} />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              <Pencil aria-hidden="true" />
              {busy ? 'Saving…' : 'Save adjustment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Reject: a required reason, then confirm. The recommendation stays on record. */
function RejectDialog({ row, onClose }) {
  const { submit, busy, error } = useDecision(row, onClose)
  const [reason, setReason] = useState('')
  const [localError, setLocalError] = useState(null)

  const handleSubmit = (event) => {
    event.preventDefault()
    if (!reason.trim()) {
      setLocalError('Give a short reason for rejecting it.')
      return
    }
    setLocalError(null)
    submit({ decision: 'REJECTED', reason: reason.trim() })
  }

  return (
    <Dialog open onOpenChange={(next) => (!next && !busy ? onClose() : null)}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>Reject this recommendation?</DialogTitle>
            <DialogDescription>{actionSentence(row)}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="reject-reason">Reason</Label>
            <Textarea
              id="reject-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value.slice(0, REASON_MAX))}
              disabled={busy}
              required
              rows={3}
              autoFocus
              placeholder="For example: the other store also needs its available stock."
            />
          </div>
          <p className="text-sm text-muted-foreground">The recommendation and your reason are kept on record. The decision cannot be changed afterwards.</p>
          <FormError message={localError ?? error} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={busy}>
              <X aria-hidden="true" />
              {busy ? 'Saving…' : 'Reject'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** The saved decision: who, when, what changed and why. */
function DecisionSummary({ row }) {
  const decision = row.decision
  const status = enumMeta(RECOMMENDATION_STATUS_META, row.status)
  if (!decision) {
    return <ToneBadge label={status.label} tone={status.tone} icon={null} />
  }
  const adjusted = decision.decision === 'ADJUSTED'
  const byQuantity = decision.adjusted_quantity != null
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <ToneBadge label={status.label} tone={status.tone} icon={null} />
        <span className="text-muted-foreground">
          by <span className="font-medium text-foreground">{decision.decided_by_name}</span> on {formatDateTime(decision.decided_at)}
        </span>
      </div>
      {adjusted ? (
        <dl className="grid max-w-sm grid-cols-2 gap-2 text-sm">
          <div className="rounded-lg border border-border/70 bg-muted/40 px-3 py-2">
            <dt className="text-xs text-muted-foreground">{byQuantity ? 'Recommended' : "Supplier's expected date"}</dt>
            <dd className="font-semibold tabular-nums">{byQuantity ? formatQuantity(decision.original_quantity, row.unit) : decision.original_expected_date ? formatDate(decision.original_expected_date) : 'Not known'}</dd>
          </div>
          <div className="rounded-lg border border-info/40 bg-info-bg px-3 py-2">
            <dt className="text-xs text-muted-foreground">{byQuantity ? 'Officer decided' : 'Date requested'}</dt>
            <dd className="font-semibold tabular-nums text-[#1d4ed8]">{byQuantity ? formatQuantity(decision.adjusted_quantity, row.unit) : formatDate(decision.adjusted_expected_date)}</dd>
          </div>
        </dl>
      ) : null}
      {decision.reason ? <p className="text-sm text-foreground">“{decision.reason}”</p> : null}
    </div>
  )
}

/** Decisions on the same product (and store, for transfers) from other recommendation sets, newest first. */
function EarlierDecisions({ row }) {
  const params = { item_id: row.product_id, limit: EARLIER_LIMIT + 1 }
  if (row.store_id) params.store_id = row.store_id
  const query = useRecommendationDecisions(params, { staleTime: 60_000 })
  const items = (query.data?.items ?? []).filter((item) => item.recommendation_id !== row.id).slice(0, EARLIER_LIMIT)

  return (
    <div>
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Earlier decisions on this product</p>
      {query.isPending ? (
        <Skeleton className="mt-2 h-5 w-64" />
      ) : query.isError ? (
        <p className="mt-1 text-sm text-muted-foreground">Could not load earlier decisions.</p>
      ) : items.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">None yet.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {items.map((item) => {
            const meta = enumMeta(RECOMMENDATION_STATUS_META, item.decision)
            const summary = actionShort({ ...item, details: { purchase_order_id: item.purchase_order_id } })
            const changed =
              item.decision === 'ADJUSTED'
                ? item.adjusted_quantity != null
                  ? `${formatQuantity(item.original_quantity, item.unit)} to ${formatQuantity(item.adjusted_quantity, item.unit)}`
                  : `delivery ${item.original_expected_date ? formatDate(item.original_expected_date) : EM_DASH} to ${formatDate(item.adjusted_expected_date)}`
                : null
            return (
              <li key={item.id} className="text-sm">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <ToneBadge label={meta.label} tone={meta.tone} icon={null} className="h-5 px-2 text-[11px]" />
                  <span className="text-foreground">
                    {summary}
                    {item.store_id && row.store_id !== item.store_id ? ` (${item.store_name ?? storeName(item.store_id)})` : ''}
                  </span>
                  <span className="text-muted-foreground">
                    · predictions of {formatDate(item.prediction_date)} · {item.decided_by_name}
                  </span>
                </div>
                {changed ? <p className="text-xs text-muted-foreground">Changed {changed}.</p> : null}
                {item.reason ? <p className="text-xs text-muted-foreground">“{item.reason}”</p> : null}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/**
 * The officer's decision on one recommendation (Phase 11, human in the loop). A pending row of the latest set shows
 * Accept | Adjust | Reject to a procurement officer; everyone else sees why they cannot decide. A decided row shows
 * who decided, when, the original and adjusted value and the reason. Below, earlier decisions on the same product.
 * The backend checks the role and the row's state again; this component only hides what would be refused.
 * @param {{ row: import('@/api/shapes').RecommendationRow, isLatestSet: boolean }} props
 */
export default function DecisionPanel({ row, isLatestSet }) {
  const { user } = useAuth()
  const [dialog, setDialog] = useState(null)
  const isOfficer = user?.role === OFFICER_ROLE
  const pending = row.status === 'PENDING'
  const canDecide = pending && isOfficer && isLatestSet
  const canAdjust = adjustKind(row) !== null
  const close = () => setDialog(null)

  let content
  if (!pending) {
    content = <DecisionSummary row={row} />
  } else if (canDecide) {
    content = (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={() => setDialog('accept')}>
            <Check aria-hidden="true" />
            Accept
          </Button>
          {canAdjust ? (
            <Button type="button" size="sm" variant="outline" className="bg-card" onClick={() => setDialog('adjust')}>
              <Pencil aria-hidden="true" />
              Adjust
            </Button>
          ) : null}
          <Button type="button" size="sm" variant="outline" className="bg-card text-danger hover:text-danger" onClick={() => setDialog('reject')}>
            <X aria-hidden="true" />
            Reject
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Nothing is ordered or moved automatically. Your decision is recorded and cannot be changed afterwards.</p>
      </div>
    )
  } else {
    const status = enumMeta(RECOMMENDATION_STATUS_META, row.status)
    content = (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <ToneBadge label={status.label} tone={status.tone} icon={null} />
        <span className="text-muted-foreground">
          {!isLatestSet ? 'Not reviewed before newer recommendations replaced this set.' : isOfficer ? 'Awaiting your review.' : 'Awaiting a procurement officer’s review.'}
        </span>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Decision</p>
        <div className="mt-1.5">{content}</div>
      </div>
      <EarlierDecisions row={row} />
      {dialog === 'accept' ? <AcceptDialog row={row} onClose={close} /> : null}
      {dialog === 'adjust' ? <AdjustDialog row={row} onClose={close} /> : null}
      {dialog === 'reject' ? <RejectDialog row={row} onClose={close} /> : null}
    </div>
  )
}
