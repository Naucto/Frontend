import "./App.css";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Hub } from "@modules/hub/Hub";
import { styled, ThemeProvider } from "@mui/material/styles";
import NavBar from "@shared/navbar/NavBar";
import { muiTheme } from "@theme/MUITheme";
import Projects from "@modules/projects/Projects";
import Project from "@modules/project/Project";
import { ProjectProvider } from "src/providers/ProjectProvider";

const Container = styled("div")(({ theme }) => ({
  height: "100vh",
  width: "100vw",
  margin: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
  backgroundColor: theme.palette.background.default,
  flex: 1
}));

function App() {
  return (
    <ThemeProvider theme={muiTheme}>
      <Container>
        <BrowserRouter>
          <NavBar />
          <Routes>
            <Route path="/" element={<Hub />} />
            <Route path="/hub" element={<Hub />} />
            <Route path='/projects' element={<Projects />} />
            <Route path="/projects/:projectId" element={<Project />} />
            {/* <Route path="/editor" element={editorManager.render()} /> */}
          </Routes>
        </BrowserRouter>
      </Container>
    </ThemeProvider>
  );
}

export default App;
