import asyncio
import json
import mimetypes
import os
import re
import sqlite3
import shutil
import threading
import time
import webbrowser
from concurrent.futures import TimeoutError as FutureTimeoutError
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlencode, urlparse
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from telethon import TelegramClient
from telethon.errors import ApiIdInvalidError, FloodWaitError, SendCodeUnavailableError, SessionPasswordNeededError


import sys

if getattr(sys, 'frozen', False):
    ROOT = Path(sys.executable).resolve().parent
else:
    ROOT = Path(__file__).resolve().parent


def default_data_root():
    if not getattr(sys, "frozen", False):
        return ROOT
    base = os.environ.get("LOCALAPPDATA") or os.environ.get("APPDATA")
    if base:
        return Path(base) / "TelegramChannelReader"
    return ROOT


DATA_ROOT = Path(os.environ.get("TELE_DATA_DIR", str(default_data_root()))).expanduser()
DATA_ROOT.mkdir(parents=True, exist_ok=True)


def migrate_runtime_file(name):
    if not getattr(sys, "frozen", False):
        return
    source = ROOT / name
    target = DATA_ROOT / name
    if source.exists() and not target.exists():
        shutil.copy2(source, target)


for runtime_file in (".env", "tele_settings.db", "telegram_user.session"):
    migrate_runtime_file(runtime_file)

if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
    WEB = Path(sys._MEIPASS) / "web"
else:
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
load_dotenv(DATA_ROOT / ".env")
PORT = int(os.environ.get("TELE_UI_PORT", str(PORT)))
DB_PATH = Path(os.environ.get("TELE_DB_PATH", str(DATA_ROOT / "tele_settings.db"))).expanduser()
REQUEST_TIMEOUT = float(os.environ.get("TELE_REQUEST_TIMEOUT", "120"))
DOWNLOAD_TIMEOUT = float(os.environ.get("TELE_DOWNLOAD_TIMEOUT", "3600"))
TRANSLATE_TIMEOUT = float(os.environ.get("TELE_TRANSLATE_TIMEOUT", "6"))
AUTO_SHUTDOWN_ON_BROWSER_CLOSE = (
    str(os.environ.get("TELE_AUTO_SHUTDOWN_ON_BROWSER_CLOSE") or "").strip().lower()
    in {"1", "true", "yes", "on"}
)
SESSION_PREFIX = DATA_ROOT / "telegram_user"


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


