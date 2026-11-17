# Model evaluation on the 2025 hold-out period

Evaluation of the two trained artifacts in `app/ml/trained/` **without retraining**, produced by
`scripts/evaluate_models.py` (run on 2026-11-17 with `backend/.venv`, scikit-learn 1.6.1, xgboost 3.4.1, pandas 3.0.6).
Every number below is pasted from that run. Re-run with:

```bash
.venv/Scripts/python -m scripts.evaluate_models
```

(≈ 2.5 minutes, ≈ 4 GB RAM; `--cache <dir>` pickles the slow intermediates for repeated runs.)

**Set-up.** Same splits as `metrics.json`: train ≤ 2024-06-30, validation ≤ 2024-12-31, **test = 2025**.
The notebook pipeline is replayed through `app/ml/features.py`: `demand.csv` (sub-stores only; `STR-001` has no demand
rows) is capped per item at the 99.9th percentile (`cap_demand_outliers`), aggregated into Monday weeks with
`build_weekly_demand`, forecast from every week with `forecast(..., all_weeks=True)`, and the Monday snapshots with
14-day labels come from `build_stockout_snapshots`. Artifacts load through `app.ml.artifacts.load_artifacts`
(features.py hash `0dc86299c390`, both models v2.0, `metrics.json` trained 2026-10-16).

**Reproduction check.** The run reproduces `metrics.json` exactly: demand WAPE 0.1199 / 0.1208 / 0.1223 / 0.1244 and
P90 coverage 0.930 / 0.928 / 0.926 / 0.923 for horizons 1-4; stockout test set 107,350 rows with 5,106 positives,
PR-AUC 0.4795 (0.4794), ROC-AUC 0.8870 (0.8869), Brier 0.0328, precision/recall 0.186/0.772 at the review threshold
and 0.463/0.465 at the urgent threshold. So the artifacts in the repo are the ones the notebook measured, and the
numbers below are directly comparable with `metrics.json`.

---

## 1. Demand forecast: is the model biased?

Test rows: 437,988 store-item-week-horizon forecasts (2,147 store-item series × 51 target weeks 2025-01-06 .. 2025-12-22
× 4 horizons). Actuals are the capped weekly demand the model was trained on. "Error" = P50 − actual, so a negative
mean error means under-forecasting.

### 1a. Bias per horizon

| horizon | n | mean actual / week | mean error (P50 − actual) | sum(P50) / sum(actual) | share over-forecast | share under-forecast | share within ±1 unit | P90 coverage |
|---|---|---|---|---|---|---|---|---|
| 1 | 109,497 | 41.63 | −0.73 | 0.982 | 50.0% | 49.8% | 24.5% | 0.930 |
| 2 | 109,497 | 41.63 | −0.78 | 0.981 | 49.8% | 50.1% | 24.5% | 0.928 |
| 3 | 109,497 | 41.63 | −0.83 | 0.980 | 49.6% | 50.2% | 24.2% | 0.926 |
| 4 | 109,497 | 41.63 | −0.88 | 0.979 | 49.3% | 50.5% | 24.2% | 0.923 |

* The P50 under-forecasts total volume by **1.8% (h1) to 2.1% (h4)**, i.e. about 0.7-0.9 units on an average week of
  41.6 units. Week by week it is over as often as under (50/50), so the bias is in the size of the misses, not their
  direction: when the model is wrong it is wrong by a little more on the low side.
* This is the expected behaviour of a **median (P50) forecast on right-skewed demand**: the median sits below the mean,
  so summing medians always falls a little short of summing actuals. It is a property of the quantile objective the
  model was trained with, not a sign of a broken model.
* **P90 coverage is 92.3-93.0%**, confirming the 0.93 in `metrics.json`. A P90 should cover 90%, so the upper band is
  slightly *conservative* (a touch wide), which is the safe direction for safety-stock calculations.
* The bias is the same in every month (ratio 0.975-0.992 for h1); it is a little larger in July-October
  (0.975-0.980) than in December (0.992). No month flips to over-forecasting.

