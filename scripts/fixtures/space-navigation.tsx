import React from "react";
import { createRoot } from "react-dom/client";
import { DesktopFrame } from "../../src/renderer/components/common/DesktopFrame";
import { ChatShell } from "../../src/renderer/features/chat/ChatShell";
import "../../src/renderer/styles/index.css";
createRoot(document.getElementById("root")!).render(<DesktopFrame><ChatShell /></DesktopFrame>);
