import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { MotionConfig } from "framer-motion";
import { StoreProvider } from "../src/lib/store";
import { TooltipProvider } from "../src/components/ui/tooltip";
import { LaunchDialog } from "../src/components/LaunchDialog";
import "../src/styles.css";
function Harness() {
  const [open, setOpen] = useState(true);
  return (
    <MotionConfig reducedMotion="user">
      <TooltipProvider>
        <StoreProvider>
          <LaunchDialog
            open={open}
            onClose={() => setOpen(false)}
            initialPrompt=""
            initialProvider="codex"
            initialWorkspace="fixture-workspace"
            onCreated={() => {}}
            onAddWorkspace={async () => {}}
          />
        </StoreProvider>
      </TooltipProvider>
    </MotionConfig>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Harness />
  </React.StrictMode>,
);
