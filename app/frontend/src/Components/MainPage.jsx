import React from "react";
import { useNavigate } from "react-router-dom";
import "./../Styles/MainPage.css";
import logotype from "./../assets/logo.svg"

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
          <span className="star-value">42</span>
        </div>
        <div className="progress-container">
          <div className="progress-bar"></div>
        </div>
        <p className="level-text">Уровень 1</p>
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
