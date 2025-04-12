import React from "react"
import { useState } from "react"
import reactLogo from "./assets/react.svg"
import viteLogo from "/vite.svg"
import "./App.css"
import { ThemeProvider } from "@theme/ThemeContext"
import { BrowserRouter, Route, Routes } from "react-router-dom"
import { Hub } from "@modules/hub/Hub"
import { Editors } from "@modules/editor/Editors"


function App() {

  return (
    <ThemeProvider>
      
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Hub />} />
          <Route path="/hub" element={<Hub />} />
          <Route path="/editor" element={<Editors />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App
