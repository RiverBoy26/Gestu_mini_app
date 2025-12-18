import React, { useEffect, useMemo, useState } from "react";
import "./../Styles/Categories.css";
import { useNavigate } from "react-router-dom";
import logotype from "./../assets/logo.svg";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

const STATIC_CATEGORIES = [
  { slug: "words", title: "Алфавит", category_order: 1 },
  { slug: "animals", title: "Животные", category_order: 2 },
  { slug: "numbers", title: "Числа", category_order: 3 },
];

const RUS_ALPHABET = [
  "А","Б","В","Г","Д","Е","Ё","Ж","З","И","Й","К","Л","М","Н","О","П","Р","С","Т","У","Ф","Х","Ц","Ч","Ш","Щ","Ъ","Ы","Ь","Э","Ю","Я"
];

const ANIMALS = [
  { file: "cat", title: "Кошка" },
  { file: "dog", title: "Собака" },
  { file: "goat", title: "Коза" },
  { file: "moose", title: "Лось" },
  { file: "snake", title: "Змея" },
  { file: "dolphin", title: "Дельфин" },
  { file: "donkey", title: "Осёл" },
  { file: "eagle", title: "Орел" },
  { file: "fox", title: "Лиса" },
  { file: "elephant", title: "Слон" },
];

const joinUrl = (base, path) => {
  if (!base) return path;
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
};

const getInitData = () => window?.Telegram?.WebApp?.initData || "";
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

const lessonKey = (slug, lesson) => {
  if (lesson?.lesson_id != null) return String(lesson.lesson_id);
  return `${slug}:${lesson?.lesson_order ?? ""}`;
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

const buildMockLessons = (slug) => {
  if (slug === "words") {
    return RUS_ALPHABET.map((letter, i) => ({
      lesson_id: null,
      lesson_order: i + 1,
      title: letter,
      description: "",
      content_url: `/videos/words/${letter}.mp4`,
      __mock: true,
    }));
  }
  if (slug === "numbers") {
    return Array.from({ length: 10 }).map((_, i) => ({
      lesson_id: null,
      lesson_order: i + 1,
      title: String(i),
      description: "",
      content_url: `/videos/numbers/${i}.mp4`,
      __mock: true,
    }));
  }
  if (slug === "animals") {
    return ANIMALS.map((a, i) => ({
      lesson_id: null,
      lesson_order: i + 1,
      title: a.title,
      description: "",
      content_url: `/videos/animals/${a.file}.mp4`,
      __mock: true,
    }));
  }
  return [];
};

const Categories = () => {
  const navigate = useNavigate();

  const [categories, setCategories] = useState(STATIC_CATEGORIES);
  const [activeSlug, setActiveSlug] = useState("words");

  const [lessonsBySlug, setLessonsBySlug] = useState(() => ({
    words: buildMockLessons("words"),
    animals: buildMockLessons("animals"),
    numbers: buildMockLessons("numbers"),
  }));

  const [completedKeys, setCompletedKeys] = useState(() => readCompleted());

  const openMenu = () => navigate("/menu");

  useEffect(() => {
    const sync = () => setCompletedKeys(readCompleted());
    const onVis = () => { if (!document.hidden) sync(); };

    sync();
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", onVis);

    return () => {
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  useEffect(() => {
    (async () => {
      const headers = getAuthHeaders();
      if (!headers["X-Telegram-Init-Data"]) return;

      try {
        const res = await fetch(joinUrl(API_BASE, "/api/v1/categories"), { headers });
        if (!res.ok) return;

        const data = await res.json();
        if (!Array.isArray(data) || !data.length) return;

        const sorted = data
          .slice()
          .sort((a, b) => (a.category_order ?? 0) - (b.category_order ?? 0));

        const merged = STATIC_CATEGORIES.map((s) => {
          const fromApi = sorted.find((x) => x.slug === s.slug);
          return fromApi ? { ...s, ...fromApi } : s;
        });

        setCategories(merged);
        if (!activeSlug) setActiveSlug(merged[0]?.slug || "words");
      } catch (e) {
        console.log("categories fetch error", e);
      }
    })();
  }, []);

  useEffect(() => {
    if (!activeSlug) return;

    (async () => {
      const headers = getAuthHeaders();
      if (!headers["X-Telegram-Init-Data"]) return;

      try {
        const res = await fetch(joinUrl(API_BASE, `/api/v1/categories/${activeSlug}/lessons`), {
          headers,
        });
        if (!res.ok) return;

        const data = await res.json();
        const lessons = Array.isArray(data)
          ? data.slice().sort((a, b) => (a.lesson_order ?? 0) - (b.lesson_order ?? 0))
          : [];

        if (lessons.length) {
          setLessonsBySlug((prev) => ({ ...prev, [activeSlug]: lessons }));
        }
      } catch (e) {
        console.log("lessons fetch error", e);
      }
    })();
  }, [activeSlug]);

  const rawLessons = lessonsBySlug[activeSlug] || [];

  const displayLessons = useMemo(() => {
    if (activeSlug === "words" || activeSlug === "alphabet") return rawLessons.slice().reverse();
    return rawLessons;
  }, [rawLessons, activeSlug]);

  const lessonByOrder = useMemo(() => {
    const m = new Map();
    rawLessons.forEach((l) => m.set(Number(l.lesson_order), l));
    return m;
  }, [rawLessons]);

  const isUnlocked = (lesson) => {
    const ord = Number(lesson?.lesson_order);
    if (!ord) return false;
    if (ord === 1) return true;

    const prev = lessonByOrder.get(ord - 1);
    if (!prev) return true;

    const prevKey = lessonKey(activeSlug, prev);
    return completedKeys.has(prevKey);
  };

  const isCompleted = (lesson) => {
    return completedKeys.has(lessonKey(activeSlug, lesson));
  };

  const openExercise = (lesson) => {
    if (!lesson?.lesson_order) return;
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

  const iconFor = (slug) => {
    if (slug === "animals") return "🐱";
    if (slug === "numbers") return "123";
    return "A";
  };

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
              <span className="category-icon">{iconFor(cat.slug)}</span>
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
            const completed = isCompleted(lesson);

            return (
              <div
                key={lesson.lesson_id ?? `${activeSlug}-${lesson.lesson_order}`}
                className={`node ${unlocked ? "green" : "gray"} ${completed ? "completed" : ""}`}
                style={{
                  top: index * 80 + "px",
                  left: index % 2 === 0 ? "20px" : "140px",
                }}
                onClick={() => openExercise(lesson)}
                title={lesson.title}
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
