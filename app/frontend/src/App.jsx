import { useEffect } from "react";

function App() {
  useEffect(() => {
    const tg = window.Telegram.WebApp;
    tg.ready(); // Сообщаем Telegram, что интерфейс загружен
    tg.expand(); // Разворачиваем окно на максимум
  }, []);

  const handleSendData = () => {
    const tg = window.Telegram.WebApp;
    tg.sendData("React WebApp says hello!"); // Отправляем данные обратно боту
  };

  return (
    <div style={{ padding: 20, textAlign: "center" }}>
      <h2>👋 Привет из React WebApp!</h2>
      <button onClick={handleSendData}>Отправить данные боту</button>
    </div>
  );
}

export default App;