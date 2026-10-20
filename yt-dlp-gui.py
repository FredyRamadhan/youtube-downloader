#!/usr/bin/env python3

import tkinter as tk
from tkinter import ttk, filedialog, messagebox
import subprocess
import shutil
import os
import threading
import queue

def find_yt_dlp():
    """Checks if yt-dlp is in PATH and returns the command name or path."""
    return shutil.which("yt-dlp")

class YtdlpGuiApp:
    def __init__(self, master):
        self.master = master
        master.title("yt-dlp GUI Helper")
        master.geometry("700x750") # Increased height for log area

        self.yt_dlp_executable = find_yt_dlp()
        if not self.yt_dlp_executable:
            messagebox.showerror("Error", "yt-dlp command not found in your system's PATH.\nPlease ensure yt-dlp is installed and accessible.")
            master.destroy()
            return

        # --- UI Elements ---
        ttk.Style().configure("TButton", padding=6, relief="flat", background="#ccc")
        ttk.Style().configure("TLabel", padding=3)
        ttk.Style().configure("TEntry", padding=3)
        ttk.Style().configure("TRadiobutton", padding=3)
        ttk.Style().configure("TCheckbutton", padding=3)

        # URL
        ttk.Label(master, text="Video/Playlist URL:").grid(row=0, column=0, sticky=tk.W, padx=5, pady=5)
        self.url_entry = ttk.Entry(master, width=60)
        self.url_entry.grid(row=0, column=1, columnspan=2, sticky=tk.EW, padx=5, pady=5)

        # Download Type (Audio/Video)
        self.download_type = tk.StringVar(value="video")
        ttk.Label(master, text="Download Type:").grid(row=1, column=0, sticky=tk.W, padx=5, pady=5)
        ttk.Radiobutton(master, text="Video", variable=self.download_type, value="video", command=self.toggle_options).grid(row=1, column=1, sticky=tk.W, padx=5)
        ttk.Radiobutton(master, text="Audio Only", variable=self.download_type, value="audio", command=self.toggle_options).grid(row=1, column=2, sticky=tk.W, padx=5)

        # Audio Options Frame
        self.audio_options_frame = ttk.LabelFrame(master, text="Audio Options")
        self.audio_options_frame.grid(row=2, column=0, columnspan=3, sticky=tk.EW, padx=5, pady=5, ipadx=5, ipady=5)

        ttk.Label(self.audio_options_frame, text="Audio Format:").grid(row=0, column=0, sticky=tk.W, padx=5, pady=2)
        self.audio_format_var = tk.StringVar(value="best")
        self.audio_format_options = ["best", "mp3", "m4a", "wav", "flac", "opus"]
        self.audio_format_menu = ttk.Combobox(self.audio_options_frame, textvariable=self.audio_format_var, values=self.audio_format_options, state="readonly")
        self.audio_format_menu.grid(row=0, column=1, sticky=tk.EW, padx=5, pady=2)

        # Video Options Frame
        self.video_options_frame = ttk.LabelFrame(master, text="Video Options")
        self.video_options_frame.grid(row=3, column=0, columnspan=3, sticky=tk.EW, padx=5, pady=5, ipadx=5, ipady=5)

        ttk.Label(self.video_options_frame, text="Video Quality:").grid(row=0, column=0, sticky=tk.W, padx=5, pady=2)
        self.video_quality_var = tk.StringVar(value="720p")
        self.video_quality_options = ["best", "1080p", "720p", "480p", "360p"] # User can also type a raw format string
        self.video_quality_menu = ttk.Combobox(self.video_options_frame, textvariable=self.video_quality_var, values=self.video_quality_options)
        self.video_quality_menu.grid(row=0, column=1, sticky=tk.EW, padx=5, pady=2)

        # Output Options
        output_frame = ttk.LabelFrame(master, text="Output Options")
        output_frame.grid(row=4, column=0, columnspan=3, sticky=tk.EW, padx=5, pady=5, ipadx=5, ipady=5)

        ttk.Label(output_frame, text="Output Path:").grid(row=0, column=0, sticky=tk.W, padx=5, pady=2)
        self.output_path_var = tk.StringVar(value=os.getcwd())
        self.output_path_entry = ttk.Entry(output_frame, textvariable=self.output_path_var, width=50)
        self.output_path_entry.grid(row=0, column=1, sticky=tk.EW, padx=5, pady=2)
        self.browse_button = ttk.Button(output_frame, text="Browse", command=self.browse_output_path)
        self.browse_button.grid(row=0, column=2, padx=5, pady=2)

        ttk.Label(output_frame, text="Output Template:").grid(row=1, column=0, sticky=tk.W, padx=5, pady=2)
        self.output_template_var = tk.StringVar(value="%(title)s [%(id)s].%(ext)s")
        self.output_template_entry = ttk.Entry(output_frame, textvariable=self.output_template_var, width=50)
        self.output_template_entry.grid(row=1, column=1, columnspan=2, sticky=tk.EW, padx=5, pady=2)

        # Subtitle Options
        subtitle_frame = ttk.LabelFrame(master, text="Subtitle Options")
        subtitle_frame.grid(row=5, column=0, columnspan=3, sticky=tk.EW, padx=5, pady=5, ipadx=5, ipady=5)

        self.subs_var = tk.BooleanVar()
        ttk.Checkbutton(subtitle_frame, text="Download Manually Created Subs", variable=self.subs_var).grid(row=0, column=0, sticky=tk.W, padx=5)
        self.auto_subs_var = tk.BooleanVar()
        ttk.Checkbutton(subtitle_frame, text="Download Auto-Generated Subs", variable=self.auto_subs_var).grid(row=0, column=1, sticky=tk.W, padx=5)

        ttk.Label(subtitle_frame, text="Subtitle Languages (e.g., en,es):").grid(row=1, column=0, sticky=tk.W, padx=5, pady=2)
        self.sub_langs_var = tk.StringVar()
        self.sub_langs_entry = ttk.Entry(subtitle_frame, textvariable=self.sub_langs_var, width=30)
        self.sub_langs_entry.grid(row=1, column=1, sticky=tk.EW, padx=5, pady=2)

        # Additional yt-dlp arguments
        ttk.Label(master, text="Extra yt-dlp Args:").grid(row=6, column=0, sticky=tk.W, padx=5, pady=5)
        self.yt_dlp_args_entry = ttk.Entry(master, width=60)
        self.yt_dlp_args_entry.grid(row=6, column=1, columnspan=2, sticky=tk.EW, padx=5, pady=5)


        # Download Button
        self.download_button = ttk.Button(master, text="Download", command=self.start_download_thread)
        self.download_button.grid(row=7, column=0, columnspan=3, pady=10)

        # Progress/Log Area
        log_frame = ttk.LabelFrame(master, text="Log / Progress")
        log_frame.grid(row=8, column=0, columnspan=3, sticky="nsew", padx=5, pady=5)
        master.grid_rowconfigure(8, weight=1) # Make log area expand
        master.grid_columnconfigure(1, weight=1)


        self.log_text = tk.Text(log_frame, height=15, wrap=tk.WORD, state=tk.DISABLED)
        self.log_text_scrollbar = ttk.Scrollbar(log_frame, orient=tk.VERTICAL, command=self.log_text.yview)
        self.log_text.configure(yscrollcommand=self.log_text_scrollbar.set)
        
        self.log_text.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=5, pady=5)
        self.log_text_scrollbar.pack(side=tk.RIGHT, fill=tk.Y)


        # Initial state
        self.toggle_options()

        # Queue for communication between threads
        self.log_queue = queue.Queue()
        self.master.after(100, self.process_log_queue)


    def toggle_options(self):
        """Enable/disable audio/video options based on download type."""
        if self.download_type.get() == "audio":
            for child in self.audio_options_frame.winfo_children():
                if isinstance(child, (ttk.Entry, ttk.Combobox, ttk.Button)):
                    child.configure(state="normal")
            for child in self.video_options_frame.winfo_children():
                 if isinstance(child, (ttk.Entry, ttk.Combobox, ttk.Button)):
                    child.configure(state="disabled")
            self.video_quality_menu.configure(state="disabled") # Specifically disable combobox
        else: # Video
            for child in self.audio_options_frame.winfo_children():
                if isinstance(child, (ttk.Entry, ttk.Combobox, ttk.Button)):
                    child.configure(state="disabled")
            self.audio_format_menu.configure(state="disabled") # Specifically disable combobox
            for child in self.video_options_frame.winfo_children():
                if isinstance(child, (ttk.Entry, ttk.Combobox, ttk.Button)):
                    child.configure(state="normal")
            self.video_quality_menu.configure(state="normal") # Specifically enable combobox


    def browse_output_path(self):
        """Open a dialog to choose the output directory."""
        directory = filedialog.askdirectory(initialdir=self.output_path_var.get())
        if directory:
            self.output_path_var.set(directory)

    def log_message(self, message):
        """Append a message to the log text area."""
        self.log_text.configure(state=tk.NORMAL)
        self.log_text.insert(tk.END, message + "\n")
        self.log_text.see(tk.END)
        self.log_text.configure(state=tk.DISABLED)

    def process_log_queue(self):
        """Process messages from the log queue and update the GUI."""
        try:
            while True:
                message = self.log_queue.get_nowait()
                self.log_message(message)
        except queue.Empty:
            pass
        self.master.after(100, self.process_log_queue)


    def start_download_thread(self):
        """Starts the download process in a separate thread to keep GUI responsive."""
        url = self.url_entry.get().strip()
        if not url:
            messagebox.showerror("Error", "URL cannot be empty.")
            return

        self.download_button.configure(state=tk.DISABLED)
        self.log_text.configure(state=tk.NORMAL)
        self.log_text.delete(1.0, tk.END) # Clear previous logs
        self.log_text.configure(state=tk.DISABLED)
        self.log_message("Starting download process...")

        # Create and start the download thread
        thread = threading.Thread(target=self.execute_download, daemon=True)
        thread.start()

    def execute_download(self):
        """Constructs and executes the yt-dlp command."""
        cmd = [self.yt_dlp_executable]
        url = self.url_entry.get().strip()

        # Download Type
        if self.download_type.get() == "audio":
            cmd.extend(["-x"])  # Extract audio
            cmd.extend(["--audio-format", self.audio_format_var.get()])
            if self.audio_format_var.get() == "mp3":
                cmd.extend(["--embed-thumbnail", "--ppa", "ThumbnailsConvertor+FFmpegMetadata"])
        else: # Video
            quality = self.video_quality_var.get()
            quality_presets = {
                "1080p": "bv*[height<=1080][ext=mp4]+ba*[ext=m4a]/b[ext=mp4][height<=1080]/bv*[height<=1080]+ba/b[height<=1080]",
                "720p": "bv*[height<=720][ext=mp4]+ba*[ext=m4a]/b[ext=mp4][height<=720]/bv*[height<=720]+ba/b[height<=720]",
                "480p": "bv*[height<=480][ext=mp4]+ba*[ext=m4a]/b[ext=mp4][height<=480]/bv*[height<=480]+ba/b[height<=480]",
                "360p": "bv*[height<=360][ext=mp4]+ba*[ext=m4a]/b[ext=mp4][height<=360]/bv*[height<=360]+ba/b[height<=360]",
                "best": "bestvideo*+bestaudio/best",
            }
            if quality in quality_presets:
                cmd.extend(["-f", quality_presets[quality]])
            elif quality: # User might provide a raw format string
                cmd.extend(["-f", quality])

        # Output Path
        output_path = self.output_path_var.get().strip()
        if output_path:
            try:
                os.makedirs(output_path, exist_ok=True)
                cmd.extend(["-P", output_path])
            except Exception as e:
                self.log_queue.put(f"Error creating output path: {e}")
                # Optionally, don't proceed if path creation fails
                # self.master.after(0, lambda: self.download_button.configure(state=tk.NORMAL))
                # return
        
        # Output Template
        output_template = self.output_template_var.get().strip()
        if output_template:
             cmd.extend(["-o", output_template])
        else: # Default if empty, though UI has a default
            cmd.extend(["-o", "%(title)s [%(id)s].%(ext)s"])


        # Subtitles
        sub_options_added = False
        if self.subs_var.get():
            cmd.append("--write-sub")
            sub_options_added = True
        if self.auto_subs_var.get():
            cmd.append("--write-auto-sub")
            sub_options_added = True

        if sub_options_added and self.sub_langs_var.get().strip():
            cmd.extend(["--sub-langs", self.sub_langs_var.get().strip()])

        # Extra arguments
        extra_args = self.yt_dlp_args_entry.get().strip()
        if extra_args:
            cmd.extend(extra_args.split())

        cmd.append(url)

        self.log_queue.put("Executing command:")
        try:
            import shlex
            self.log_queue.put("  " + " ".join(shlex.quote(str(c)) for c in cmd))
        except ImportError:
            self.log_queue.put("  " + " ".join(map(str,cmd)))
        self.log_queue.put("-" * 30)


        try:
            # Start the subprocess
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT, # Redirect stderr to stdout
                text=True,
                encoding='utf-8',
                errors='replace',
                bufsize=1,  # Line-buffered
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0 # Hide console window on Windows
            )

            # Read output line by line
            for line in iter(process.stdout.readline, ''):
                self.log_queue.put(line.strip())
            
            process.stdout.close()
            return_code = process.wait()

            if return_code == 0:
                self.log_queue.put("-" * 30)
                self.log_queue.put("Download completed successfully!")
            else:
                self.log_queue.put("-" * 30)
                self.log_queue.put(f"yt-dlp exited with status {return_code}")

        except FileNotFoundError:
            self.log_queue.put(f"Error: The command '{self.yt_dlp_executable}' was not found.")
        except Exception as e:
            self.log_queue.put("-" * 30)
            self.log_queue.put(f"An unexpected error occurred: {e}")
        finally:
            # Re-enable the download button on the main thread
            self.master.after(0, lambda: self.download_button.configure(state=tk.NORMAL))


if __name__ == "__main__":
    root = tk.Tk()
    app = YtdlpGuiApp(root)
    root.mainloop()
