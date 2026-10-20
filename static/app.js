// yt-dlp Web GUI - Client Application

let currentTaskId = null;
let currentSocket = null;

// DOM Elements
const urlInput = document.getElementById("urlInput");
const clearUrlBtn = document.getElementById("clearUrlBtn");
const pasteUrlBtn = document.getElementById("pasteUrlBtn");
const fetchInfoBtn = document.getElementById("fetchInfoBtn");

// Preview Elements
const videoPreviewCard = document.getElementById("videoPreviewCard");
const previewThumbImg = document.getElementById("previewThumbImg");
const previewDuration = document.getElementById("previewDuration");
const previewTitle = document.getElementById("previewTitle");
const previewUploader = document.getElementById("previewUploader");
const previewViews = document.getElementById("previewViews");
const previewDescription = document.getElementById("previewDescription");

// Options Elements
const typeVideo = document.getElementById("typeVideo");
const typeAudio = document.getElementById("typeAudio");
const videoOptionsRow = document.getElementById("videoOptionsRow");
const audioOptionsRow = document.getElementById("audioOptionsRow");
const videoQualitySelect = document.getElementById("videoQualitySelect");
const customFormatGroup = document.getElementById("customFormatGroup");
const customFormatInput = document.getElementById("customFormatInput");
const embedSubsCheckbox = document.getElementById("embedSubsCheckbox");
const audioFormatSelect = document.getElementById("audioFormatSelect");
const embedThumbnailCheckbox = document.getElementById("embedThumbnailCheckbox");

// Advanced Options
const advSettingsToggle = document.getElementById("advSettingsToggle");
const subsCheckbox = document.getElementById("subsCheckbox");
const autoSubsCheckbox = document.getElementById("autoSubsCheckbox");
const subLangsInput = document.getElementById("subLangsInput");
const outputTemplateInput = document.getElementById("outputTemplateInput");
const outputPathInput = document.getElementById("outputPathInput");
const extraArgsInput = document.getElementById("extraArgsInput");

// Action & Monitor Elements
const startDownloadBtn = document.getElementById("startDownloadBtn");
const liveMonitorCard = document.getElementById("liveMonitorCard");
const taskStatusBadge = document.getElementById("taskStatusBadge");
const monitorTaskTitle = document.getElementById("monitorTaskTitle");
const cancelDownloadBtn = document.getElementById("cancelDownloadBtn");
const progressBarFill = document.getElementById("progressBarFill");
const statPercent = document.getElementById("statPercent");
const statSpeed = document.getElementById("statSpeed");
const statEta = document.getElementById("statEta");
const statSize = document.getElementById("statSize");
const completedFiles = document.getElementById("completedFiles");
const completedFilesLabel = document.getElementById("completedFilesLabel");
const completedFilesList = document.getElementById("completedFilesList");


// --- Application Initialization ---
document.addEventListener("DOMContentLoaded", () => {
    initUrlInput();
    initOptions();
    initMonitorActions();
    checkSystemStatus();
});


// --- System Status ---
async function checkSystemStatus() {
    const ytdlpPill = document.getElementById("statusYtdlp");
    const ffmpegPill = document.getElementById("statusFfmpeg");

    try {
        const res = await fetch("/api/status");
        if (!res.ok) throw new Error("Status check failed");
        const data = await res.json();

        // yt-dlp status
        if (data.yt_dlp_version) {
            ytdlpPill.className = "status-pill online";
            ytdlpPill.querySelector(".status-label").textContent = `yt-dlp: v${data.yt_dlp_version}`;
        } else {
            ytdlpPill.className = "status-pill";
            ytdlpPill.querySelector(".status-label").textContent = "yt-dlp: Ready";
        }

        // ffmpeg status
        if (data.ffmpeg_available) {
            ffmpegPill.className = "status-pill online";
            ffmpegPill.querySelector(".status-label").textContent = "ffmpeg: Ready";
        } else {
            ffmpegPill.className = "status-pill offline";
            ffmpegPill.querySelector(".status-label").textContent = "ffmpeg: Missing";
        }
    } catch (e) {
        ytdlpPill.className = "status-pill offline";
        ytdlpPill.querySelector(".status-label").textContent = "Backend: Offline";
    }
}


// --- URL Input & Fetch Info ---
function initUrlInput() {
    urlInput.addEventListener("input", () => {
        clearUrlBtn.style.display = urlInput.value.trim() ? "flex" : "none";
    });

    clearUrlBtn.addEventListener("click", () => {
        urlInput.value = "";
        clearUrlBtn.style.display = "none";
        videoPreviewCard.style.display = "none";
        urlInput.focus();
    });

    pasteUrlBtn.addEventListener("click", async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (text) {
                urlInput.value = text.trim();
                clearUrlBtn.style.display = "flex";
                fetchVideoInfo();
            }
        } catch (err) {
            showToast("Could not access clipboard", "error");
        }
    });

    fetchInfoBtn.addEventListener("click", fetchVideoInfo);

    urlInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            fetchVideoInfo();
        }
    });
}

