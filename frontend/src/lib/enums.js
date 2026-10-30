/**
 * Enum -> label / colour maps and fixed lookup lists (plan sections 6, 6.12, 7.12).
 *
 * `tone` names map to the semantic colours in src/index.css (section 3.2):
 *   danger  = URGENT / HIGH        (red)
 *   warning = REVIEW / MODERATE    (amber)
 *   success = LOW                  (green)
 *   primary = PURCHASE             (teal)
 *   info    = TRANSFER             (blue)
 *   violet  = EXPEDITE_PO          (violet)
 *   neutral = NONE / unknown       (grey)
 */

import { EM_DASH } from '@/lib/format'

/** Tailwind classes for a tinted pill per tone (badge background + text). */
export const TONE_CLASSES = {
  danger: 'bg-danger-bg text-danger',
  warning: 'bg-warning-bg text-[#b45309]',
  success: 'bg-success-bg text-[#047857]',
  primary: 'bg-accent text-primary',
  info: 'bg-info-bg text-[#1d4ed8]',
  violet: 'bg-violet-bg text-[#6d28d9]',
  neutral: 'bg-muted text-muted-foreground',
}

/** Solid colours per tone (charts, dots, bars). */
export const TONE_COLORS = {
  danger: 'var(--danger)',
  warning: 'var(--warning)',
  success: 'var(--success)',
  primary: 'var(--primary-teal)',
  info: 'var(--info)',
  violet: 'var(--violet)',
  neutral: 'var(--text-muted)',
}

/* ------------------------------------------------------------- risk level */

export const RISK_LEVELS = ['URGENT', 'REVIEW', 'LOW']

export const RISK_LEVEL_META = {
  URGENT: { label: 'Urgent', tone: 'danger' },
  REVIEW: { label: 'Review', tone: 'warning' },
  LOW: { label: 'Low', tone: 'success' },
}

/* ----------------------------------------------------------------- action */

export const ACTIONS = ['PURCHASE', 'TRANSFER', 'EXPEDITE_PO', 'NONE']

export const ACTION_META = {
  PURCHASE: { label: 'Purchase', tone: 'primary' },
  TRANSFER: { label: 'Transfer', tone: 'info' },
  EXPEDITE_PO: { label: 'Expedite PO', tone: 'violet' },
  NONE: { label: 'No action', tone: 'neutral' },
}

/* --------------------------------------------------------------- priority */

export const PRIORITIES = ['HIGH', 'MODERATE', 'LOW']

export const PRIORITY_META = {
  HIGH: { label: 'High', tone: 'danger' },
  MODERATE: { label: 'Moderate', tone: 'warning' },
  LOW: { label: 'Low', tone: 'success' },
}

/* ---------------------------------------------------- recommendation status */

/** Only PENDING exists until backend Phase 11 adds accept / adjust / reject. */
export const RECOMMENDATION_STATUSES = ['PENDING', 'ACCEPTED', 'ADJUSTED', 'REJECTED']

export const RECOMMENDATION_STATUS_META = {
  PENDING: { label: 'Pending', tone: 'neutral' },
  ACCEPTED: { label: 'Accepted', tone: 'success' },
  ADJUSTED: { label: 'Adjusted', tone: 'info' },
  REJECTED: { label: 'Rejected', tone: 'danger' },
}

/* ---------------------------------------------------------- other enums */

/** Model run status. */
export const RUN_STATUSES = ['running', 'completed', 'failed']