TRANSLATION_LANGUAGES = {
    "fa": "페르시아어",
    "ru": "러시아어",
    "zh-CN": "중국어",
    "en": "영어",
}
NEWS_TERM_TRANSLATIONS = {
    "미국": {"fa": "آمریکا", "ru": "США", "zh-CN": "美国", "en": "United States"},
    "이란": {"fa": "ایران", "ru": "Иран", "zh-CN": "伊朗", "en": "Iran"},
    "이스라엘": {"fa": "اسرائیل", "ru": "Израиль", "zh-CN": "以色列", "en": "Israel"},
    "러시아": {"fa": "روسیه", "ru": "Россия", "zh-CN": "俄罗斯", "en": "Russia"},
    "우크라이나": {"fa": "اوکراین", "ru": "Украина", "zh-CN": "乌克兰", "en": "Ukraine"},
    "중국": {"fa": "چین", "ru": "Китай", "zh-CN": "中国", "en": "China"},
    "대만": {"fa": "تایوان", "ru": "Тайвань", "zh-CN": "台湾", "en": "Taiwan"},
    "북한": {"fa": "کره شمالی", "ru": "Северная Корея", "zh-CN": "朝鲜", "en": "North Korea"},
    "한국": {"fa": "کره جنوبی", "ru": "Южная Корея", "zh-CN": "韩国", "en": "South Korea"},
    "트럼프": {"fa": "ترامپ", "ru": "Трамп", "zh-CN": "特朗普", "en": "Trump"},
    "푸틴": {"fa": "پوتین", "ru": "Путин", "zh-CN": "普京", "en": "Putin"},
    "젤렌스키": {"fa": "زلنسکی", "ru": "Зеленский", "zh-CN": "泽连斯基", "en": "Zelensky"},
    "하메네이": {"fa": "خامنه‌ای", "ru": "Хаменеи", "zh-CN": "哈梅内伊", "en": "Khamenei"},
    "전쟁": {"fa": "جنگ", "ru": "война", "zh-CN": "战争", "en": "war"},
    "공격": {"fa": "حمله", "ru": "атака", "zh-CN": "袭击", "en": "attack"},
    "공습": {"fa": "حمله هوایی", "ru": "авиаудар", "zh-CN": "空袭", "en": "airstrike"},
    "미사일": {"fa": "موشک", "ru": "ракета", "zh-CN": "导弹", "en": "missile"},
    "드론": {"fa": "پهپاد", "ru": "беспилотник", "zh-CN": "无人机", "en": "drone"},
    "핵": {"fa": "هسته‌ای", "ru": "ядерный", "zh-CN": "核", "en": "nuclear"},
    "협상": {"fa": "مذاکرات", "ru": "переговоры", "zh-CN": "谈判", "en": "negotiations"},
    "휴전": {"fa": "آتش‌بس", "ru": "перемирие", "zh-CN": "停火", "en": "ceasefire"},
    "제재": {"fa": "تحریم", "ru": "санкции", "zh-CN": "制裁", "en": "sanctions"},
    "대통령": {"fa": "رئیس‌جمهور", "ru": "президент", "zh-CN": "总统", "en": "president"},
    "군대": {"fa": "ارتش", "ru": "армия", "zh-CN": "军队", "en": "military"},
    "사망": {"fa": "کشته", "ru": "погиб", "zh-CN": "死亡", "en": "killed"},
    "지진": {"fa": "زلزله", "ru": "землетрясение", "zh-CN": "地震", "en": "earthquake"},
    "폭발": {"fa": "انفجار", "ru": "взрыв", "zh-CN": "爆炸", "en": "explosion"},
    "화재": {"fa": "آتش‌سوزی", "ru": "пожар", "zh-CN": "火灾", "en": "fire"},
    "홍수": {"fa": "سیل", "ru": "наводнение", "zh-CN": "洪水", "en": "flood"},
    "항공기": {"fa": "هواپیما", "ru": "самолёт", "zh-CN": "飞机", "en": "aircraft"},
    "선박": {"fa": "کشتی", "ru": "судно", "zh-CN": "船舶", "en": "ship"},
}
TRANSLATION_CACHE = {}


def normalize_translation_languages(value):
    if isinstance(value, str):
        values = value.split(",")
    elif isinstance(value, (list, tuple, set)):
        values = value
    else:
        values = []
    result = []
    for item in values:
        code = str(item or "").strip()
        if code in TRANSLATION_LANGUAGES and code not in result:
            result.append(code)
    return result


def local_news_translation(term, language):
    normalized = re.sub(r"\s+", " ", str(term or "").strip())
    if normalized in NEWS_TERM_TRANSLATIONS:
        return NEWS_TERM_TRANSLATIONS[normalized].get(language, "")
    words = normalized.split(" ")
    if len(words) > 1 and all(NEWS_TERM_TRANSLATIONS.get(word, {}).get(language) for word in words):
        return " ".join(NEWS_TERM_TRANSLATIONS[word][language] for word in words)
    return ""


def translate_term(term, language):
    if language not in TRANSLATION_LANGUAGES:
        raise ValueError("Unsupported translation language.")
    local_value = local_news_translation(term, language)
    if local_value:
        return local_value
    cache_key = (language, str(term or "").strip().casefold())
    if cache_key in TRANSLATION_CACHE:
        return TRANSLATION_CACHE[cache_key]
    query = urlencode({"client": "gtx", "sl": "auto", "tl": language, "dt": "t", "q": term})
    url = f"https://translate.googleapis.com/translate_a/single?{query}"
    request = Request(url, headers={"User-Agent": "Mozilla/5.0 TelegramChannelReader/1.0"})
    with urlopen(request, timeout=TRANSLATE_TIMEOUT) as response:
        data = json.loads(response.read().decode("utf-8"))
    translated = "".join(segment[0] for segment in data[0] if segment and segment[0]).strip()
    if translated:
        TRANSLATION_CACHE[cache_key] = translated
    return translated


def translation_warning(exc):
    if isinstance(exc, HTTPError) and exc.code == 429:
        return "자동 번역 사용량이 많아 변환하지 못한 검색어는 제외했습니다. 잠시 후 다시 시도해 주세요."
    return "자동 번역에 연결하지 못해 변환하지 못한 검색어는 제외했습니다."


