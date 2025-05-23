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
import Create from "@modules/create/Create";
import { StyledEngineProvider } from "@mui/material";
import { TabData } from "@modules/editor/tab/TabData";
import { muiTheme } from "@theme/MUITheme";

const Container = styled.div<{ theme: any }>`
    min-height: 100vh;
    min-width: 100vw;
    margin: 0;
    padding: 0;
    position: absolute;
    background-color: ${({ theme }) => theme.colors.background};
`;

function App() {
  // temporary for example

  const editorManagerRef = useRef(new EditorManager());

  const editorManager = useMemo(() => {
    const manager = editorManagerRef.current;
    manager.addEditor(CodeEditor, new TabData("Code", "code"));
    manager.addEditor(MapEditor, new TabData("Map", "map"));
    manager.addEditor(SoundEditor, new TabData("Sound", "sound"));
    manager.addEditor(SpriteEditor, new TabData("Sprite", "sprite"));
    return manager;
  }, []);

  const theme = useTheme();
  return (
    <Container theme={theme}>
      <EditorManagerProvider value={editorManager}>
        <StyledEngineProvider injectFirst>
          <MUIThemeProvider theme={muiTheme}>
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
          </MUIThemeProvider>
        </StyledEngineProvider>
      </EditorManagerProvider>
    </Container >
  );
}

export default App;
