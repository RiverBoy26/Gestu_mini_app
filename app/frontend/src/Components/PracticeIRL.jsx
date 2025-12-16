import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./../Styles/PracticeIRL.css";
import logotype from "./../assets/logo.svg"

const PracticeIRL = () => {
  const [hasCamera, setHasCamera] = useState(false); // состояние для проверки наличия камеры
  const videoRef = useRef(null); // ссылка на элемент video
  const streamRef = useRef(null); // ссылка на поток видео
  const navigate = useNavigate();

  // переход по кнопке меню
  const openMenu = () => {
    navigate("/menu"); 
  };

  useEffect(() => {
    console.log("hasCamera:", hasCamera);
    // Функция для запроса доступа к камере
    const startCamera = async () => {
      console.log("stream:", stream);
      console.log("videoRef:", videoRef.current);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true, // только видео
        });
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream; // назначаем поток на видео
          videoRef.current.onloadedmetadata = () => {
            videoRef.current.play();
          };
        }
        streamRef.current = stream; // сохраняем поток для будущего использования
        setHasCamera(true); // если камера доступна, меняем состояние
      } catch (error) {
        console.error("Ошибка доступа к камере", error);
        setHasCamera(false); // если камера недоступна, меняем состояние
      }
    };

    startCamera();

    // Очистка при размонтировании компонента
    return () => {
      if (streamRef.current) {
        const tracks = streamRef.current.getTracks();
        tracks.forEach(track => track.stop()); // останавливаем поток
      }
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

      {/* Основной блок с видео */}
      <div className="camera-card">
        <div className="video-container">
          {hasCamera ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{ width: "100%", height: "auto", borderRadius: "8px" }}
            />
          ) : (
            <p>Ищем Вашу камеру...</p>
          )}
        </div>
      </div>

      {/* Кнопка для снимка */}
      <button className="capture-btn" onClick={() => alert("Снимок сделан")}>Сделать снимок</button>

      {/* Нижний декоративный блок */}
      <footer className="footer">GESTU</footer>
    </div>
  );
};

export default PracticeIRL;