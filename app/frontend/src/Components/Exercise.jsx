import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import "./../Styles/Exercise.css";

const Exercise = () => {
  const navigate = useNavigate();
  const { id } = useParams();   // ← получаем id упражнения
  const [exercise, setExercise] = useState(null);

  // Заглушка: список упражнений
  // Ты можешь заменить на API или твой массив
  const data = [
    {
      id: "1",
      category: "Животные",
      topic: "Домашние питомцы",
      text: "тестовое описание упражнения тестовое описание упражнения...",
    },
    {
      id: "2",
      category: "Еда",
      topic: "Фрукты",
      text: "описание про фрукты...",
    }
  ];

useEffect(() => {
  const found = data.find((item) => item.id === String(id));
  setExercise(found);
}, [id]);

  if (!exercise) return <div>Загрузка...</div>;

  return (
    <div className="exercises-screen">

      {/* Header */}
      <header className="header">
        <button className="menu-btn" onClick={() => navigate("/menu")}>☰</button>
        <h1 className="logo">GESTU</h1>
        <div className="logo-icon">🤟</div>
      </header>

      {/* Основной контент */}
      <div className="exercise-container">

        <div className="exercise-header">
          <div className="exercise-category">
            КАТЕГОРИЯ: {exercise.category}
            <span className="star">⭐</span>
          </div>

          <div className="exercise-topic">
            ТЕМА: {exercise.topic}
          </div>
        </div>

        {/* Описание */}
        <div className="exercise-text-box">
          <p className="exercise-text">{exercise.text}</p>
        </div>

        {/* Кнопки навигации */}
        <div className="exercise-nav">
          <button
            className="nav-btn"
            onClick={() => navigate(`/exercise/${Number(id) - 1}`)}
            disabled={Number(id) === 1}>
                &lt; Назад
        </button>

          <button
            className="nav-btn"
            onClick={() => navigate(`/exercise/${Number(id) + 1}`)}>
                Вперёд &gt;
        </button>

        </div>

        {/* Переход к практическим заданиям */}
        <button
          className="exercises-start-btn"
          onClick={() => navigate(`/practice`)} // потом может потребоваться id
        >
          Перейти к упражнениям
        </button>

      </div>

      {/* Footer */}
      <footer className="footer">GESTU</footer>
    </div>
  );
};

export default Exercise;
