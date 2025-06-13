import React, { useMemo, useRef, useEffect } from "react";
import "./App.css";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Hub } from "@modules/hub/Hub";
import { EditorManager, EditorManagerProvider } from "@modules/editor/EditorManager";

import { ThemeProvider as MUIThemeProvider } from "@mui/material/styles";
import { CodeEditor } from "@modules/editor/CodeEditor/CodeEditor";
import { MapEditor } from "@modules/editor/MapEditor/MapEditor";
import { SoundEditor } from "@modules/editor/SoundEditor/SoundEditor";
import { SpriteEditor } from "@modules/editor/SpriteEditor/SpriteEditor";
import styled from "styled-components";
import { useTheme } from "@theme/ThemeContext";
import NavBar from "@shared/navbar/NavBar";
import { ThemeProvider } from "styled-components";
import { StyledEngineProvider } from "@mui/material";
import { muiTheme } from "@theme/MUITheme";
import GameEditor from "@modules/create/game-editor/GameEditor";

const Container = styled.div<{ theme: any }>`
    height: 100vh;
    width: 100vw;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    background-color: ${({ theme }) => theme.colors.background};
`;

function App() {
  // temporary for example

  const editorManagerRef = useRef(new EditorManager());

  const editorManager = useMemo(() => {
    const manager = editorManagerRef.current;
    manager.addEditor(CodeEditor, { title: "Code", icon: "code" });
    manager.addEditor(MapEditor, { title: "Map", icon: "map" });
    manager.addEditor(SoundEditor, { title: "Sound", icon: "sound" });
    manager.addEditor(SpriteEditor, { title: "Sprite", icon: "sprite" });
    return manager;
  }, []);

  const theme = useTheme();
  return (
    <EditorManagerProvider value={editorManager}> {/* will soon be removed */}
      <StyledEngineProvider injectFirst>
        <MUIThemeProvider theme={muiTheme}>
          <ThemeProvider theme={theme} >
            <BrowserRouter>
              <Container theme={theme}>
                <NavBar />
                <div style={{ flex: 1, display: "flex" }}>
                  <Routes>
                    <Route path="/" element={<Hub />} />
                    <Route path="/hub" element={<Hub />} />
                    <Route path="/create" element={<GameEditor />} />
                  </Routes>
                </div>
              </Container>
            </BrowserRouter>
          </ThemeProvider>
        </MUIThemeProvider>
      </StyledEngineProvider>
    </EditorManagerProvider>
  );
}

export default App;
