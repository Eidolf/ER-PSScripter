"""Add PowerShell knowledge models

Revision ID: 7c89a01e23f4
Revises: 6bd12be6d651
Create Date: 2026-10-27 19:38:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from pgvector.sqlalchemy import Vector

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "7c89a01e23f4"
down_revision: str | Sequence[str] | None = "6bd12be6d651"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Create knowledgesource table
    op.create_table(
        "knowledgesource",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("source_type", sa.String(), nullable=False),
        sa.Column("url", sa.String(), nullable=True),
        sa.Column("trust_level", sa.Float(), nullable=True, server_default="1.0"),
        sa.Column("is_active", sa.Boolean(), nullable=True, server_default="true"),
        sa.Column("auto_refresh", sa.Boolean(), nullable=True, server_default="false"),
        sa.Column("refresh_frequency_hours", sa.Integer(), nullable=True, server_default="168"),
        sa.Column("last_crawled_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_knowledgesource_id"), "knowledgesource", ["id"], unique=False)
    op.create_index(op.f("ix_knowledgesource_name"), "knowledgesource", ["name"], unique=True)
    op.create_index(op.f("ix_knowledgesource_source_type"), "knowledgesource", ["source_type"], unique=False)

    # 2. Create knowledgeentity table
    op.create_table(
        "knowledgeentity",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("canonical_name", sa.String(), nullable=False),
        sa.Column("category", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("tags", sa.JSON(), nullable=True),
        sa.Column("source_id", sa.Integer(), nullable=True),
        sa.Column("source_url", sa.String(), nullable=True),
        sa.Column("source_type", sa.String(), nullable=True, server_default="official_microsoft"),
        sa.Column("ps_edition", sa.String(), nullable=True, server_default="Desktop,Core"),
        sa.Column("min_ps_version", sa.String(), nullable=True),
        sa.Column("module_name", sa.String(), nullable=True),
        sa.Column("trust_level", sa.Float(), nullable=True, server_default="1.0"),
        sa.Column("confidence_score", sa.Float(), nullable=True, server_default="1.0"),
        sa.Column("structured_details", sa.JSON(), nullable=True),
        sa.Column("embedding", Vector(1536), nullable=True),
        sa.Column("content_hash", sa.String(), nullable=True),
        sa.Column("date_indexed", sa.DateTime(), nullable=True),
        sa.Column("date_updated", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["source_id"], ["knowledgesource.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_knowledgeentity_id"), "knowledgeentity", ["id"], unique=False)
    op.create_index(op.f("ix_knowledgeentity_canonical_name"), "knowledgeentity", ["canonical_name"], unique=False)
    op.create_index(op.f("ix_knowledgeentity_category"), "knowledgeentity", ["category"], unique=False)
    op.create_index(op.f("ix_knowledgeentity_module_name"), "knowledgeentity", ["module_name"], unique=False)
    op.create_index(op.f("ix_knowledgeentity_source_type"), "knowledgeentity", ["source_type"], unique=False)
    op.create_index(op.f("ix_knowledgeentity_content_hash"), "knowledgeentity", ["content_hash"], unique=False)

    # 3. Create knowledgerelation table
    op.create_table(
        "knowledgerelation",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("from_entity_id", sa.Integer(), nullable=False),
        sa.Column("to_entity_id", sa.Integer(), nullable=False),
        sa.Column("relation_type", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=True, server_default="1.0"),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["from_entity_id"], ["knowledgeentity.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["to_entity_id"], ["knowledgeentity.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_knowledgerelation_id"), "knowledgerelation", ["id"], unique=False)
    op.create_index(op.f("ix_knowledgerelation_from_entity_id"), "knowledgerelation", ["from_entity_id"], unique=False)
    op.create_index(op.f("ix_knowledgerelation_to_entity_id"), "knowledgerelation", ["to_entity_id"], unique=False)
    op.create_index(op.f("ix_knowledgerelation_relation_type"), "knowledgerelation", ["relation_type"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_knowledgerelation_relation_type"), table_name="knowledgerelation")
    op.drop_index(op.f("ix_knowledgerelation_to_entity_id"), table_name="knowledgerelation")
    op.drop_index(op.f("ix_knowledgerelation_from_entity_id"), table_name="knowledgerelation")
    op.drop_index(op.f("ix_knowledgerelation_id"), table_name="knowledgerelation")
    op.drop_table("knowledgerelation")

    op.drop_index(op.f("ix_knowledgeentity_content_hash"), table_name="knowledgeentity")
    op.drop_index(op.f("ix_knowledgeentity_source_type"), table_name="knowledgeentity")
    op.drop_index(op.f("ix_knowledgeentity_module_name"), table_name="knowledgeentity")
    op.drop_index(op.f("ix_knowledgeentity_category"), table_name="knowledgeentity")
    op.drop_index(op.f("ix_knowledgeentity_canonical_name"), table_name="knowledgeentity")
    op.drop_index(op.f("ix_knowledgeentity_id"), table_name="knowledgeentity")
    op.drop_table("knowledgeentity")

    op.drop_index(op.f("ix_knowledgesource_source_type"), table_name="knowledgesource")
    op.drop_index(op.f("ix_knowledgesource_name"), table_name="knowledgesource")
    op.drop_index(op.f("ix_knowledgesource_id"), table_name="knowledgesource")
    op.drop_table("knowledgesource")
