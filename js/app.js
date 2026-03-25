import "./search.js";
import "./networking.js";

const AREA_STORAGE_KEY = "licensehub.activeArea";
const DEFAULT_AREA = "cloud";

const areaButtons = Array.from(document.querySelectorAll("[data-area-tab]"));
const areaViews = Array.from(document.querySelectorAll("[data-area-view]"));

if (areaButtons.length && areaViews.length) {
  initializeAreaTabs();
}

function initializeAreaTabs() {
  const storedArea = window.localStorage.getItem(AREA_STORAGE_KEY);
  const initialArea = areaViews.some((view) => view.dataset.areaView === storedArea) ? storedArea : DEFAULT_AREA;

  areaButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setActiveArea(button.dataset.areaTab);
    });
  });

  setActiveArea(initialArea);
}

function setActiveArea(area) {
  areaButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.areaTab === area);
  });

  areaViews.forEach((view) => {
    view.hidden = view.dataset.areaView !== area;
  });

  window.localStorage.setItem(AREA_STORAGE_KEY, area);
}
