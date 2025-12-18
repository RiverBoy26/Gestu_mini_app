import React, { useEffect, useMemo, useState } from "react";
import "./../Styles/Categories.css";
import { useNavigate } from "react-router-dom";
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

function catmullRom2bezier(points) {
  if (points.length < 2) return "";
  let path = `M ${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;

    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;

    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;

    path += ` C ${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
  }
  return path;
}

const Categories = () => {
  const navigate = useNavigate();

  const [categories, setCategories] = useState([]);
  const [activeSlug, setActiveSlug] = useState(null);
  const [lessonsBySlug, setLessonsBySlug] = useState({});
  const [completedIds, setCompletedIds] = useState(() => readCompleted());

  const openMenu = () => navigate("/menu");

  useEffect(() => {
    (async () => {
      const res = await fetch(`${API_BASE}/api/v1/categories`, {
        headers: { ...getAuthHeaders() },
      });
      const data = await res.json();
      const sorted = Array.isArray(data)
        ? data.slice().sort((a, b) => (a.category_order ?? 0) - (b.category_order ?? 0))
        : [];
      setCategories(sorted);
      if (!activeSlug && sorted[0]?.slug) setActiveSlug(sorted[0].slug);
    })().catch(() => {});
  }, []);

  useEffect(() => {
    if (!activeSlug) return;
    if (lessonsBySlug[activeSlug]) return;

    (async () => {
      const res = await fetch(`${API_BASE}/api/v1/categories/${activeSlug}/lessons`, {
        headers: { ...getAuthHeaders() },
      });
      const data = await res.json();
      const lessons = Array.isArray(data)
        ? data.slice().sort((a, b) => (a.lesson_order ?? 0) - (b.lesson_order ?? 0))
        : [];
      setLessonsBySlug((prev) => ({ ...prev, [activeSlug]: lessons }));
    })().catch(() => {});
  }, [activeSlug, lessonsBySlug]);

  const rawLessons = lessonsBySlug[activeSlug] || [];

  const displayLessons = useMemo(() => {
    if (activeSlug === "words" || activeSlug === "alphabet") return rawLessons.slice().reverse();
    return rawLessons;
  }, [rawLessons, activeSlug]);

  const lessonByOrder = useMemo(() => {
    const m = new Map();
    rawLessons.forEach((l) => m.set(l.lesson_order, l));
    return m;
  }, [rawLessons]);

  const isUnlocked = (lesson) => {
    if (!lesson?.lesson_order) return false;
    if (lesson.lesson_order === 1) return true;
    const prev = lessonByOrder.get(lesson.lesson_order - 1);
    if (!prev) return true;
    return completedIds.has(prev.lesson_id);
  };

  const openExercise = (lesson) => {
    if (!lesson) return;
    if (!isUnlocked(lesson)) return;
    navigate(`/exercise/${activeSlug}/${lesson.lesson_order}`);
  };

  const nodePositions = useMemo(() => {
    return displayLessons.map((_, index) => ({
      x: index % 2 === 0 ? 45 : 165,
      y: index * 80 + 30,
    }));
  }, [displayLessons]);

  const linePath = useMemo(() => catmullRom2bezier(nodePositions), [nodePositions]);

  const roadmapHeight = Math.max(420, displayLessons.length * 80 + 60);

  return (
    <div className="categories-container">
      <header className="header">
        <button className="menu-btn" onClick={openMenu}>☰</button>
        <h1 className="logo">GESTU</h1>
        <div className="logo-icon"><img src={logotype} alt="logo" /></div>
      </header>

      <div className="scroll-area">
        <div className="categories-box">
          {categories.map((cat) => (
            <div
              key={cat.slug}
              className={`category-item ${activeSlug === cat.slug ? "active" : ""}`}
              onClick={() => setActiveSlug(cat.slug)}
            >
              <span className="category-icon">{cat.slug === "animals" ? "🐱" : cat.slug === "numbers" ? "123" : "A"}</span>
              <span className="category-label">{cat.title}</span>
            </div>
          ))}
        </div>

        <div className="roadmap" style={{ height: roadmapHeight }}>
          <svg className="roadmap-line" width="220" height={roadmapHeight}>
            <path d={linePath} stroke="white" strokeWidth="6" fill="none" />
          </svg>

          {displayLessons.map((lesson, index) => {
            const unlocked = isUnlocked(lesson);
            return (
              <div
                key={lesson.lesson_id}
                className={`node ${unlocked ? "green" : "gray"}`}
                style={{
                  top: index * 80 + "px",
                  left: index % 2 === 0 ? "20px" : "140px",
                }}
                onClick={() => openExercise(lesson)}
              />
            );
          })}
        </div>

        <footer className="footer">GESTU</footer>
      </div>
    </div>
  );
};

export default Categories;
