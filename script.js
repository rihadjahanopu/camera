// Ensure DOM is ready before inserting buttons and accessing elements
window.addEventListener("DOMContentLoaded", () => {
	const video = document.getElementById("video");
	const canvas = document.getElementById("canvas");
	const startBtn = document.getElementById("startRecording");
	const stopBtn = document.getElementById("stopRecording");
	const captureBtn = document.getElementById("capture");
	const filterSelect = document.getElementById("filterSelect");
	const toggleAudioBtn = document.getElementById("toggleAudio");
	const downloadLink = document.getElementById("downloadLink");

	let mediaRecorder;
	let recordedChunks = [];
	let audioEnabled = true;
	let stream;
	let isRecording = false;

	// Insert recording toggle button before startBtn
	const controlsDiv = document.querySelector(".controls");
	const recordToggleBtn = document.createElement("button");
	recordToggleBtn.id = "recordToggle";
	recordToggleBtn.textContent = "Start Recording";
	if (controlsDiv) {
		controlsDiv.insertBefore(
			recordToggleBtn,
			controlsDiv.querySelector("#filterSelect").nextSibling
		);
	}
	if (startBtn) startBtn.style.display = "none";
	if (stopBtn) stopBtn.style.display = "none";

	// Start camera with video + audio (HD), fallback to lower resolution if needed
	function startCamera(constraints) {
		navigator.mediaDevices
			.getUserMedia(constraints)
			.then((s) => {
				stream = s;
				video.srcObject = stream;
				video.play();

				mediaRecorder = new MediaRecorder(stream);
				mediaRecorder.ondataavailable = (e) => recordedChunks.push(e.data);
				mediaRecorder.onstop = async () => {
					const blob = new Blob(recordedChunks, { type: "video/webm" });
					recordedChunks = [];
					downloadLink.href = URL.createObjectURL(blob);
					downloadLink.style.display = "inline";

					// Ask user if they want to convert to MP4
					if (window.FFmpeg && window.createFFmpeg) {
						if (confirm("Convert video to MP4?")) {
							try {
								const mp4Blob = await convertWebMtoMP4(blob);
								fileManagerDownload(mp4Blob, "recorded.mp4");
							} catch (e) {
								alert("MP4 conversion failed: " + e);
							}
						} else {
							fileManagerDownload(blob, "recorded.webm");
						}
					} else {
						fileManagerDownload(blob, "recorded.webm");
					}
				};

				// Media Session metadata
				if ("mediaSession" in navigator) {
					navigator.mediaSession.metadata = new MediaMetadata({
						title: "Camera Stream",
						artist: "Web App User",
						album: "Live Session",
						artwork: [
							{
								src: "https://via.placeholder.com/96",
								sizes: "96x96",
								type: "image/png",
							},
						],
					});

					navigator.mediaSession.setActionHandler("play", () => video.play());
					navigator.mediaSession.setActionHandler("pause", () => video.pause());
					navigator.mediaSession.setActionHandler("stop", () => {
						video.pause();
						stream.getTracks().forEach((track) => track.stop());
					});
				}
			})
			.catch((err) => {
				if (
					(constraints.video.width && constraints.video.width.ideal === 1920) ||
					(constraints.video.height && constraints.video.height.ideal === 1080)
				) {
					// Fallback to 1280x720 if 1920x1080 fails
					startCamera({
						video: {
							width: { ideal: 1280 },
							height: { ideal: 720 },
							facingMode: "environment",
						},
						audio: true,
					});
				} else {
					console.error("Camera access error:", err);
					alert("Camera access error: " + err.message);
				}
			});
	}

	startCamera({
		video: {
			width: { ideal: 1920 },
			height: { ideal: 1080 },
			facingMode: "environment",
		},
		audio: true,
	});

	// Replace start/stop with a single toggle button
	recordToggleBtn.onclick = () => {
		if (!isRecording) {
			mediaRecorder.start();
			downloadLink.style.display = "none";
			recordToggleBtn.style.backgroundColor = "#ff5252";
			recordToggleBtn.textContent = "Stop Recording";
			isRecording = true;
		} else {
			mediaRecorder.stop();
			recordToggleBtn.style.backgroundColor = "";
			recordToggleBtn.textContent = "Start Recording";
			isRecording = false;
		}
	};

	// Capture image and auto-download (no preview)
	captureBtn.onclick = () => {
		canvas.width = video.videoWidth;
		canvas.height = video.videoHeight;
		const ctx = canvas.getContext("2d");
		ctx.filter = video.style.filter || "none";
		ctx.drawImage(video, 0, 0);

		// Vibrate device on capture (if supported)
		if (navigator.vibrate) {
			navigator.vibrate(100); // vibrate for 100ms
		}

		// Download as Blob
		canvas.toBlob((blob) => {
			const url = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = url;
			link.download = "capture.png";
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);

			// Cleanup memory
			URL.revokeObjectURL(url);
			canvas.style.display = "none";
		}, "image/png");
	};

	// Change filter
	filterSelect.onchange = () => {
		video.style.filter = filterSelect.value;
	};

	// Toggle audio on/off
	toggleAudioBtn.onclick = () => {
		audioEnabled = !audioEnabled;
		stream.getAudioTracks().forEach((track) => (track.enabled = audioEnabled));
		toggleAudioBtn.textContent = audioEnabled ? "Mute Audio" : "Unmute Audio";
	};

	// Insert HD/FHD toggle button after the filterSelect in controlsDiv
	const resolutionToggleBtn = document.createElement("button");
	resolutionToggleBtn.id = "resolutionToggle";
	resolutionToggleBtn.textContent = "FHD";
	if (controlsDiv) {
		controlsDiv.insertBefore(resolutionToggleBtn, filterSelect.nextSibling);
	}
	let isFHD = true; // Start with FHD

	resolutionToggleBtn.onclick = () => {
		isFHD = !isFHD;
		resolutionToggleBtn.textContent = isFHD ? "FHD" : "HD";
		// Stop current stream if exists
		if (stream) {
			stream.getTracks().forEach((track) => track.stop());
		}
		startCamera({
			video: {
				width: { ideal: isFHD ? 1920 : 1280 },
				height: { ideal: isFHD ? 1080 : 720 },
				facingMode: "environment",
			},
			audio: true,
		});
	};

	// Helper: Convert WebM Blob to MP4 using ffmpeg.js (browser-side)
	async function convertWebMtoMP4(webmBlob) {
		return new Promise(async (resolve, reject) => {
			if (!window.createFFmpeg) {
				alert("FFmpeg.js is required for MP4 conversion.");
				reject("FFmpeg.js not loaded");
				return;
			}
			const { createFFmpeg, fetchFile } = window.FFmpeg;
			const ffmpeg = createFFmpeg({ log: true, corePath: "./ffmpeg-core.js" });
			await ffmpeg.load();
			ffmpeg.FS("writeFile", "input.webm", await fetchFile(webmBlob));
			await ffmpeg.run("-i", "input.webm", "-c:v", "copy", "output.mp4");
			const data = ffmpeg.FS("readFile", "output.mp4");
			const mp4Blob = new Blob([data.buffer], { type: "video/mp4" });
			resolve(mp4Blob);
		});
	}

	// File Manager: Download video (MP4 or WebM)
	function fileManagerDownload(blob, filename) {
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}
});
