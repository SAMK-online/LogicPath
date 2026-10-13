FROM python:3.13-slim
WORKDIR /srv
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend backend
COPY shared shared
WORKDIR /srv/backend
# SQLite lives on a mounted persistent volume (see README, "Deployment").
ENV DATABASE_URL=sqlite:////data/socratic.db FIXTURES_DIR=/srv/shared/problem-fixtures ENV=production COOKIE_SECURE=true
VOLUME /data
EXPOSE 8100
# Single worker on purpose: SQLite has one writer and the rate limiter is in-process.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8100 --proxy-headers --forwarded-allow-ips='*'"]
