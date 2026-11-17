import datetime
from typing import Any

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base

SOURCE_LLM = "llm"
SOURCE_TEMPLATE = "template"


class RecommendationExplanation(Base):
    """One plain-language paragraph per item and prediction refresh (CLAUDE.md rule 8: it only restates stored
    results). Written once on first request and reused; a new refresh gets a new paragraph."""

    __tablename__ = "recommendation_explanations"
    __table_args__ = (
        UniqueConstraint("model_run_id", "item_id"),
        CheckConstraint(f"source IN ('{SOURCE_LLM}', '{SOURCE_TEMPLATE}')", name="source"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    model_run_id: Mapped[int] = mapped_column(ForeignKey("model_runs.id", ondelete="CASCADE"))   # stockout run
    item_id: Mapped[str] = mapped_column(ForeignKey("medical_items.item_id"))
    text: Mapped[str] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(10))               # llm | template
    provider_model: Mapped[str | None] = mapped_column(String(100))  # e.g. gemini-2.5-flash (llm rows only)
    note: Mapped[str | None] = mapped_column(Text)                # why the template was used, if it was
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    model_run: Mapped[Any] = relationship("ModelRun")
