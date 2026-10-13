"""visualization cache

Revision ID: 0002
Revises: 0001
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: Union[str, Sequence[str], None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "visualizations",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("coding_session_id", sa.String(length=36), nullable=False),
        sa.Column("code_version", sa.Integer(), nullable=False),
        sa.Column("test_case_id", sa.Integer(), nullable=False),
        sa.Column("mode", sa.String(length=8), nullable=False),
        sa.Column("spec", sa.JSON(), nullable=False),
        sa.Column("captions_removed", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["coding_session_id"], ["coding_sessions.id"], name=op.f("fk_visualizations_coding_session_id_coding_sessions"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_visualizations")),
        sa.UniqueConstraint("coding_session_id", "code_version", "test_case_id", "mode", name="uq_visualizations_key"),
    )


def downgrade() -> None:
    op.drop_table("visualizations")
