import React, { useMemo, useRef, useEffect } from "react";
import "./App.css";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Hub } from "@modules/hub/Hub";
import { EditorManager, EditorManagerProvider } from "@modules/editor/EditorManager";

import { CodeEditor } from "@modules/editor/CodeEditor/CodeEditor";
import { MapEditor } from "@modules/editor/MapEditor/MapEditor";
import { SoundEditor } from "@modules/editor/SoundEditor/SoundEditor";
import { SpriteEditor } from "@modules/editor/SpriteEditor/SpriteEditor";
import { styled, ThemeProvider } from "@mui/material/styles";
import NavBar from "@shared/navbar/NavBar";
import Create from "@modules/create/Create";
import { muiTheme } from "@theme/MUITheme";
import GameEditor from "@modules/create/game-editor/GameEditor";

const Container = styled("div")(({ theme }) => ({
  height: "100vh",
  width: "100vw",
  margin: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
  backgroundColor: theme.palette.background.default
}));

function App() {
  return (
    <ThemeProvider theme={muiTheme}>
      <Container>
        <BrowserRouter>
          <NavBar />
          <div style={{ flex: 1, display: "flex" }}>
            <Routes>
              <Route path="/" element={<Hub />} />
              <Route path="/hub" element={<Hub />} />
              <Route path='/create' element={<GameEditor />} />
              {/* <Route path="/editor" element={editorManager.render()} /> */}
            </Routes>
          </div>
        </BrowserRouter>
      </Container>
    </ThemeProvider>
  );
}

export default App;
