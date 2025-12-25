import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import MainPage from "./Components/MainPage";
import Dictionary from "./Components/Dictionary";
import Menu from "./Components/Menu";
import PracticeIRL from "./Components/PracticeIRL";
import Categories from "./Components/Categories"
import Exercise from "./Components/Exercise";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainPage />} />
        <Route path="/menu" element={<Menu />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/dictionary" element={<Dictionary />} />
        <Route path="/practice" element={<PracticeIRL />} />
        <Route path="/exercise/:category/:order" element={<Exercise />} />
        <Route path="/practice-lesson/:category/:order" element={<PracticeLesson />} />
      </Routes>
    </BrowserRouter>
  );
}