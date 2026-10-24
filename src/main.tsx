import "./renderer/diagnostics";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./renderer/app/App";
import { MatrixProvider } from "./renderer/app/providers/MatrixProvider";
import "./renderer/styles/index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <MatrixProvider>
        <App />
      </MatrixProvider>
    </QueryClientProvider>
  </StrictMode>,
);
