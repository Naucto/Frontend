import React from "react"
import { useState } from "react"
import reactLogo from "./assets/react.svg"
import viteLogo from "/vite.svg"
import "./App.css"
import { ThemeProvider } from "@theme/ThemeContext"

import { Hub } from "@modules/hub/Hub"
function App() {
  return (
    <ThemeProvider>
      <Hub></Hub>
    </ThemeProvider>
  )
}

export default App
