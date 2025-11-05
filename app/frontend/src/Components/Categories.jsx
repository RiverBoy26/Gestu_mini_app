import { useMemo, useState } from "react";
import "./../Styles/Categories.css";

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

export default function Categories() {
  const categories = Object.keys(CATALOG);
  const [selected, setSelected] = useState(categories[0] ?? "");
  const [search, setSearch] = useState("");
  const [list, setList] = useState(CATALOG);

  const items = list[selected] ?? [];
    const toggleMenu = () => {
    setMenuOpen(!menuOpen);
  };

  const handleMenuItemClick = (path) => {
    setMenuOpen(false);
    navigate(path);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return !q ? items : items.filter(i => i.title.toLowerCase().includes(q));
  }, [items, search]);

  const learnedCount = items.filter(i => i.learned).length;
  const totalCount = items.length || 1; // чтобы не делить на 0
  const progress = Math.round((learnedCount / totalCount) * 100);

  const toggleLearned = (id) => {
    setList(prev => ({
      ...prev,
      [selected]: prev[selected].map(i =>
        i.id === id ? { ...i, learned: !i.learned } : i
      ),
    }));
  };

  return (
    <div className="categories-screen">
      {/* верхняя панель в стиле проекта */}
      <header className="header">
        <button className="menu-btn" onClick={toggleMenu}>☰</button>
        <h1 className="logo">GESTU</h1>
        <div className="logo-icon">🤟</div>
      </header>
        {/* Выпадающее меню */}
      
      <main className="categories-container">
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

            <button
              className="picker-choose"
              onClick={() => setSearch("")}
              title="Очистить поиск"
            >
              Выбрать
            </button>
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

                {/* круг с звездой (метка) */}
                <button
                  className={`star-badge ${item.learned ? "is-active" : ""}`}
                  onClick={() => toggleLearned(item.id)}
                  aria-pressed={item.learned}
                  aria-label={item.learned ? "Пометить как не изучено" : "Пометить как изучено"}
                >
                  ★
                </button>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="footer">🤟🤚🖐✋</footer>
    </div>
  );
}