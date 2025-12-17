import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./../Styles/PracticeIRL.css";
import logotype from "./../assets/logo.svg";

const PracticeIRL = () => {
  const [hasCamera, setHasCamera] = useState(false);
  const [cameraError, setCameraError] = useState(null);

  const [gesture, setGesture] = useState(null);
  const [confidence, setConfidence] = useState(null);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const canvasRef = useRef(null);
  const wsRef = useRef(null);

  const navigate = useNavigate();
  const openMenu = () => navigate("/menu");

  useEffect(() => {
    let cancelled = false;

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        setCameraError(null);
        setHasCamera(true);
      } catch (error) {
        streamRef.current = null;
        setHasCamera(false);
        setCameraError(error);
      }
    };

    startCamera();

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const videoEl = videoRef.current;
    const stream = streamRef.current;

    if (!videoEl || !stream) return;

    videoEl.srcObject = stream;

    const onLoaded = () => {
      videoEl.play().catch(() => {});
    };

    videoEl.addEventListener("loadedmetadata", onLoaded);

    if (videoEl.readyState >= 1) {
      onLoaded();
    }

    return () => {
      videoEl.removeEventListener("loadedmetadata", onLoaded);
    };
  }, [hasCamera]);

  useEffect(() => {
    const ws = new WebSocket("ws://localhost:8000/ws/gesture");
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("WS connected");
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setGesture(data.word);
        setConfidence(data.confidence);
      } catch {}
    };

    ws.onerror = (e) => {
      console.error("WS error", e);
    };

    ws.onclose = () => {
      console.log("WS closed");
    };

    return () => {
      ws.close();
    };
  }, []);


  useEffect(() => {
    if (!hasCamera) return;
    if (!videoRef.current || !canvasRef.current) return;
    if (!wsRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    let rafId;
    let lastSent = 0;

    const sendFrame = (time) => {
      rafId = requestAnimationFrame(sendFrame);

      if (wsRef.current.readyState !== WebSocket.OPEN) return;
      if (time - lastSent < 66) return; // ~15 FPS
      if (video.readyState < 2) return;

      lastSent = time;

      ctx.drawImage(video, 0, 0, 224, 224);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.6);

      wsRef.current.send(
        JSON.stringify({
          type: "frame",
          data: dataUrl,
        })
      );
    };

    rafId = requestAnimationFrame(sendFrame);

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [hasCamera]);

  return (
    <div className="app-container">
      <header className="header">
        <button className="menu-btn" onClick={openMenu}>
          ☰
        </button>
        <h1 className="logo">GESTU</h1>
        <div className="logo-icon">
          <img src={logotype} alt="logo" />
        </div>
      </header>

      <div className="camera-card">
        <div className="video-container">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{
              width: "100%",
              height: "300px",
              background: "black",
              borderRadius: "8px",
              transform: "scaleX(-1)",
            }}
          />

          <canvas
            ref={canvasRef}
            width={224}
            height={224}
            style={{ display: "none" }}
          />

          {!hasCamera && !cameraError && <p>Ищем Вашу камеру...</p>}
          {cameraError && (
            <p>
              Камера недоступна: {cameraError.name || "UnknownError"}
            </p>
          )}
        </div>

        {gesture && (
          <div
            style={{
              marginTop: "12px",
              textAlign: "center",
              fontSize: "20px",
              fontWeight: "600",
            }}
          >
            {gesture}
            {confidence !== null && (
              <span
                style={{
                  fontSize: "14px",
                  marginLeft: "8px",
                  opacity: 0.6,
                }}
              >
                {(confidence * 100).toFixed(1)}%
              </span>
            )}
          </div>
        )}
      </div>

      <footer className="footer">GESTU</footer>
    </div>
  );
};

export default PracticeIRL;