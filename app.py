import asyncio
import json
import os
import re
import shlex
import shutil
import sys
import tempfile
import time
import uuid
from pathlib import Path
from typing import Dict, List, Optional, Set

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
import yt_dlp

app = FastAPI(title="yt-dlp Web GUI", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"

# Downloads are staged in a per-task directory inside the system temp folder
# (never in the source tree). Finished files are handed over to the browser's
# own download manager and the staged copy is deleted afterwards.
STAGING_ROOT = Path(tempfile.gettempdir()) / "yt-dlp-gui"
STAGING_ROOT.mkdir(parents=True, exist_ok=True)

# Staged files are dropped a while after a task finishes so the browser has
# time to fetch them (fallback in case the auto-download was blocked).
STAGING_TTL_SECONDS = 30 * 60


def _sweep_stale_staging() -> None:
    """Remove staging leftovers from previous runs (tasks do not survive restarts)."""
    now = time.time()
    for entry in STAGING_ROOT.iterdir():
        try:
            if now - entry.stat().st_mtime < 300:
                continue
            if entry.is_dir():
                shutil.rmtree(entry, ignore_errors=True)
            else:
                entry.unlink(missing_ok=True)
        except OSError:
            continue


_sweep_stale_staging()


def get_yt_dlp_executable() -> str:
    """Find the best yt-dlp binary (venv, system PATH, or fallback)."""
    # 1. Active Python environment
    venv_bin = Path(sys.prefix) / "bin" / "yt-dlp"
    if venv_bin.is_file() and os.access(venv_bin, os.X_OK):
        return str(venv_bin)

    # 2. Workspace ytdlpvenv
    workspace_venv = BASE_DIR / "ytdlpvenv" / "bin" / "yt-dlp"
    if workspace_venv.is_file() and os.access(workspace_venv, os.X_OK):
        return str(workspace_venv)

    # 3. System PATH
    which_bin = shutil.which("yt-dlp")
    if which_bin:
        return which_bin

    return sys.executable


# --- Pydantic Models ---
class DownloadRequest(BaseModel):
    url: str = Field(..., description="URL of the video or playlist")
    download_type: str = Field(default="video", description="'video' or 'audio'")
    video_quality: str = Field(default="best", description="e.g. best, 1080p, 720p, 480p, 360p or custom format")
    audio_format: str = Field(default="best", description="e.g. best, mp3, m4a, wav, flac, opus")
    embed_thumbnail: bool = Field(default=True, description="Embed thumbnail (for audio)")
    embed_subs: bool = Field(default=False, description="Embed subtitles into video")
    subs: bool = Field(default=False, description="Download manual subtitles")
    auto_subs: bool = Field(default=False, description="Download auto-generated subtitles")
    sub_langs: str = Field(default="", description="Subtitle languages comma-separated, e.g. 'en,es'")
    output_template: str = Field(default="%(title)s [%(id)s].%(ext)s", description="Output filename template")
    output_path: Optional[str] = Field(default="", description="Target directory for downloads")
    extra_args: str = Field(default="", description="Additional CLI arguments for yt-dlp")


class InfoRequest(BaseModel):
    url: str


class DownloadTask:
    def __init__(self, task_id: str, request: DownloadRequest, cmd: List[str], output_dir: Path,
                 keep_server_copy: bool = False):
        self.task_id = task_id
        self.request = request
        self.cmd = cmd
        self.output_dir = output_dir
        self.keep_server_copy = keep_server_copy
        self.output_files: List[Path] = []
        self.cleanup_handle: Optional[asyncio.Task] = None
        self.status = "queued"  # queued, downloading, postprocessing, completed, error, cancelled
        self.percent: float = 0.0
        self.speed: str = ""
        self.eta: str = ""
        self.total_size: str = ""
        self.current_filename: str = ""
        self.created_at = time.time()
        self.completed_at: Optional[float] = None
        self.return_code: Optional[int] = None
        self.error_message: Optional[str] = None
        self.process: Optional[asyncio.subprocess.Process] = None
        self.subscribers: Set[asyncio.Queue] = set()

    def to_dict(self) -> dict:
        return {
            "task_id": self.task_id,
            "url": self.request.url,
            "download_type": self.request.download_type,
            "status": self.status,
            "percent": self.percent,
            "speed": self.speed,
            "eta": self.eta,
            "total_size": self.total_size,
            "current_filename": self.current_filename,
            "created_at": self.created_at,
            "completed_at": self.completed_at,
            "return_code": self.return_code,
            "error_message": self.error_message,
        }

    async def broadcast(self, message: dict):
        dead = []
        for q in self.subscribers:
            try:
                q.put_nowait(message)
            except Exception:
                dead.append(q)
        for q in dead:
            self.subscribers.discard(q)


# Active / historical tasks
tasks_lock = asyncio.Lock()
tasks: Dict[str, DownloadTask] = {}

PROGRESS_RE = re.compile(
    r'\[download\]\s+([0-9\.]+)%\s+of\s+~?([0-9\.]+\w+)(?:\s+at\s+([0-9\.]+\w+/s))?(?:\s+ETA\s+([0-9:]+))?'
)
PROGRESS_100_RE = re.compile(r'\[download\]\s+100(?:\.0)?%')
DESTINATION_RE = re.compile(r'\[(?:download|ExtractAudio|Merger)\]\s+Destination:\s*(.+)')


def format_duration(seconds: Optional[float]) -> str:
    if not seconds:
        return "N/A"
    seconds = int(seconds)
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    secs = seconds % 60
    if hours > 0:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes:02d}:{secs:02d}"


