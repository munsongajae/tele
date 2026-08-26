# Telegram Channel Reader

Local web UI and CLI helper for searching Telegram channel posts with a Telethon user session.

## Files

- `app.py`: local HTTP server, Telegram session handling, SQLite settings, Markdown export
- Video posts can be downloaded on demand to `downloads/media/<channel>/` from the web UI.
- `web/`: static browser UI
- `tasnim_search.py`: CLI search helper for Telegram channels
- `setup_env.ps1`: prompts for Telegram credentials and writes `.env`
- `.env.example`: environment variable template

## Setup

1. Create or select a Python environment.
2. Install dependencies:

```powershell
python -m pip install -r requirements.txt
```

3. Create `.env`:

```powershell
.\setup_env.ps1
```

Or copy `.env.example` to `.env` and edit the values manually.

## Environment

- `TELEGRAM_API_ID`: numeric app API ID from Telegram
- `TELEGRAM_API_HASH`: 32-character app API hash from the same Telegram app
- `TELEGRAM_PHONE`: phone number used for the user session
- `TELEGRAM_CHANNELS`: comma-separated `channel|label` entries
- `TELE_DOWNLOAD_DIR`: folder for Markdown exports
- `TELE_DB_PATH`: local SQLite settings DB path
- `TELE_UI_PORT`: local web UI port, default `8788`
- `TELE_REQUEST_TIMEOUT`: Telegram request timeout in seconds, default `120`
- `TELE_DOWNLOAD_TIMEOUT`: video download timeout in seconds, default `3600`
- `TELE_TRANSLATE_TIMEOUT`: Persian translation request timeout in seconds, default `6`
- `TELE_AUTO_SHUTDOWN_ON_BROWSER_CLOSE`: set to `1` to stop the server when browser heartbeats stop; default is off.

## Run

```powershell
python app.py
```

Open:

```text
http://127.0.0.1:8788
```

The first login may require entering the Telegram code and, if enabled, the 2FA password.

## CLI Search

```powershell
python tasnim_search.py --channel TasnimNews --search "cargo ship" --limit 20
```

Results are written to a timestamped `.jsonl` file by default. Pass `--output ""` to only print previews.

## Local Data

The following files are local runtime artifacts and are ignored by `.gitignore`:

- `.env`
- `*.session`
- `downloads/`
- `*.db`
