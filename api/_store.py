"""Tiny key-value store for the Vercel functions (serverless instances share no memory).
Results and usage counters live here, each with an expiry.

Backends, whichever is configured (both come from Vercel Marketplace integrations):
  • Neon Postgres (free plan)  — POSTGRES_URL or DATABASE_URL
  • Upstash Redis (REST)       — KV_REST_API_URL + KV_REST_API_TOKEN, or UPSTASH_REDIS_REST_URL + _TOKEN
"""
import json, os
import requests

PG_DSN = os.environ.get("POSTGRES_URL") or os.environ.get("DATABASE_URL")
REDIS_URL = os.environ.get("KV_REST_API_URL") or os.environ.get("UPSTASH_REDIS_REST_URL")
REDIS_TOKEN = os.environ.get("KV_REST_API_TOKEN") or os.environ.get("UPSTASH_REDIS_REST_TOKEN")


def available():
    return bool(PG_DSN or (REDIS_URL and REDIS_TOKEN))


# ---------- Postgres (Neon) ----------
_TABLE = "CREATE TABLE IF NOT EXISTS mirrai_kv (k text PRIMARY KEY, v text NOT NULL, exp timestamptz NOT NULL)"


def _pg(sql, args=(), fetch=False):
    import psycopg
    with psycopg.connect(PG_DSN, autocommit=True, connect_timeout=10) as conn, conn.cursor() as cur:
        cur.execute(_TABLE)
        cur.execute(sql, args)
        return cur.fetchone() if fetch else None


# ---------- Upstash Redis (REST) ----------
def _redis(*args):
    r = requests.post(REDIS_URL, headers={"Authorization": f"Bearer {REDIS_TOKEN}"}, json=[str(a) for a in args], timeout=10)
    r.raise_for_status()
    return r.json().get("result")


# ---------- public API ----------
def put(key, value, ttl=86400):
    if PG_DSN:
        _pg("DELETE FROM mirrai_kv WHERE exp < now()")  # sweep expired rows (results must not outlive 24h)
        _pg("INSERT INTO mirrai_kv (k, v, exp) VALUES (%s, %s, now() + make_interval(secs => %s::float8)) "
            "ON CONFLICT (k) DO UPDATE SET v = excluded.v, exp = excluded.exp", (key, json.dumps(value), ttl))
    else:
        _redis("SET", key, json.dumps(value), "EX", ttl)


def get(key):
    if PG_DSN:
        row = _pg("SELECT v FROM mirrai_kv WHERE k = %s AND exp > now()", (key,), fetch=True)
        return json.loads(row[0]) if row else None
    raw = _redis("GET", key)
    return json.loads(raw) if raw else None


def delete(key):
    if PG_DSN:
        _pg("DELETE FROM mirrai_kv WHERE k = %s", (key,))
    else:
        _redis("DEL", key)


def incr(key, ttl):
    if PG_DSN:  # atomic counter; restarts at 1 once the previous window has expired
        row = _pg("INSERT INTO mirrai_kv (k, v, exp) VALUES (%s, '1', now() + make_interval(secs => %s::float8)) "
                  "ON CONFLICT (k) DO UPDATE SET "
                  "v = CASE WHEN mirrai_kv.exp < now() THEN '1' ELSE (mirrai_kv.v::int + 1)::text END, "
                  "exp = CASE WHEN mirrai_kv.exp < now() THEN excluded.exp ELSE mirrai_kv.exp END "
                  "RETURNING v", (key, ttl), fetch=True)
        return int(row[0])
    n = int(_redis("INCR", key))
    if n == 1:
        _redis("EXPIRE", key, ttl)
    return n