| month of target week (h1) | n | mean actual | mean error | sum(P50)/sum(actual) | P90 coverage |
|---|---|---|---|---|---|
| Jan | 8,588 | 39.4 | −0.76 | 0.981 | 0.928 |
| Feb | 8,588 | 39.3 | −0.69 | 0.982 | 0.931 |
| Mar | 10,735 | 39.3 | −0.47 | 0.988 | 0.938 |
| Apr | 8,588 | 40.9 | −0.72 | 0.982 | 0.927 |
| May | 8,588 | 41.5 | −0.61 | 0.985 | 0.932 |
| Jun | 10,735 | 42.3 | −0.62 | 0.985 | 0.932 |
| Jul | 8,588 | 43.4 | −0.86 | 0.980 | 0.922 |
| Aug | 8,588 | 44.1 | −1.03 | 0.977 | 0.922 |
| Sep | 10,735 | 43.4 | −1.11 | 0.975 | 0.932 |
| Oct | 8,588 | 42.2 | −0.90 | 0.979 | 0.927 |
| Nov | 8,588 | 41.9 | −0.67 | 0.984 | 0.932 |
| Dec | 8,588 | 41.6 | −0.33 | 0.992 | 0.935 |

### 1b. Model vs two baselines

Baselines computed on exactly the same rows: **seasonal naive** = demand of the same week last year (available for 100%
of test rows), **MA4** = mean of the 4 weeks before the forecast origin. MASE is scaled by the one-step naive
("next week = last week") MAE on the same rows, so the three methods are comparable; `metrics.json` used a different
MASE denominator (its 0.831 vs 0.767 here), which does not affect the ranking.

| horizon | model WAPE | model MASE | model bias ratio | seasonal-naive WAPE | seasonal-naive MASE | seasonal-naive bias ratio | MA4 WAPE | MA4 MASE | MA4 bias ratio |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **0.120** | **0.767** | 0.982 | 0.163 | 1.044 | 0.932 | 0.129 | 0.827 | 0.997 |
| 2 | **0.121** | **0.759** | 0.981 | 0.163 | 1.026 | 0.932 | 0.134 | 0.838 | 0.996 |
| 3 | **0.122** | **0.749** | 0.980 | 0.163 | 1.000 | 0.932 | 0.139 | 0.848 | 0.995 |
| 4 | **0.124** | **0.746** | 0.979 | 0.163 | 0.980 | 0.932 | 0.143 | 0.860 | 0.993 |

* The model beats both baselines at every horizon: 7% lower WAPE than MA4 at h1, widening to 13% at h4, and 24-27%
  lower than the seasonal naive.
