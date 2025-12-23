import React, { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./../Styles/MainPage.css";
import logotype from "./../assets/logo.svg"

const PROGRESS_KEY = "gestu_completed_keys";

const readLearnedCount = () => {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? new Set(arr.map(String)).size : 0;
  } catch {
    return 0;
  }
};

const MainPage = () => {
  const navigate = useNavigate();

  // переход по кнопке меню
  const openMenu = () => {
    navigate("/menu"); 
  };

  const openCategories = () => {
    navigate("/categories"); 
  };

  const openIRL = () => {
    navigate("/practice"); 
  };

  const [learnedCount, setLearnedCount] = useState(() => readLearnedCount());

  // обновляем прогресс при возврате на главную (и при смене вкладки)
 useEffect(() => {
    const sync = () => setLearnedCount(readLearnedCount());

    sync();
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("storage", sync);
    window.addEventListener("gestu-progress", sync);

    return () => {
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("storage", sync);
      window.removeEventListener("gestu-progress", sync);
    };
  }, []);

  // --- Логика уровней: 33 слова, по 11 на уровень ---
  const LEVEL_SIZE = 11;
  const TOTAL_WORDS = 33;

  const clamped = Math.min(learnedCount, TOTAL_WORDS);

  const { level, inLevelCount, progressPct } = useMemo(() => {
    // уровень: 1..3
    const lvl = Math.min(3, Math.floor(clamped / LEVEL_SIZE) + 1);

    // сколько слов набрано в текущем уровне (0..10), после полного уровня сбрасывается
    const inLvl = clamped % LEVEL_SIZE;

    // если достигли ровно 11, полоска должна быть 100% на этом уровне
    const pct =
      inLvl === 0 && clamped !== 0 ? 100 : Math.round((inLvl / LEVEL_SIZE) * 100);

    return { level: lvl, inLevelCount: inLvl, progressPct: pct };
  }, [clamped]);

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
    <div className="app-container">
      {/* Верхняя панель */}
      <header className="header">
        <button className="menu-btn" onClick={openMenu}>☰</button>
        <h1 className="logo">GESTU</h1>
        <div className="logo-icon"><img src={logotype} alt="logo" /></div>
      </header>

      {/* Основной блок уровня */}
      <div className="level-card">
        <div className="star">
          <span className="star-value">{inLevelCount + 11*(level-1)}</span>
        </div>
        <div className="progress-container">
          <div className="progress-bar" style={{ width: `${progressPct}%` }} aria-label="Прогресс уровня"></div>
        </div>
        <p className="level-text">Уровень {level}</p>
      </div>

      {/* Кнопка */}
      <button className="start-btn" onClick={openCategories}>Начать обучение</button>
      <button className="practice-btn" onClick={openIRL}>Видео-практика</button>

      {/* Нижний декоративный блок */}
      <footer className="footer">GESTU</footer>
    </div>
  );
};

export default MainPage;