def collect_output_files(root: Path) -> List[Path]:
    """Final files produced by a task (ignores yt-dlp partial/temp artifacts)."""
    temp_suffixes = {".part", ".ytdl", ".temp"}
    files = [
        p for p in root.rglob("*")
        if p.is_file() and not p.name.startswith(".") and p.suffix.lower() not in temp_suffixes
    ]
    return sorted(files, key=lambda p: p.stat().st_mtime)


def cleanup_task_staging(task: "DownloadTask") -> None:
    """Delete the task's staged copy (never touches user-provided output dirs)."""
    if task.keep_server_copy:
        return
    handle = task.cleanup_handle
    if handle and handle is not asyncio.current_task() and not handle.done():
        handle.cancel()
    try:
        if task.output_dir.exists() and task.output_dir.is_relative_to(STAGING_ROOT):
            shutil.rmtree(task.output_dir, ignore_errors=True)
    except OSError:
        pass


async def _expire_staging(task: "DownloadTask") -> None:
    """Fallback cleanup for staged files the browser never fetched."""
    try:
        await asyncio.sleep(STAGING_TTL_SECONDS)
    except asyncio.CancelledError:
        return
    cleanup_task_staging(task)


async def run_download_process(task: DownloadTask):
    task.status = "downloading"
    await task.broadcast({
        "type": "status",
        "task_id": task.task_id,
        "status": task.status,
    })

    try:
        task.process = await asyncio.create_subprocess_exec(
            *task.cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            cwd=str(task.output_dir)
        )

        # Read yt-dlp output, but only extract progress/status metrics —
        # raw output is never stored or forwarded to clients.
        while True:
            line_bytes = await task.process.stdout.readline()
            if not line_bytes:
                break
            line = line_bytes.decode('utf-8', errors='replace').rstrip('\r\n')
            if not line:
                continue

            # Check for destination file
            dest_match = DESTINATION_RE.search(line)
            if dest_match:
                task.current_filename = Path(dest_match.group(1).strip()).name

            # Parse download progress
            p_match = PROGRESS_RE.search(line)
            if p_match:
                task.status = "downloading"
                try:
                    task.percent = float(p_match.group(1))
                except ValueError:
                    pass
                if p_match.group(2):
                    task.total_size = p_match.group(2)
                if p_match.group(3):
                    task.speed = p_match.group(3)
                if p_match.group(4):
                    task.eta = p_match.group(4)

                await task.broadcast({
                    "type": "progress",
                    "task_id": task.task_id,
                    "percent": task.percent,
                    "speed": task.speed,
                    "eta": task.eta,
                    "total_size": task.total_size,
                    "status": task.status,
                    "filename": task.current_filename
                })
            elif PROGRESS_100_RE.search(line):
                task.percent = 100.0
                await task.broadcast({
                    "type": "progress",
                    "task_id": task.task_id,
                    "percent": 100.0,
                    "speed": task.speed,
                    "eta": "00:00",
                    "total_size": task.total_size,
                    "status": task.status,
                    "filename": task.current_filename
                })
            elif "[ExtractAudio]" in line or "[Merger]" in line or "[Fixup" in line:
                task.status = "postprocessing"

        return_code = await task.process.wait()
        task.return_code = return_code
        task.completed_at = time.time()

        if return_code == 0:
            task.status = "completed"
            task.percent = 100.0
            task.output_files = collect_output_files(task.output_dir)
            if not task.keep_server_copy:
                task.cleanup_handle = asyncio.create_task(_expire_staging(task))
        else:
            if task.status != "cancelled":
                task.status = "error"
                task.error_message = f"Process exited with code {return_code}"
            cleanup_task_staging(task)

        await task.broadcast({
            "type": "complete",
            "task_id": task.task_id,
            "status": task.status,
            "return_code": return_code,
            "error": task.error_message,
            "files": [p.name for p in task.output_files],
            "kept": task.keep_server_copy,
        })

    except asyncio.CancelledError:
        task.status = "cancelled"
        task.completed_at = time.time()
        if task.process and task.process.returncode is None:
            try:
                task.process.terminate()
            except Exception:
                pass
        cleanup_task_staging(task)
        await task.broadcast({
            "type": "complete",
            "task_id": task.task_id,
            "status": "cancelled",
        })
    except Exception as e:
        task.status = "error"
        task.error_message = str(e)
        task.completed_at = time.time()
        cleanup_task_staging(task)
        await task.broadcast({
            "type": "complete",
            "task_id": task.task_id,
            "status": "error",
            "error": str(e),
        })