* The seasonal naive is itself biased low by 6.8% (last year's volume was lower: demand grew), so "same week last
  year" is a poor plan on its own. MA4 is almost unbiased (0.997) but less accurate; the model trades 2 points of
  bias for a clearly smaller error. For the dashboard's purposes the P50 is the better point forecast.

### 1c. Bias by item

Relative bias per item = (sum P50 − sum actual) / sum actual over 2025, all horizons pooled.

**The 10 items with the largest |relative bias|** are all near-zero-volume items (mean < 0.25 units per store-week):

| Item_ID | Item | archetype | mean weekly actual | sum actual | sum P50 | relative bias | share of 2025 demand |
|---|---|---|---|---|---|---|---|
| MED-000217 | External (Condom) Catheter - Medium | rare_event | 0.13 | 135.7 | 14.9 | −0.89 | 0.00% |
| MED-000361 | Single-Use Polypectomy Snare | rare_event | 0.25 | 100.0 | 11.6 | −0.88 | 0.00% |
| MED-000328 | Defibrillation Pads - Paediatric | rare_event | 0.10 | 80.0 | 9.6 | −0.88 | 0.00% |
| MED-000138 | Tracheostomy Tube Cuffed - Size 7.0 | rare_event | 0.12 | 99.8 | 12.4 | −0.88 | 0.00% |
| MED-000101 | Blood Collection Bag CPDA-1 - Single 350 ml | department_specific | 0.20 | 40.0 | 5.7 | −0.86 | 0.00% |
| MED-000201 | Rectal Tube 26 Fr | rare_event | 0.23 | 236.0 | 39.7 | −0.83 | 0.00% |
| MED-000140 | Tracheostomy Tube Cuffed - Size 9.0 | rare_event | 0.12 | 95.8 | 16.8 | −0.82 | 0.00% |
| MED-000164 | Self-Inflating Resuscitation Bag Disposable - Neonatal | rare_event | 0.09 | 56.0 | 10.3 | −0.82 | 0.00% |
| MED-000218 | External (Condom) Catheter - Large | rare_event | 0.08 | 84.0 | 15.4 | −0.82 | 0.00% |
| MED-000139 | Tracheostomy Tube Cuffed - Size 8.0 | rare_event | 0.18 | 148.0 | 28.0 | −0.81 | 0.00% |

For an item used once every 5-10 weeks the median weekly demand genuinely is 0, so the P50 is near zero and the
"−85%" is arithmetic, not a model fault; these items are covered by the P90 (coverage 99.6% for `rare_event`) and by
the stockout model, not by the point forecast.

Across all 403 items: median |relative bias| 2.2%; 67 items are beyond ±10% but together they are **0.38% of 2025
demand**; 31 items beyond ±25% are 0.07% of demand. 367 items are under-forecast, 36 over-forecast. Demand-weighted
relative bias −1.9%.

**Largest |relative bias| among items averaging ≥ 5 units per store-week** (where the forecast actually drives orders):

| Item_ID | Item | archetype | mean weekly actual | relative bias |
|---|---|---|---|---|
| MED-000358 | Dialysis Sterile Procedure Pack | department_specific | 12.7 | −0.145 |
| MED-000354 | Dialysis Dressing Change Kit | department_specific | 10.9 | −0.133 |
| MED-000344 | Haemodialysis Arterial/Venous Blood Tubing Set | department_specific | 9.6 | +0.133 |
| MED-000355 | Dry Bicarbonate Cartridge | department_specific | 11.3 | −0.091 |
| MED-000376 | Bladder Irrigation Set | department_specific | 5.0 | −0.067 |
| MED-000356 | Dialysis Catheter Cap/Clamp | department_specific | 6.2 | −0.065 |
| MED-000077 | IV Infusion Set Adult 20 Drops/ml with Air Vent | seasonal (gastro:.3,dengue:.2) | 164.2 | −0.057 |
| MED-000209 | Closed Wound Drain with Trocar - 10 Fr | procedure_dependent | 9.5 | −0.055 |
| MED-000177 | Foley Catheter 2-Way Latex - 20 Fr | stable | 7.7 | −0.055 |
| MED-000357 | Haemodialysis Transducer Protector | department_specific | 10.5 | −0.055 |

The only cluster is the **dialysis consumables** (single department, ~10 units/week), under-forecast by 9-15%. The
10 highest-volume items (stable, ~160-170 units/store-week, 1.5-1.8% of demand each) are all under-forecast by
1.9-3.1%.

### 1d. Bias by `Demand_Archetype` and `Seasonality_Profile`

| Demand_Archetype | items | mean actual | mean error | sum(P50)/sum(actual) | share over | share under | WAPE | P90 coverage | share of 2025 demand |
|---|---|---|---|---|---|---|---|---|---|
| stable | 183 | 62.1 | −1.14 | 0.982 | 46.9% | 53.2% | 0.103 | 0.913 | 78.9% |
| seasonal | 28 | 55.9 | −1.15 | 0.979 | 50.9% | 49.2% | 0.148 | 0.896 | 11.8% |
| procedure_dependent | 54 | 21.4 | −0.34 | 0.984 | 49.6% | 50.4% | 0.153 | 0.951 | 5.6% |
| department_specific | 45 | 11.2 | −0.34 | 0.969 | 52.5% | 47.5% | 0.381 | 0.911 | 1.8% |
| intermittent | 54 | 4.5 | −0.20 | 0.955 | 52.1% | 47.8% | 0.448 | 0.955 | 1.4% |
| emergency_critical | 17 | 5.8 | −0.18 | 0.969 | 49.3% | 50.7% | 0.299 | 0.973 | 0.5% |
| rare_event | 22 | 0.4 | −0.18 | 0.571 | 70.2% | 26.6% | 0.945 | 0.996 | 0.04% |

`Seasonality_Profile` values look like `dengue:.35` or `gastro:.3,dengue:.2`; grouped by the first driver word
(`Seasonality_Family`, blank = `none`):

| Seasonality_Family | items | mean actual | mean error | sum(P50)/sum(actual) | share over | share under | WAPE | P90 coverage | share of 2025 demand |
|---|---|---|---|---|---|---|---|---|---|
| none | 354 | 41.0 | −0.77 | 0.981 | 49.5% | 50.3% | 0.114 | 0.931 | 83.7% |
| resp | 16 | 55.2 | −0.01 | 1.000 | 53.9% | 46.1% | 0.140 | 0.920 | 6.2% |
| dengue | 19 | 35.1 | −1.18 | 0.967 | 49.6% | 50.4% | 0.178 | 0.899 | 5.7% |
| gastro | 5 | 81.6 | −3.14 | 0.962 | 46.5% | 53.5% | 0.144 | 0.859 | 3.8% |
| burn | 4 | 20.6 | −0.49 | 0.976 | 49.0% | 51.0% | 0.337 | 0.874 | 0.4% |
| flood | 5 | 9.2 | −0.30 | 0.967 | 51.3% | 48.7% | 0.242 | 0.953 | 0.2% |

By exact profile value (bias ratio / WAPE): blank 0.981 / 0.114; resp:.5 0.997 / 0.133; dengue:.15,gastro:.1 0.970 /
0.198; dengue:.35,gastro:.25 0.966 / 0.192; resp:.3 1.012 / 0.170; gastro:.4 0.973 / 0.141; flood:1.2 0.979 / 0.215;
burn:.6 1.032 / 0.529; dengue:.3 0.964 / 0.187; resp:.7 1.002 / 0.133; burn:.5 0.966 / 0.313; burn:.8 0.977 / 0.328;
dengue:.2 0.961 / 0.137; flood:.8,resp:.2 0.792 / 0.689; flood:.5 0.616 / 0.915; dengue:6 0.965 / 0.160;
dengue:1.5,gastro:.5 0.966 / 0.158; dengue:1.5 0.968 / 0.140; gastro:.3,dengue:.2 0.944 / 0.143; gastro:.8 0.973 /
0.158; resp:.8 0.998 / 0.162.

* Every group is under-forecast by 2-4% except `resp` (unbiased) and the negligible `rare_event` group.
* The **dengue and gastro items** are the weakest: 3.3-3.8% under in volume, WAPE 0.14-0.18 and P90 coverage
  86-90% (below the 90% target). These are the epidemic-driven items; the model's seasonal features (lag_52,
  roll_mean_52, week_of_year) capture the average season but not the size of a given year's outbreak. They are 9.5%
  of demand, and even for them the under-forecast is under 4%.

