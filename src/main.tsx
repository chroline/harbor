import { MotionConfig } from "framer-motion";
import { SizeProvider } from "./lib/size-context";
import { SurfaceProvider } from "./lib/surface-context";
import React from "react";
import ReactDOM from "react-dom/client";
import { StoreProvider } from "./lib/store";
import { TooltipProvider } from "./components/ui/tooltip";
import App from "./App";
import { StandaloneTab } from "./components/StandaloneTab";
import { desktop } from "./lib/api";
import "./styles.css";

// Include the toolbar in Vite dev and packaged development builds only.
const Agentation =
  import.meta.env.DEV || import.meta.env.MODE === "development"
    ? React.lazy(() =>
        import("agentation").then(({ Agentation }) => ({
          default: Agentation,
        })),
      )
    : null;

document.documentElement.classList.toggle("desktop", desktop);
const standalone = new URLSearchParams(location.search).has("detached");
document.documentElement.classList.toggle("standalone", standalone);
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MotionConfig reducedMotion="user">
      <SizeProvider size="default">
        <SurfaceProvider value={1}>
          <TooltipProvider>
            <StoreProvider autoReconnect={!standalone}>
              {standalone ? <StandaloneTab /> : <App />}
            </StoreProvider>
          </TooltipProvider>
        </SurfaceProvider>
      </SizeProvider>
    </MotionConfig>
    {Agentation && !standalone && (
      <React.Suspense fallback={null}>
        <Agentation
          endpoint={import.meta.env.VITE_AGENTATION_ENDPOINT || undefined}
        />
      </React.Suspense>
    )}
  </React.StrictMode>,
);
