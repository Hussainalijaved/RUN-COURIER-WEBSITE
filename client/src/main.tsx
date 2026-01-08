import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { logEnvironmentStatus } from "./lib/env-validation";

logEnvironmentStatus();

createRoot(document.getElementById("root")!).render(<App />);