# --- API Routes ---

@app.get("/api/status")
async def get_system_status():
    ffmpeg_bin = shutil.which("ffmpeg")

    yt_ver = None
    try:
        yt_ver = yt_dlp.version.__version__
    except Exception:
        pass

    return {
        "yt_dlp_version": yt_ver,
        "ffmpeg_available": bool(ffmpeg_bin),
        "active_tasks_count": sum(1 for t in tasks.values() if t.status in ("queued", "downloading", "postprocessing"))
    }


def _extract_info_sync(url: str):
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'skip_download': True,
        'extract_flat': 'in_playlist',
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        return ydl.extract_info(url, download=False)


@app.post("/api/info")
async def fetch_info(req: InfoRequest):
    if not req.url or not req.url.strip():
        raise HTTPException(status_code=400, detail="URL cannot be empty")

    url = req.url.strip()

    try:
        info = await asyncio.to_thread(_extract_info_sync, url)
        if not info:
            raise HTTPException(status_code=404, detail="Could not extract metadata for this URL")

        # Collect video qualities available
        formats = info.get("formats", [])
        resolutions = set()
        for f in formats:
            h = f.get("height")
            if h and f.get("vcodec") != "none":
                resolutions.add(h)
        sorted_res = [f"{h}p" for h in sorted(resolutions, reverse=True)]

        return {
            "title": info.get("title") or "Unknown Title",
            "id": info.get("id"),
            "uploader": info.get("uploader") or info.get("channel") or "Unknown Uploader",
            "duration": info.get("duration"),
            "duration_formatted": format_duration(info.get("duration")),
            "thumbnail": info.get("thumbnail"),
            "view_count": info.get("view_count"),
            "webpage_url": info.get("webpage_url") or url,
            "description": (info.get("description") or "")[:280],
            "available_resolutions": sorted_res,
            "is_playlist": info.get("_type") == "playlist" or "entries" in info,
            "playlist_count": len(info.get("entries", [])) if "entries" in info else None,
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error extracting info: {str(e)}")


@app.post("/api/download")
async def start_download(req: DownloadRequest):
    url = req.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="URL cannot be empty")

    # Target directory: staged in system temp by default (delivered to the
    # browser afterwards), or kept permanently when the user names a server path.
    keep_server_copy = False
    if req.output_path and req.output_path.strip():
        custom_path = Path(req.output_path.strip()).expanduser()
        try:
            custom_path.mkdir(parents=True, exist_ok=True)
            target_dir = custom_path
            keep_server_copy = True
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Cannot use output directory: {e}")
    else:
        target_dir = Path(tempfile.mkdtemp(prefix="task-", dir=str(STAGING_ROOT)))

    # Build yt-dlp command
    yt_bin = get_yt_dlp_executable()
    cmd: List[str] = [yt_bin] if not yt_bin.endswith("python") and not yt_bin.endswith("python3") else [yt_bin, "-m", "yt_dlp"]

    # Basic streaming flags
    cmd.extend(["--newline", "--no-colors"])

    # Download type
    if req.download_type == "audio":
        cmd.append("-x")
        audio_fmt = req.audio_format or "best"
        cmd.extend(["--audio-format", audio_fmt])
        if req.embed_thumbnail and audio_fmt == "mp3":
            cmd.extend(["--embed-thumbnail", "--ppa", "ThumbnailsConvertor+FFmpegMetadata"])
        elif req.embed_thumbnail:
            cmd.append("--embed-thumbnail")
    else:
        quality = req.video_quality
        quality_presets = {
            "1080p": "bv*[height<=1080][ext=mp4]+ba*[ext=m4a]/b[ext=mp4][height<=1080]/bv*[height<=1080]+ba/b[height<=1080]",
            "720p": "bv*[height<=720][ext=mp4]+ba*[ext=m4a]/b[ext=mp4][height<=720]/bv*[height<=720]+ba/b[height<=720]",
            "480p": "bv*[height<=480][ext=mp4]+ba*[ext=m4a]/b[ext=mp4][height<=480]/bv*[height<=480]+ba/b[height<=480]",
            "360p": "bv*[height<=360][ext=mp4]+ba*[ext=m4a]/b[ext=mp4][height<=360]/bv*[height<=360]+ba/b[height<=360]",
            "best": "bestvideo*+bestaudio/best",
        }
        if quality in quality_presets:
            cmd.extend(["-f", quality_presets[quality]])
        elif quality and quality != "best":
            cmd.extend(["-f", quality])

        if req.embed_subs:
            cmd.append("--embed-subs")

    # Output path & template
    cmd.extend(["-P", str(target_dir)])
    out_tmpl = req.output_template.strip() if req.output_template else "%(title)s [%(id)s].%(ext)s"
    cmd.extend(["-o", out_tmpl])

    # Subtitles
    if req.subs:
        cmd.append("--write-sub")
    if req.auto_subs:
        cmd.append("--write-auto-sub")
    if (req.subs or req.auto_subs) and req.sub_langs.strip():
        cmd.extend(["--sub-langs", req.sub_langs.strip()])

    # Extra arguments
    if req.extra_args and req.extra_args.strip():
        cmd.extend(shlex.split(req.extra_args.strip()))

    # Target URL
    cmd.append(url)

    task_id = str(uuid.uuid4())[:8]
    task = DownloadTask(task_id, req, cmd, target_dir, keep_server_copy=keep_server_copy)

    async with tasks_lock:
        tasks[task_id] = task

    # Spawn background task
    asyncio.create_task(run_download_process(task))

    return {
        "task_id": task_id,
        "status": "queued",
    }


