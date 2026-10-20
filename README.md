# yt-dlp GUI & Web Wrapper

A simple, modern, and powerful web-based GUI (built with **FastAPI** and a static responsive frontend) alongside the original desktop Tkinter application to wrap `yt-dlp`.

---

## Features

- **Web-Based Interface**:
  - Clean, responsive dark-mode UI accessible from any modern browser.
  - Video & playlist metadata preview (title, uploader, views, duration, thumbnail).
  - Format selection:
    - **Video + Audio**: Best available, 1080p, 720p, 480p, 360p, or custom `-f` format strings.
    - **Audio Only**: MP3, M4A, FLAC, WAV, OPUS, with automatic thumbnail cover art embedding.
  - Subtitle options: Manual subs, auto-generated subs, language filters (e.g. `en,es`).
  - Output template support, plus an optional server-side copy path.
  - Extra arguments field for any additional `yt-dlp` CLI flags.
  - Real-time download progress bar, speed and ETA via **WebSocket**.
  - Finished files are handed to the **browser's own download manager** (saved to your normal Downloads folder). The server stages files in the system temp dir and deletes them after transfer.
  - Interactive OpenAPI docs at `/docs`.
- **Desktop Tkinter Interface**:
  - Classic lightweight local desktop GUI (`yt-dlp-gui.py`).

---

## Docker

### 1. Requirements

Ensure docker is installed on your system

### 2. Build the Image

In the source code directory:
```bash
    docker build -t yt-downloader .
```

### 3. Run Container
```bash
    docker run \
    --name yt-dlp-gui
    -p 8002:8002
    yt-downloader:latest
```
### 4. Open in browser 

Open your browser at **[http://127.0.0.1:8002](http://127.0.0.1:8002

## Manual Start

### 1. Requirements

Ensure `ffmpeg` is installed on your system:
```bash
# Ubuntu / Debian
sudo apt install ffmpeg

# Arch Linux
sudo pacman -S ffmpeg

# macOS
brew install ffmpeg
```

### 2. Setup Virtual Environment & Dependencies

```bash
# Create and activate virtual environment (if not already created)
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 3. Run the Web GUI

You can start the web server using either:

```bash
./run_web.sh
```

or directly with Python:

```bash
python app.py
```

or with Uvicorn:

```bash
uvicorn app:app --host 0.0.0.0 --port 8002 --reload
```

Open your browser at **[http://127.0.0.1:8002](http://127.0.0.1:8002)**.

---


## REST & WebSocket API

The FastAPI server provides endpoints for programmatic usage or custom integrations:

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Serves the web GUI frontend |
| `GET` | `/api/status` | System status (yt-dlp version, ffmpeg presence, active tasks) |
| `POST` | `/api/info` | Fetch metadata & available qualities for a given URL |
| `POST` | `/api/download` | Start a new download task |
| `GET` | `/api/tasks` | List recent download tasks & status |
| `GET` | `/api/tasks/{task_id}` | Get specific task progress |
| `POST` | `/api/tasks/{task_id}/cancel` | Cancel an active download |
| `GET` | `/api/tasks/{task_id}/files/{index}` | Download a finished file (attachment) |
| `WS` | `/ws/tasks/{task_id}` | WebSocket stream for live progress events |
| `GET` | `/docs` | Swagger interactive OpenAPI documentation |

---

## Directory Structure

```text
├── app.py              # FastAPI backend & WebSocket handler
├── run_web.sh          # One-click shell launcher
├── requirements.txt    # Project dependencies
├── yt-dlp-gui.py       # Original Tkinter desktop app
├── static/             # Static frontend files
│   ├── index.html      # Responsive web UI
│   ├── style.css       # Clean dark-mode stylesheet
│   └── app.js          # Client-side download manager & WebSocket logic
```