import asyncio
import json
import mimetypes
import os
import re
import sqlite3
import threading
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from telethon import TelegramClient
from telethon.errors import ApiIdInvalidError, SessionPasswordNeededError


ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"
HOST = "127.0.0.1"
PORT = int(os.environ.get("TELE_UI_PORT", "8788"))
LOCAL_TZ = timezone(timedelta(hours=9))


def load_dotenv(path):
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip("'\"")
        if key and key not in os.environ:
            os.environ[key] = value


load_dotenv(ROOT / ".env")
PORT = int(os.environ.get("TELE_UI_PORT", str(PORT)))
DB_PATH = Path(os.environ.get("TELE_DB_PATH", str(ROOT / "tele_settings.db"))).expanduser()


def normalize_api_id(value):
    match = re.search(r"\d+", str(value or ""))
    if not match:
        raise ValueError("api_id must be the numeric App api_id.")
    return int(match.group(0))


def normalize_api_hash(value):
    value = str(value or "").strip().strip("'\"")
    match = re.search(r"[0-9a-fA-F]{32}", value)
    if not match:
        raise ValueError("api_hash must be the 32-character App api_hash.")
    return match.group(0)


def message_to_dict(message, channel):
    text = message.text or ""
    media_type = media_kind(message)
    return {
        "id": message.id,
        "date": message.date.astimezone(timezone.utc).isoformat() if message.date else None,
        "text": text,
        "views": message.views,
        "forwards": message.forwards,
        "replies": getattr(getattr(message, "replies", None), "replies", None),
        "has_media": bool(message.media),
        "media_type": media_type,
        "link": f"https://t.me/{channel.lstrip('@')}/{message.id}",
    }


def media_kind(message):
    if getattr(message, "photo", None):
        return "photo"
    if getattr(message, "video", None):
        return "video"
    if getattr(message, "gif", None):
        return "gif"
    if getattr(message, "voice", None):
        return "voice"
    if getattr(message, "audio", None):
        return "audio"
    if getattr(message, "sticker", None):
        return "sticker"
    if getattr(message, "document", None):
        return "document"
    if getattr(message, "web_preview", None):
        return "webpage"
    if getattr(message, "poll", None):
        return "poll"
    if getattr(message, "geo", None):
        return "geo"
    return "media" if getattr(message, "media", None) else None


def parse_local_datetime(value, end_of_day=False):
    value = str(value or "").strip()
    if not value:
        return None
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        value = f"{value}T23:59:59" if end_of_day else f"{value}T00:00:00"
    dt = datetime.fromisoformat(value)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=LOCAL_TZ)
    return dt.astimezone(timezone.utc)


def split_search_terms(value):
    terms = []
    for part in re.split(r"[\n,]+", str(value or "")):
        part = part.strip()
        if part:
            terms.append(part)
    return terms


def contains_hangul(value):
    return bool(re.search(r"[가-힣]", str(value or "")))


def translate_search_terms(terms):
    if not terms:
        return []
    try:
        from deep_translator import GoogleTranslator
    except ImportError as exc:
        raise RuntimeError("deep-translator is not installed. Run: py -m pip install --user deep-translator") from exc

    translated = []
    for term in terms:
        translated.append(term)
        if contains_hangul(term):
            for target in ("fa", "en"):
                candidate = GoogleTranslator(source="auto", target=target).translate(term)
                if candidate and candidate.strip():
                    translated.append(candidate.strip())
    deduped = []
    seen = set()
    for term in translated:
        key = term.casefold()
        if key not in seen:
            seen.add(key)
            deduped.append(term)
    return deduped


def parse_channel_config(raw):
    channels = []
    for part in re.split(r"[\n,]+", raw):
        item = part.strip()
        if not item:
            continue
        if "|" in item:
            channel, label = item.split("|", 1)
        else:
            channel, label = item, ""
        channel = channel.strip().lstrip("@")
        label = label.strip()
        if channel:
            channels.append({"id": channel, "label": label or channel})
    return channels or [{"id": "TasnimNews", "label": "TasnimNews"}]


