import React, { useEffect } from "react";
import "./App.css";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Hub } from "@modules/hub/Hub";
import styled from "styled-components";
import { useTheme } from "@theme/ThemeContext";
import NavBar from "@shared/navbar/NavBar";
import { ThemeProvider } from "styled-components";
import { ThemeProvider as MuiThemeProvider } from "@mui/material/styles";
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

  const theme = useTheme();
  return (
    <StyledEngineProvider injectFirst>
      <MuiThemeProvider theme={muiTheme}>
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
      </MuiThemeProvider>
    </StyledEngineProvider>
  );
}

export default App;
