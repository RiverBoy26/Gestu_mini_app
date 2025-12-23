import { useMemo, useState, useLayoutEffect, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./../Styles/Dictionary.css";
import logotype from "./../assets/logo.svg";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

const CATEGORY_META = [
  { slug: "words", title: "Алфавит" },
  { slug: "animals", title: "Животные" },
  { slug: "numbers", title: "Числа" },
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

const getInitData = () => window?.Telegram?.WebApp?.initData || "";
const getAuthHeaders = () => {
  const initData = getInitData();
  return initData ? { "X-Telegram-Init-Data": initData } : {};
};

const joinUrl = (base, path) => {
  if (!base) return path;
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
};

const PROGRESS_KEYS_KEY = "gestu_completed_keys";
const PROGRESS_IDS_KEY = "gestu_completed_lesson_ids";

const readProgressSet = () => {
  const s = new Set();

  try {
    const raw = localStorage.getItem(PROGRESS_KEYS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (Array.isArray(arr)) arr.forEach((x) => s.add(String(x)));
  } catch {}

  try {
    const raw = localStorage.getItem(PROGRESS_IDS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (Array.isArray(arr)) arr.forEach((x) => s.add(String(x)));
  } catch {}

  return s;
};

const makeKey = (slug, lesson) => {
  if (lesson?.lesson_id != null) return String(lesson.lesson_id);
  return `${slug}:${lesson?.lesson_order ?? ""}`;
};

const buildFallbackItems = (slug) => {
  if (slug === "words") {
    return RUS_ALPHABET.map((letter, i) => ({
      id: `words:${i + 1}`,
      title: letter,
      learned: false,
      lesson_order: i + 1,
    }));
  }

  if (slug === "numbers") {
    return Array.from({ length: 10 }).map((_, i) => ({
      id: `numbers:${i + 1}`,
      title: String(i),
      learned: false,
      lesson_order: i + 1,
    }));
  }

  if (slug === "animals") {
    return ANIMALS.map((a, i) => ({
      id: `animals:${i + 1}`,
      title: a.title,
      learned: false,
      lesson_order: i + 1,
    }));
  }

  return [];
};

const applyProgress = (slug, items, progressSet) => {
  return items.map((it) => ({
    ...it,
    learned: progressSet.has(String(it.id)),
  }));
};

export default function Dictionary() {
  const navigate = useNavigate();

  const categories = CATEGORY_META.map((c) => c.title);
  const titleToSlug = useMemo(() => {
    const m = new Map();
    CATEGORY_META.forEach((c) => m.set(c.title, c.slug));
    return m;
  }, []);

  const [selected, setSelected] = useState(CATEGORY_META[0]?.title ?? "");
  const [search, setSearch] = useState("");

  const [list, setList] = useState(() => {
    const progress = readProgressSet();
    const init = {};
    for (const c of CATEGORY_META) {
      const base = buildFallbackItems(c.slug).map((x) => ({ ...x, id: `${c.slug}:${x.lesson_order}` }));
      init[c.slug] = applyProgress(c.slug, base, progress);
    }
    return init;
  });

  const selectedSlug = titleToSlug.get(selected) || "words";
  const items = list[selectedSlug] ?? [];

  const filtered = useMemo(() => {
  const q = search.trim().toLowerCase();
  return !q ? items : items.filter((i) => 
    i.title.toLowerCase().startsWith(q)
  );
}, [items, search]);

  const learnedCount = items.filter((i) => i.learned).length;
  const totalCount = items.length || 1;
  const progressPct = Math.round((learnedCount / totalCount) * 100);

  const openMenu = () => navigate("/menu");

  useEffect(() => {
    const sync = () => {
      const progress = readProgressSet();
      setList((prev) => {
        const next = { ...prev };
        for (const c of CATEGORY_META) {
          const slug = c.slug;
          const arr = prev[slug] || [];
          next[slug] = arr.map((it) => ({ ...it, learned: progress.has(String(it.id)) }));
        }
        return next;
      });
    };

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

      const progress = readProgressSet();

      try {
        const results = await Promise.all(
          CATEGORY_META.map(async (c) => {
            const res = await fetch(joinUrl(API_BASE, `/api/v1/categories/${c.slug}/lessons`), { headers });
            if (!res.ok) return { slug: c.slug, lessons: null };
            const data = await res.json();
            const lessons = Array.isArray(data)
              ? data.slice().sort((a, b) => (a.lesson_order ?? 0) - (b.lesson_order ?? 0))
              : [];
            return { slug: c.slug, lessons };
          })
        );

        setList((prev) => {
          const next = { ...prev };

          for (const r of results) {
            if (!r.lessons) continue;

            next[r.slug] = r.lessons.map((l) => {
              const key = makeKey(r.slug, l);
              const fallbackKey = `${r.slug}:${l.lesson_order}`;
              const learned = progress.has(String(key)) || progress.has(String(fallbackKey));

              return {
                id: String(key),
                title: String(l.title ?? ""),
                learned,
                lesson_order: Number(l.lesson_order ?? 0),
              };
            });
          }

          return next;
        });
      } catch {}
    })();
  }, []);

  useLayoutEffect(() => {
    const setVH = () => {
      const height = window.visualViewport ? window.visualViewport.height : window.innerHeight;
      document.documentElement.style.setProperty("--vh", `${height * 0.01}px`);
    };

    setVH();
    window.visualViewport?.addEventListener("resize", setVH);
    window.addEventListener("orientationchange", setVH);

    return () => {
      window.visualViewport?.removeEventListener("resize", setVH);
      window.removeEventListener("orientationchange", setVH);
    };
  }, []);

  return (
    <div className="dictionary-screen">
      <header className="header">
        <button className="menu-btn" onClick={openMenu}>☰</button>
        <h1 className="logo">GESTU</h1>
        <div className="logo-icon"><img src={logotype} alt="logo" /></div>
      </header>

      <main className="dictionary-container">
        <section className="picker-card">
          <p className="picker-title">
            Выберите категорию, чтобы просмотреть изученные слова
          </p>

          <div className="picker-row">
            <select
              className="picker-select"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="progress-line">
            <div className="progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
          <div className="progress-caption">
            Слов изучено: {learnedCount} из {totalCount}
          </div>

          <input
            className="search-input"
            type="text"
            placeholder="Поиск по списку…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </section>

        <section className="list-wrap">
          <ul className="item-list">
            {filtered.map((item) => (
              <li key={item.id} className="item-row">
                <span className="item-title">{item.title}</span>

                <button
                  className={`star-badge ${item.learned ? "is-active" : ""}`}
                  aria-pressed={item.learned}
                  disabled
                >
                  <svg viewBox="0 0 24 24" width="18" height="18">
                    <path d="M12 2l3 7 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