def db_connect():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with db_connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS channels (
                id TEXT PRIMARY KEY,
                label TEXT NOT NULL,
                sort_order INTEGER NOT NULL DEFAULT 0
            )
            """
        )
        row = conn.execute("SELECT value FROM settings WHERE key = 'download_dir'").fetchone()
        if not row:
            conn.execute(
                "INSERT INTO settings(key, value) VALUES('download_dir', ?)",
                (os.environ.get("TELE_DOWNLOAD_DIR", str(ROOT / "downloads")),),
            )
        count = conn.execute("SELECT COUNT(*) AS count FROM channels").fetchone()["count"]
        if count == 0:
            seed = parse_channel_config(os.environ.get("TELEGRAM_CHANNELS", "TasnimNews"))
            conn.executemany(
                "INSERT OR REPLACE INTO channels(id, label, sort_order) VALUES(?, ?, ?)",
                [(item["id"], item["label"], index) for index, item in enumerate(seed)],
            )


def get_setting(key, default=""):
    with db_connect() as conn:
        row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
        return row["value"] if row else default


def set_setting(key, value):
    with db_connect() as conn:
        conn.execute(
            "INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, value),
        )


def configured_channels():
    with db_connect() as conn:
        rows = conn.execute("SELECT id, label FROM channels ORDER BY sort_order, id").fetchall()
    return [{"id": row["id"], "label": row["label"]} for row in rows] or [{"id": "TasnimNews", "label": "TasnimNews"}]


def set_channels(channels):
    normalized = []
    for item in channels:
        if isinstance(item, str):
            parsed = parse_channel_config(item)
            normalized.extend(parsed)
            continue
        channel = str(item.get("id") or "").strip().lstrip("@")
        label = str(item.get("label") or channel).strip()
        if channel:
            normalized.append({"id": channel, "label": label or channel})
    if not normalized:
        raise ValueError("At least one channel is required.")
    with db_connect() as conn:
        conn.execute("DELETE FROM channels")
        conn.executemany(
            "INSERT INTO channels(id, label, sort_order) VALUES(?, ?, ?)",
            [(item["id"], item["label"], index) for index, item in enumerate(normalized)],
        )
    return {"channels": configured_channels()}


def resolve_download_dir(value):
    raw = str(value or "").strip().strip("'\"")
    if not raw:
        raise ValueError("Download directory is empty.")
    path = Path(raw).expanduser()
    if not path.is_absolute():
        path = ROOT / path
    return path.resolve()


def get_download_dir():
    return resolve_download_dir(get_setting("download_dir", str(ROOT / "downloads")))


def set_download_dir(value):
    path = resolve_download_dir(value)
    path.mkdir(parents=True, exist_ok=True)
    set_setting("download_dir", str(path))
    return {"download_dir": str(path)}


class TelegramService:
    def __init__(self):
        self.loop = asyncio.new_event_loop()
        self.thread = threading.Thread(target=self.loop.run_forever, daemon=True)
        self.thread.start()
        self.client = None
        self.api_id = normalize_api_id(os.environ["TELEGRAM_API_ID"]) if os.environ.get("TELEGRAM_API_ID") else None
        self.api_hash = normalize_api_hash(os.environ["TELEGRAM_API_HASH"]) if os.environ.get("TELEGRAM_API_HASH") else None
        self.phone = os.environ.get("TELEGRAM_PHONE")

    def call(self, coro):
        return asyncio.run_coroutine_threadsafe(coro, self.loop).result()

    async def _ensure_client(self, api_id=None, api_hash=None):
        if api_id is not None and api_hash is not None:
            if self.client:
                await self.client.disconnect()
            self.api_id = normalize_api_id(api_id)
            self.api_hash = normalize_api_hash(api_hash)
            self.client = TelegramClient(str(ROOT / "telegram_user"), self.api_id, self.api_hash)

        if not self.client:
            if not self.api_id or not self.api_hash:
                raise RuntimeError("API credentials are not configured.")
            self.client = TelegramClient(str(ROOT / "telegram_user"), self.api_id, self.api_hash)

        if not self.client.is_connected():
            await self.client.connect()
        return self.client

    async def connect(self, api_id, api_hash, phone=None):
        if api_id and api_hash:
            client = await self._ensure_client(api_id, api_hash)
        else:
            client = await self._ensure_client()
        self.phone = phone or self.phone
        if await client.is_user_authorized():
            return {"authorized": True, "code_required": False}
        if not self.phone:
            return {"authorized": False, "code_required": False, "phone_required": True}
        await client.send_code_request(self.phone)
        return {"authorized": False, "code_required": True}

    async def verify_code(self, code, password=None):
        client = await self._ensure_client()
        if not self.phone:
            raise RuntimeError("Phone number is missing. Connect first.")
        try:
            await client.sign_in(self.phone, code)
        except SessionPasswordNeededError:
            if not password:
                return {"authorized": False, "password_required": True}
            await client.sign_in(password=password)
        return {"authorized": await client.is_user_authorized()}

    async def status(self):
        if not self.client and (not self.api_id or not self.api_hash):
            return {"configured": False, "authorized": False}
        await self._ensure_client()
        return {
            "configured": True,
            "authorized": await self.client.is_user_authorized(),
            "session": str(ROOT / "telegram_user.session"),
            "phone_configured": bool(self.phone),
        }

    async def posts(
        self,
        channel,
        limit=30,
        search=None,
        offset_id=0,
        date_from=None,
        date_to=None,
        korean_search=False,
        content_filter="all",
    ):
        client = await self._ensure_client()
        if not await client.is_user_authorized():
            raise RuntimeError("Telegram session is not authorized.")
        channel = channel.strip().lstrip("@")
        final_limit = max(1, min(int(limit), 1000))
        start_dt = parse_local_datetime(date_from)
        end_dt = parse_local_datetime(date_to, end_of_day=True)
        terms = split_search_terms(search)
        if korean_search:
            terms = translate_search_terms(terms)
        if not terms:
            terms = [None]

        by_id = {}
        scan_limit = min(max(final_limit * 3, final_limit), 3000)
        for term in terms:
            kwargs = {"limit": scan_limit}
            if term:
                kwargs["search"] = term
            if offset_id:
                kwargs["offset_id"] = int(offset_id)
            if end_dt:
                kwargs["offset_date"] = end_dt

            async for message in client.iter_messages(channel, **kwargs):
                if start_dt and message.date and message.date < start_dt:
                    break
                if end_dt and message.date and message.date > end_dt:
                    continue
                has_text = bool((message.text or "").strip())
                has_media = bool(message.media)
                if content_filter == "text" and not has_text:
                    continue
                if content_filter == "with_media" and not has_media:
                    continue
                if content_filter == "with_photo" and media_kind(message) != "photo":
                    continue
                if content_filter == "with_video" and media_kind(message) != "video":
                    continue
                by_id[message.id] = message_to_dict(message, channel)

        rows = sorted(by_id.values(), key=lambda item: item["id"], reverse=True)[:final_limit]
        next_offset = rows[-1]["id"] if rows else None
        return {"channel": channel, "items": rows, "next_offset": next_offset, "effective_searches": [t for t in terms if t]}


init_db()
SERVICE = TelegramService()
TRANSLATION_CACHE = {}


def chunk_text(text, size=4500):
    text = text.strip()
    if not text:
        return []
    chunks = []
    while len(text) > size:
        split_at = text.rfind("\n", 0, size)
        if split_at < size // 2:
            split_at = text.rfind(" ", 0, size)
        if split_at < size // 2:
            split_at = size
        chunks.append(text[:split_at].strip())
        text = text[split_at:].strip()
    if text:
        chunks.append(text)
    return chunks


def translate_to_korean(text):
    text = (text or "").strip()
    if not text:
        return ""
    if text in TRANSLATION_CACHE:
        return TRANSLATION_CACHE[text]
    try:
        from deep_translator import GoogleTranslator
    except ImportError as exc:
        raise RuntimeError("deep-translator is not installed. Run: py -m pip install --user deep-translator") from exc

    translator = GoogleTranslator(source="auto", target="ko")
    translated = "\n".join(translator.translate(part) for part in chunk_text(text))
    TRANSLATION_CACHE[text] = translated
    return translated


def translate_items(items):
    rows = []
    for item in items:
        text = item.get("text") or ""
        rows.append(
            {
                "id": item.get("id"),
                "translation_ko": translate_to_korean(text),
            }
        )
    return {"items": rows}


def file_safe(value):
    value = re.sub(r"[^0-9A-Za-z가-힣_-]+", "_", str(value or "telegram"))
    value = value.strip("_")[:60]
    return value or "telegram"


def markdown_text(value):
    return str(value or "").replace("\r\n", "\n").strip()


def build_ai_markdown(channel, search, items, date_from=None, date_to=None):
    lines = [
        f"# Telegram channel posts: @{channel}",
        "",
        f"Search: {search or 'none'}",
        f"Date from: {date_from or 'none'}",
        f"Date to: {date_to or 'none'}",
        f"Count: {len(items)}",
        "",
        "Use this as source material. Preserve dates and links when summarizing.",
        "",
    ]
    for index, item in enumerate(items, 1):
        lines.extend(
            [
                f"## {index}. Post #{item.get('id', '')}",
                "",
                f"Date: {item.get('date', '')}",
                f"Link: {item.get('link', '')}",
            ]
        )
        if item.get("views") is not None:
            lines.append(f"Views: {item.get('views')}")
        if item.get("forwards") is not None:
            lines.append(f"Forwards: {item.get('forwards')}")
        if item.get("replies") is not None:
            lines.append(f"Replies: {item.get('replies')}")
        if item.get("has_media"):
            lines.append(f"Media: {item.get('media_type') or 'yes'}")
        lines.append("")
        if item.get("translation_ko"):
            lines.extend(["### Korean translation", "", markdown_text(item.get("translation_ko")) or "(empty)", ""])
        lines.extend(["### Original", "", markdown_text(item.get("text")) or "(media/no text)", ""])
    return "\n".join(lines)


def export_items(payload):
    channel = str(payload.get("channel") or "telegram").strip().lstrip("@")
    search = str(payload.get("search") or "").strip()
    date_from = str(payload.get("date_from") or "").strip()
    date_to = str(payload.get("date_to") or "").strip()
    items = payload.get("items") or []
    download_dir = get_download_dir()
    download_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    date_part = ""
    if date_from or date_to:
        date_part = f"_{file_safe(date_from or 'start')}_to_{file_safe(date_to or 'end')}"
    suffix = f"_{file_safe(search)}" if search else ""
    path = download_dir / f"{file_safe(channel)}{date_part}{suffix}_{stamp}_ai_posts.md"
    path.write_text(build_ai_markdown(channel, search, items, date_from, date_to), encoding="utf-8")
    return {"path": str(path), "count": len(items)}


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            parsed = urlparse(self.path)
            if parsed.path == "/api/status":
                return self.json_response(SERVICE.call(SERVICE.status()))
            if parsed.path == "/api/channels":
                return self.json_response({"channels": configured_channels()})
            if parsed.path == "/api/settings":
                return self.json_response({"download_dir": str(get_download_dir()), "db_path": str(DB_PATH.resolve())})
            if parsed.path == "/api/posts":
                query = parse_qs(parsed.query)
                data = SERVICE.call(
                    SERVICE.posts(
                        channel=query.get("channel", ["TasnimNews"])[0],
                        limit=query.get("limit", ["30"])[0],
                        search=query.get("search", [""])[0] or None,
                        offset_id=query.get("offset_id", ["0"])[0] or 0,
                        date_from=query.get("date_from", [""])[0] or None,
                        date_to=query.get("date_to", [""])[0] or None,
                        korean_search=query.get("korean_search", ["false"])[0].lower() == "true",
                        content_filter=query.get("content_filter", ["all"])[0],
                    )
                )
                return self.json_response(data)
            return self.serve_static(parsed.path)
        except Exception as exc:
            return self.json_response({"error": str(exc)}, 400)

    def do_POST(self):
        try:
            payload = self.read_json()
            if self.path == "/api/connect":
                data = SERVICE.call(
                    SERVICE.connect(payload.get("api_id"), payload.get("api_hash"), payload.get("phone"))
                )
                return self.json_response(data)
            if self.path == "/api/verify":
                data = SERVICE.call(SERVICE.verify_code(payload.get("code"), payload.get("password")))
                return self.json_response(data)
            if self.path == "/api/translate":
                return self.json_response(translate_items(payload.get("items") or []))
            if self.path == "/api/export":
                return self.json_response(export_items(payload))
            if self.path == "/api/settings":
                return self.json_response(set_download_dir(payload.get("download_dir")))
            if self.path == "/api/channels":
                return self.json_response(set_channels(payload.get("channels") or []))
            return self.json_response({"error": "not found"}, 404)
        except ApiIdInvalidError:
            return self.json_response(
                {"error": "Telegram rejected this api_id/api_hash pair. Use App api_id and App api_hash from the same app."},
                400,
            )
        except Exception as exc:
            return self.json_response({"error": str(exc)}, 400)

    def serve_static(self, path):
        if path == "/":
            path = "/index.html"
        target = (WEB / path.lstrip("/")).resolve()
        if not str(target).startswith(str(WEB.resolve())) or not target.exists() or not target.is_file():
            return self.json_response({"error": "not found"}, 404)
        content_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        data = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length else b"{}"
        return json.loads(raw.decode("utf-8"))

    def json_response(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        print(fmt % args)


def main():
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Telegram UI running at http://{HOST}:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
