"""Add category to snippets

Revision ID: 3493ac4f128b
Revises: a1447fe9c351
Create Date: 2026-01-04 14:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '3493ac4f128b'
down_revision = 'a1447fe9c351'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('snippet', sa.Column('category', sa.String(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('snippet') as batch_op:
        batch_op.drop_column('category')
