/**
 * Response shapes of the MedNeurals backend (plan section 6.13), as JSDoc typedefs.
 *
 * Documentation only: this module exports nothing at runtime. Import it for editor hints with
 *   @type {import("@/api/shapes").DashboardSummary}
 * `T | null` fields can really be null - always handle them in the UI.
 */

/** @typedef {'URGENT' | 'REVIEW' | 'LOW'} RiskLevel */
/** @typedef {'PURCHASE' | 'TRANSFER' | 'EXPEDITE_PO' | 'NONE'} Action */
/** @typedef {'HIGH' | 'MODERATE' | 'LOW'} Priority */
/** @typedef {'PENDING' | 'ACCEPTED' | 'ADJUSTED' | 'REJECTED'} RecommendationStatus */
/** @typedef {string} ISODate YYYY-MM-DD */
/** @typedef {string} ISODateTime ISO 8601 with offset, e.g. 2026-10-28T23:52:21.719436+05:00 */

/**
 * Paginated list. `limit` 1-1000 (default 100), `offset` >= 0.
 * @template T
 * @typedef {{ total: number, limit: number, offset: number, items: T[] }} Page
 */

/* ------------------------------------------------------------------ system */

/** @typedef {{ status: string }} Health GET /health */
/** @typedef {{ status: string, database: string }} HealthDb GET /health/db (503 {detail} when offline) */

/* ------------------------------------------------------------- predictions */

/**
 * @typedef {Object} ModelRunInfo
 * @property {string} model_type
 * @property {string} model_name
 * @property {string} model_version
 * @property {number} model_run_id
 * @property {string} feature_version
 * @property {string} status running | completed | failed
 * @property {number} prediction_count
 * @property {ISODateTime} started_at
 * @property {ISODateTime | null} completed_at
 */

/**
 * Latest completed stockout run whose demand run also completed for the same cutoff.
 * @typedef {Object} PredictionRun
 * @property {string} status
 * @property {ISODate} data_cutoff_date
 * @property {ISODate} prediction_date
 * @property {ISODateTime | null} completed_at
 * @property {number} forecast_count
 * @property {number} stockout_count
 * @property {ModelRunInfo} demand_forecast
 * @property {ModelRunInfo} stockout
 */

/**
 * @typedef {Object} RecommendationSummary POST /recommendations/refresh
 * @property {number} model_run_id
 * @property {number} demand_model_run_id
 * @property {ISODate} prediction_date
 * @property {ISODate} data_cutoff_date
 * @property {boolean} created
 * @property {ISODateTime | null} generated_at
 * @property {number} row_count
 * @property {number} item_count
 * @property {Record<string, number>} action_counts
 * @property {Record<string, number>} priority_counts per row
 * @property {number} skipped_count
 * @property {{ item_id: string, reason: string }[] | null} skipped only when created, else null
 */

/**
 * @typedef {Object} RecommendationStep
 * @property {string} status generated | failed
 * @property {RecommendationSummary | null} summary
 * @property {string | null} error
 */

/**
 * GET /predictions/status (recommendations is null) and POST /predictions/refresh.
 * @typedef {PredictionRun & { recommendations: RecommendationStep | null }} PredictionStatus
 */

/* ---------------------------------------------------------------- products */

/**
 * @typedef {Object} ProductSummary GET /products row
 * @property {string} item_id
 * @property {string} item_name
 * @property {string} category_id
 * @property {string} category_name
 * @property {string | null} sub_category
 * @property {string} uom
 * @property {number} uom_per_purchase_pack
 * @property {string} criticality
 * @property {string} ved_class V | E | D
 * @property {number} unit_cost_pkr
 * @property {number} nominal_lead_time_days
 */

/**
 * @typedef {Object} ProductSupplier
 * @property {string} supplier_item_id
 * @property {string} supplier_id
 * @property {number} unit_price
 * @property {number} minimum_order_quantity packs
 * @property {boolean} preferred_supplier_flag
 * @property {number} lead_time_days
 * @property {string} lead_time_variability
 * @property {string} supply_status
 * @property {ISODate} contract_start_date
 * @property {ISODate} contract_end_date
 */

/**
 * @typedef {ProductSummary & {
 *   hospital_id: string, family_key: string, item_description: string | null,
 *   primary_cost_centre: string | null, material: string | null, sterile_flag: boolean,
 *   purchase_pack_description: string | null, size: string | null, gauge: string | null,
 *   length: string | null, target_population: string, shelf_life_days: number,
 *   demand_archetype: string, imported_flag: boolean, storage_condition: string | null,
 *   storage_temperature: string | null, seasonality_profile: string | null,
 *   variant_demand_weight: number, supplier_items: ProductSupplier[]
 * }} ProductDetail GET /products/{item_id}
 */

/* --------------------------------------------------- inventory & transactions */

