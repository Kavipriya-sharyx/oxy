import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App as AntApp, ConfigProvider, theme as antTheme } from "antd";
import App from "./App";
import "./styles/oxxy.css";
import "./styles/index.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

// Light by default, like www.oxxy.in; dark only when <html data-theme="dark"> is set (styles/oxxy.css)
const dark = typeof document !== "undefined" && document.documentElement.dataset.theme === "dark";

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ConfigProvider
          theme={{
            algorithm: dark ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
            token: {
              colorPrimary: dark ? "#2cc6b9" : "#02857c",
              colorLink: dark ? "#2cc6b9" : "#02857c",
              fontFamily: '"Roboto", system-ui, -apple-system, "Segoe UI", sans-serif',
              borderRadius: 6,
            },
          }}
        >
          <AntApp>
            <App />
          </AntApp>
        </ConfigProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
