"""create recommendation_decisions

Revision ID: f7a8b9c0d1e2
Revises: e5f6a7b8c9d0
Create Date: 2026-11-21

Officer Accept / Adjust / Reject (Phase 11): one final decision per recommendation row, with the officer, the time,
the original and adjusted value and the reason. The recommendation row itself only has its status set.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f7a8b9c0d1e2'
down_revision: Union[str, Sequence[str], None] = 'e5f6a7b8c9d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'recommendation_decisions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('recommendation_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('decision', sa.String(length=10), nullable=False),
        sa.Column('original_quantity', sa.Integer(), nullable=True),
        sa.Column('adjusted_quantity', sa.Integer(), nullable=True),
        sa.Column('original_expected_date', sa.Date(), nullable=True),
        sa.Column('adjusted_expected_date', sa.Date(), nullable=True),
        sa.Column('reason', sa.Text(), nullable=True),
        sa.Column('decided_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint("decision IN ('ACCEPTED', 'ADJUSTED', 'REJECTED')",
                           name=op.f('ck_recommendation_decisions_decision')),
        sa.CheckConstraint("decision = 'ACCEPTED' OR length(btrim(coalesce(reason, ''))) > 0",
                           name=op.f('ck_recommendation_decisions_reason')),
        sa.CheckConstraint("decision = 'ADJUSTED' OR (adjusted_quantity IS NULL AND adjusted_expected_date IS NULL)",
                           name=op.f('ck_recommendation_decisions_no_adjustment')),
        sa.CheckConstraint("decision <> 'ADJUSTED' OR "
                           "(adjusted_quantity IS NOT NULL AND adjusted_expected_date IS NULL "
                           " AND adjusted_quantity IS DISTINCT FROM original_quantity) OR "
                           "(adjusted_quantity IS NULL AND adjusted_expected_date IS NOT NULL "
                           " AND adjusted_expected_date IS DISTINCT FROM original_expected_date)",
                           name=op.f('ck_recommendation_decisions_one_adjustment')),
        sa.CheckConstraint('adjusted_quantity IS NULL OR adjusted_quantity >= 0',
                           name=op.f('ck_recommendation_decisions_adjusted_quantity')),
        sa.ForeignKeyConstraint(['recommendation_id'], ['recommendations.id'],
                                name=op.f('fk_recommendation_decisions_recommendation_id_recommendations')),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_recommendation_decisions_user_id_users')),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_recommendation_decisions')),
        sa.UniqueConstraint('recommendation_id', name=op.f('uq_recommendation_decisions_recommendation_id')),
    )
    op.create_index('ix_recommendation_decisions_user_id', 'recommendation_decisions', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_recommendation_decisions_user_id', table_name='recommendation_decisions')
    op.drop_table('recommendation_decisions')
