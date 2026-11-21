import datetime
from typing import Any

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base

DECISION_ACCEPTED = "ACCEPTED"
DECISION_ADJUSTED = "ADJUSTED"
DECISION_REJECTED = "REJECTED"
DECISIONS = (DECISION_ACCEPTED, DECISION_ADJUSTED, DECISION_REJECTED)


class RecommendationDecision(Base):
    """A procurement officer's final word on one recommendation row (Phase 11, human in the loop). One decision per
    row, never changed: the UNIQUE on recommendation_id is what blocks a duplicate submission. The recommendation
    itself is never edited except for its status, which mirrors `decision`; the original values that matter are
    copied here so the decision reads on its own (the purchase order's expected date comes from a live join that a
    later import can change). Nothing here places an order or moves stock."""

    __tablename__ = "recommendation_decisions"
    __table_args__ = (
        UniqueConstraint("recommendation_id"),
        CheckConstraint("decision IN ('ACCEPTED', 'ADJUSTED', 'REJECTED')", name="decision"),
        # a rejection or an adjustment always says why
        CheckConstraint("decision = 'ACCEPTED' OR length(btrim(coalesce(reason, ''))) > 0", name="reason"),
        # only an adjustment carries adjusted values, and exactly one of them, different from the original
        CheckConstraint("decision = 'ADJUSTED' OR (adjusted_quantity IS NULL AND adjusted_expected_date IS NULL)",
                        name="no_adjustment"),
        CheckConstraint("decision <> 'ADJUSTED' OR "
                        "(adjusted_quantity IS NOT NULL AND adjusted_expected_date IS NULL "
                        " AND adjusted_quantity IS DISTINCT FROM original_quantity) OR "
                        "(adjusted_quantity IS NULL AND adjusted_expected_date IS NOT NULL "
                        " AND adjusted_expected_date IS DISTINCT FROM original_expected_date)", name="one_adjustment"),
        CheckConstraint("adjusted_quantity IS NULL OR adjusted_quantity >= 0", name="adjusted_quantity"),
        Index("ix_recommendation_decisions_user_id", "user_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    recommendation_id: Mapped[int] = mapped_column(ForeignKey("recommendations.id"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))                 # the officer who decided
    decision: Mapped[str] = mapped_column(String(10))
    original_quantity: Mapped[int | None] = mapped_column(Integer)              # PURCHASE: recommended_quantity; TRANSFER: transfer_qty
    adjusted_quantity: Mapped[int | None] = mapped_column(Integer)              # ADJUSTED rows of those two actions
    original_expected_date: Mapped[datetime.date | None] = mapped_column(Date)  # EXPEDITE_PO: the PO's expected delivery date when decided
    adjusted_expected_date: Mapped[datetime.date | None] = mapped_column(Date)  # ADJUSTED EXPEDITE_PO rows: the date the officer asks for
    reason: Mapped[str | None] = mapped_column(Text)                            # required unless ACCEPTED
    decided_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    recommendation: Mapped[Any] = relationship("Recommendation")
    user: Mapped[Any] = relationship("User")
