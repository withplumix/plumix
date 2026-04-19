import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.js";

import "./styles/globals.css";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Missing #root element");

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
