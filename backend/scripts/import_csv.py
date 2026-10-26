# Import the MedNeurals CSV dataset into PostgreSQL
import argparse
import datetime
import sys
import time

from sqlalchemy import func, select

from app.database.connection import engine
from app.services.csv_import import DATASETS, IMPORT_ORDER, MASTER_DATASETS, CsvImportError, import_dataset

DEFAULT_DATA_DIR = "data/MedNeurals_dataset_v2"


def print_result(result: dict, seconds: float) -> None:
    print(
        f"{result['dataset']:<22} received={result['rows_received']:>9,} skipped={result['rows_skipped']:>8,} "
        f"rejected={result['rows_rejected']:>6,} written={result['rows_written']:>9,} "
        f"unchanged={result['rows_unchanged']:>9,}  [{result['status']}, {seconds:.1f}s]"
    )
    if result["rows_rejected"]:
        print(f"    rejected: {result['rejected_summary']}\n    report:   {result['rejected_report']}")


def print_row_counts(results: list[dict]) -> bool:
    """Compare each table's row count with the rows this run accepted (equal on a full load into empty tables)."""
    print("\nRow-count check (DB rows vs rows accepted from CSV):")
    ok = True
    with engine.connect() as conn:
        for result in results:
            table = DATASETS[result["dataset"]].table
            db_rows = conn.execute(select(func.count()).select_from(table)).scalar_one()
            match = db_rows == result["rows_accepted"]
            ok &= match
            print(f"  {table.name:<22} db={db_rows:>9,} accepted={result['rows_accepted']:>9,}  {'OK' if match else 'DIFFERENT'}")
    return ok


def main() -> int:
    parser = argparse.ArgumentParser(description="Import MedNeurals CSV files into PostgreSQL.")
    target = parser.add_mutually_exclusive_group(required=True)
    target.add_argument("--all", action="store_true", help="import every dataset in foreign-key-safe order")
    target.add_argument("--dataset", choices=IMPORT_ORDER, help="import a single dataset")
    parser.add_argument("--file", help="CSV path for --dataset (default: the file in --data-dir)")
    parser.add_argument("--data-dir", default=DEFAULT_DATA_DIR)
    parser.add_argument("--cutoff", type=datetime.date.fromisoformat, help="only import rows dated on/before this date")
    args = parser.parse_args()

    datasets = IMPORT_ORDER if args.all else [args.dataset]
    results = []
    for dataset in datasets:
        path = args.file if args.file else f"{args.data_dir}/{DATASETS[dataset].filename}"
        start = time.perf_counter()
        try:
            result = import_dataset(engine, dataset, path, cutoff=args.cutoff)
        except CsvImportError as exc:
            print(f"{dataset}: FAILED - {exc}")
            return 1
        print_result(result, time.perf_counter() - start)
        results.append(result)
        if args.all and dataset in MASTER_DATASETS and result["rows_rejected"]:
            print(f"Stopping: master dataset {dataset} has rejected rows.")
            return 1

    if args.all:
        return 0 if print_row_counts(results) else 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
