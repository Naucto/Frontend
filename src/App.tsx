import React, {useMemo,useRef, useEffect } from "react"
import "./App.css"
import { BrowserRouter, Route, Routes } from "react-router-dom"
import { Hub } from "@modules/hub/Hub"
import { EditorManager, EditorManagerProvider } from "@modules/editor/EditorManager"

import { CodeEditor } from "@modules/editor/CodeEditor/CodeEditor"
import { MapEditor } from "@modules/editor/MapEditor/MapEditor"
import { SoundEditor } from "@modules/editor/SoundEditor/SoundEditor"
import { SpriteEditor } from "@modules/editor/SpriteEditor/SpriteEditor"
import styled from "styled-components"
import { useTheme } from "@theme/ThemeContext"
import NavBar from "@shared/navbar/NavBar"
import { ThemeProvider } from "styled-components";
import Create from "@modules/create/Create"
import { StyledEngineProvider } from "@mui/material"
import { useUser } from "src/providers/UserProvider"

const Container = styled.div<{ theme: any }>`
    min-height: 100vh;
    min-width: 100vw;
    margin: 0;
    padding: 0;
    position: absolute;
    background-color: ${({ theme }) => theme.colors.background};
`;

function App() {
  const { user, setUser } = useUser();

  // temporary for example
  useEffect(() => {
    setUser({
      "name": "test",
      "id": "test",
    })
  }, [])

  // temporary for example
  useEffect(() => {
    console.log("User", user)
  }, [user])
  
  const editorManagerRef = useRef(new EditorManager());

  const editorManager = useMemo(() => {
    const manager = editorManagerRef.current;
    manager.addEditor(new CodeEditor());
    manager.addEditor(new MapEditor());
    manager.addEditor(new SoundEditor());
    manager.addEditor(new SpriteEditor());
    return manager;
  }, []);

  const theme = useTheme();
  return (
    <Container theme={theme}>
      <EditorManagerProvider value={editorManager}>
        <StyledEngineProvider injectFirst>
          <ThemeProvider theme={theme} >
            <BrowserRouter>
              <NavBar />
              <Routes>
                <Route path="/" element={<Hub />} />
                <Route path="/hub" element={<Hub />} />
                <Route path='/create' element={<Create />} />
                {/* <Route path="/editor" element={editorManager.render()} /> */}
              </Routes>
            </BrowserRouter>
          </ThemeProvider>
        </StyledEngineProvider>
      </EditorManagerProvider>
    </Container >
  )
}

export default App
