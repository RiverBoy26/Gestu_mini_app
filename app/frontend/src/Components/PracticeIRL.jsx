import React, { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import "./../Styles/PracticeIRL.css";
import logotype from "./../assets/logo.svg";

const PracticeIRL = () => {
  const [hasCamera, setHasCamera] = useState(false);
  const [cameraError, setCameraError] = useState(null);

  const [gesture, setGesture] = useState(null);
  const [confidence, setConfidence] = useState(null);

  const [wsStatus, setWsStatus] = useState("connecting");
  const [wsStatusText, setWsStatusText] = useState("Пытаемся установить соединение...");
  const [wsDebug, setWsDebug] = useState(null);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const canvasRef = useRef(null);

  const connectingRef = useRef(false);

  const wsRef = useRef(null);
  const shouldReconnectRef = useRef(true);
  const reconnectTimerRef = useRef(null);
  const reconnectAttemptRef = useRef(0);

  const wsSeqRef = useRef(0);
  const activeSeqRef = useRef(0);

  const navigate = useNavigate();
  const openMenu = () => navigate("/menu");

  const getWsUrl = () => {
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    return `${proto}://${window.location.host}/ws/gesture`;
  };

  const cleanupReconnectTimer = () => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  };

  const closeWs = useCallback((code = 1000, reason = "client_close") => {
    cleanupReconnectTimer();
    const ws = wsRef.current;
    if (ws) {
      try {
        ws.close(code, reason);
      } catch {}
      wsRef.current = null;
    }
  }, []);

  const connectWs = useCallback((force = false) => {
    if (document.visibilityState === "hidden") return;

    cleanupReconnectTimer();

    const existing = wsRef.current;

    if (!force && existing &&
        (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) {
      return;
    }

    if (existing && existing.readyState !== WebSocket.CLOSED) {
      try {
        existing.onopen = existing.onmessage = existing.onerror = existing.onclose = null;
      } catch {}
      try {
        existing.close(1000, "replaced");
      } catch {}
      wsRef.current = null;
    }

    if (connectingRef.current) return;
    connectingRef.current = true;

    const seq = ++wsSeqRef.current;
    activeSeqRef.current = seq;

    const url = getWsUrl();
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (activeSeqRef.current !== seq) return;
      connectingRef.current = false;
      console.log("WS connected");
      reconnectAttemptRef.current = 0;
      setWsStatus("connected");
      setWsStatusText("Подключено");
    };

    ws.onmessage = (event) => {
      if (activeSeqRef.current !== seq) return;
      try {
        const data = JSON.parse(event.data);
        if (data?.type === "ping") return;
        if (typeof data?.word === "string") setGesture(data.word);
        if (typeof data?.confidence === "number") setConfidence(data.confidence);
      } catch {}
    };

    ws.onerror = (e) => {
      if (activeSeqRef.current !== seq) return;
      connectingRef.current = false;
      console.log("WS error", e);
      setWsDebug((d) => ({ ...d, lastErrorAt: Date.now() }));
    };

    ws.onclose = (e) => {
      if (activeSeqRef.current !== seq) return;

      connectingRef.current = false;
      console.log("WS closed", e.code, e.reason);

      wsRef.current = null;

      setWsStatus("disconnected");
      setWsStatusText("Нет соединения");
      setWsDebug((d) => ({
        ...d,
        lastCloseCode: e.code,
        lastCloseReason: e.reason,
        lastCloseAt: Date.now(),
      }));

      if (!shouldReconnectRef.current) return;
      if (document.visibilityState === "hidden") return;

      const attempt = Math.min(reconnectAttemptRef.current, 5);
      const delay = Math.min(500 * Math.pow(2, attempt), 10000);

      setWsStatus("connecting");
      setWsStatusText("Пытаемся установить соединение...");

      reconnectTimerRef.current = setTimeout(() => {
        reconnectAttemptRef.current += 1;
        connectWs(false);
      }, delay);
    };
  }, [closeWs]);

  const reconnectNow = useCallback(() => {
    shouldReconnectRef.current = true;
    reconnectAttemptRef.current = 0;
    closeWs(1000, "manual_reconnect");
    connectWs(true);
  }, [closeWs, connectWs]);

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
    if (videoEl.readyState >= 1) onLoaded();

    return () => {
      videoEl.removeEventListener("loadedmetadata", onLoaded);
    };
  }, [hasCamera]);

  useEffect(() => {
    shouldReconnectRef.current = true;
    connectWs(false);

    const onVis = () => {
      if (document.visibilityState === "hidden") {
        shouldReconnectRef.current = false;
        setWsStatus("disconnected");
        setWsStatusText("Пауза (вкладка скрыта)");
        closeWs(1001, "tab_hidden");
      } else {
        shouldReconnectRef.current = true;
        reconnectNow();
      }
    };

    document.addEventListener("visibilitychange", onVis);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      shouldReconnectRef.current = false;
      closeWs(1000, "unmount");
    };
  }, [connectWs, closeWs, reconnectNow]);

  useEffect(() => {
    if (!hasCamera) return;
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    let rafId;
    let lastSent = 0;

    const sendFrame = (time) => {
      rafId = requestAnimationFrame(sendFrame);

      if (document.visibilityState === "hidden") return;
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      if (time - lastSent < 120) return;
      if (video.readyState < 2) return;

      lastSent = time;

      ctx.drawImage(video, 0, 0, 224, 224);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.55);

      ws.send(JSON.stringify({ type: "frame", data: dataUrl }));
    };

    rafId = requestAnimationFrame(sendFrame);

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [hasCamera]);

  const statusColor =
    wsStatus === "connected" ? "#22c55e" : wsStatus === "connecting" ? "#f59e0b" : "#ef4444";

  return (
    <div className="app-container">
      <header className="header">
        <button className="menu-btn" onClick={openMenu}>☰</button>
        <h1 className="logo">GESTU</h1>
        <div className="logo-icon"><img src={logotype} alt="logo" /></div>
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

          <canvas ref={canvasRef} width={224} height={224} style={{ display: "none" }} />

          {!hasCamera && !cameraError && <p>Ищем Вашу камеру...</p>}
          {cameraError && <p>Камера недоступна: {cameraError.name || "UnknownError"}</p>}
        </div>

        {/* WS status */}
        <div
          style={{
            marginTop: "10px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span
              style={{
                width: "10px",
                height: "10px",
                borderRadius: "2px",
                background: statusColor,
                display: "inline-block",
              }}
              title={wsStatus}
            />
            <span style={{ fontSize: "14px", opacity: 0.85 }}>{wsStatusText}</span>
          </div>

          <button
            onClick={reconnectNow}
            disabled={wsStatus === "connecting"}
            style={{
              padding: "6px 10px",
              borderRadius: "8px",
              border: "1px solid rgba(255,255,255,0.15)",
              background: "rgba(255,255,255,0.06)",
              cursor: wsStatus === "connecting" ? "not-allowed" : "pointer",
              opacity: wsStatus === "connecting" ? 0.6 : 1,
              color: "inherit",
              fontSize: "14px",
            }}
          >
            Переподключить
          </button>
        </div>

        {/* Debug */}
        {wsDebug?.lastCloseCode && (
          <div style={{ marginTop: "6px", fontSize: "12px", opacity: 0.6 }}>
            WS close: {wsDebug.lastCloseCode} {wsDebug.lastCloseReason ? `(${wsDebug.lastCloseReason})` : ""}
          </div>
        )}

        {/* Result */}
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
              <span style={{ fontSize: "14px", marginLeft: "8px", opacity: 0.6 }}>
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