import argparse
import asyncio
import getpass
import json
import os
import re
from datetime import datetime, timezone

from telethon.errors import ApiIdInvalidError
from telethon import TelegramClient


DEFAULT_QUERIES = [
    "کشتی باری",
    "کشتی تجاری",
    "کشتی اسرائیلی",
    "حمله به کشتی",
    "هدف موشک",
    "MSC Ishika",
    "cargo ship",
]


def env_or_prompt(name, prompt, secret=False):
    value = os.environ.get(name)
    if value:
        return value.strip()
    if secret:
        return getpass.getpass(prompt).strip()
    return input(prompt).strip()


def normalize_api_id(value):
    match = re.search(r"\d+", value)
    if not match:
        raise ValueError("api_id must be the numeric App api_id from my.telegram.org/apps.")
    return int(match.group(0))


def normalize_api_hash(value):
    value = value.strip().strip("'\"")
    match = re.search(r"[0-9a-fA-F]{32}", value)
    if not match:
        raise ValueError("api_hash must be the 32-character App api_hash from my.telegram.org/apps.")
    return match.group(0)


def as_jsonable_message(message, query):
    return {
        "query": query,
        "id": message.id,
        "date": message.date.astimezone(timezone.utc).isoformat() if message.date else None,
        "text": message.text or "",
        "views": message.views,
        "forwards": message.forwards,
        "link": f"https://t.me/TasnimNews/{message.id}",
    }


async def run(args):
    api_id = normalize_api_id(env_or_prompt("TELEGRAM_API_ID", "api_id: "))
    api_hash = normalize_api_hash(env_or_prompt("TELEGRAM_API_HASH", "api_hash: ", secret=True))
    phone = os.environ.get("TELEGRAM_PHONE") or args.phone

    client = TelegramClient(args.session, api_id, api_hash)
    try:
        await client.start(phone=phone)
    except ApiIdInvalidError as exc:
        raise SystemExit(
            "Telegram rejected this api_id/api_hash pair.\n"
            "Use the exact App api_id and App api_hash from the same app at https://my.telegram.org/apps.\n"
            "Do not use RSA public keys, bot tokens, or values from a different app."
        ) from exc

    queries = args.search or DEFAULT_QUERIES
    seen = set()
    rows = []

    for query in queries:
        print(f"\n### search: {query}")
        async for message in client.iter_messages(args.channel, search=query, limit=args.limit):
            if message.id in seen:
                continue
            seen.add(message.id)
            row = as_jsonable_message(message, query)
            rows.append(row)
            text = " ".join(row["text"].split())
            print("=" * 80)
            print(f"{row['date']}  id={row['id']}  {row['link']}")
            print(text[: args.preview])

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            for row in rows:
                f.write(json.dumps(row, ensure_ascii=False) + "\n")
        print(f"\nSaved {len(rows)} messages to {args.output}")
    else:
        print(f"\nFound {len(rows)} unique messages.")

    await client.disconnect()


def parse_args():
    parser = argparse.ArgumentParser(
        description="Search TasnimNews Telegram channel with a logged-in user session."
    )
    parser.add_argument("--channel", default="TasnimNews", help="Telegram channel username")
    parser.add_argument("--session", default="telegram_user", help="Telethon session file prefix")
    parser.add_argument("--phone", default=None, help="Phone number, e.g. +821012345678")
    parser.add_argument("--limit", type=int, default=20, help="Max messages per search query")
    parser.add_argument("--preview", type=int, default=700, help="Preview characters per result")
    parser.add_argument(
        "--search",
        action="append",
        help="Search term. Can be repeated. Defaults to cargo/ship attack terms.",
    )
    parser.add_argument(
        "--output",
        default=f"tasnim_search_{datetime.now().strftime('%Y%m%d_%H%M%S')}.jsonl",
        help="JSONL output path. Use empty string to disable.",
    )
    return parser.parse_args()


if __name__ == "__main__":
    asyncio.run(run(parse_args()))
