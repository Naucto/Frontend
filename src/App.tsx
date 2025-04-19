import React from "react"
import { useState } from "react"
import reactLogo from "./assets/react.svg"
import viteLogo from "/vite.svg"
import "./App.css"
import { BrowserRouter, Route, Routes } from "react-router-dom"
import { Hub } from "@modules/hub/Hub"
import { EditorManager } from "@modules/editor/EditorManager"

import { CodeEditor } from "@modules/editor/CodeEditor/CodeEditor"
import { MapEditor } from "@modules/editor/MapEditor/MapEditor"
import { SoundEditor } from "@modules/editor/SoundEditor/SoundEditor"
import { SpriteEditor } from "@modules/editor/SpriteEditor/SpriteEditor"
import styled from "styled-components"
import { theme, useTheme } from "@theme/ThemeContext"
import NavBar from "@shared/navbar/NavBar"
import { ThemeProvider } from "styled-components";


const Container = styled.div<{ theme: any }>`
  min-height: 100vh;
  min-width: 100vw;
  margin: 0px;
  padding: 0;
  position: absolute;
  background-color: ${({ theme }) => theme.colors.background};
`;

function App() {
  const theme = useTheme()
  const editorManager = new EditorManager();
  editorManager.addEditor(new CodeEditor());
  editorManager.addEditor(new MapEditor());
  editorManager.addEditor(new SoundEditor());
  editorManager.addEditor(new SpriteEditor());

  return (
    <Container theme={theme}>
      <ThemeProvider theme={theme}>
        <BrowserRouter>
          <NavBar />
          <Routes>
            <Route path="/" element={<Hub />} />
            <Route path="/hub" element={<Hub />} />
            <Route path="/editor" element={editorManager.render()} />
          </Routes>
        </BrowserRouter>
      </ThemeProvider>
    </Container>
  )
}

export default App
