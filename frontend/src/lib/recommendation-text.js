import { storeName } from '@/lib/enums'
import { formatQuantity } from '@/lib/format'

/*
 * Plain-English wording for a saved recommendation row (plan §7.3). Every value is a stored field; nothing is
 * calculated here. Shared by the recommendations list and its detail panel.
 */

/** The one sentence that says what to do. */
export function actionSentence(row) {
  const d = row.details ?? {}
  const supplier = d.supplier_name ?? 'the supplier'
  switch (row.action) {
    case 'EXPEDITE_PO':
      return d.purchase_order_id ? `Ask ${supplier} to deliver purchase order ${d.purchase_order_id} sooner.` : `Ask ${supplier} to deliver the open order sooner.`
    case 'PURCHASE':
      return `Order ${formatQuantity(row.recommended_purchase_quantity, row.unit)} from ${supplier}.`
    case 'TRANSFER':
      return `Move ${formatQuantity(row.transfer_quantity, row.unit)} from the central store to ${row.store_name ?? storeName(row.store_id)}.`
    default:
      return 'No purchase needed now; stock is adequate.'
  }
}

/** Short form for the list: "Chase PO2-009169", "Order 1,800 Each", "Move 120 Roll", "Nothing to do". */
export function actionShort(row) {
  const d = row.details ?? {}
  switch (row.action) {
    case 'EXPEDITE_PO':
      return d.purchase_order_id ? `Chase ${d.purchase_order_id}` : 'Chase the open order'
    case 'PURCHASE':
      return `Order ${formatQuantity(row.recommended_purchase_quantity, row.unit)}`
    case 'TRANSFER':
      return `Move ${formatQuantity(row.transfer_quantity, row.unit)}`
    default:
      return 'Nothing to do'
  }
}