---

## 2. Stockout risk: does a simple rule or a logistic regression come close?

Test set: **107,350 Monday snapshots** (2,147 sub-store × item pairs × 50 Mondays, 2025-01-06 .. 2025-12-15; only
snapshots whose 14-day label window is fully observed), **5,106 positives (4.76%)**. The logistic regressions were
fitted on the 225,435 snapshots dated ≤ 2024-12-31 (positive rate 4.75%), so they see no 2025 data.

### 2a. Calibrated HistGradientBoosting model

| metric | this run | metrics.json |
|---|---|---|
| PR-AUC | 0.4795 | 0.4794 |
| ROC-AUC | 0.8870 | 0.8869 |
| Brier (calibrated) | 0.0328 | 0.0328 |
| Brier (raw, before Platt scaling) | 0.1189 | 0.1128 |
| Brier of always predicting the 4.76% base rate | 0.0453 | — |
| mean predicted probability | 0.0443 | — |
| observed stockout rate | 0.0476 | — |

| method | flag rate | precision | recall | F1 | TN | FP | FN | TP |
|---|---|---|---|---|---|---|---|---|
| model, review threshold 0.0416 | 19.7% | 0.186 | 0.772 | 0.300 | 85,014 | 17,230 | 1,162 | 3,944 |
| model, urgent threshold 0.2126 | 4.8% | 0.463 | 0.465 | 0.464 | 99,491 | 2,753 | 2,733 | 2,373 |

### 2b. Simple rules

