import asyncio
import json
import mimetypes
import os
import re
import sqlite3
import threading
from concurrent.futures import TimeoutError as FutureTimeoutError
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlencode, urlparse
from urllib.request import urlopen

from telethon import TelegramClient
from telethon.errors import ApiIdInvalidError, SendCodeUnavailableError, SessionPasswordNeededError


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
REQUEST_TIMEOUT = float(os.environ.get("TELE_REQUEST_TIMEOUT", "120"))
TRANSLATE_TIMEOUT = float(os.environ.get("TELE_TRANSLATE_TIMEOUT", "6"))


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


def message_to_dict(message, channel, channel_label=None):
    text = message.text or ""
    media_type = media_kind(message)
    channel = channel.strip().lstrip("@")
    return {
        "id": message.id,
        "channel": channel,
        "channel_label": channel_label or channel,
        "date": message.date.astimezone(timezone.utc).isoformat() if message.date else None,
        "text": text,
        "views": message.views,
        "forwards": message.forwards,
        "replies": getattr(getattr(message, "replies", None), "replies", None),
        "has_media": bool(message.media),
        "media_type": media_type,
        "link": f"https://t.me/{channel}/{message.id}",
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


def truthy(value):
    return str(value or "").strip().lower() in {"1", "true", "yes", "on"}


def translate_term_to_persian(term):
    query = urlencode({"client": "gtx", "sl": "auto", "tl": "fa", "dt": "t", "q": term})
    url = f"https://translate.googleapis.com/translate_a/single?{query}"
    with urlopen(url, timeout=TRANSLATE_TIMEOUT) as response:
        data = json.loads(response.read().decode("utf-8"))
    translated = "".join(segment[0] for segment in data[0] if segment and segment[0]).strip()
    return translated


def expand_search_terms(search, translate_to_persian=False):
    terms = split_search_terms(search)
    if not terms:
        return [None], [], None
    if not translate_to_persian:
        return terms, [], None

    translated = []
    try:
        for term in terms:
            value = translate_term_to_persian(term)
            if value and value.casefold() != term.casefold():
                translated.append(value)
    except Exception as exc:
        return terms, [], f"Persian translation failed: {exc}"

    merged = []
    seen = set()
    for term in [*terms, *translated]:
        key = term.casefold()
        if key not in seen:
            seen.add(key)
            merged.append(term)
    return merged, translated, None


def parse_offset_state(value):
    if isinstance(value, dict):
        return {str(key): int(val) for key, val in value.items() if val}
    raw = str(value or "").strip()
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    if not isinstance(data, dict):
        return {}
    return {str(key): int(val) for key, val in data.items() if val}


def contains_hangul(value):
    return bool(re.search(r"[가-힣]", str(value or "")))


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


def pick_download_dir():
    try:
        import tkinter as tk
        from tkinter import filedialog
    except ImportError as exc:
        raise RuntimeError("Folder picker is not available in this Python environment.") from exc

    root = tk.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    selected = filedialog.askdirectory(
        initialdir=str(get_download_dir()),
        title="Select export folder",
        mustexist=False,
    )
    root.destroy()
    if not selected:
        return {"download_dir": str(get_download_dir()), "cancelled": True}
    return set_download_dir(selected)


class TelegramService:
    def __init__(self):
        self.loop = asyncio.new_event_loop()
        self.thread = threading.Thread(target=self.loop.run_forever, daemon=True)
        self.thread.start()
        self.client = None
        self.client_lock = None
        self.request_timeout = REQUEST_TIMEOUT
        self.api_id = normalize_api_id(os.environ["TELEGRAM_API_ID"]) if os.environ.get("TELEGRAM_API_ID") else None
        self.api_hash = normalize_api_hash(os.environ["TELEGRAM_API_HASH"]) if os.environ.get("TELEGRAM_API_HASH") else None
        self.phone = os.environ.get("TELEGRAM_PHONE")

    def call(self, coro):
        future = asyncio.run_coroutine_threadsafe(coro, self.loop)
        try:
            return future.result(timeout=self.request_timeout)
        except FutureTimeoutError as exc:
            future.cancel()
            raise TimeoutError(f"Telegram request timed out after {self.request_timeout:g} seconds.") from exc

    def lock(self):
        if self.client_lock is None:
            self.client_lock = asyncio.Lock()
        return self.client_lock

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
        async with self.lock():
            if api_id and api_hash:
                client = await self._ensure_client(api_id, api_hash)
            else:
                client = await self._ensure_client()
            self.phone = phone or self.phone
            if await client.is_user_authorized():
                return {"authorized": True, "code_required": False}
            if not self.phone:
                return {"authorized": False, "code_required": False, "phone_required": True}
            try:
                await client.send_code_request(self.phone)
            except SendCodeUnavailableError:
                return {
                    "authorized": False,
                    "code_required": True,
                    "warning": "Telegram is refusing another login code request. If you already received a code, enter it below. Otherwise wait a few minutes before pressing Connect again.",
                }
            return {"authorized": False, "code_required": True}

    async def verify_code(self, code, password=None):
        async with self.lock():
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
        async with self.lock():
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
        limit=100,
        search=None,
        offset_id=0,
        date_from=None,
        date_to=None,
        content_filter="all",
        translate_search=False,
    ):
        async with self.lock():
            client = await self._ensure_client()
            if not await client.is_user_authorized():
                raise RuntimeError("Telegram session is not authorized.")
            channel = channel.strip().lstrip("@")
            final_limit = max(1, min(int(limit), 1000))
            start_dt = parse_local_datetime(date_from)
            end_dt = parse_local_datetime(date_to, end_of_day=True)
            terms, translated_terms, translation_warning = expand_search_terms(search, translate_search)

            rows = await self._search_channel(
                client=client,
                channel=channel,
                channel_label=channel,
                final_limit=final_limit,
                terms=terms,
                offset_id=offset_id,
                start_dt=start_dt,
                end_dt=end_dt,
                content_filter=content_filter,
            )
            next_offset = rows[-1]["id"] if rows else None
            return {
                "channel": channel,
                "mode": "single",
                "items": rows,
                "next_offset": next_offset,
                "effective_searches": [t for t in terms if t],
                "translated_searches": translated_terms,
                "translation_warning": translation_warning,
            }

    async def posts_many(
        self,
        channels,
        limit=100,
        search=None,
        offset_state=None,
        date_from=None,
        date_to=None,
        content_filter="all",
        translate_search=False,
    ):
        async with self.lock():
            client = await self._ensure_client()
            if not await client.is_user_authorized():
                raise RuntimeError("Telegram session is not authorized.")
            final_limit = max(1, min(int(limit), 1000))
            start_dt = parse_local_datetime(date_from)
            end_dt = parse_local_datetime(date_to, end_of_day=True)
            terms, translated_terms, translation_warning = expand_search_terms(search, translate_search)
            offsets = parse_offset_state(offset_state)

            all_rows = []
            channel_rows = {}
            for item in channels:
                channel = str(item.get("id") or "").strip().lstrip("@")
                if not channel:
                    continue
                rows = await self._search_channel(
                    client=client,
                    channel=channel,
                    channel_label=str(item.get("label") or channel),
                    final_limit=final_limit,
                    terms=terms,
                    offset_id=offsets.get(channel, 0),
                    start_dt=start_dt,
                    end_dt=end_dt,
                    content_filter=content_filter,
                )
                channel_rows[channel] = rows
                all_rows.extend(rows)

            all_rows.sort(key=lambda item: (item.get("date") or "", item.get("channel") or "", item.get("id") or 0), reverse=True)
            rows = all_rows[:final_limit]
            next_offsets = {}
            for item in rows:
                channel = item.get("channel")
                if channel:
                    next_offsets[channel] = item.get("id")
            for channel, rows_for_channel in channel_rows.items():
                if not rows_for_channel:
                    next_offsets[channel] = None

            return {
                "channel": "All saved channels",
                "mode": "multi",
                "channels": channels,
                "items": rows,
                "next_offset": next_offsets,
                "effective_searches": [t for t in terms if t],
                "translated_searches": translated_terms,
                "translation_warning": translation_warning,
            }

    async def _search_channel(
        self,
        client,
        channel,
        channel_label,
        final_limit,
        terms,
        offset_id=0,
        start_dt=None,
        end_dt=None,
        content_filter="all",
    ):
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
                by_id[message.id] = message_to_dict(message, channel, channel_label)

        return sorted(by_id.values(), key=lambda item: item["id"], reverse=True)[:final_limit]

    async def download_video(self, channel, message_id):
        async with self.lock():
            client = await self._ensure_client()
            if not await client.is_user_authorized():
                raise RuntimeError("Telegram session is not authorized.")
            channel = str(channel or "").strip().lstrip("@")
            if not channel:
                raise ValueError("Channel is required.")
            message_id = int(message_id)
            message = await client.get_messages(channel, ids=message_id)
            if not message:
                raise RuntimeError("Telegram message was not found.")
            if media_kind(message) != "video":
                raise RuntimeError("This post does not contain a downloadable video.")

            target_dir = get_download_dir() / "media" / file_safe(channel)
            target_dir.mkdir(parents=True, exist_ok=True)
            target = target_dir / f"{file_safe(channel)}_{message_id}.mp4"
            if target.exists() and target.stat().st_size > 0:
                return {"path": str(target), "size": target.stat().st_size, "cached": True}

            path = await client.download_media(message, file=str(target))
            if not path:
                raise RuntimeError("Telegram did not return a downloaded video file.")
            saved = Path(path).resolve()
            return {"path": str(saved), "size": saved.stat().st_size if saved.exists() else None, "cached": False}


