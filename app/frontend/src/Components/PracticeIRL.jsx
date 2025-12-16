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
    const startCamera = async () => {
      console.log("mediaDevices:", navigator.mediaDevices);
      console.log(
        "getUserMedia:",
        navigator.mediaDevices?.getUserMedia
      );

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
        });

        console.log("STREAM OK:", stream);
        console.log("VIDEO TRACKS:", stream.getVideoTracks());

        if (videoRef.current) {
          videoRef.current.srcObject = stream;

          videoRef.current.onloadedmetadata = () => {
            videoRef.current
              .play()
              .then(() => console.log("VIDEO PLAYING"))
              .catch(e => console.error("PLAY ERROR", e));
          };
        }

        streamRef.current = stream;
        setHasCamera(true);
      } catch (error) {
        console.error(
          "CAMERA ERROR:",
          error.name,
          error.message,
          error
        );
        setHasCamera(false);
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