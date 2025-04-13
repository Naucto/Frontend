import React, { useEffect } from "react"
import { useState } from "react"
import reactLogo from "./assets/react.svg"
import viteLogo from "/vite.svg"
import "./App.css"
import { ThemeProvider } from "@theme/ThemeContext"
import { BrowserRouter, Route, Routes } from "react-router-dom"
import { Hub } from "@modules/hub/Hub"
import { EditorManager } from "@modules/editor/EditorManager"

import { CodeEditor } from "@modules/editor/CodeEditor/CodeEditor"
import { MapEditor } from "@modules/editor/MapEditor/MapEditor"
import { SoundEditor } from "@modules/editor/SoundEditor/SoundEditor"
import { SpriteEditor } from "@modules/editor/SpriteEditor/SpriteEditor"
import { useUser } from "@modules/user/UserContext"


function App() {
  const { user, setUser } = useUser();

  useEffect(() => {
    setUser({
      "name": "test",
      "id": "test",
    })
  }, [])

  useEffect(() => {
    console.log("User", user)
  }, [user])
  const editorManager = new EditorManager();
  editorManager.addEditor(new CodeEditor());
  editorManager.addEditor(new MapEditor());
  editorManager.addEditor(new SoundEditor());
  editorManager.addEditor(new SpriteEditor());

  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Hub />} />
          <Route path="/hub" element={<Hub />} />
          <Route path="/editor" element={editorManager.render()} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App