/**
 * GET /inventory row. No item/store names - join with the section 6.12 store list or show ids.
 * @typedef {Object} InventoryRow
 * @property {ISODate} date
 * @property {string} store_id
 * @property {string} item_id
 * @property {number} opening_qty
 * @property {number} received_qty
 * @property {number} demand_qty
 * @property {number} issued_qty
 * @property {number} unmet_qty
 * @property {number} closing_qty
 * @property {number} on_order_qty
 * @property {boolean} is_stockout
 */

/**
 * @typedef {Object} DemandRow GET /demand row (~3.5 M rows: always filter by item)
 * @property {string} demand_id
 * @property {ISODate} demand_date
 * @property {string} store_id
 * @property {string} department_id
 * @property {string} item_id
 * @property {number} demand_quantity
 * @property {string} demand_type
 * @property {boolean} is_emergency_related
 * @property {string} source
 */

/**
 * @typedef {Object} PurchaseOrderRow GET /purchase-orders row
 * @property {string} purchase_order_id
 * @property {string} supplier_id
 * @property {string} item_id
 * @property {ISODate} order_date
 * @property {ISODate} expected_delivery_date
 * @property {ISODate | null} receipt_date
 * @property {number | null} lead_time_days
 * @property {number} ordered_packs
 * @property {number} ordered_quantity
 * @property {number} accepted_quantity
 * @property {number} unit_price_per_pack
 * @property {boolean} is_emergency
 * @property {number} premium_pct
 * @property {string} status Open | Received
 * @property {number} line_amount_pkr
 */

/* --------------------------------------------------------------- suppliers */

/**
 * @typedef {Object} SupplierRow GET /suppliers row
 * @property {string} supplier_id
 * @property {string} supplier_code
 * @property {string} supplier_name
 * @property {string} supplier_type
 * @property {string} city
 * @property {string} region
 * @property {string} payment_terms
 * @property {string} reliability_class
 * @property {number} typical_lead_time_days
 * @property {string} lead_time_variability
 * @property {number} minimum_order_value
 * @property {boolean} active_flag
 */

/**
 * @typedef {Object} LeadTime
 * @property {number} sample_size
 * @property {number | null} mean_days
 * @property {number | null} median_days
 * @property {number | null} std_dev_days
 * @property {number | null} min_days
 * @property {number | null} max_days
 */

/**
 * GET /suppliers/{supplier_id}/performance. Metrics that cannot be computed are null and explained in `unavailable`.
 * @typedef {Object} SupplierPerformance
 * @property {string} supplier_id
 * @property {string} supplier_name
 * @property {ISODate | null} as_of
 * @property {boolean} include_emergency
 * @property {{ first_order_date: ISODate | null, last_order_date: ISODate | null, last_receipt_date: ISODate | null }} data_period
 * @property {{ total: number, emergency_excluded: number, completed: number, open: number, cancelled: number,
 *              missing_receipt_date: number, other_status: number }} order_counts
 * @property {LeadTime} lead_time
 * @property {{ sample_size: number, on_time_count: number, delayed_count: number, rate: number | null }} on_time_delivery
 * @property {{ sample_size: number, ordered_quantity: number, accepted_quantity: number,
 *              partially_filled_count: number, rate: number | null }} fill_rate
 * @property {Record<string, string>} unavailable
 */

/* --------------------------------------------------- forecasts & stockout risk */

/**
 * @typedef {Object} ForecastRow GET /forecasts row (sub-stores only, horizons 1-4)
 * @property {string} item_id
 * @property {string} item_name
 * @property {string} unit
 * @property {string} store_id
 * @property {string} store_name
 * @property {number} horizon 1-4 = H1-H4
 * @property {ISODate} target_week Monday
 * @property {number} p50
 * @property {number} p90
 * @property {number} model_run_id
 */

/**
 * @typedef {Object} StockoutRiskRow GET /stockout-risks row (one per sub-store x item, 14-day horizon)
 * @property {string} item_id
 * @property {string} item_name
 * @property {string} store_id
 * @property {string} store_name
 * @property {number} probability 0-1
 * @property {RiskLevel} risk_level
 * @property {number} horizon_days
 * @property {number} threshold_review
 * @property {number} threshold_urgent
 * @property {number} model_run_id
 */

/** @typedef {Page<ForecastRow> & { run: PredictionRun }} ForecastPage */
/** @typedef {Page<StockoutRiskRow> & { run: PredictionRun }} StockoutRiskPage */

/* --------------------------------------------------------------- dashboard */

/**
 * @typedef {Object} RecommendationSet
 * @property {'current' | 'missing'} status
 * @property {number | null} model_run_id
 * @property {ISODateTime | null} generated_at
 * @property {number | null} latest_available_model_run_id
 */

/**
 * GET /dashboard/summary. Always 200; prediction fields are null without a successful run.
 * `stockout_risk_counts` and `recommendation_priority_counts` count ITEMS (each once), not store x item rows.
 * @typedef {Object} DashboardSummary
 * @property {number} total_items
 * @property {ISODate | null} latest_data_date
 * @property {ISODateTime | null} latest_prediction_timestamp
 * @property {Record<string, string> | null} model_versions {"demand_forecast": "2.0", "stockout": "2.0"}
 * @property {PredictionRun | null} prediction_run
 * @property {Record<RiskLevel, number> | null} stockout_risk_counts
 * @property {number | null} items_without_stockout_prediction
 * @property {RecommendationSet} recommendation_set
 * @property {Record<Priority, number> | null} recommendation_priority_counts null when set missing
 * @property {number | null} items_needing_attention null when set missing
 */

