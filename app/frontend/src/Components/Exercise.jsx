import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import "./../Styles/Exercise.css";
import logotype from "./../assets/logo.svg";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

const getAuthHeaders = () => {
  const initData = window?.Telegram?.WebApp?.initData;
  return initData ? { "X-Telegram-Init-Data": initData } : {};
};

const readCompleted = () => {
  try {
    const raw = localStorage.getItem("gestu_completed_lesson_ids");
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
};

const writeCompleted = (set) => {
  localStorage.setItem("gestu_completed_lesson_ids", JSON.stringify(Array.from(set)));
};

const Exercise = () => {
  const navigate = useNavigate();
  const { category, order } = useParams();

  const [categories, setCategories] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [completedIds, setCompletedIds] = useState(() => readCompleted());

  const videoRef = useRef(null);

  useEffect(() => {
    (async () => {
      const res = await fetch(`${API_BASE}/api/v1/categories`, { headers: { ...getAuthHeaders() } });
      const data = await res.json();
      setCategories(Array.isArray(data) ? data : []);
    })().catch(() => {});
  }, []);

  useEffect(() => {
    if (!category) return;
    (async () => {
      const res = await fetch(`${API_BASE}/api/v1/categories/${category}/lessons`, {
        headers: { ...getAuthHeaders() },
      });
      const data = await res.json();
      const sorted = Array.isArray(data)
        ? data.slice().sort((a, b) => (a.lesson_order ?? 0) - (b.lesson_order ?? 0))
        : [];
      setLessons(sorted);
    })().catch(() => {});
  }, [category]);

  const currentOrder = Number(order || 1);

  const currentLesson = useMemo(() => {
    return lessons.find((l) => Number(l.lesson_order) === currentOrder) || null;
  }, [lessons, currentOrder]);

  const categoryTitle = useMemo(() => {
    return categories.find((c) => c.slug === category)?.title || category;
  }, [categories, category]);

  const isCompleted = currentLesson ? completedIds.has(currentLesson.lesson_id) : false;

  const toggleCompleted = () => {
    if (!currentLesson) return;
    const next = new Set(completedIds);
    if (next.has(currentLesson.lesson_id)) next.delete(currentLesson.lesson_id);
    else next.add(currentLesson.lesson_id);
    setCompletedIds(next);
    writeCompleted(next);
  };

  const prevDisabled = currentOrder <= 1;
  const nextDisabled = currentOrder >= (lessons[lessons.length - 1]?.lesson_order ?? currentOrder);

  const goPrev = () => {
    if (prevDisabled) return;
    navigate(`/exercise/${category}/${currentOrder - 1}`);
  };

  const goNext = () => {
    if (nextDisabled) return;
    navigate(`/exercise/${category}/${currentOrder + 1}`);
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  };

  if (!currentLesson) return <div>Загрузка...</div>;

  return (
    <div className="exercises-screen">
      <header className="header">
        <button className="menu-btn" onClick={() => navigate("/menu")}>☰</button>
        <h1 className="logo">GESTU</h1>
        <div className="logo-icon"><img src={logotype} alt="logo" /></div>
      </header>

      <div className="exercise-container">
        <div className="exercise-header">
          <div className="exercise-category">
            КАТЕГОРИЯ: {categoryTitle}
          </div>
          <div className="exercise-topic">
            ТЕМА: {currentLesson.title}
          </div>
        </div>

        <button
          className={`lesson-status-btn ${isCompleted ? "done" : ""}`}
          onClick={toggleCompleted}
          aria-label="Статус урока"
        >
          {isCompleted ? "✓" : "○"}
        </button>

        <div className="exercise-text-box">
          <p className="exercise-text">{currentLesson.description}</p>
        </div>

        <div className="exercise-video-box" onClick={togglePlay}>
          <video
            ref={videoRef}
            src={currentLesson.content_url}
            loop
            autoPlay
            playsInline
            controls={false}
            preload="auto"
          />
        </div>

        <div className="exercise-nav">
          <button className="nav-btn" onClick={goPrev} disabled={prevDisabled}>
            &lt; Назад
          </button>
          <button className="nav-btn" onClick={goNext} disabled={nextDisabled}>
            Вперёд &gt;
          </button>
        </div>

        <button
          className="exercises-start-btn"
          onClick={() => navigate(`/practice?lesson_id=${currentLesson.lesson_id}`)}
        >
          Перейти к практике
        </button>
      </div>

      <footer className="footer">GESTU</footer>
    </div>
  );
};

export default Exercise;