init_db()
SERVICE = TelegramService()


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
                f"Channel: @{item.get('channel', channel)} ({item.get('channel_label') or item.get('channel') or channel})",
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
                channel = query.get("channel", ["TasnimNews"])[0]
                if channel == "__all__":
                    data = SERVICE.call(
                        SERVICE.posts_many(
                            channels=configured_channels(),
                            limit=query.get("limit", ["100"])[0],
                            search=query.get("search", [""])[0] or None,
                            offset_state=query.get("offset_state", [""])[0],
                            date_from=query.get("date_from", [""])[0] or None,
                            date_to=query.get("date_to", [""])[0] or None,
                            content_filter=query.get("content_filter", ["all"])[0],
                            translate_search=truthy(query.get("translate_search", ["0"])[0]),
                        )
                    )
                else:
                    data = SERVICE.call(
                        SERVICE.posts(
                            channel=channel,
                            limit=query.get("limit", ["100"])[0],
                            search=query.get("search", [""])[0] or None,
                            offset_id=query.get("offset_id", ["0"])[0] or 0,
                            date_from=query.get("date_from", [""])[0] or None,
                            date_to=query.get("date_to", [""])[0] or None,
                            content_filter=query.get("content_filter", ["all"])[0],
                            translate_search=truthy(query.get("translate_search", ["0"])[0]),
                        )
                    )
                return self.json_response(data)
            return self.serve_static(parsed.path)
        except TimeoutError as exc:
            return self.json_response({"error": str(exc)}, 504)
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
            if self.path == "/api/export":
                return self.json_response(export_items(payload))
            if self.path == "/api/download-video":
                data = SERVICE.call(SERVICE.download_video(payload.get("channel"), payload.get("id")))
                return self.json_response(data)
            if self.path == "/api/settings":
                return self.json_response(set_download_dir(payload.get("download_dir")))
            if self.path == "/api/pick-folder":
                return self.json_response(pick_download_dir())
            if self.path == "/api/channels":
                return self.json_response(set_channels(payload.get("channels") or []))
            return self.json_response({"error": "not found"}, 404)
        except ApiIdInvalidError:
            return self.json_response(
                {"error": "Telegram rejected this api_id/api_hash pair. Use App api_id and App api_hash from the same app."},
                400,
            )
        except TimeoutError as exc:
            return self.json_response({"error": str(exc)}, 504)
        except Exception as exc:
            return self.json_response({"error": str(exc)}, 400)

    def serve_static(self, path):
        if path == "/":
            path = "/index.html"
        target = (WEB / unquote(path).lstrip("/\\")).resolve()
        try:
            target.relative_to(WEB.resolve())
        except ValueError:
            return self.json_response({"error": "not found"}, 404)
        if not target.exists() or not target.is_file():
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
