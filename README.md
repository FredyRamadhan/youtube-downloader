# yt-dlp GUI & Web Wrapper

A simple, modern, and powerful web-based GUI (built with **FastAPI** and a static responsive frontend) alongside the original desktop Tkinter application to wrap `yt-dlp`.

---

## 🌟 Features

- **Web-Based Interface**:
  - Clean, responsive dark-mode UI accessible from any modern browser.
  - Video & playlist metadata preview (title, uploader, views, duration, thumbnail).
  - Format selection:
    - **Video + Audio**: Best available, 1080p, 720p, 480p, 360p, or custom `-f` format strings.
    - **Audio Only**: MP3, M4A, FLAC, WAV, OPUS, with automatic thumbnail cover art embedding.
  - Subtitle options: Manual subs, auto-generated subs, language filters (e.g. `en,es`).
  - Output template & custom directory support.
  - Extra arguments field for any additional `yt-dlp` CLI flags.
  - Real-time download progress bar, speed, ETA, and live streaming console logs via **WebSocket**.
  - Built-in **Downloads Library**: view downloaded files, preview/stream directly in browser (`<video>` / `<audio>` modal), download to device, or delete.
  - Interactive OpenAPI docs at `/docs`.
- **Desktop Tkinter Interface**:
  - Classic lightweight local desktop GUI (`yt-dlp-gui.py`).

---

## 🚀 Quick Start (Web GUI)

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
python3 -m venv ytdlpvenv
source ytdlpvenv/bin/activate

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
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

Open your browser at **[http://127.0.0.1:8000](http://127.0.0.1:8000)**.

---

## 🖥️ Running the Desktop Tkinter GUI

If you prefer the local Tkinter desktop GUI:

```bash
python yt-dlp-gui.py
```

---

## 📡 REST & WebSocket API

The FastAPI server provides endpoints for programmatic usage or custom integrations:

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Serves the web GUI frontend |
| `GET` | `/api/status` | System status (yt-dlp version, ffmpeg presence, active tasks) |
| `POST` | `/api/info` | Fetch metadata & available qualities for a given URL |
| `POST` | `/api/download` | Start a new download task |
| `GET` | `/api/tasks` | List recent download tasks & status |
| `GET` | `/api/tasks/{task_id}` | Get specific task progress and logs |
| `POST` | `/api/tasks/{task_id}/cancel` | Cancel an active download |
| `WS` | `/ws/tasks/{task_id}` | WebSocket stream for live logs and progress events |
| `GET` | `/api/files` | List files in the download folder |
| `GET` | `/api/files/{filename}` | Stream or download a file |
| `DELETE` | `/api/files/{filename}` | Delete a downloaded file |
| `GET` | `/docs` | Swagger interactive OpenAPI documentation |

---

## 📁 Directory Structure

```text
├── app.py              # FastAPI backend & WebSocket handler
├── run_web.sh          # One-click shell launcher
├── requirements.txt    # Project dependencies
├── yt-dlp-gui.py       # Original Tkinter desktop app
├── static/             # Static frontend files
│   ├── index.html      # Responsive web UI
│   ├── style.css       # Clean dark-mode stylesheet
│   └── app.js          # Client-side download manager & WebSocket logic
└── downloads/          # Default directory for downloaded media
```
