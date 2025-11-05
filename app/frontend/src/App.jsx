import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import MainPage from "./Components/MainPage";
import Categories from "./Components/categories";
import TheoryPage from "./Components/TheoryPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainPage />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/theory" element={<TheoryPage />} />
      </Routes>
    </BrowserRouter>
  );
}