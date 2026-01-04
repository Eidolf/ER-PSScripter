"""Add system settings

Revision ID: a1447fe9c351
Revises: 8871342d7e4b
Create Date: 2026-01-04 13:46:22.123456

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a1447fe9c351'
down_revision = '8871342d7e4b'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('system_settings',
    sa.Column('key', sa.String(), nullable=False),
    sa.Column('value', sa.String(), nullable=True),
    sa.Column('description', sa.String(), nullable=True),
    sa.Column('is_secret', sa.Boolean(), nullable=True),
    sa.Column('updated_at', sa.DateTime(), nullable=True),
    sa.PrimaryKeyConstraint('key')
    )
    op.create_index(op.f('ix_system_settings_key'), 'system_settings', ['key'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_system_settings_key'), table_name='system_settings')
    op.drop_table('system_settings')
