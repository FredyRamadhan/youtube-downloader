// yt-dlp Web GUI - Client Application

let currentTaskId = null;
let currentSocket = null;
let allLibraryFiles = [];

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
const terminalOutput = document.getElementById("terminalOutput");
const autoScrollCheckbox = document.getElementById("autoScrollCheckbox");
const copyLogBtn = document.getElementById("copyLogBtn");
const clearLogBtn = document.getElementById("clearLogBtn");

// Library Elements
const libraryTable = document.getElementById("libraryTable");
const libraryTableBody = document.getElementById("libraryTableBody");
const libraryLoading = document.getElementById("libraryLoading");
const libraryEmpty = document.getElementById("libraryEmpty");
const libraryCountBadge = document.getElementById("libraryCountBadge");
const refreshLibraryBtn = document.getElementById("refreshLibraryBtn");
const librarySearchInput = document.getElementById("librarySearchInput");

// Modal Elements
const mediaModal = document.getElementById("mediaModal");
const modalMediaTitle = document.getElementById("modalMediaTitle");
const modalMediaContainer = document.getElementById("modalMediaContainer");
const modalCloseBtn = document.getElementById("modalCloseBtn");


// --- Application Initialization ---
document.addEventListener("DOMContentLoaded", () => {
    initTabs();
    initUrlInput();
    initOptions();
    initMonitorActions();
    initLibrary();
    initModal();
    checkSystemStatus();
    loadLibraryFiles();
});


// --- Tab Navigation ---
function initTabs() {
    const tabButtons = document.querySelectorAll(".tab-btn");
    tabButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            const targetTab = btn.getAttribute("data-tab");
            tabButtons.forEach(b => b.classList.remove("active"));
            document.querySelectorAll(".tab-pane").forEach(pane => pane.classList.remove("active"));

            btn.classList.add("active");
            document.getElementById(targetTab).classList.add("active");

            if (targetTab === "tab-library") {
                loadLibraryFiles();
            }
        });
    });
}


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
    terminalOutput.textContent = "";

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

    currentSocket.onopen = () => {
        appendTerminalLine(`[System] Connected to task stream for ${taskId}`);
    };

    currentSocket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            handleTaskEvent(data);
        } catch (e) {
            console.error("Failed to parse WebSocket message:", event.data);
        }
    };

    currentSocket.onerror = (err) => {
        appendTerminalLine("[System] WebSocket connection error. Polling task status...");
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
        if (data.recent_logs) {
            data.recent_logs.forEach(appendTerminalLine);
        }
    } else if (data.type === "status") {
        updateStatusBadge(data.status);
        if (data.log) appendTerminalLine(data.log);
    } else if (data.type === "progress") {
        updateProgress(data.percent, data.speed, data.eta, data.total_size);
        if (data.status) updateStatusBadge(data.status);
    } else if (data.type === "log") {
        appendTerminalLine(data.line);
    } else if (data.type === "complete") {
        updateStatusBadge(data.status);
        if (data.log) appendTerminalLine(data.log);

        if (data.status === "completed") {
            updateProgress(100.0, "", "00:00", "");
            showToast("Download finished successfully!", "success");
        } else if (data.status === "cancelled") {
            showToast("Download cancelled", "info");
        } else {
            showToast(`Download failed: ${data.error || "Unknown error"}`, "error");
        }

        resetDownloadButton();
        loadLibraryFiles();
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

function appendTerminalLine(line) {
    if (!line) return;
    terminalOutput.textContent += line + "\n";
    if (autoScrollCheckbox.checked) {
        terminalOutput.scrollTop = terminalOutput.scrollHeight;
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

    copyLogBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(terminalOutput.textContent).then(() => {
            showToast("Logs copied to clipboard", "success");
        }).catch(() => {
            showToast("Failed to copy logs", "error");
        });
    });

    clearLogBtn.addEventListener("click", () => {
        terminalOutput.textContent = "";
    });
}


// --- Downloads Library ---
function initLibrary() {
    refreshLibraryBtn.addEventListener("click", loadLibraryFiles);

    librarySearchInput.addEventListener("input", () => {
        const query = librarySearchInput.value.toLowerCase().trim();
        const filtered = allLibraryFiles.filter(f => f.name.toLowerCase().includes(query));
        renderLibraryTable(filtered);
    });
}