async function fetchVideoInfo() {
    const url = urlInput.value.trim();
    if (!url) {
        showToast("Please enter a media URL first", "error");
        return;
    }

    const spinner = fetchInfoBtn.querySelector(".btn-spinner");
    const btnText = fetchInfoBtn.querySelector(".btn-text");
    fetchInfoBtn.disabled = true;
    spinner.style.display = "inline-block";
    btnText.textContent = "Fetching...";

    try {
        const res = await fetch("/api/info", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url })
        });

        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.detail || "Failed to fetch metadata");
        }

        // Populate preview
        previewTitle.textContent = data.title;
        previewDuration.textContent = data.duration_formatted || "";
        previewUploader.innerHTML = `
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
            ${data.uploader}
        `;
        previewViews.innerHTML = `
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
            ${data.view_count ? data.view_count.toLocaleString() + ' views' : 'N/A'}
        `;
        previewDescription.textContent = data.description || "No description available.";
        if (data.thumbnail) {
            previewThumbImg.src = data.thumbnail;
            previewThumbImg.style.display = "block";
        } else {
            previewThumbImg.style.display = "none";
        }

        // Update video qualities dynamically if resolutions found
        if (data.available_resolutions && data.available_resolutions.length > 0) {
            updateResolutionDropdown(data.available_resolutions);
        }

        videoPreviewCard.style.display = "flex";
        showToast("Metadata fetched successfully", "success");
    } catch (err) {
        showToast(err.message, "error");
    } finally {
        fetchInfoBtn.disabled = false;
        spinner.style.display = "none";
        btnText.textContent = "Fetch Info";
    }
}

function updateResolutionDropdown(resolutions) {
    const currentVal = videoQualitySelect.value;
    videoQualitySelect.innerHTML = `<option value="best">Best Available (Auto Max)</option>`;
    resolutions.forEach(res => {
        const opt = document.createElement("option");
        opt.value = res;
        opt.textContent = `${res} (Stream)`;
        videoQualitySelect.appendChild(opt);
    });
    const customOpt = document.createElement("option");
    customOpt.value = "custom";
    customOpt.textContent = "Custom Format String...";
    videoQualitySelect.appendChild(customOpt);

    if (resolutions.includes(currentVal)) {
        videoQualitySelect.value = currentVal;
    }
}


// --- Options & Controls ---
function initOptions() {
    typeVideo.addEventListener("change", () => {
        videoOptionsRow.style.display = "flex";
        audioOptionsRow.style.display = "none";
    });

    typeAudio.addEventListener("change", () => {
        videoOptionsRow.style.display = "none";
        audioOptionsRow.style.display = "flex";
    });

    videoQualitySelect.addEventListener("change", () => {
        customFormatGroup.style.display = (videoQualitySelect.value === "custom") ? "block" : "none";
    });

    advSettingsToggle.addEventListener("click", () => {
        const accordion = advSettingsToggle.parentElement;
        accordion.classList.toggle("open");
    });

    startDownloadBtn.addEventListener("click", startDownload);
}


// --- Start & Manage Download ---
async function startDownload() {
    const url = urlInput.value.trim();
    if (!url) {
        showToast("Please enter a media URL", "error");
        urlInput.focus();
        return;
    }

    const downloadType = document.querySelector('input[name="downloadType"]:checked').value;
    let videoQuality = videoQualitySelect.value;
    if (videoQuality === "custom") {
        videoQuality = customFormatInput.value.trim() || "best";
    }

    const payload = {
        url: url,
        download_type: downloadType,
        video_quality: videoQuality,
        audio_format: audioFormatSelect.value,
        embed_thumbnail: embedThumbnailCheckbox.checked,
        embed_subs: embedSubsCheckbox.checked,
        subs: subsCheckbox.checked,
        auto_subs: autoSubsCheckbox.checked,
        sub_langs: subLangsInput.value.trim(),
        output_template: outputTemplateInput.value.trim(),
        output_path: outputPathInput.value.trim(),
        extra_args: extraArgsInput.value.trim()
    };

    startDownloadBtn.disabled = true;
    startDownloadBtn.innerHTML = `
        <span class="btn-spinner"></span>
        <span>Starting...</span>
    `;

    try {
        const res = await fetch("/api/download", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.detail || "Failed to start download");
        }

        currentTaskId = data.task_id;
        openTaskMonitor(currentTaskId);
        showToast("Download started", "success");
    } catch (err) {
        showToast(err.message, "error");
        resetDownloadButton();
    }
}

