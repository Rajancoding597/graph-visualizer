import React from "react";
import { createRoot } from "react-dom/client";
import GraphVisualizerUI from "./GraphVisualizerUI";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <GraphVisualizerUI />
  </React.StrictMode>
);
