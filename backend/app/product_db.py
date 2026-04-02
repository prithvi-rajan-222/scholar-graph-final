from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import JSON, DateTime, ForeignKey, String, Text, create_engine, func
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, relationship, sessionmaker

from app.config import PRODUCT_DATABASE_URL


class Base(DeclarativeBase):
    pass


class UserRecord(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())

    statuses: Mapped[list["PaperStatusRecord"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class PaperStatusRecord(Base):
    __tablename__ = "paper_status"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    paper_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    status: Mapped[str] = mapped_column(String(32), index=True)
    note: Mapped[str | None] = mapped_column(Text(), nullable=True)
    updated_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user: Mapped[UserRecord] = relationship(back_populates="statuses")


class SavedItemRecord(Base):
    __tablename__ = "saved_items"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    item_type: Mapped[str] = mapped_column(String(32), primary_key=True)
    item_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())


class LearningGoalRecord(Base):
    __tablename__ = "learning_goals"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    goal_type: Mapped[str] = mapped_column(String(32), index=True)
    title: Mapped[str] = mapped_column(String(255))
    subject_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())


class RecommendationRunRecord(Base):
    __tablename__ = "recommendation_runs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    context_type: Mapped[str] = mapped_column(String(32))
    context_value: Mapped[str] = mapped_column(String(255))
    recommendations_json: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())


class GeneratedArtifactRecord(Base):
    __tablename__ = "generated_artifacts"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    artifact_type: Mapped[str] = mapped_column(String(64), index=True)
    subject_type: Mapped[str] = mapped_column(String(32), index=True)
    subject_id: Mapped[str] = mapped_column(String(128), index=True)
    provider: Mapped[str] = mapped_column(String(64))
    model: Mapped[str] = mapped_column(String(128))
    content_json: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())


class EmbeddingRecord(Base):
    __tablename__ = "embeddings"

    subject_type: Mapped[str] = mapped_column(String(32), primary_key=True)
    subject_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    provider: Mapped[str] = mapped_column(String(64))
    embedding_json: Mapped[list[float]] = mapped_column(JSON)
    updated_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


engine = create_engine(PRODUCT_DATABASE_URL, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, class_=Session)


def init_product_db() -> None:
    Base.metadata.create_all(bind=engine)


@contextmanager
def get_product_session() -> Iterator[Session]:
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