@app.get("/api/tasks")
async def list_tasks():
    async with tasks_lock:
        return [t.to_dict() for t in sorted(tasks.values(), key=lambda x: x.created_at, reverse=True)]


@app.get("/api/tasks/{task_id}")
async def get_task_details(task_id: str):
    async with tasks_lock:
        task = tasks.get(task_id)
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        return task.to_dict()


@app.post("/api/tasks/{task_id}/cancel")
async def cancel_task(task_id: str):
    async with tasks_lock:
        task = tasks.get(task_id)
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")

        if task.status in ("completed", "error", "cancelled"):
            return {"task_id": task_id, "status": task.status, "message": "Task already ended"}

        task.status = "cancelled"
        if task.process and task.process.returncode is None:
            try:
                task.process.terminate()
            except Exception as e:
                try:
                    task.process.kill()
                except Exception:
                    pass
        return {"task_id": task_id, "status": "cancelled", "message": "Task cancellation requested"}


@app.websocket("/ws/tasks/{task_id}")
async def task_websocket(websocket: WebSocket, task_id: str):
    await websocket.accept()

    task: Optional[DownloadTask] = None
    async with tasks_lock:
        task = tasks.get(task_id)

    if not task:
        await websocket.send_json({"type": "error", "message": "Task not found"})
        await websocket.close()
        return

    queue = asyncio.Queue()
    task.subscribers.add(queue)

    # Send initial state
    await websocket.send_json({
        "type": "init",
        "task": task.to_dict(),
    })

    try:
        while True:
            # We listen for messages from queue, or client ping/cancellation
            receiver = asyncio.create_task(websocket.receive_text())
            dispatcher = asyncio.create_task(queue.get())

            done, pending = await asyncio.wait(
                [receiver, dispatcher],
                return_when=asyncio.FIRST_COMPLETED
            )

            for p in pending:
                p.cancel()

            if dispatcher in done:
                msg = dispatcher.result()
                await websocket.send_json(msg)

            if receiver in done:
                client_text = receiver.result()
                try:
                    client_data = json.loads(client_text)
                    if client_data.get("action") == "cancel":
                        await cancel_task(task_id)
                except Exception:
                    pass

    except (WebSocketDisconnect, asyncio.CancelledError):
        pass
    finally:
        task.subscribers.discard(queue)


