import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import "./../Styles/Exercise.css";
import logotype from "./../assets/logo.svg";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

const CATEGORIES_RU = {
  words: "Алфавит",
  animals: "Животные",
  numbers: "Числа",
};

const joinUrl = (base, path) => {
  if (!base) return path;
  return `${base.replace(/\/+$/, "")}/${String(path || "").replace(/^\/+/, "")}`;
};

const resolveMediaUrl = (url) => {
  if (!url) return "";
  const s = String(url);
  if (/^https?:\/\//i.test(s)) return s;
  return joinUrl(API_BASE, s);
};

const getInitData = () => {
  try {
    return window?.Telegram?.WebApp?.initData || "";
  } catch {
    return "";
  }
};

const getAuthHeaders = () => {
  const initData = getInitData();
  return initData ? { "X-Telegram-Init-Data": initData } : {};
};

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

const lessonKey = (slug, lesson) => {
  if (lesson?.lesson_id != null) return String(lesson.lesson_id);
  return `${slug}:${lesson?.lesson_order ?? ""}`;
};

const Exercise = () => {
  const navigate = useNavigate();
  const { category, order } = useParams();

  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [debugText, setDebugText] = useState(""); 
  const [completedKeys, setCompletedKeys] = useState(() => readCompleted());

  const videoRef = useRef(null);

  // подтягиваем уроки из БД
  useEffect(() => {
    let alive = true;

    const load = async () => {
      if (!category) return;

      setLoading(true);
      setLoadError("");
      setDebugText("");

      try {
        const headers = getAuthHeaders();

        console.log("Telegram object:", window.Telegram);
        console.log("initData:", window.Telegram?.WebApp?.initData);
        console.log("REQUEST HEADERS:", headers);
        const initData = getInitData();

        /*
        const res = await fetch(
          joinUrl(API_BASE, `/api/v1/categories/${category}/lessons`),
          {
            headers,
          }
        );

        setDebugText((p) => p + `\nHTTP status: ${res.status}`);

        if (!alive) return;

        if (!res.ok) {
          // 401 = нет Telegram initData (или невалидная подпись)
          if (res.status === 401) {
            setLoadError(
              "Нет авторизации Telegram (initData). Открой мини-апп внутри Telegram."
            );
          } else if (res.status === 404) {
            setLoadError("Категория не найдена.");
          } else {
            setLoadError(`Ошибка загрузки уроков (${res.status}).`);
          }
          setLessons([]);
          return;
        }

        const data = await res.json();

        */

        const base = API_BASE || window.location.origin;

        const requestUrl =
          joinUrl(base, `/api/v1/categories/${category}/lessons`) +
          `?ts=${Date.now()}`;

        const res = await fetch(requestUrl, {
          headers,
          cache: "no-store",
        });

        const ct = res.headers.get("content-type") || "";
        const body = await res.text();

        if (!res.ok) {
          if (res.status === 401) {
            setLoadError("Нет авторизации Telegram (initData). Открой мини-апп внутри Telegram.");
          } else if (res.status === 404) {
            setLoadError("Категория не найдена.");
          } else {
            setLoadError(`Ошибка загрузки уроков (${res.status}).`);
          }
          setLessons([]);
          return;
        }

        let data;
        try {
          data = JSON.parse(body);
        } catch {
          setLessons([]);
          setLoadError(
            "API вернул HTML вместо JSON. Смотри debug: requestUrl/response.url/content-type/body head."
          );
          return;
        }

        const sorted = Array.isArray(data)
          ? data.slice().sort((a, b) => (a.lesson_order ?? 0) - (b.lesson_order ?? 0))
          : [];

        setLessons(sorted);
      } catch (e) {
        if (!alive) return;
        setLessons([]);
        setLoadError("Не удалось загрузить уроки (ошибка сети).");
      } finally {
        if (alive) setLoading(false);
      }
    };

    load();

    return () => {
      alive = false;
    };
  }, [category]);

  // синхронизируем прогресс
  useEffect(() => {
    const sync = () => setCompletedKeys(readCompleted());
    sync();
  }, [category, order]);

  const currentOrder = Number(order || 1);

  const maxOrder = useMemo(() => {
    if (!lessons.length) return 1;
    const last = lessons[lessons.length - 1];
    return Number(last?.lesson_order || lessons.length || 1);
  }, [lessons]);

  const safeOrder = useMemo(() => {
    const n = Number.isFinite(currentOrder) ? currentOrder : 1;
    return Math.min(Math.max(1, n), maxOrder || 1);
  }, [currentOrder, maxOrder]);

  // если в URL кривой order — аккуратно правим
  useEffect(() => {
    if (loading) return;
    if (!lessons.length) return;
    if (!category) return;
    if (safeOrder !== currentOrder) {
      navigate(`/exercise/${category}/${safeOrder}`, { replace: true });
    }
  }, [loading, lessons.length, category, safeOrder, currentOrder, navigate]);

  const currentLesson = useMemo(() => {
    if (!lessons.length) return null;
    return lessons.find((l) => Number(l.lesson_order) === safeOrder) || null;
  }, [lessons, safeOrder]);

  const categoryTitle = CATEGORIES_RU[category] || category;

  const isCompleted = useMemo(() => {
    if (!currentLesson) return false;
    return completedKeys.has(lessonKey(category, currentLesson));
  }, [completedKeys, currentLesson, category]);

  const toggleCompleted = () => {
    if (!currentLesson) return;
    const key = lessonKey(category, currentLesson);
    const next = new Set(completedKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setCompletedKeys(next);
    writeCompleted(next);
  };

  const goPrev = () => {
    const prev = safeOrder - 1;
    if (prev < 1) return;
    navigate(`/exercise/${category}/${prev}`);
  };

  const goNext = () => {
    const next = safeOrder + 1;
    if (next > maxOrder) return;
    navigate(`/exercise/${category}/${next}`);
  };

  const prevDisabled = safeOrder <= 1;
  const nextDisabled = safeOrder >= maxOrder;

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  };

  // UI-состояния
  const descriptionText = currentLesson?.description?.trim()
    ? currentLesson.description
    : "Описание урока отсутствует";

  const videoSrc = resolveMediaUrl(currentLesson?.content_url);

  return (
    <div className="exercises-screen">
      <header className="header">
        <button className="menu-btn" onClick={() => navigate("/menu")}>
          ☰
        </button>
        <h1 className="logo">GESTU</h1>
        <div className="logo-icon">
          <img src={logotype} alt="logo" />
        </div>
      </header>

      <div className="exercise-container">
        <div className="exercise-header">
          <div className="exercise-category">КАТЕГОРИЯ: {categoryTitle}</div>
          <div className="exercise-topic">
            ТЕМА: {currentLesson?.title || (loading ? "Загрузка…" : "—")}
          </div>
        </div>

        <button className="nav-btn" style={{color: "purple"}} onClick={() => navigate("/categories")}>Вернуться к категориям</button>
        <button
          className={`lesson-status-btn ${isCompleted ? "done" : ""}`}
          onClick={toggleCompleted}
          style={{color: "black"}}
          disabled={!currentLesson}
          aria-label="Статус урока"
          title={isCompleted ? "Урок пройден" : "Не пройден"}
        >
          {isCompleted ? "Урок пройден" : "Урок не пройден"}
        </button>


        <div className="exercise-text-box">
          <pre
            style={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              fontSize: 12,
              lineHeight: 1.3,
              margin: "0 0 8px 0",
              color: "#333",
            }}
          >{debugText}</pre>
          <p className="exercise-text">
            {loading ? "Загрузка описания…" : loadError ? loadError : descriptionText}
          </p>
        </div>

        <div className="exercise-video-box" onClick={togglePlay}>
          {videoSrc ? (
            <video
              ref={videoRef}
              src={videoSrc}
              loop
              autoPlay
              muted
              playsInline
              controls={false}
              preload="auto"
            />
          ) : (
            <div style={{ padding: 12 }}>
              {loading ? "Загрузка видео…" : "Видео не найдено для этого урока"}
            </div>
          )}
        </div>

        <div className="exercise-nav">
          <button className="nav-btn" onClick={goPrev} disabled={prevDisabled || !lessons.length}>
            &lt; Назад
          </button>
          <button className="nav-btn" onClick={goNext} disabled={nextDisabled || !lessons.length}>
            Вперёд &gt;
          </button>
        </div>

        <button
          className="exercises-start-btn"
          disabled={!currentLesson}
          onClick={() =>
            navigate(`/practice?lesson_id=${currentLesson?.lesson_id ?? ""}`)
          }
        >
          Перейти к практике
        </button>
      </div>

      <footer className="footer">GESTU</footer>
    </div>
  );
};

export default Exercise;
