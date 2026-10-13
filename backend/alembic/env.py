from logging.config import fileConfig

from alembic import context

from app.core.config import get_settings
from app.db.base import Base
from app.db.session import make_engine
import app.models  # noqa: F401  (register tables)

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)
target_metadata = Base.metadata
url = get_settings().database_url


def run_migrations_offline() -> None:
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True, render_as_batch=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    # Tests can hand us an already-built connection via config.attributes.
    connection = config.attributes.get("connection")
    if connection is not None:
        context.configure(connection=connection, target_metadata=target_metadata, render_as_batch=True)
        with context.begin_transaction():
            context.run_migrations()
        return
    engine = make_engine(url)
    with engine.connect() as conn:
        # render_as_batch: SQLite can't ALTER most things in place.
        context.configure(connection=conn, target_metadata=target_metadata, render_as_batch=True, compare_type=True)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