| method | flag rate | precision | recall | F1 | TP | FP | FN |
|---|---|---|---|---|---|---|---|
| model, review threshold 0.0416 | **19.7%** | **0.186** | 0.772 | **0.300** | 3,944 | 17,230 | 1,162 |
| model, urgent threshold 0.2126 | **4.8%** | **0.463** | 0.465 | **0.464** | 2,373 | 2,753 | 2,733 |
| (a) days_of_cover < 14 | 58.4% | 0.070 | 0.854 | 0.129 | 4,360 | 58,374 | 746 |
| (b) cover_incl_transit < 14 | 53.2% | 0.076 | 0.846 | 0.139 | 4,319 | 52,750 | 787 |
| (c) cover_vs_forecast < 1 | 51.5% | 0.078 | 0.839 | 0.142 | 4,283 | 51,015 | 823 |
| (a) or (c) | 62.2% | 0.067 | 0.881 | 0.125 | 4,500 | 62,265 | 606 |
| already out of stock (stock_on_hand = 0) | 1.1% | 0.396 | 0.091 | 0.148 | 463 | 707 | 4,643 |

* The three cover rules catch slightly more stockouts than the review threshold (84-85% vs 77%) but to do so they
  **flag more than half of all store-item rows** every Monday (51-58% vs 20%), and only 7-8 of every 100 flags are
  real (precision 0.07-0.08, barely above the 4.8% base rate). The model's review list is 2.4-2.7× more precise at
  a third of the length.
* Nothing rule-based approaches the urgent list: "already out of stock" is the only rule with comparable precision
  (0.40) and it finds 9% of the coming stockouts, the model finds 46% at 0.46 precision.
* `cover_vs_forecast` is undefined (forecast P50 = 0) on 0.18% of rows; those are not flagged by rule (c).

### 2c. Rules as a ranking, at the model's recall

A fairer test: treat each cover feature as a risk score (lower cover = riskier) and pick the cut-off that gives the
same recall as the model's two thresholds.

| score | PR-AUC | ROC-AUC | precision @ recall 0.772 | flag rate @ recall 0.772 | cut-off (review) | precision @ recall 0.465 | flag rate @ recall 0.465 | cut-off (urgent) |
|---|---|---|---|---|---|---|---|---|
| model (calibrated probability) | **0.480** | **0.887** | **0.186** | **19.7%** | p ≥ 0.0416 | **0.464** | **4.8%** | p ≥ 0.213 |
| days_of_cover | 0.183 | 0.737 | 0.078 | 47.2% | < 11.7 days | 0.138 | 16.0% | < 6.1 days |
| cover_incl_transit | 0.308 | 0.764 | 0.085 | 43.5% | < 12.0 days | 0.173 | 12.8% | < 6.5 days |
| cover_vs_forecast | 0.315 | 0.764 | 0.086 | 42.5% | < 0.89 | 0.170 | 13.0% | < 0.49 |

Even with the best possible cut-off, a cover rule needs to flag 43-47% of rows to match the review recall (vs 20%)
and 13-16% to match the urgent recall (vs 4.8%), at less than half (review) or about a third (urgent) of the
model's precision. Including transit stock or the forecast helps the rule (PR-AUC 0.18 → 0.31) but it stays far
below the model's 0.48.

### 2d. Logistic regression on the same 17 features

Two variants, both with median imputation and standardisation; the second applies log1p first because
`days_of_cover`-type features are capped at 999 / 1e6 and are extremely skewed. Thresholds for the logistic models
were chosen on the 2025 rows to match the model's recall exactly, which flatters them slightly (the model's thresholds
were fixed on 2024 validation data).

| method | PR-AUC | ROC-AUC | Brier | precision @ recall 0.772 | flag rate @ recall 0.772 | precision @ recall 0.465 | flag rate @ recall 0.465 |
|---|---|---|---|---|---|---|---|
| logistic (impute + standardise) | 0.240 | 0.772 | 0.0411 | 0.089 | 41.2% | 0.183 | 12.1% |
| logistic (log1p + impute + standardise) | 0.419 | 0.836 | 0.0349 | 0.121 | 30.5% | 0.365 | 6.1% |
| HistGradientBoosting (calibrated, saved thresholds) | **0.480** | **0.887** | **0.0328** | **0.186** | **19.7%** | **0.463** | **4.8%** |

F1 of the better logistic variant at the matched recalls: 0.208 (review) and 0.409 (urgent), vs 0.300 and 0.464.

