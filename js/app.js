import { initializeAuthApp } from "./auth.js";

const PRICE_UPDATE_MAINTENANCE = true;

if (PRICE_UPDATE_MAINTENANCE) {
  document.body.classList.add("maintenance-mode");
  document.body.classList.remove("auth-ready");
} else {
  document.body.classList.remove("maintenance-mode");
  initializeAuthApp();
}