def expand_search_terms(search, translate_languages=None):
    terms = split_search_terms(search)
    if not terms:
        return [None], [], None
    languages = normalize_translation_languages(translate_languages)
    if not languages:
        return terms, [], None

    translated = []
    effective = []
    warning = None
    for term in terms:
        if not contains_hangul(term):
            effective.append(term)
            continue
        for language in languages:
            try:
                value = translate_term(term, language)
                if value and value.casefold() != term.casefold():
                    translated.append(value)
                    effective.append(value)
            except Exception as exc:
                warning = translation_warning(exc)

    merged = []
    seen = set()
    for term in effective:
        key = term.casefold()
        if key not in seen:
            seen.add(key)
            merged.append(term)
    return merged, translated, warning


def translate_result_search(search, translate_languages=None):
    languages = normalize_translation_languages(translate_languages)
    source_terms = [part.strip() for part in re.split(r"[\s,]+", str(search or "")) if part.strip()]
    groups = []
    warning = None
    for term in source_terms:
        if not languages or not contains_hangul(term):
            groups.append([term])
            continue
        alternatives = []
        for language in languages:
            try:
                value = translate_term(term, language)
                if value and value.casefold() not in {item.casefold() for item in alternatives}:
                    alternatives.append(value)
            except Exception as exc:
                warning = translation_warning(exc)
        groups.append(alternatives)
    return {"groups": groups, "warning": warning, "languages": languages}


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
    return channels or [
        {"id": "TasnimNews", "label": "타스님뉴스"},
        {"id": "farsna", "label": "파르스뉴스"},
        {"id": "sepahcybery", "label": "세파 사이버"},
        {"id": "mehrnews", "label": "메흐르뉴스"},
        {"id": "Irna_en", "label": "IRNA 영문"},
        {"id": "iribnews", "label": "IRIB 뉴스"},
        {"id": "Nournews_ir", "label": "누르뉴스"},
    ]


