"""Tiny Upstash Redis (REST) client. Serverless functions share no memory, so results and usage counters live here.
Env: KV_REST_API_URL / KV_REST_API_TOKEN (Vercel's Upstash integration) or UPSTASH_REDIS_REST_URL / _TOKEN."""
import json, os
import requests

URL = os.environ.get("KV_REST_API_URL") or os.environ.get("UPSTASH_REDIS_REST_URL")
TOKEN = os.environ.get("KV_REST_API_TOKEN") or os.environ.get("UPSTASH_REDIS_REST_TOKEN")


def available():
    return bool(URL and TOKEN)


def _cmd(*args):
    r = requests.post(URL, headers={"Authorization": f"Bearer {TOKEN}"}, json=[str(a) for a in args], timeout=10)
    r.raise_for_status()
    return r.json().get("result")


def put(key, value, ttl=86400):
    _cmd("SET", key, json.dumps(value), "EX", ttl)


def get(key):
    raw = _cmd("GET", key)
    return json.loads(raw) if raw else None


def delete(key):
    _cmd("DEL", key)


def incr(key, ttl):
    n = int(_cmd("INCR", key))
    if n == 1:
        _cmd("EXPIRE", key, ttl)
    return n
