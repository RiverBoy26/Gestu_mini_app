import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./../Styles/Menu.css";

const Menu = ({ onClose }) => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(true); // состояние открытия меню

  // Переход по пункту меню
  const handleClick = (path) => {
    navigate(path); // навигация
    closeMenu();    // закрытие меню
  };

  // Закрытие меню без изменения текущего маршрута
  const closeMenu = () => {
    setIsOpen(false); // скрываем меню
    if (onClose) onClose(); // уведомляем родителя
  };

  return (
    <>
      {/* Боковое меню */}
      <div className={`menu-container ${isOpen ? "open" : ""}`}>
        <nav className="menu-content">
          <ul>
            <li onClick={() => handleClick("/")}>Главная</li>
            <li onClick={() => handleClick("/categories")}>Категории</li>
            <li onClick={() => handleClick("/dictionary")}>Словарь</li>
            <li onClick={() => handleClick("/practice")}>Практика IRL</li>
          </ul>
        </nav>
      </div>
    </>
  );
};

export default Menu;