def db_connect():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
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
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS channel_groups (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE COLLATE NOCASE,
                sort_order INTEGER NOT NULL DEFAULT 0
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS channel_group_members (
                group_id INTEGER NOT NULL,
                channel_id TEXT NOT NULL,
                sort_order INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (group_id, channel_id),
                FOREIGN KEY (group_id) REFERENCES channel_groups(id) ON DELETE CASCADE,
                FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
            )
            """
        )
        row = conn.execute("SELECT value FROM settings WHERE key = 'download_dir'").fetchone()
        if not row:
            conn.execute(
                "INSERT INTO settings(key, value) VALUES('download_dir', ?)",
                (os.environ.get("TELE_DOWNLOAD_DIR", str(DATA_ROOT / "downloads")),),
            )
        count = conn.execute("SELECT COUNT(*) AS count FROM channels").fetchone()["count"]
        if count == 0:
            seed = parse_channel_config(os.environ.get("TELEGRAM_CHANNELS", "TasnimNews|타스님뉴스,farsna|파르스뉴스,sepahcybery|세파 사이버,mehrnews|메흐르뉴스,Irna_en|IRNA 영문,iribnews|IRIB 뉴스,Nournews_ir|누르뉴스"))
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
    return [{"id": row["id"], "label": row["label"]} for row in rows] or [
        {"id": "TasnimNews", "label": "타스님뉴스"},
        {"id": "farsna", "label": "파르스뉴스"},
        {"id": "sepahcybery", "label": "세파 사이버"},
        {"id": "mehrnews", "label": "메흐르뉴스"},
        {"id": "Irna_en", "label": "IRNA 영문"},
        {"id": "iribnews", "label": "IRIB 뉴스"},
        {"id": "Nournews_ir", "label": "누르뉴스"},
    ]


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
    unique = []
    seen = set()
    for item in normalized:
        key = item["id"].casefold()
        if key not in seen:
            seen.add(key)
            unique.append(item)
    normalized = unique
    with db_connect() as conn:
        for index, item in enumerate(normalized):
            conn.execute(
                """
                INSERT INTO channels(id, label, sort_order) VALUES(?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET label = excluded.label, sort_order = excluded.sort_order
                """,
                (item["id"], item["label"], index),
            )
        placeholders = ",".join("?" for _ in normalized)
        conn.execute(
            f"DELETE FROM channels WHERE id NOT IN ({placeholders})",
            [item["id"] for item in normalized],
        )
    return {"channels": configured_channels()}


def configured_channel_groups():
    with db_connect() as conn:
        rows = conn.execute(
            """
            SELECT g.id, g.name, m.channel_id, m.sort_order AS member_order
            FROM channel_groups AS g
            LEFT JOIN channel_group_members AS m ON m.group_id = g.id
            ORDER BY g.sort_order, g.id, m.sort_order, m.channel_id
            """
        ).fetchall()
    groups = []
    by_id = {}
    for row in rows:
        group_id = row["id"]
        group = by_id.get(group_id)
        if group is None:
            group = {"id": group_id, "name": row["name"], "channel_ids": []}
            by_id[group_id] = group
            groups.append(group)
        if row["channel_id"]:
            group["channel_ids"].append(row["channel_id"])
    return groups


def channels_for_group(group_id):
    with db_connect() as conn:
        group = conn.execute("SELECT id, name FROM channel_groups WHERE id = ?", (int(group_id),)).fetchone()
        if not group:
            raise ValueError("Monitoring list was not found.")
        rows = conn.execute(
            """
            SELECT c.id, c.label
            FROM channel_group_members AS m
            JOIN channels AS c ON c.id = m.channel_id
            WHERE m.group_id = ?
            ORDER BY m.sort_order, c.sort_order, c.id
            """,
            (group["id"],),
        ).fetchall()
    return group["name"], [{"id": row["id"], "label": row["label"]} for row in rows]


def set_channel_groups(groups):
    if not isinstance(groups, list):
        raise ValueError("Monitoring lists must be an array.")
    channel_ids = {item["id"] for item in configured_channels()}
    normalized = []
    seen_names = set()
    for item in groups:
        name = str(item.get("name") or "").strip()
        if not name:
            raise ValueError("Every monitoring list needs a name.")
        name_key = name.casefold()
        if name_key in seen_names:
            raise ValueError(f"Duplicate monitoring list name: {name}")
        seen_names.add(name_key)
        members = []
        seen_members = set()
        for channel_id in item.get("channel_ids") or []:
            channel_id = str(channel_id or "").strip().lstrip("@")
            if channel_id in channel_ids and channel_id not in seen_members:
                seen_members.add(channel_id)
                members.append(channel_id)
        raw_id = item.get("id")
        normalized.append({
            "id": int(raw_id) if str(raw_id or "").isdigit() else None,
            "name": name,
            "channel_ids": members,
        })

    with db_connect() as conn:
        existing_ids = {row["id"] for row in conn.execute("SELECT id FROM channel_groups")}
        kept_ids = []
        for index, item in enumerate(normalized):
            group_id = item["id"]
            if group_id in existing_ids:
                conn.execute(
                    "UPDATE channel_groups SET name = ?, sort_order = ? WHERE id = ?",
                    (item["name"], index, group_id),
                )
            else:
                cursor = conn.execute(
                    "INSERT INTO channel_groups(name, sort_order) VALUES(?, ?)",
                    (item["name"], index),
                )
                group_id = cursor.lastrowid
            kept_ids.append(group_id)
            conn.execute("DELETE FROM channel_group_members WHERE group_id = ?", (group_id,))
            conn.executemany(
                "INSERT INTO channel_group_members(group_id, channel_id, sort_order) VALUES(?, ?, ?)",
                [(group_id, channel_id, member_index) for member_index, channel_id in enumerate(item["channel_ids"])],
            )
        if kept_ids:
            placeholders = ",".join("?" for _ in kept_ids)
            conn.execute(f"DELETE FROM channel_groups WHERE id NOT IN ({placeholders})", kept_ids)
        else:
            conn.execute("DELETE FROM channel_groups")
    return {"groups": configured_channel_groups()}


def resolve_download_dir(value):
    raw = str(value or "").strip().strip("'\"")
    if not raw:
        raise ValueError("Download directory is empty.")
    path = Path(raw).expanduser()
    if not path.is_absolute():
        path = DATA_ROOT / path
    return path.resolve()


def get_download_dir():
    return resolve_download_dir(get_setting("download_dir", str(DATA_ROOT / "downloads")))


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


LAST_HEARTBEAT = time.time()
HEARTBEAT_RECEIVED = False


def heartbeat_monitor(server):
    global LAST_HEARTBEAT, HEARTBEAT_RECEIVED
    start_time = time.time()
    while True:
        time.sleep(5)
        if HEARTBEAT_RECEIVED:
            if time.time() - LAST_HEARTBEAT > 30:
                print("No heartbeat received for 30 seconds. Shutting down server...")
                threading.Thread(target=server.shutdown, daemon=True).start()
                break
        else:
            if time.time() - start_time > 60:
                print("No initial heartbeat received for 60 seconds. Shutting down server...")
                threading.Thread(target=server.shutdown, daemon=True).start()
                break


class TelegramService:
    def __init__(self):
        self.loop = asyncio.new_event_loop()
        self.thread = threading.Thread(target=self.loop.run_forever, daemon=True)
        self.thread.start()
        self.client = None
        self.client_lock = None
        self.request_timeout = REQUEST_TIMEOUT

        # DB 초기화
        init_db()

        # 환경변수 우선 적용, 없으면 DB에서 조회
        raw_api_id = os.environ.get("TELEGRAM_API_ID") or get_setting("telegram_api_id")
        raw_api_hash = os.environ.get("TELEGRAM_API_HASH") or get_setting("telegram_api_hash")
        
        self.api_id = None
        self.api_hash = None
        self.phone = os.environ.get("TELEGRAM_PHONE") or get_setting("telegram_phone") or None

        if raw_api_id:
            try:
                self.api_id = normalize_api_id(raw_api_id)
            except ValueError:
                pass
        if raw_api_hash:
            try:
                self.api_hash = normalize_api_hash(raw_api_hash)
            except ValueError:
                pass

    def call(self, coro, timeout=None):
        timeout = self.request_timeout if timeout is None else float(timeout)
        future = asyncio.run_coroutine_threadsafe(coro, self.loop)
        try:
            return future.result(timeout=timeout)
        except FutureTimeoutError as exc:
            future.cancel()
            raise TimeoutError(f"Telegram request timed out after {timeout:g} seconds.") from exc

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
            # 입력받은 값을 즉시 로컬 DB에 영구 저장
            set_setting("telegram_api_id", str(self.api_id))
            set_setting("telegram_api_hash", self.api_hash)
            self.client = TelegramClient(str(SESSION_PREFIX), self.api_id, self.api_hash)

        if not self.client:
            if not self.api_id or not self.api_hash:
                raise RuntimeError("API credentials are not configured.")
            self.client = TelegramClient(str(SESSION_PREFIX), self.api_id, self.api_hash)

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
            if self.phone:
                set_setting("telegram_phone", self.phone)
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
                "session": str(SESSION_PREFIX.with_suffix(".session")),
                "phone_configured": bool(self.phone),
            }

    def close(self):
        if self.client:
            future = asyncio.run_coroutine_threadsafe(self.client.disconnect(), self.loop)
            try:
                future.result(timeout=10)
            except Exception:
                pass
        self.loop.call_soon_threadsafe(self.loop.stop)

    async def posts(
        self,
        channel,
        limit=100,
        search=None,
        offset_id=0,
        date_from=None,
        date_to=None,
        content_filter="all",
        translate_languages=None,
    ):
        async with self.lock():
            client = await self._ensure_client()
            if not await client.is_user_authorized():
                raise RuntimeError("Telegram session is not authorized.")
            channel = channel.strip().lstrip("@")
            final_limit = max(1, min(int(limit), 1000))
            start_dt = parse_local_datetime(date_from)
            end_dt = parse_local_datetime(date_to, end_of_day=True)
            terms, translated_terms, translation_warning = expand_search_terms(search, translate_languages)

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
        translate_languages=None,
    ):
        async with self.lock():
            client = await self._ensure_client()
            if not await client.is_user_authorized():
                raise RuntimeError("Telegram session is not authorized.")
            final_limit = max(1, min(int(limit), 1000))
            start_dt = parse_local_datetime(date_from)
            end_dt = parse_local_datetime(date_to, end_of_day=True)
            terms, translated_terms, translation_warning = expand_search_terms(search, translate_languages)
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

            partial = target.with_suffix(target.suffix + ".part")
            if partial.exists():
                partial.unlink()
            path = await client.download_media(message, file=str(partial))
            if not path:
                raise RuntimeError("Telegram did not return a downloaded video file.")
            saved = Path(path).resolve()
            if not saved.exists() or saved.stat().st_size <= 0:
                raise RuntimeError("Telegram did not return a downloaded video file.")
            saved.replace(target)
            return {"path": str(target), "size": target.stat().st_size if target.exists() else None, "cached": False}


SERVICE = None


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
            if parsed.path == "/api/channel-groups":
                return self.json_response({"groups": configured_channel_groups()})
            if parsed.path == "/api/settings":
                return self.json_response({"download_dir": str(get_download_dir()), "db_path": str(DB_PATH.resolve())})
            if parsed.path == "/favicon.ico":
                self.send_response(204)
                self.end_headers()
                return
            if parsed.path == "/api/posts":
                query = parse_qs(parsed.query)
                channel = query.get("channel", ["TasnimNews"])[0]
                group_name = None
                if channel.startswith("__group__:"):
                    group_id = channel.split(":", 1)[1]
                    group_name, selected_channels = channels_for_group(group_id)
                    if not selected_channels:
                        raise ValueError("This monitoring list has no channels. Add at least one channel in Settings.")
                else:
                    selected_channels = configured_channels() if channel == "__all__" else None
                if selected_channels is not None:
                    data = SERVICE.call(
                        SERVICE.posts_many(
                            channels=selected_channels,
                            limit=query.get("limit", ["100"])[0],
                            search=query.get("search", [""])[0] or None,
                            offset_state=query.get("offset_state", [""])[0],
                            date_from=query.get("date_from", [""])[0] or None,
                            date_to=query.get("date_to", [""])[0] or None,
                            content_filter=query.get("content_filter", ["all"])[0],
                            translate_languages=(
                                query.get("translate_languages", [""])[0]
                                or ("fa" if truthy(query.get("translate_search", ["0"])[0]) else "")
                            ),
                        )
                    )
                    if group_name:
                        data["channel"] = group_name
                        data["group_name"] = group_name
                        data["mode"] = "group"
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
                            translate_languages=(
                                query.get("translate_languages", [""])[0]
                                or ("fa" if truthy(query.get("translate_search", ["0"])[0]) else "")
                            ),
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
            if self.path == "/api/heartbeat":
                global LAST_HEARTBEAT, HEARTBEAT_RECEIVED
                LAST_HEARTBEAT = time.time()
                HEARTBEAT_RECEIVED = True
                return self.json_response({"status": "ok"})

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
            if self.path == "/api/translate-search":
                return self.json_response(
                    translate_result_search(payload.get("search"), payload.get("languages"))
                )
            if self.path == "/api/download-video":
                data = SERVICE.call(
                    SERVICE.download_video(payload.get("channel"), payload.get("id")),
                    timeout=DOWNLOAD_TIMEOUT,
                )
                return self.json_response(data)
            if self.path == "/api/settings":
                return self.json_response(set_download_dir(payload.get("download_dir")))
            if self.path == "/api/pick-folder":
                return self.json_response(pick_download_dir())
            if self.path == "/api/channels":
                return self.json_response(set_channels(payload.get("channels") or []))
            if self.path == "/api/channel-groups":
                return self.json_response(set_channel_groups(payload.get("groups") or []))
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


def open_browser():
    import time
    time.sleep(0.5)
    webbrowser.open(f"http://{HOST}:{PORT}")


def main():
    global SERVICE
    import sys
    try:
        server = ThreadingHTTPServer((HOST, PORT), Handler)
    except OSError as e:
        print(f"Error: Could not bind to port {PORT}. Is another instance running? {e}", file=sys.stderr)
        sys.exit(1)

    print(f"Telegram UI running at http://{HOST}:{PORT}")
    SERVICE = TelegramService()

    if AUTO_SHUTDOWN_ON_BROWSER_CLOSE:
        threading.Thread(target=heartbeat_monitor, args=(server,), daemon=True).start()

    threading.Thread(target=open_browser, daemon=True).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        SERVICE.close()
        server.server_close()


if __name__ == "__main__":
    main()
