import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import "./../Styles/PracticeLesson.css";
import logotype from "./../assets/logo.svg";

const PROGRESS_KEY = "gestu_completed_keys";

const readCompleted = () => {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    const set = new Set();
    if (Array.isArray(arr)) arr.forEach((x) => set.add(String(x)));
    return set;
  } catch {
    return new Set();
  }
};

const writeCompleted = (set) => {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(Array.from(set)));
};

const normalize = (s) =>
  String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const PracticeLesson = () => {
  const navigate = useNavigate();
  const { category, order } = useParams();
  const location = useLocation();

  const qs = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const topicWord = (qs.get("word") || "").trim();
  const lessonId = (qs.get("lesson_id") || "").trim();

  // ключ как в Exercise: если есть lesson_id — используем его, иначе category:order
  const lessonKey = useMemo(() => {
    if (lessonId) return String(lessonId);
    return `${String(category || "")}:${String(order || "")}`;
  }, [lessonId, category, order]);

  // camera
  const [hasCamera, setHasCamera] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  // canvas для отправки 224x224
  const canvasRef = useRef(null);

  // детект (реальный, из WS)
  const [detectedWord, setDetectedWord] = useState("");
  const [manualWord, setManualWord] = useState("");

  // информация
  const [showInfo, setShowInfo] = useState(false);

  // status
  const [completedKeys, setCompletedKeys] = useState(() => readCompleted());

  const isCompleted = useMemo(() => completedKeys.has(lessonKey), [completedKeys, lessonKey]);

  const isMatch = useMemo(() => {
    if (!topicWord || !detectedWord) return false;
    return normalize(topicWord) === normalize(detectedWord);
  }, [topicWord, detectedWord]);

  // если совпало — автоматически засчитываем урок
  useEffect(() => {
    if (!isMatch) return;

    setCompletedKeys((prev) => {
      if (prev.has(lessonKey)) return prev;
      const next = new Set(prev);
      next.add(lessonKey);
      writeCompleted(next);
      return next;
    });
  }, [isMatch, lessonKey]);

  const toggleCompleted = () => {
    const next = new Set(completedKeys);
    if (next.has(lessonKey)) next.delete(lessonKey);
    else next.add(lessonKey);
    setCompletedKeys(next);
    writeCompleted(next);
  };

  // Telegram expand + safe area vars (не ломает, если Telegram нет)
  useEffect(() => {
    const tg = window?.Telegram?.WebApp;
    if (!tg) return;

    try {
      tg.ready?.();
      tg.expand?.();
    } catch {}

    const applyInsets = () => {
      const inset = tg.contentSafeAreaInset || tg.safeAreaInset || {};
      const top = Number(inset.top) || 0;
      const bottom = Number(inset.bottom) || 0;
      document.documentElement.style.setProperty("--tma-safe-top", `${top}px`);
      document.documentElement.style.setProperty("--tma-safe-bottom", `${bottom}px`);
    };

    applyInsets();
    tg.onEvent?.("contentSafeAreaChanged", applyInsets);
    tg.onEvent?.("safeAreaChanged", applyInsets);

    return () => {
      tg.offEvent?.("contentSafeAreaChanged", applyInsets);
      tg.offEvent?.("safeAreaChanged", applyInsets);
    };
  }, []);

  // start camera
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
      } catch (err) {
        streamRef.current = null;
        setHasCamera(false);
        setCameraError(err);
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

  const [wsStatus, setWsStatus] = useState("connecting");
  const [wsStatusText, setWsStatusText] = useState("Соединяем…");

  const wsRef = useRef(null);
  const connectingRef = useRef(false);
  const shouldReconnectRef = useRef(true);
  const reconnectTimerRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const pendingReconnectRef = useRef(false);

  const wsSeqRef = useRef(0);
  const activeSeqRef = useRef(0);

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

  const connectWs = useCallback(
    (force = false) => {
      if (document.visibilityState === "hidden") return;

      cleanupReconnectTimer();

      const existing = wsRef.current;
      if (
        !force &&
        existing &&
        (existing.readyState === WebSocket.OPEN ||
          existing.readyState === WebSocket.CONNECTING)
      ) {
        return;
      }

      if (existing && existing.readyState !== WebSocket.CLOSED) {
        try {
          existing.onopen =
            existing.onmessage =
            existing.onerror =
            existing.onclose =
              null;
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

      const ws = new WebSocket(getWsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        if (activeSeqRef.current !== seq) return;
        connectingRef.current = false;
        reconnectAttemptRef.current = 0;
        setWsStatus("connected");
        setWsStatusText("Подключено");
      };

      ws.onmessage = (event) => {
        if (activeSeqRef.current !== seq) return;
        try {
          const data = JSON.parse(event.data);
          if (data?.type === "ping") return;

          if (typeof data?.word === "string") {
            const w = data.word.trim();
            if (!w) return;
            setDetectedWord(w);
          }
        } catch {}
      };

      ws.onerror = () => {
        if (activeSeqRef.current !== seq) return;
        connectingRef.current = false;
      };

      ws.onclose = () => {
        if (activeSeqRef.current !== seq) return;

        connectingRef.current = false;
        wsRef.current = null;

        setWsStatus("disconnected");
        setWsStatusText("Нет соединения");

        if (!shouldReconnectRef.current) return;
        if (document.visibilityState === "hidden") return;

        if (pendingReconnectRef.current) {
          pendingReconnectRef.current = false;
          reconnectAttemptRef.current = 0;
          connectWs(false);
          return;
        }

        const attempt = Math.min(reconnectAttemptRef.current, 5);
        const delay = Math.min(500 * Math.pow(2, attempt), 10000);

        setWsStatus("connecting");
        setWsStatusText("Соединяем…");

        reconnectTimerRef.current = setTimeout(() => {
          reconnectAttemptRef.current += 1;
          connectWs(false);
        }, delay);
      };
    },
    [closeWs]
  );

  const reconnectNow = useCallback(() => {
    const ws = wsRef.current;

    pendingReconnectRef.current = true;
    shouldReconnectRef.current = true;
    reconnectAttemptRef.current = 0;

    if (ws && ws.readyState !== WebSocket.CLOSED) {
      ws.close(1000, "manual_reconnect");
      return;
    }

    connectWs(true);
  }, [connectWs]);

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

  // отправка кадров в WS
  useEffect(() => {
    if (!hasCamera) return;
    if (!videoRef.current) return;

    if (!canvasRef.current) return;

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

      const SEND_INTERVAL_MS = 66;
      if (time - lastSent < SEND_INTERVAL_MS) return;

      if (ws.bufferedAmount > 1_000_000) return;
      if (video.readyState < 2) return;

      lastSent = time;

      const vw = video.videoWidth;
      const vh = video.videoHeight;

      const side = Math.min(vw, vh);
      const sx = (vw - side) / 2;
      const sy = (vh - side) / 2;


      ctx.drawImage(video, sx, sy, side, side, 0, 0, 224, 224);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.75);

      ws.send(JSON.stringify({ type: "frame", data: dataUrl }));
    };

    rafId = requestAnimationFrame(sendFrame);
    return () => cancelAnimationFrame(rafId);
  }, [hasCamera]);

  const openMenu = () => navigate("/menu");
  const backToLesson = () => navigate(`/exercise/${category}/${order}`);

  const onSubmitManual = (e) => {
    e.preventDefault();
    const v = manualWord.trim();
    if (!v) return;
    setDetectedWord(v);
  };

  return (
    <div className="practice-lesson-screen">
      <header className="practice-lesson-topbar">
        <button className="practice-lesson-menu-btn" onClick={openMenu}>☰</button>
        <h1 className="practice-lesson-logo">GESTU</h1>
        <div className="practice-lesson-logo-icon">
          <img src={logotype} alt="logo" />
        </div>
      </header>

      <div className="practice-lesson-content">
        <div className="practice-lesson-topic-row">
          <div className="practice-lesson-topic">
            ТЕМА: <span className="practice-lesson-topic-word">{topicWord || "—"}</span>
          </div>

          <button
            className="practice-lesson-info-btn practice-lesson-info-btn--topic"
            onClick={() => setShowInfo(true)}
            type="button"
            aria-label="Информирование по распознаванию"
            title="Информирование"
          >
            ℹ️
          </button>
        </div>

        <button className="practice-lesson-back-btn" onClick={backToLesson}>
          Вернуться к уроку
        </button>

        <div className="practice-lesson-camera-card">
          <div className="practice-lesson-video-wrap">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="practice-lesson-video"
            />
            <canvas
              ref={canvasRef}
              width={224}
              height={224}
              style={{ display: "none" }}
            />
          </div>

          {!hasCamera && !cameraError && (
            <div className="practice-lesson-hint">Ищем вашу камеру…</div>
          )}
          {cameraError && (
            <div className="practice-lesson-hint">
              Камера недоступна: {cameraError?.name || "UnknownError"}
            </div>
          )}

          <div className="practice-lesson-hint" style={{ opacity: 0.85 }}>
            {wsStatusText}
          </div>

          <div className="practice-lesson-detect-box">
            <div className="practice-lesson-detect-title">Слова после детекции</div>
            <div className="practice-lesson-detect-value">
              {detectedWord ? detectedWord : "—"}
            </div>
          </div>


          {detectedWord && (
            <div className={`practice-lesson-compare ${isMatch ? "ok" : "fail"}`}>
              {isMatch ? "Совпало ✓ Урок засчитан" : "Не совпало ✗ Попробуй ещё"}
            </div>
          )}
        </div>
        {showInfo && (
          <div
            className="practice-lesson-info-overlay"
            onClick={() => setShowInfo(false)}
            role="presentation"
          >
            <div
              className="practice-lesson-info-modal"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
            >
              <div className="practice-lesson-info-title">
                Чтобы распознавание букв работало стабильно:
              </div>

              <ol className="practice-lesson-info-list">
                <li>Свет — ровное освещение без сильных теней и засветов.</li>
                <li>Кадр — держите всю кисть полностью в кадре, ближе к центру, примерно 30–60 см от камеры.</li>
                <li>Фон — лучше однотонный, без лишних движений за спиной.</li>
                <li>Поза — показывайте жест как в уроке, не перекрывайте пальцы, по возможности без перчаток/крупных аксессуаров.</li>
                <li>Стабилизация — удерживайте жест неподвижно 1–2 секунды. Результат фиксируется после нескольких кадров.</li>
                <li>Буквы с движением — для динамичных делайте движение плавно и в пределах кадра.</li>
              </ol>

              <button
                className="practice-lesson-info-close"
                onClick={() => setShowInfo(false)}
                type="button"
              >
                Понятно
              </button>
            </div>
          </div>
        )}
      </div>

      {/* нижняя плашка статуса */}
      <button
        className={`practice-lesson-status ${isCompleted ? "done" : "todo"}`}
        onClick={toggleCompleted}
        title="Нажми, чтобы переключить статус"
      >
        {isCompleted ? "Урок пройден" : "Урок не пройден"}
      </button>
    </div>
  );
};

export default PracticeLesson;