function openTaskMonitor(taskId) {
    liveMonitorCard.style.display = "block";
    liveMonitorCard.scrollIntoView({ behavior: "smooth" });

    // Reset monitor display
    updateStatusBadge("downloading");
    progressBarFill.style.width = "0%";
    statPercent.textContent = "0.0%";
    statSpeed.textContent = "Speed: --";
    statEta.textContent = "ETA: --";
    statSize.textContent = "Size: --";
    completedFiles.style.display = "none";
    completedFilesList.innerHTML = "";

    // Connect WebSocket
    connectTaskSocket(taskId);
}

function connectTaskSocket(taskId) {
    if (currentSocket) {
        currentSocket.close();
    }

    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${location.host}/ws/tasks/${taskId}`;
    currentSocket = new WebSocket(wsUrl);

    currentSocket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            handleTaskEvent(data);
        } catch (e) {
            console.error("Failed to parse WebSocket message");
        }
    };

    currentSocket.onclose = () => {
        // Closed
    };
}

function handleTaskEvent(data) {
    if (data.type === "init") {
        if (data.task) {
            updateStatusBadge(data.task.status);
            if (data.task.percent) {
                updateProgress(data.task.percent, data.task.speed, data.task.eta, data.task.total_size);
            }
        }
    } else if (data.type === "status") {
        updateStatusBadge(data.status);
    } else if (data.type === "progress") {
        updateProgress(data.percent, data.speed, data.eta, data.total_size);
        if (data.status) updateStatusBadge(data.status);
    } else if (data.type === "complete") {
        updateStatusBadge(data.status);

        if (data.status === "completed") {
            updateProgress(100.0, "", "00:00", "");
            deliverFilesToBrowser(data);
        } else if (data.status === "cancelled") {
            showToast("Download cancelled", "info");
        } else {
            showToast(`Download failed: ${data.error || "Unknown error"}`, "error");
        }

        resetDownloadButton();
    }
}

// Hand finished files over to the browser's own download manager, then the
// server deletes its staged copy (unless the user asked to keep one).
function deliverFilesToBrowser(taskEvent) {
    const files = taskEvent.files || [];
    const taskId = taskEvent.task_id;

    if (!files.length) {
        showToast("Download finished, but no output files were found", "error");
        return;
    }

    completedFiles.style.display = "block";
    completedFilesLabel.textContent = taskEvent.kept
        ? "Sent to your browser and kept on the server"
        : "Saved to your browser's Downloads";
    completedFilesList.innerHTML = "";

    files.forEach((name, index) => {
        const link = document.createElement("a");
        link.href = `/api/tasks/${taskId}/files/${index}`;
        link.download = name;
        link.textContent = name;
        link.className = "completed-file-link";
        completedFilesList.appendChild(link);

        // Trigger the actual browser download (staggered so playlists
        // don't get blocked as a burst of simultaneous downloads)
        setTimeout(() => {
            const trigger = document.createElement("a");
            trigger.href = link.href;
            trigger.download = name;
            document.body.appendChild(trigger);
            trigger.click();
            trigger.remove();
        }, 400 + index * 800);
    });

    if (taskEvent.kept) {
        showToast("Download finished — file(s) sent to your browser", "success");
    } else {
        showToast("Download finished — saving to your browser", "success");
    }
}

function updateProgress(percent, speed, eta, totalSize) {
    const p = Math.min(100, Math.max(0, percent || 0));
    progressBarFill.style.width = `${p}%`;
    statPercent.textContent = `${p.toFixed(1)}%`;
    if (speed) statSpeed.textContent = `Speed: ${speed}`;
    if (eta) statEta.textContent = `ETA: ${eta}`;
    if (totalSize) statSize.textContent = `Size: ${totalSize}`;
}

function updateStatusBadge(status) {
    taskStatusBadge.className = `status-badge ${status}`;
    taskStatusBadge.textContent = status.toUpperCase();

    if (status === "completed" || status === "error" || status === "cancelled") {
        cancelDownloadBtn.style.display = "none";
    } else {
        cancelDownloadBtn.style.display = "inline-flex";
    }
}

function resetDownloadButton() {
    startDownloadBtn.disabled = false;
    startDownloadBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Start Download
    `;
}

function initMonitorActions() {
    cancelDownloadBtn.addEventListener("click", async () => {
        if (!currentTaskId) return;
        if (!confirm("Are you sure you want to cancel the download?")) return;

        try {
            await fetch(`/api/tasks/${currentTaskId}/cancel`, { method: "POST" });
            showToast("Cancellation sent", "info");
        } catch (err) {
            showToast("Failed to send cancel signal", "error");
        }
    });
}


// --- Utilities ---
function showToast(message, type = "info") {
    const container = document.getElementById("toastContainer");
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;

    let icon = "ℹ️";
    if (type === "success") icon = "✅";
    if (type === "error") icon = "⚠️";

    toast.innerHTML = `<span>${icon}</span><span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateX(20px)";
        toast.style.transition = "all 0.3s ease";
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/[&<>'"]/g, tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
    }[tag] || tag));
}
