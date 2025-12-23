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
  if (/^https?:\/\//i.test(url)) return url;
  return joinUrl(API_BASE, url);
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
    return new Set(arr.map(String));
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
  const [completedKeys, setCompletedKeys] = useState(() => readCompleted());

  const videoRef = useRef(null);

  // загрузка уроков из БД
  useEffect(() => {
    let alive = true;

    const load = async () => {
      if (!category) return;

      setLoading(true);
      setLoadError("");

      try {
        const headers = getAuthHeaders();
        const base = API_BASE || window.location.origin;

        const res = await fetch(
          joinUrl(base, `/api/v1/categories/${category}/lessons`),
          { headers }
        );

        if (!alive) return;

        if (!res.ok) {
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

        const sorted = Array.isArray(data)
          ? data.slice().sort(
              (a, b) => (a.lesson_order ?? 0) - (b.lesson_order ?? 0)
            )
          : [];

        setLessons(sorted);
      } catch {
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

  // синхронизация прогресса
  useEffect(() => {
    setCompletedKeys(readCompleted());
  }, [category, order]);

  const currentOrder = Number(order || 1);

  const maxOrder = useMemo(() => {
    if (!lessons.length) return 1;
    return Number(lessons[lessons.length - 1]?.lesson_order || 1);
  }, [lessons]);

  const safeOrder = useMemo(() => {
    return Math.min(Math.max(1, currentOrder), maxOrder);
  }, [currentOrder, maxOrder]);

  useEffect(() => {
    if (!loading && lessons.length && safeOrder !== currentOrder) {
      navigate(`/exercise/${category}/${safeOrder}`, { replace: true });
    }
  }, [loading, lessons.length, safeOrder, currentOrder, category, navigate]);

  const currentLesson = useMemo(() => {
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
    next.has(key) ? next.delete(key) : next.add(key);
    setCompletedKeys(next);
    writeCompleted(next);
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    v.paused ? v.play().catch(() => {}) : v.pause();
  };

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

        <button
          className={`lesson-status-btn ${isCompleted ? "done" : ""}`}
          onClick={toggleCompleted}
          disabled={!currentLesson}
        >
          {isCompleted ? "✓" : "○"}
        </button>

        <div className="exercise-text-box">
          <p className="exercise-text">
            {loading ? "Загрузка описания…" : loadError || descriptionText}
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
            />
          ) : (
            <div style={{ padding: 12 }}>
              {loading ? "Загрузка видео…" : "Видео не найдено"}
            </div>
          )}
        </div>

        <div className="exercise-nav">
          <button
            className="nav-btn"
            onClick={() =>
              safeOrder > 1 &&
              navigate(`/exercise/${category}/${safeOrder - 1}`)
            }
          >
            &lt; Назад
          </button>
          <button
            className="nav-btn"
            onClick={() =>
              safeOrder < maxOrder &&
              navigate(`/exercise/${category}/${safeOrder + 1}`)
            }
          >
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
