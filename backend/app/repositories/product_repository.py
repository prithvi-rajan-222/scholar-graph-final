from __future__ import annotations

from datetime import datetime

from sqlalchemy import delete, func, select

from app.models.graph import PaperStatusOption, RecommendationItem
from app.product_db import (
    GeneratedArtifactRecord,
    PaperStatusRecord,
    RecommendationRunRecord,
    SavedItemRecord,
    UserRecord,
)


class ProductRepository:
    def __init__(self, session):
        self.session = session

    def ensure_user(self, user_id: str, *, name: str = "Demo User") -> UserRecord:
        user = self.session.get(UserRecord, user_id)
        if user is None:
            user = UserRecord(id=user_id, name=name)
            self.session.add(user)
            self.session.flush()
        return user

    def get_status_map(self, user_id: str) -> dict[str, str]:
        records = self.session.scalars(
            select(PaperStatusRecord).where(PaperStatusRecord.user_id == user_id)
        ).all()
        return {record.paper_id: record.status for record in records}

    def set_paper_status(self, user_id: str, paper_id: str, status: PaperStatusOption, *, note: str | None = None) -> None:
        self.ensure_user(user_id)
        record = self.session.get(PaperStatusRecord, {"user_id": user_id, "paper_id": paper_id})
        if record is None:
            record = PaperStatusRecord(user_id=user_id, paper_id=paper_id, status=status, note=note)
            self.session.add(record)
        else:
            record.status = status
            record.note = note
        self.session.flush()

    def clear_paper_status(self, user_id: str, paper_id: str) -> None:
        self.session.execute(
            delete(PaperStatusRecord).where(
                PaperStatusRecord.user_id == user_id,
                PaperStatusRecord.paper_id == paper_id,
            )
        )

    def get_read_ids(self, user_id: str) -> set[str]:
        rows = self.session.scalars(
            select(PaperStatusRecord).where(
                PaperStatusRecord.user_id == user_id,
                PaperStatusRecord.status == "read",
            )
        ).all()
        return {row.paper_id for row in rows}

    def get_latest_read_update(self, user_id: str) -> datetime | None:
        stmt = select(func.max(PaperStatusRecord.updated_at)).where(
            PaperStatusRecord.user_id == user_id,
            PaperStatusRecord.status == "read",
        )
        return self.session.execute(stmt).scalar_one_or_none()

    def save_item(self, user_id: str, item_type: str, item_id: str) -> None:
        self.ensure_user(user_id)
        record = self.session.get(SavedItemRecord, {"user_id": user_id, "item_type": item_type, "item_id": item_id})
        if record is None:
            self.session.add(SavedItemRecord(user_id=user_id, item_type=item_type, item_id=item_id))

    def list_saved_items(self, user_id: str, *, item_type: str | None = None) -> list[SavedItemRecord]:
        stmt = select(SavedItemRecord).where(SavedItemRecord.user_id == user_id)
        if item_type:
            stmt = stmt.where(SavedItemRecord.item_type == item_type)
        return list(self.session.scalars(stmt).all())

    def store_generated_artifact(
        self,
        *,
        user_id: str,
        artifact_type: str,
        subject_type: str,
        subject_id: str,
        provider: str,
        model: str,
        content_json: dict,
    ) -> GeneratedArtifactRecord:
        self.ensure_user(user_id)
        record = GeneratedArtifactRecord(
            user_id=user_id,
            artifact_type=artifact_type,
            subject_type=subject_type,
            subject_id=subject_id,
            provider=provider,
            model=model,
            content_json=content_json,
        )
        self.session.add(record)
        self.session.flush()
        return record

    def get_latest_generated_artifact(
        self,
        *,
        user_id: str,
        artifact_type: str,
        subject_type: str,
        subject_id: str,
    ) -> GeneratedArtifactRecord | None:
        stmt = (
            select(GeneratedArtifactRecord)
            .where(
                GeneratedArtifactRecord.user_id == user_id,
                GeneratedArtifactRecord.artifact_type == artifact_type,
                GeneratedArtifactRecord.subject_type == subject_type,
                GeneratedArtifactRecord.subject_id == subject_id,
            )
            .order_by(GeneratedArtifactRecord.created_at.desc(), GeneratedArtifactRecord.id.desc())
            .limit(1)
        )
        return self.session.scalars(stmt).first()

    def list_generated_artifacts(
        self,
        *,
        user_id: str,
        artifact_type: str,
        subject_type: str,
        subject_id: str,
    ) -> list[GeneratedArtifactRecord]:
        stmt = (
            select(GeneratedArtifactRecord)
            .where(
                GeneratedArtifactRecord.user_id == user_id,
                GeneratedArtifactRecord.artifact_type == artifact_type,
                GeneratedArtifactRecord.subject_type == subject_type,
                GeneratedArtifactRecord.subject_id == subject_id,
            )
            .order_by(GeneratedArtifactRecord.created_at.desc(), GeneratedArtifactRecord.id.desc())
        )
        return list(self.session.scalars(stmt).all())

    def list_generated_artifacts_for_user(
        self,
        *,
        user_id: str,
        artifact_type: str | None = None,
        subject_type: str | None = None,
    ) -> list[GeneratedArtifactRecord]:
        stmt = select(GeneratedArtifactRecord).where(GeneratedArtifactRecord.user_id == user_id)
        if artifact_type is not None:
            stmt = stmt.where(GeneratedArtifactRecord.artifact_type == artifact_type)
        if subject_type is not None:
            stmt = stmt.where(GeneratedArtifactRecord.subject_type == subject_type)
        stmt = stmt.order_by(GeneratedArtifactRecord.created_at.desc(), GeneratedArtifactRecord.id.desc())
        return list(self.session.scalars(stmt).all())

    def get_generated_artifact_by_id(self, artifact_id: int, *, user_id: str) -> GeneratedArtifactRecord | None:
        stmt = select(GeneratedArtifactRecord).where(
            GeneratedArtifactRecord.id == artifact_id,
            GeneratedArtifactRecord.user_id == user_id,
        )
        return self.session.scalars(stmt).first()

    def log_recommendations(
        self,
        *,
        user_id: str,
        context_type: str,
        context_value: str,
        recommendations: list[RecommendationItem],
    ) -> None:
        self.ensure_user(user_id)
        self.session.add(
            RecommendationRunRecord(
                user_id=user_id,
                context_type=context_type,
                context_value=context_value,
                recommendations_json={"items": [item.model_dump(mode="json") for item in recommendations]},
            )
        )
