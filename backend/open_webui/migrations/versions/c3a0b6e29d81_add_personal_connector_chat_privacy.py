"""Keep personal connector chats private independently of editable chat metadata."""
from alembic import op
import sqlalchemy as sa

revision = 'c3a0b6e29d81'
down_revision = '0bd252b206fb'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('chat', sa.Column('personal_connectors_private', sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade():
    op.drop_column('chat', 'personal_connectors_private')
