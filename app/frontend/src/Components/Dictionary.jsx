import { useMemo, useState, useLayoutEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./../Styles/Dictionary.css";
import logotype from "./../assets/logo.svg"

/** Пример данных — можешь заменить на загрузку с API */
const CATALOG = {
  Food: [
    { id: 1, title: "Дикий огурец", learned: true },
    { id: 2, title: "Дикий латяо", learned: false },
    { id: 3, title: "Дикий помидор", learned: true },
    { id: 4, title: "Дикий дуриан", learned: false },
    { id: 5, title: "Дикий рис", learned: true },
    { id: 6, title: "Дикий арбуз", learned: false },
  ],
  Nature: [
    { id: 7, title: "Горный ветер", learned: false },
    { id: 8, title: "Туманный лес", learned: false },
  ],
  Travel: [
    { id: 9, title: "Аэропорт", learned: true },
    { id: 10, title: "Багаж", learned: false },
  ],
};

export default function Dictionary() {
  const categories = Object.keys(CATALOG);
  const [selected, setSelected] = useState(categories[0] ?? "");
  const [search, setSearch] = useState("");
  const [list, setList] = useState(CATALOG);

  const navigate = useNavigate();

  /** ✅ переход в Menu.jsx */
  const openMenu = () => {
    navigate("/menu");
  };

  const items = list[selected] ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return !q ? items : items.filter(i => i.title.toLowerCase().includes(q));
  }, [items, search]);

  const learnedCount = items.filter(i => i.learned).length;
  const totalCount = items.length || 1;
  const progress = Math.round((learnedCount / totalCount) * 100);

  const toggleLearned = (id) => {
    setList(prev => ({
      ...prev,
      [selected]: prev[selected].map(i =>
        i.id === id ? { ...i, learned: !i.learned } : i
      ),
    }));
  };

  useLayoutEffect(() => {
      const setVH = () => {
        const height = window.visualViewport
          ? window.visualViewport.height
          : window.innerHeight;
  
        document.documentElement.style.setProperty(
          "--vh",
          `${height * 0.01}px`
        );
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
      {/* верхняя панель */}
      <header className="header">
        <button className="menu-btn" onClick={openMenu}>☰</button>
        <h1 className="logo">GESTU</h1>
        <div className="logo-icon"><img src={logotype} alt="logo" /></div>
      </header>

      <main className="dictionary-container">

        {/* карточка выбора и поиска */}
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
              {categories.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* прогресс */}
          <div className="progress-line">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="progress-caption">
            Слов изучено: {learnedCount} из {totalCount}
          </div>

          {/* поиск */}
          <input
            className="search-input"
            type="text"
            placeholder="Поиск по списку…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </section>

        {/* список элементов */}
        <section className="list-wrap">
          <ul className="item-list">
            {filtered.map(item => (
              <li key={item.id} className="item-row">
                <span className="item-title">{item.title}</span>

                <button
                  className={`star-badge ${item.learned ? "is-active" : ""}`}
                  onClick={() => toggleLearned(item.id)}
                  aria-pressed={item.learned}
                >
                   <svg viewBox="0 0 24 24" width="18" height="18" >
                      <path d="M12 2l3 7 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/>
                    </svg>
                </button>
              </li>
            ))}
          </ul>
        </section>
        <footer className="footer">GESTU</footer>
      </main>

      
    </div>
  );
}