export const RUN_STATUS_META = {
  running: { label: 'Running', tone: 'info' },
  completed: { label: 'Completed', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
}

/** Purchase-order status values present in the data. */
export const PO_STATUSES = ['Open', 'Received']

export const PO_STATUS_META = {
  Open: { label: 'Open', tone: 'info' },
  Received: { label: 'Received', tone: 'success' },
}

export const VED_CLASSES = ['V', 'E', 'D']

export const VED_CLASS_META = {
  V: { label: 'Vital', tone: 'danger' },
  E: { label: 'Essential', tone: 'warning' },
  D: { label: 'Desirable', tone: 'neutral' },
}

/** Recommendation-set / freshness states. */
export const RECOMMENDATION_SET_STATUSES = ['current', 'missing']
export const FRESHNESS = ['current', 'stale']

/** Datasets accepted by POST /data/import (section 6.3), in the required import order (masters first). */
export const IMPORT_DATASETS = [
  { value: 'hospitals', label: 'Hospitals' },
  { value: 'categories', label: 'Categories' },
  { value: 'units_of_measure', label: 'Units of measure' },
  { value: 'stores', label: 'Stores' },
  { value: 'departments', label: 'Departments' },
  { value: 'medical_items', label: 'Medical items' },
  { value: 'suppliers', label: 'Suppliers' },
  { value: 'supplier_items', label: 'Supplier items' },
  { value: 'item_department_usage', label: 'Item department usage' },
  { value: 'calendar', label: 'Calendar' },
  { value: 'demand', label: 'Demand' },
  { value: 'daily_inventory', label: 'Daily inventory' },
  { value: 'purchase_orders', label: 'Purchase orders' },
  { value: 'stock_transfers', label: 'Stock transfers' },
  { value: 'stockout_events', label: 'Stockout events' },
]

/* ----------------------------------------------------------------- stores */

/**
 * Store list - mirrors the `stores` table in the database (plan section 6.12).
 * There is no /stores endpoint, so filter dropdowns use this constant.
 * `short` is a compact label for chart axes only.
 */
export const STORES = [
  { store_id: 'STR-001', store_name: 'Central Medical Store (CMS)', type: 'Central', short: 'CMS' },
  { store_id: 'STR-002', store_name: 'Emergency Sub-Store', type: 'Sub-Store', short: 'Emergency' },
  { store_id: 'STR-003', store_name: 'Operation Theatre Sub-Store', type: 'Sub-Store', short: 'OT' },
  { store_id: 'STR-004', store_name: 'ICU/CCU/HDU Sub-Store', type: 'Sub-Store', short: 'ICU/CCU/HDU' },
  { store_id: 'STR-005', store_name: 'Laboratory Store', type: 'Sub-Store', short: 'Laboratory' },
  { store_id: 'STR-006', store_name: 'Blood Bank Store', type: 'Sub-Store', short: 'Blood Bank' },
  { store_id: 'STR-007', store_name: 'Dialysis Store', type: 'Sub-Store', short: 'Dialysis' },
  { store_id: 'STR-008', store_name: 'Obstetric & Gynae Sub-Store', type: 'Sub-Store', short: 'Obs & Gynae' },
  { store_id: 'STR-009', store_name: 'Neonatal & Paediatric Sub-Store', type: 'Sub-Store', short: 'Neonatal & Paeds' },
  { store_id: 'STR-010', store_name: 'General Wards Sub-Store', type: 'Sub-Store', short: 'General Wards' },
  { store_id: 'STR-011', store_name: 'Specialty Clinics & Procedures Store', type: 'Sub-Store', short: 'Specialty Clinics' },
]

export const CENTRAL_STORE_ID = 'STR-001'

/** The 10 sub-stores (forecasts and stockout risks exist for these only). */
export const SUB_STORES = STORES.filter((store) => store.type === 'Sub-Store')

export const STORE_BY_ID = Object.fromEntries(STORES.map((store) => [store.store_id, store]))

/** Full store name for an id, falling back to the id itself. */
export function storeName(storeId) {
  return STORE_BY_ID[storeId]?.store_name ?? storeId ?? ''
}

/** Short store label for chart axes, falling back to the id itself. */
export function storeShortName(storeId) {
  return STORE_BY_ID[storeId]?.short ?? storeId ?? ''
}

/* ---------------------------------------------------------------- helpers */

/** Label + tone for any enum value, with a neutral fallback for unknown values. */
export function enumMeta(meta, value) {
  return meta[value] ?? { label: value ?? EM_DASH, tone: 'neutral' }
}