async function loadLibraryFiles() {
    libraryLoading.style.display = "flex";
    libraryEmpty.style.display = "none";
    libraryTable.style.display = "none";

    try {
        const res = await fetch("/api/files");
        if (!res.ok) throw new Error("Failed to load files");
        allLibraryFiles = await res.json();

        libraryCountBadge.textContent = allLibraryFiles.length;

        if (allLibraryFiles.length === 0) {
            libraryEmpty.style.display = "flex";
        } else {
            renderLibraryTable(allLibraryFiles);
            libraryTable.style.display = "table";
        }
    } catch (err) {
        showToast("Error loading downloads library", "error");
    } finally {
        libraryLoading.style.display = "none";
    }
}

function renderLibraryTable(files) {
    libraryTableBody.innerHTML = "";

    if (files.length === 0) {
        libraryEmpty.style.display = "flex";
        libraryTable.style.display = "none";
        return;
    }

    libraryEmpty.style.display = "none";
    libraryTable.style.display = "table";

    files.forEach(file => {
        const tr = document.createElement("tr");

        // Icon based on type
        let iconSvg = '';
        if (file.file_type === 'video') {
            iconSvg = `<svg class="file-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>`;
        } else if (file.file_type === 'audio') {
            iconSvg = `<svg class="file-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
        } else {
            iconSvg = `<svg class="file-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
        }

        const encodedName = encodeURIComponent(file.name);
        const fileUrl = `/api/files/${encodedName}`;

        tr.innerHTML = `
            <td>
                <div class="file-name-cell">
                    ${iconSvg}
                    <span>${escapeHtml(file.name)}</span>
                </div>
            </td>
            <td><span class="ext-badge ${file.file_type}">${escapeHtml(file.ext)}</span></td>
            <td>${escapeHtml(file.size_formatted)}</td>
            <td>${escapeHtml(file.modified_formatted)}</td>
            <td class="text-right">
                <div class="row-actions">
                    ${file.file_type !== 'other' ? `
                    <button class="btn btn-secondary btn-sm preview-btn" data-url="${fileUrl}" data-type="${file.file_type}" data-name="${escapeHtml(file.name)}" title="Preview in browser">
                        ▶ Play
                    </button>` : ''}
                    <a href="${fileUrl}" download class="btn btn-primary btn-sm" title="Download to device">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    </a>
                    <button class="btn btn-danger btn-sm delete-btn" data-name="${escapeHtml(file.name)}" title="Delete file">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                </div>
            </td>
        `;

        libraryTableBody.appendChild(tr);
    });

    // Wire up preview and delete buttons
    document.querySelectorAll(".preview-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const url = btn.getAttribute("data-url");
            const type = btn.getAttribute("data-type");
            const name = btn.getAttribute("data-name");
            openMediaPreview(url, type, name);
        });
    });

    document.querySelectorAll(".delete-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const name = btn.getAttribute("data-name");
            deleteFile(name);
        });
    });
}

async function deleteFile(filename) {
    if (!confirm(`Are you sure you want to delete "${filename}"?`)) return;

    try {
        const res = await fetch(`/api/files/${encodeURIComponent(filename)}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Delete failed");
        showToast(`Deleted ${filename}`, "success");
        loadLibraryFiles();
    } catch (err) {
        showToast(err.message, "error");
    }
}


// --- Media Player Modal ---
function initModal() {
    modalCloseBtn.addEventListener("click", closeMediaModal);
    mediaModal.addEventListener("click", (e) => {
        if (e.target === mediaModal) closeMediaModal();
    });
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && mediaModal.style.display !== "none") {
            closeMediaModal();
        }
    });
}

function openMediaPreview(url, fileType, title) {
    modalMediaTitle.textContent = title;
    modalMediaContainer.innerHTML = "";

    if (fileType === "video") {
        const video = document.createElement("video");
        video.controls = true;
        video.autoplay = true;
        video.src = url;
        modalMediaContainer.appendChild(video);
    } else {
        const audio = document.createElement("audio");
        audio.controls = true;
        audio.autoplay = true;
        audio.src = url;
        modalMediaContainer.appendChild(audio);
    }

    mediaModal.style.display = "flex";
}

function closeMediaModal() {
    mediaModal.style.display = "none";
    modalMediaContainer.innerHTML = "";
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
