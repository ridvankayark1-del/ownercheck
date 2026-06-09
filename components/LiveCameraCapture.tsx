"use client";

import { useEffect, useRef, useState } from "react";

type LiveCameraCaptureProps = {
  onCapture: (file: File) => void;
};

export function LiveCameraCapture({ onCapture }: LiveCameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraReady(false);
  }

  async function startCamera() {
    setErrorMessage("");
    setPreviewUrl("");

    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMessage(
        "Camera access is required for verification right now. Please try from a phone or allow camera permission."
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setCameraReady(true);
    } catch {
      setErrorMessage(
        "Camera access is required for verification right now. Please try from a phone or allow camera permission."
      );
    }
  }

  async function capturePhoto() {
    const video = videoRef.current;

    if (!video) {
      setErrorMessage("Camera is not ready yet.");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const context = canvas.getContext("2d");

    if (!context) {
      setErrorMessage("Could not capture from the camera.");
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.92)
    );

    if (!blob) {
      setErrorMessage("Could not create the photo file.");
      return;
    }

    stopCamera();
    const file = new File([blob], `owner-proof-${Date.now()}.jpg`, {
      type: "image/jpeg",
    });
    setPreviewUrl(URL.createObjectURL(file));
    onCapture(file);
  }

  function retakePhoto() {
    setPreviewUrl("");
    startCamera();
  }

  useEffect(() => {
    return () => {
      stopCamera();
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <div className="overflow-hidden rounded-2xl bg-slate-900">
        {previewUrl ? (
          <img src={previewUrl} alt="Captured proof" className="h-72 w-full object-cover" />
        ) : (
          <video
            ref={videoRef}
            playsInline
            muted
            className="h-72 w-full object-cover"
          />
        )}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <button type="button" className="btn" onClick={startCamera}>
          Start camera
        </button>
        <button
          type="button"
          className="btn btn-dark"
          onClick={capturePhoto}
          disabled={!cameraReady}
        >
          Capture photo
        </button>
        <button type="button" className="btn" onClick={retakePhoto}>
          Retake
        </button>
      </div>

      {errorMessage && (
        <p className="mt-3 text-sm font-bold text-red-700">{errorMessage}</p>
      )}
    </div>
  );
}