/* --------------------------------------------------------- recommendations */

/**
 * @typedef {Object} RecommendationDetails
 * @property {number} current_stock
 * @property {number} on_order_qty
 * @property {number} open_po_count
 * @property {string | null} purchase_order_id
 * @property {number} daily_demand_p50
 * @property {number} demand_std
 * @property {number} lead_time_days
 * @property {number} lead_time_std
 * @property {number} lead_time_sample_size
 * @property {string} ved_class
 * @property {number} z_value
 * @property {number} stockout_probability
 * @property {number} pack_size
 * @property {number | null} moq_packs
 * @property {string} supplier_id
 * @property {string} supplier_name
 */

/**
 * GET /recommendations row. `store_id`/`store_name` are set for TRANSFER rows only.
 * @typedef {Object} RecommendationRow
 * @property {number} id
 * @property {string} product_id
 * @property {string} product_name
 * @property {string} unit
 * @property {string | null} store_id
 * @property {string | null} store_name
 * @property {Action} action
 * @property {Priority} priority
 * @property {number} recommended_purchase_quantity
 * @property {number} transfer_quantity
 * @property {number} safety_stock
 * @property {number} reorder_point
 * @property {number} order_up_to_level
 * @property {number} inventory_position
 * @property {string} reason
 * @property {RecommendationStatus} status
 * @property {RecommendationDetails} details
 * @property {number} model_run_id
 * @property {number} demand_model_run_id
 * @property {ISODate} prediction_date
 * @property {ISODate} data_cutoff_date
 * @property {ISODateTime} created_at
 */

/**
 * GET /recommendations page. `freshness === 'stale'` means a newer prediction run exists without its own set.
 * @typedef {Page<RecommendationRow> & {
 *   model_run_id: number, generated_at: ISODateTime, latest_prediction_run_id: number | null,
 *   latest_prediction_date: ISODate | null, freshness: 'current' | 'stale', demand_model_run_id: number,
 *   prediction_date: ISODate, data_cutoff_date: ISODate
 * }} RecommendationPage
 */

/* -------------------------------------------------------- product analysis */

/**
 * @typedef {Object} ForecastTotal
 * @property {number} horizon
 * @property {ISODate} target_week
 * @property {number} p50 sum of sub-store P50
 * @property {number} p90_sum sum of sub-store P90 - label "P90 (sum of stores)", not a hospital P90
 */

/**
 * @typedef {Object} PreferredSupplier
 * @property {string} supplier_id
 * @property {string} supplier_name
 * @property {number} minimum_order_quantity
 * @property {number} contract_lead_time_days
 * @property {ISODate | null} as_of
 * @property {LeadTime} lead_time
 * @property {number | null} on_time_rate
 * @property {number | null} fill_rate
 */

/**
 * GET /products/{item_id}/analysis. Run sections are null when there is no prediction run.
 * @typedef {Object} ProductAnalysis
 * @property {ProductSummary} item
 * @property {PredictionRun | null} prediction_run
 * @property {{ totals: ForecastTotal[], by_store: ForecastRow[] } | null} forecast
 * @property {{ highest: StockoutRiskRow | null, by_store: StockoutRiskRow[] } | null} stockout_risk
 * @property {{ recommendation_set: RecommendationSet,
 *              item_status: 'available' | 'item_not_included' | 'set_missing',
 *              rows: RecommendationRow[] } | null} recommendation
 * @property {{ as_of_date: ISODate, central_store_qty: number | null, total_qty: number,
 *              by_store: { store_id: string, store_name: string, closing_qty: number }[] } | null} current_stock
 * @property {{ as_of_date: ISODate, quantity: number,
 *              orders: { purchase_order_id: string, supplier_id: string, order_date: ISODate,
 *                        expected_delivery_date: ISODate, ordered_quantity: number }[] } | null} open_purchase_orders
 * @property {PreferredSupplier[]} preferred_suppliers
 */

/* ------------------------------------------------------------- data import */

/**
 * POST /data/import result. `status` is "completed", or "partial" when rows were rejected.
 * @typedef {Object} ImportResult
 * @property {number} upload_id
 * @property {string} dataset
 * @property {string} filename
 * @property {ISODate | null} cutoff_date
 * @property {string} status
 * @property {number} rows_received
 * @property {number} rows_skipped
 * @property {number} rows_rejected
 * @property {number} rows_accepted
 * @property {number} rows_written
 * @property {number} rows_unchanged
 * @property {string | null} rejected_summary
 * @property {string | null} rejected_report server path
 * @property {Record<string, unknown>[]} rejected_sample at most 20 rows
 */

export {}
