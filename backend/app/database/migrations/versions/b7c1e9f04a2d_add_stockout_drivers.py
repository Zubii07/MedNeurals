"""add stockout driver columns

Revision ID: b7c1e9f04a2d
Revises: 5da47f83ba0a
Create Date: 2026-11-18

Saves, next to every stockout probability, the snapshot values the model scored (stock on hand, demand rate, cover,
incoming stock, forecast, stockout history) so the UI can explain why an item is at risk. Nullable: rows of earlier
runs keep NULL.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b7c1e9f04a2d'
down_revision: Union[str, Sequence[str], None] = '5da47f83ba0a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

DRIVERS = ["stock_on_hand", "in_transit_qty", "adu_28", "days_of_cover", "incoming_within_n", "fc_next_n_p50",
           "stockout_days_last_28", "central_stock_qty", "days_since_stockout", "supplier_lt_mean"]


def upgrade() -> None:
    for name in DRIVERS:
        op.add_column('stockout_predictions', sa.Column(name, sa.Float(), nullable=True))


def downgrade() -> None:
    for name in reversed(DRIVERS):
        op.drop_column('stockout_predictions', name)
