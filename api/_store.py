"""Tiny key-value store for the Vercel functions (serverless instances share no memory).
Results and usage counters live here, each with an expiry.

Backends, whichever is configured through a Vercel Marketplace integration:
  • Redis (TCP)           — REDIS_URL  (redis:// or rediss://, e.g. the "Redis" integration)
  • Upstash Redis (REST)  — KV_REST_API_URL + KV_REST_API_TOKEN, or UPSTASH_REDIS_REST_URL + _TOKEN
  • Neon Postgres         — POSTGRES_URL or DATABASE_URL
Variables with a custom prefix (e.g. STORAGE_REDIS_URL) are also recognised.
"""
import json, os
import requests


def _env(*names, suffixes=()):
    """Exact names first, then any variable ending with a suffix — Vercel lets users add a custom prefix when connecting."""
    for n in names:
        if os.environ.get(n):
            return os.environ[n]
    for k, v in sorted(os.environ.items()):
        if v and any(k.endswith(s) for s in suffixes):
            return v
    return None


TCP_REDIS = _env("REDIS_URL", suffixes=("_REDIS_URL",))
if TCP_REDIS and not TCP_REDIS.startswith(("redis://", "rediss://")):
    TCP_REDIS = None
REST_URL = _env("KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", suffixes=("_REST_API_URL", "_REDIS_REST_URL"))
REST_TOKEN = _env("KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_TOKEN", suffixes=("_REST_API_TOKEN", "_REDIS_REST_TOKEN"))
PG_DSN = _env("POSTGRES_URL", "DATABASE_URL", suffixes=("_POSTGRES_URL", "_DATABASE_URL"))

BACKEND = "redis" if TCP_REDIS else "upstash" if (REST_URL and REST_TOKEN) else "postgres" if PG_DSN else None


def available():
    return BACKEND is not None


def env_names():
    """Names (never values) of storage-looking variables, for diagnosing the Vercel setup."""
    keys = ("DATABASE", "POSTGRES", "PG", "REDIS", "KV_", "UPSTASH", "NEON", "STORAGE")
    return sorted(k for k in os.environ if any(t in k for t in keys))


# ---------- Redis over TCP ----------
_client = None


def _tcp():
    global _client
    if _client is None:
        import redis
        _client = redis.from_url(TCP_REDIS, socket_timeout=10, socket_connect_timeout=10, decode_responses=True)
    return _client


# ---------- Upstash Redis over REST ----------
def _rest(*args):
    r = requests.post(REST_URL, headers={"Authorization": f"Bearer {REST_TOKEN}"}, json=[str(a) for a in args], timeout=10)
    r.raise_for_status()
    return r.json().get("result")


# ---------- Postgres (Neon) ----------
_TABLE = "CREATE TABLE IF NOT EXISTS mirrai_kv (k text PRIMARY KEY, v text NOT NULL, exp timestamptz NOT NULL)"


def _pg(sql, args=(), fetch=False):
    import psycopg
    with psycopg.connect(PG_DSN, autocommit=True, connect_timeout=10) as conn, conn.cursor() as cur:
        cur.execute(_TABLE)
        cur.execute(sql, args)
        return cur.fetchone() if fetch else None


# ---------- public API ----------
def put(key, value, ttl=86400):
    if BACKEND == "redis":
        _tcp().set(key, json.dumps(value), ex=ttl)
    elif BACKEND == "upstash":
        _rest("SET", key, json.dumps(value), "EX", ttl)
    else:
        _pg("DELETE FROM mirrai_kv WHERE exp < now()")  # sweep expired rows (results must not outlive 24h)
        _pg("INSERT INTO mirrai_kv (k, v, exp) VALUES (%s, %s, now() + make_interval(secs => %s::float8)) "
            "ON CONFLICT (k) DO UPDATE SET v = excluded.v, exp = excluded.exp", (key, json.dumps(value), ttl))


def get(key):
    if BACKEND == "redis":
        raw = _tcp().get(key)
    elif BACKEND == "upstash":
        raw = _rest("GET", key)
    else:
        row = _pg("SELECT v FROM mirrai_kv WHERE k = %s AND exp > now()", (key,), fetch=True)
        raw = row[0] if row else None
    return json.loads(raw) if raw else None


def delete(key):
    if BACKEND == "redis":
        _tcp().delete(key)
    elif BACKEND == "upstash":
        _rest("DEL", key)
    else:
        _pg("DELETE FROM mirrai_kv WHERE k = %s", (key,))


def incr(key, ttl):
    if BACKEND == "redis":
        n = _tcp().incr(key)
        if n == 1:
            _tcp().expire(key, ttl)
        return n
    if BACKEND == "upstash":
        n = int(_rest("INCR", key))
        if n == 1:
            _rest("EXPIRE", key, ttl)
        return n
    row = _pg("INSERT INTO mirrai_kv (k, v, exp) VALUES (%s, '1', now() + make_interval(secs => %s::float8)) "
              "ON CONFLICT (k) DO UPDATE SET "
              "v = CASE WHEN mirrai_kv.exp < now() THEN '1' ELSE (mirrai_kv.v::int + 1)::text END, "
              "exp = CASE WHEN mirrai_kv.exp < now() THEN excluded.exp ELSE mirrai_kv.exp END "
              "RETURNING v", (key, ttl), fetch=True)
    return int(row[0])
