import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./../Styles/PracticeIRL.css";
import logotype from "./../assets/logo.svg";

const PracticeIRL = () => {
  const [hasCamera, setHasCamera] = useState(false);
  const [cameraError, setCameraError] = useState(null);

  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const navigate = useNavigate();

  const openMenu = () => navigate("/menu");

  useEffect(() => {
    let cancelled = false;

    const startCamera = async () => {
      console.log("mediaDevices:", navigator.mediaDevices);
      console.log("getUserMedia:", navigator.mediaDevices?.getUserMedia);

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        console.log("STREAM OK:", stream);
        console.log("VIDEO TRACKS:", stream.getVideoTracks());

        streamRef.current = stream;
        setCameraError(null);
        setHasCamera(true);
      } catch (error) {
        console.error("CAMERA ERROR:", error?.name, error?.message, error);
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
      videoEl
        .play()
        .then(() => console.log("VIDEO PLAYING"))
        .catch((e) => console.error("PLAY ERROR:", e));
    };

    videoEl.addEventListener("loadedmetadata", onLoaded);

    if (videoEl.readyState >= 1) {
      onLoaded();
    }

    return () => {
      videoEl.removeEventListener("loadedmetadata", onLoaded);
    };
  }, [hasCamera]); // привязываем, когда камера стала "доступна"

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
          {/* ВАЖНО: video всегда в DOM */}
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
            }}
          />

          {!hasCamera && !cameraError && <p>Ищем Вашу камеру...</p>}
          {cameraError && (
            <p>
              Камера недоступна: {cameraError.name || "UnknownError"}
            </p>
          )}
        </div>
      </div>

      <button
        className="capture-btn"
        onClick={() => alert("Снимок сделан")}
        disabled={!hasCamera}
        title={!hasCamera ? "Сначала включите камеру" : ""}
      >
        Сделать снимок
      </button>

      <footer className="footer">GESTU</footer>
    </div>
  );
};

export default PracticeIRL;