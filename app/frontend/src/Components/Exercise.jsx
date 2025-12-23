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

const Exercise = () => {
  const navigate = useNavigate();
  const { category, order } = useParams();

  const [lessons, setLessons] = useState(() => buildMockLessons(category));
  const [completedKeys, setCompletedKeys] = useState(() => readCompleted());

  const videoRef = useRef(null);

  useEffect(() => {
    setLessons(buildMockLessons(category));
  }, [category]);

  useEffect(() => {
    const sync = () => setCompletedKeys(readCompleted());
    sync();
  }, [category, order]);

  useEffect(() => {
    (async () => {
      const headers = getAuthHeaders();
      if (!headers["X-Telegram-Init-Data"]) return;

      try {
        const res = await fetch(joinUrl(API_BASE, `/api/v1/categories/${category}/lessons`), {
          headers,
        });
        if (!res.ok) return;

        const data = await res.json();
        const sorted = Array.isArray(data)
          ? data.slice().sort((a, b) => (a.lesson_order ?? 0) - (b.lesson_order ?? 0))
          : [];

        if (sorted.length) setLessons(sorted);
      } catch (e) {
        console.log("exercise lessons fetch error", e);
      }
    })();
  }, [category]);

  const currentOrder = Number(order || 1);

  const currentLesson = useMemo(() => {
    return lessons.find((l) => Number(l.lesson_order) === currentOrder) || null;
  }, [lessons, currentOrder]);

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
    const prev = currentOrder - 1;
    if (prev < 1) return;
    navigate(`/exercise/${category}/${prev}`);
  };

  const goNext = () => {
    const maxOrder = Number(lessons[lessons.length - 1]?.lesson_order || currentOrder);
    const next = currentOrder + 1;
    if (next > maxOrder) return;
    navigate(`/exercise/${category}/${next}`);
  };

  const prevDisabled = currentOrder <= 1;
  const nextDisabled =
    currentOrder >= Number(lessons[lessons.length - 1]?.lesson_order || currentOrder);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  };

  if (!currentLesson) return <div />;

  return (
    <div className="exercises-screen">
      <header className="header">
        <button className="menu-btn" onClick={() => navigate("/menu")}>☰</button>
        <h1 className="logo">GESTU</h1>
        <div className="logo-icon"><img src={logotype} alt="logo" /></div>
      </header>

      <div className="exercise-container">
        <div className="exercise-header">
          <div className="exercise-category">КАТЕГОРИЯ: {categoryTitle}</div>
          <div className="exercise-topic">ТЕМА: {currentLesson.title}</div>
        </div>

        <button
          className={`lesson-status-btn ${isCompleted ? "done" : ""}`}
          onClick={toggleCompleted}
          aria-label="Статус урока"
          title={isCompleted ? "Урок пройден" : "Не пройден"}
        >
          {isCompleted ? "✓" : "○"}
        </button>

        <div className="exercise-text-box">
          <p className="exercise-text">{currentLesson.description ?? "Текст не найден!"}</p>
        </div>

        <div className="exercise-video-box" onClick={togglePlay}>
          <video
            ref={videoRef}
            src={currentLesson.content_url}
            loop
            autoPlay
            muted
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
          onClick={() => navigate(`/practice?lesson_id=${currentLesson.lesson_id ?? ""}`)}
        >
          Перейти к практике
        </button>
      </div>

      <footer className="footer">GESTU</footer>
    </div>
  );
};

export default Exercise;
