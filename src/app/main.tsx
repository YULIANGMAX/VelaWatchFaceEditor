import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "misans/lib/Latin/MiSansLatinVF.min.css";
import "misans/lib/Normal/MiSansVF.min.css";
import "misans/lib/TC/MiSansTCVF.min.css";
import "@fontsource/noto-sans/index.css";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
