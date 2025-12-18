import React, { useState, useMemo } from "react";
import "./../Styles/Categories.css";
import { useNavigate } from "react-router-dom";
import logotype from "./../assets/logo.svg"

const Categories = () => {
  const navigate = useNavigate();

    // переход по кнопке меню
    const openMenu = () => {
      navigate("/menu"); 
    };

  // Категории
  const categories = [
    { id: "alphabet", icon: "A", label: "алфавит" },
    { id: "animals", icon: "🐱", label: "животные" },
    { id: "numbers", icon: "123", label: "Цифры" },
  ];

  // Упражнения по категориям
  const exercises = {
    alphabet: [
      { id: 1, available: false },
      { id: 2, available: false },
      { id: 3, available: true },
      { id: 4, available: true },
      { id: 5, available: true }
    ],
    animals: [
      { id: 1, available: false },
      { id: 2, available: false },
      { id: 3, available: true },
      { id: 4, available: true }
    ],
    numbers: [
      { id: 1, available: false },
      { id: 2, available: false },
      { id: 3, available: true }
    ]
  };

  const [activeCategory, setActiveCategory] = useState("alphabet");

  const openExercise = (exerciseId, available) => {
    if (!available) return; // заблокированные не кликаются
    navigate(`/exercise/${exerciseId}`);
  };

  const nodePositions = useMemo(() => {
  return exercises[activeCategory].map((_, index) => ({
    x: index % 2 === 0 ? 45 : 165,   // центр кружка
    y: index * 80 + 30
   }));
  }, [activeCategory]);

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

const linePath = useMemo(() => {
  return catmullRom2bezier(nodePositions);
}, [nodePositions]);

  return (
    <div className="categories-container">

      {/* Верхняя панель */}
      <header className="header">
        <button className="menu-btn" onClick={openMenu}>☰</button>
        <h1 className="logo">GESTU</h1>
        <div className="logo-icon"><img src={logotype} alt="logo" /></div>
      </header>

      {/* Категории */}
      <div className="scroll-area">
      <div className="categories-box">
        {categories.map(cat => (
          <div
            key={cat.id}
            className={`category-item ${activeCategory === cat.id ? "active" : ""}`}
            onClick={() => setActiveCategory(cat.id)}
          >
            <span className="category-icon">{cat.icon}</span>
            <span className="category-label">{cat.label}</span>
          </div>
        ))}
      </div>

      {/* Линия + узлы */}
      <div className="roadmap">
        <svg className="roadmap-line" width="220" height="420">
          <path d={linePath} stroke="white" strokeWidth="6" fill="none" />
        </svg>

        {exercises[activeCategory].map((ex, index) => (
          <div
            key={ex.id}
            className={`node ${ex.available ? "green" : "gray"}`}
            style={{ top: index * 80 + "px", left: index % 2 === 0 ? "20px" : "140px" }}
            onClick={() => openExercise(ex.id, ex.available)}
          ></div>
        ))}
      </div>
      
      {/* Низ */}
      <footer className="footer">GESTU</footer>
    </div>
    </div>
  );
};

export default Categories;