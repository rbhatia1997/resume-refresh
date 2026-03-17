import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import ResumeRefreshPrototype from "./ResumeRefreshPrototype";

const rootElement = document.querySelector("#root");

if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <ResumeRefreshPrototype />
    </StrictMode>
  );
}