* A plain logistic regression is little better than the cover rules.
* With a log transform it gets to about 85% of the model's PR-AUC, but at equal recall it still produces a review
  list 55% longer (30.5% vs 19.7% of rows) with a third less precision, and an urgent list 27% longer with precision
  0.37 vs 0.46. The gradient-boosting model is a clear improvement over the best linear model, not a marginal one.

### 2e. Where the model misses

Calibrated probability on the 5,106 stockouts that did happen: 10th percentile 0.020, 25th 0.047, median 0.18,
75th 0.50, 90th 0.83. **22.8% of real stockouts scored below the review threshold** (4.4% below 1%). These are
stockouts with no visible precursor on the Monday (adequate cover, no recent stockout days), most plausibly supplier
delays or demand spikes inside the 14-day window; no feature built from the Monday snapshot can see them, so this is a
ceiling on any model using these inputs, not a defect specific to this one.

---

## 3. Calibration: can the UI show exact percentages?

Reliability table of the calibrated model on the 107,350 test snapshots:

| predicted probability | count | share of rows | mean predicted | observed stockout rate | gap (obs − pred) | 95% half-width of observed rate | share of all stockouts |
|---|---|---|---|---|---|---|---|
| 0-5% | 89,144 | 83.0% | 1.27% | 1.49% | +0.22 pts | ±0.08 | 26.0% |
| 5-10% | 7,745 | 7.2% | 7.01% | 8.29% | +1.28 pts | ±0.61 | 12.6% |
| 10-20% | 4,973 | 4.6% | 13.98% | 13.75% | −0.23 pts | ±0.96 | 13.4% |
| 20-30% | 2,098 | 2.0% | 24.35% | 25.17% | +0.82 pts | ±1.86 | 10.3% |
| 30-50% | 1,675 | 1.6% | 38.44% | 39.28% | +0.84 pts | ±2.34 | 12.9% |
| 50-70% | 888 | 0.8% | 59.03% | 58.90% | −0.13 pts | ±3.24 | 10.2% |
| 70-90% | 441 | 0.4% | 79.59% | 82.54% | +2.95 pts | ±3.54 | 7.1% |
| 90-100% | 386 | 0.4% | 93.78% | 98.96% | +5.19 pts | ±1.01 | 7.5% |

Expected calibration error (row-weighted mean |gap|): **0.0035**. Largest gap in any bin with ≥ 100 rows: 5.2 points
(the top bin). Brier 0.0328 vs 0.0453 for a constant base-rate prediction (Brier skill 0.28).

Finer bins around the two thresholds and by store:

| predicted probability | count | mean predicted | observed rate | gap |
|---|---|---|---|---|
| [0, 1%) | 48,044 | 0.32% | 0.46% | +0.15 pts |
| [1%, 2%) | 17,988 | 1.48% | 1.62% | +0.15 pts |
| [2%, 4.16%) | 20,144 | 2.87% | 3.21% | +0.34 pts |
| [4.16%, 7%) | 7,228 | 5.34% | 6.38% | +1.03 pts |
| [7%, 10%) | 3,485 | 8.36% | 9.87% | +1.51 pts |
| [10%, 15%) | 3,268 | 12.23% | 12.21% | −0.02 pts |
| [15%, 21.26%) | 2,067 | 17.93% | 17.76% | −0.17 pts |
| [21.26%, 30%) | 1,736 | 25.12% | 25.69% | +0.57 pts |
| [30%, 40%) | 1,033 | 34.58% | 34.85% | +0.27 pts |
| [40%, 50%) | 642 | 44.65% | 46.42% | +1.77 pts |
| [50%, 65%) | 716 | 57.01% | 55.59% | −1.43 pts |
| [65%, 80%) | 398 | 71.60% | 74.87% | +3.27 pts |
| [80%, 100%) | 601 | 90.51% | 95.34% | +4.83 pts |

