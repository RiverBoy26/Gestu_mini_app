import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./../Styles/MainPage.css";

const MainPage = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();

  // переключение меню
  const toggleMenu = () => {
    setMenuOpen(!menuOpen);
  };

  // обработчик нажатия на пункт меню
  const handleMenuItemClick = (path) => {
    setMenuOpen(false);
    navigate(path);
  };

  return (
    <div className="app-container">
      {/* Верхняя панель */}
      <header className="header">
        <button className="menu-btn" onClick={toggleMenu}>☰</button>
        <h1 className="logo">GESTU</h1>
        <div className="logo-icon">🤟</div>
      </header>

      {/* Выпадающее меню */}
      {menuOpen && (
        <div className="dropdown-menu">
          <ul>
            <li onClick={() => handleMenuItemClick("/")}>Главная</li>
            <li onClick={() => handleMenuItemClick("/categories")}>Категории</li>
            <li onClick={() => handleMenuItemClick("Словарь")}>Словарь</li>
            <li onClick={() => handleMenuItemClick("Упражнения")}>Упражнения</li>
            <li onClick={() => handleMenuItemClick("Практика в IRL")}>Практика в IRL</li>
          </ul>
        </div>
      )}

      {/* Основной блок уровня */}
      <div className="level-card">
        <div className="star">
          <span className="star-value">42</span>
        </div>
        <div className="progress-container">
          <div className="progress-bar"></div>
        </div>
        <p className="level-text">Уровень 1</p>
      </div>

      {/* Кнопка */}
      <button className="start-btn">Начать обучение</button>

      {/* Нижний декоративный блок */}
      <footer className="footer">🤟🤚🖐✋</footer>
    </div>
  );
};

export default MainPage;