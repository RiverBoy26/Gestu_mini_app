import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./../Styles/Menu.css";

const CLOSE_MS = 250;

const Menu = ({ onClose }) => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(true);

  const closeMenu = (path) => {
    setIsOpen(false);
    if (onClose) onClose();

    window.setTimeout(() => {
      if (path) navigate(path, { replace: true });
      else navigate(-1);
    }, CLOSE_MS);
  };

  useEffect(() => {
    const onKeyDown = (e) => e.key === "Escape" && closeMenu();
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      {/* Клик по фону закрывает */}
      <div
        className={`menu-overlay ${isOpen ? "show" : ""}`}
        onClick={() => closeMenu()}
      />

      <div
        className={`menu-container ${isOpen ? "open" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Кнопка закрытия */}
        <button className="menu-close" onClick={() => closeMenu()} aria-label="Закрыть меню">
          ×
        </button>

        <nav className="menu-content">
          <ul>
            <li onClick={() => closeMenu("/")}>Главная</li>
            <li onClick={() => closeMenu("/categories")}>Категории</li>
            <li onClick={() => closeMenu("/dictionary")}>Словарь</li>
            <li onClick={() => closeMenu("/practice")}>Практика IRL</li>
          </ul>
        </nav>
      </div>
    </>
  );
};

export default Menu;