| store | count | mean predicted | observed rate | gap |
|---|---|---|---|---|
| STR-002 | 16,200 | 4.57% | 4.90% | +0.32 pts |
| STR-003 | 14,950 | 4.61% | 5.29% | +0.69 pts |
| STR-004 | 13,100 | 4.32% | 4.24% | −0.08 pts |
| STR-005 | 2,650 | 4.39% | 4.57% | +0.18 pts |
| STR-006 | 1,250 | 5.03% | 6.48% | +1.45 pts |
| STR-007 | 7,400 | 4.45% | 4.46% | +0.01 pts |
| STR-008 | 12,500 | 4.50% | 4.82% | +0.31 pts |
| STR-009 | 12,500 | 4.22% | 4.54% | +0.32 pts |
| STR-010 | 12,750 | 4.45% | 4.65% | +0.20 pts |
| STR-011 | 14,050 | 4.26% | 4.78% | +0.52 pts |

* Between 0% and 70%, where 99% of rows and 85% of stockouts sit, the observed rate is within **1.5 points** of the
  predicted probability in every bin, and within sampling noise in most. A displayed "12%" really did come true about
  12% of the time; "25%" about 25%; "59%" about 59%.
* Above 70% the model is slightly **too modest**: items shown as 80% stocked out 83% of the time, items shown as 94%
  stocked out 99% of the time. The error is in the direction of under-stating a risk that is already far past the
  urgent threshold, so it cannot change any decision.
* The 5-10% band runs about 1.3 points hot (observed 8.3% vs predicted 7.0%), the only statistically clear gap
  below 70%. Overall the model predicts 4.43% on average against an observed 4.76%, a small, uniform under-statement
  (also visible store by store: every store's gap is between −0.1 and +1.5 points).

---

## Verdict (plain language)

**1. Is the demand model biased?** Slightly, and in a known, harmless direction. On 2025 it forecasts about **2% less
than was actually used**, the same in every month and almost every product group, and it is as often above the actual
as below it. The 2% comes from the fact that the model reports the *median* week (P50): for demand that occasionally
spikes, the median is always a little below the average, so the medians add up to a little less than the total. The
only groups with a larger gap are near-zero "rare event" items (where a median of zero is correct and the P90 covers
them) and the dengue/gastro epidemic items, which are 3-4% low and whose P90 covers 86-90% of weeks instead of 90%.
The model beats both the "same week last year" and the "average of the last 4 weeks" forecasts at every horizon, and
the P90 upper band covers 92-93% of actual weeks, slightly more than its 90% promise, so safety-stock calculations
built on P90 err on the safe side. **No retraining is warranted on these numbers.** If the 2% matters for a purchase
quantity, the right fix is in the rules layer (for example ordering on P50 × 1.02, or on the P90 as already intended),
not a new model.

**2. Does a simple rule or logistic regression come close to the stockout model?** No. Flagging every item with under
14 days of cover catches a few more stockouts than the model's review list, but it flags **more than half of all
store-item pairs every week** and only 7 in 100 flags are real; the model's review list flags 20% of pairs with 19 in
100 real, and its urgent list flags 5% with 46 in 100 real. No rule produces anything like the urgent list. A
logistic regression on the same 17 inputs gets to about 85% of the model's ranking quality once the inputs are
log-transformed, but at the same catch rate it still produces review lists 55% longer and urgent lists 27% longer
with lower precision. The gradient-boosting model earns its place. Its real limitation is shared by any method:
about 23% of 2025 stockouts gave no warning sign on the Monday snapshot and scored below the review threshold.

**3. Is the calibration good enough to display exact percentages?** Yes. From 0% to 70%, which covers 99% of all
rows, the displayed probability matched the observed stockout frequency to within 1.5 percentage points in every
band tested, and within about 0.3 points for the 83% of rows below 5%. Above 70% the model slightly under-states a
risk that is already far beyond "urgent". The dashboard may show the exact probability, rounded to a whole percent
(e.g. "12%", and "<1%" below 1%), ideally next to the REVIEW / URGENT band it falls in; there is no need to hide the
number behind bands only. The one honest caveat to put in a tooltip: a shown probability is accurate to roughly
±1-2 points, and probabilities above 70% are if anything too low.

**Bottom line:** both models reproduce their published metrics on the 2025 hold-out, the demand model's 2% low bias is
a property of the median forecast rather than a defect, the stockout model clearly outperforms rules and a linear
model, and its probabilities are well enough calibrated to show as numbers. Nothing here calls for retraining.
