"""create recommendation_explanations

Revision ID: c3d4e5f60718
Revises: b7c1e9f04a2d
Create Date: 2026-11-18

One plain-language paragraph per (stockout run, item), written on first request and reused.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c3d4e5f60718'
down_revision: Union[str, Sequence[str], None] = 'b7c1e9f04a2d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'recommendation_explanations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('model_run_id', sa.Integer(), nullable=False),
        sa.Column('item_id', sa.String(length=20), nullable=False),
        sa.Column('text', sa.Text(), nullable=False),
        sa.Column('source', sa.String(length=10), nullable=False),
        sa.Column('provider_model', sa.String(length=100), nullable=True),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint("source IN ('llm', 'template')", name='source'),
        sa.ForeignKeyConstraint(['item_id'], ['medical_items.item_id']),
        sa.ForeignKeyConstraint(['model_run_id'], ['model_runs.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('model_run_id', 'item_id'),
    )


def downgrade() -> None:
    op.drop_table('recommendation_explanations')
