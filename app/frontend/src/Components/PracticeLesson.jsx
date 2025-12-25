import React, { useEffect, useMemo, useRef, useState } from "react";
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

  // "детект" заглушка
  const [detectedWord, setDetectedWord] = useState("");
  const [manualWord, setManualWord] = useState("");

  // status
  const [completedKeys, setCompletedKeys] = useState(() => readCompleted());

  const isCompleted = useMemo(() => completedKeys.has(lessonKey), [completedKeys, lessonKey]);

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
      tg.expand?.(); // expand() и --tg-viewport-height описаны в доках Telegram WebApp :contentReference[oaicite:1]{index=1}
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

  // start camera (как в PracticeIRL, но без WS) :contentReference[oaicite:2]{index=2}
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
        <div className="practice-lesson-topic">
          ТЕМА: <span className="practice-lesson-topic-word">{topicWord || "—"}</span>
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
          </div>

          {!hasCamera && !cameraError && (
            <div className="practice-lesson-hint">Ищем вашу камеру…</div>
          )}
          {cameraError && (
            <div className="practice-lesson-hint">
              Камера недоступна: {cameraError?.name || "UnknownError"}
            </div>
          )}

          <div className="practice-lesson-detect-box">
            <div className="practice-lesson-detect-title">Слова после детекции (заглушка)</div>
            <div className="practice-lesson-detect-value">
              {detectedWord ? detectedWord : "—"}
            </div>
          </div>

          <form className="practice-lesson-manual" onSubmit={onSubmitManual}>
            <input
              className="practice-lesson-input"
              value={manualWord}
              onChange={(e) => setManualWord(e.target.value)}
              placeholder="Введи слово для теста…"
            />
            <button className="practice-lesson-input-btn" type="submit">
              Показать
            </button>
          </form>
        </div>
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
