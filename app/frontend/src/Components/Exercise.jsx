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

const keysForLesson = (slug, lesson) => {
  const keys = [];
  if (lesson?.lesson_id != null) keys.push(String(lesson.lesson_id));
  if (lesson?.lesson_order != null) keys.push(`${slug}:${lesson.lesson_order}`);
  return keys;
};

const hasCompletedLesson = (slug, lesson, completedKeys) => {
  return keysForLesson(slug, lesson).some((k) => completedKeys.has(k));
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
  const scrollRef = useRef(null);

  const notify = (msg) => {
    const tg = window?.Telegram?.WebApp;
    if (tg?.showAlert) tg.showAlert(msg);
    else alert(msg);
  };

  // Telegram safe area + expand
  useEffect(() => {
    const tg = window?.Telegram?.WebApp;
    if (!tg) return;

    try {
      tg.ready?.();
      tg.expand?.(); // раскрыть bottom sheet :contentReference[oaicite:2]{index=2}
    } catch {}

    const applyInsets = () => {
      const inset = tg.contentSafeAreaInset || tg.safeAreaInset || {};
      const top = Number(inset.top) || 0;
      document.documentElement.style.setProperty("--tma-safe-top", `${top}px`);
    };

    applyInsets();

    tg.onEvent?.("contentSafeAreaChanged", applyInsets);
    tg.onEvent?.("safeAreaChanged", applyInsets);

    return () => {
      tg.offEvent?.("contentSafeAreaChanged", applyInsets);
      tg.offEvent?.("safeAreaChanged", applyInsets);
    };
  }, []);

  // reset scroll on change
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
    window.scrollTo(0, 0);
  }, [category, order]);

  // load lessons
  useEffect(() => {
    let alive = true;

    const load = async () => {
      if (!category) return;

      setLoading(true);
      setLoadError("");
      setDebugText("");

      try {
        const headers = getAuthHeaders();
        const base = API_BASE || window.location.origin;

        const requestUrl =
          joinUrl(base, `/api/v1/categories/${category}/lessons`) +
          `?ts=${Date.now()}`;

        const res = await fetch(requestUrl, {
          headers,
          cache: "no-store",
        });

        const body = await res.text();

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

        let data;
        try {
          data = JSON.parse(body);
        } catch {
          setLessons([]);
          setLoadError("API вернул не JSON. Проверь эндпоинт /api/v1/.../lessons");
          setDebugText(body.slice(0, 400));
          return;
        }

        const sorted = Array.isArray(data)
          ? data.slice().sort((a, b) => (a.lesson_order ?? 0) - (b.lesson_order ?? 0))
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

  // sync progress
  useEffect(() => {
    setCompletedKeys(readCompleted());
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

  // fix wrong order in url
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
    return hasCompletedLesson(category, currentLesson, completedKeys);
  }, [completedKeys, currentLesson, category]);

  // ✅ определяем "первый непройденный" — дальше него заходить нельзя (чтобы URL тоже не ломал цепочку)
  const firstIncompleteOrder = useMemo(() => {
    if (!lessons.length) return 1;
    for (const l of lessons) {
      const ord = Number(l?.lesson_order);
      if (!ord) continue;
      if (!hasCompletedLesson(category, l, completedKeys)) return ord;
    }
    return maxOrder; // всё пройдено
  }, [lessons, completedKeys, category, maxOrder]);

  const lockWarnedRef = useRef(false);

  // ✅ защита от прыжка вперёд через URL
  useEffect(() => {
    if (loading) return;
    if (!lessons.length) return;
    if (!category) return;

    // можно быть на любом <= firstIncompleteOrder
    if (safeOrder > firstIncompleteOrder) {
      if (!lockWarnedRef.current) {
        lockWarnedRef.current = true;
        notify("Пройдите текущий урок");
      }
      navigate(`/exercise/${category}/${firstIncompleteOrder}`, { replace: true });
    } else {
      lockWarnedRef.current = false;
    }
  }, [loading, lessons.length, category, safeOrder, firstIncompleteOrder, navigate]);

  const toggleCompleted = () => {
    if (!currentLesson) return;

    const keys = keysForLesson(category, currentLesson);
    if (!keys.length) return;

    const next = new Set(completedKeys);

    const already = keys.some((k) => next.has(k));
    if (already) keys.forEach((k) => next.delete(k));
    else keys.forEach((k) => next.add(k));

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

    if (!isCompleted) {
      notify("Пройдите текущий урок");
      return;
    }

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

  const descriptionText = currentLesson?.description?.trim()
    ? currentLesson.description
    : "Описание урока отсутствует";

  const videoSrc = resolveMediaUrl(currentLesson?.content_url);

  return (
    <div className="exercises-screen">
      <header className="exercise-topbar">
        <button className="exercise-menu-btn" onClick={() => navigate("/menu")}>☰</button>
        <h1 className="exercise-logo">GESTU</h1>
        <div className="exercise-logo-icon">
          <img src={logotype} alt="logo" />
        </div>
      </header>

      <div className="exercise-scroll" ref={scrollRef}>
        <div className="exercise-meta">
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
          {isCompleted ? "Урок пройден" : "Урок не пройден"}
        </button>

        <div className="exercise-text-box">
          {debugText ? <pre className="exercise-debug">{debugText}</pre> : null}
          <div className="exercise-text">
            {loading ? "Загрузка описания…" : loadError ? loadError : descriptionText}
          </div>
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
            <div className="exercise-video-empty">
              {loading ? "Загрузка видео…" : "Видео не найдено для этого урока"}
            </div>
          )}
        </div>

        <div className="exercise-nav">
          <button className="nav-btn" onClick={goPrev} disabled={prevDisabled || !lessons.length}>
            &lt; Назад
          </button>

          {/* не делаю disabled по прогрессу, чтобы можно было кликнуть и получить уведомление */}
          <button className="nav-btn" onClick={goNext} disabled={nextDisabled || !lessons.length}>
            Вперёд &gt;
          </button>
        </div>

        <button
          className="exercises-start-btn"
          disabled={!currentLesson}
          onClick={() =>
            navigate(
              `/practice-lesson/${category}/${safeOrder}?lesson_id=${currentLesson?.lesson_id ?? ""}&word=${encodeURIComponent(currentLesson?.title ?? "")}`
            )
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