# --- Task File Delivery (browser download) ---

@app.get("/api/tasks/{task_id}/files/{file_index}")
async def fetch_task_file(task_id: str, file_index: int):
    """Serve a finished file as a normal browser download (attachment)."""
    async with tasks_lock:
        task = tasks.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if file_index < 0 or file_index >= len(task.output_files):
        raise HTTPException(status_code=404, detail="File not found")

    path = task.output_files[file_index]
    try:
        path.resolve().relative_to(task.output_dir.resolve())
    except ValueError:
        raise HTTPException(status_code=403, detail="Forbidden file path")
    if not path.is_file():
        raise HTTPException(status_code=410, detail="File is no longer available on the server")

    return FileResponse(
        path=path,
        filename=path.name,
        media_type="application/octet-stream",
        content_disposition_type="attachment",
    )


# --- Static Frontend ---

@app.get("/")
async def serve_index():
    index_file = STATIC_DIR / "index.html"
    if not index_file.is_file():
        return JSONResponse({"status": "Backend running, frontend index.html not found"}, status_code=200)
    return FileResponse(index_file)

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8002))
    host = os.environ.get("HOST", "0.0.0.0")
    print(f"Starting yt-dlp Web GUI on http://{host}:{port}")
    uvicorn.run("app:app", host=host, port=port, reload=True)
