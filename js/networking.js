import { showEmptyState, showLoadingState } from "./tables.js";

const NETWORKING_CATALOG_PATH = "catalogs/networking_inventory.json";

const state = {
  items: [],
  isLoading: true,
  loadError: false,
};

const elements = {
  section: document.getElementById("networkingView"),
  searchInput: document.getElementById("networkSearchInput"),
  brandFilter: document.getElementById("networkBrandFilter"),
  familyFilter: document.getElementById("networkFamilyFilter"),
  locationFilter: document.getElementById("networkLocationFilter"),
  sourceFilter: document.getElementById("networkSourceFilter"),
  resultsArea: document.getElementById("networkingResultsArea"),
};

if (elements.section && elements.resultsArea) {
  initializeNetworking();
}

function initializeNetworking() {
  bindEvents();
  showLoadingState(elements.resultsArea, "Cargando inventario...");
  loadInventory();
}

function bindEvents() {
  [elements.searchInput, elements.brandFilter, elements.familyFilter, elements.locationFilter, elements.sourceFilter]
    .filter(Boolean)
    .forEach((field) => {
      const eventName = field.tagName === "INPUT" ? "input" : "change";
      field.addEventListener(eventName, () => {
        syncFilterOptions();
        renderInventory();
      });
    });
}

async function loadInventory() {
  state.isLoading = true;
  state.loadError = false;

  try {
    const response = await fetch(NETWORKING_CATALOG_PATH);
    if (!response.ok) {
      throw new Error(`Networking catalog request failed with status ${response.status}`);
    }

    const data = await response.json();
    state.items = Array.isArray(data) ? data.map(enrichItem) : [];
    state.isLoading = false;
    syncFilterOptions();
    renderInventory();
  } catch (error) {
    state.items = [];
    state.loadError = true;
    state.isLoading = false;
    showEmptyState(elements.resultsArea, {
      icon: "&#9888;",
      title: "No se pudo cargar el inventario",
      message: "Revisa catalogs/networking_inventory.json e intenta de nuevo.",
    });
  }
}

function enrichItem(item) {
  const searchText = normalizeText(
    [
      item.brand,
      item.family,
      item.type,
      item.sku,
      item.material,
      item.location,
      item.source,
      item.description,
    ].join(" "),
  );

  return {
    ...item,
    searchText,
  };
}

function getActiveFilters() {
  return {
    query: elements.searchInput?.value || "",
    brand: elements.brandFilter?.value || "",
    family: elements.familyFilter?.value || "",
    location: elements.locationFilter?.value || "",
    source: elements.sourceFilter?.value || "",
  };
}

function matchesItem(item, filters, ignoredKeys = new Set()) {
  if (!ignoredKeys.has("brand") && filters.brand && item.brand !== filters.brand) {
    return false;
  }

  if (!ignoredKeys.has("family") && filters.family && item.family !== filters.family) {
    return false;
  }

  if (!ignoredKeys.has("location") && filters.location && item.location !== filters.location) {
    return false;
  }

  if (!ignoredKeys.has("source") && filters.source && item.source !== filters.source) {
    return false;
  }

  if (!ignoredKeys.has("query")) {
    const queryWords = normalizeText(filters.query).split(/\s+/).filter(Boolean);
    if (queryWords.length && !queryWords.every((word) => item.searchText.includes(word))) {
      return false;
    }
  }

  return true;
}

function syncFilterOptions() {
  const filters = getActiveFilters();
  const availableBrands = getUniqueValues(
    state.items.filter((item) => matchesItem(item, filters, new Set(["brand"]))),
    "brand",
  );
  const availableFamilies = getUniqueValues(
    state.items.filter((item) => matchesItem(item, filters, new Set(["family"]))),
    "family",
  );
  const availableLocations = getUniqueValues(
    state.items.filter((item) => matchesItem(item, filters, new Set(["location"]))),
    "location",
  );
  const availableSources = getUniqueValues(
    state.items.filter((item) => matchesItem(item, filters, new Set(["source"]))),
    "source",
  );

  setSelectOptions(elements.brandFilter, availableBrands, "Todas");
  setSelectOptions(elements.familyFilter, availableFamilies, "Todas");
  setSelectOptions(elements.locationFilter, availableLocations, "Todas");
  setSelectOptions(elements.sourceFilter, availableSources, "Todas");
}

function renderInventory() {
  if (state.isLoading) {
    showLoadingState(elements.resultsArea, "Cargando inventario...");
    return;
  }

  if (state.loadError) {
    return;
  }

  const items = getFilteredItems();
  if (!items.length) {
    showEmptyState(elements.resultsArea, {
      title: "Sin resultados",
      message: "Ajusta la marca, la familia o la busqueda para encontrar inventario.",
    });
    return;
  }

  const totalStock = items.reduce((sum, item) => sum + (Number(item.stock) || 0), 0);
  const brands = new Set(items.map((item) => item.brand)).size;
  const locations = new Set(items.map((item) => item.location)).size;

  let html = `
    <div class="summary-strip">
      <div class="summary-card">
        <div class="summary-label">Registros</div>
        <div class="summary-val">${items.length.toLocaleString("es-CO")}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Unidades</div>
        <div class="summary-val">${totalStock.toLocaleString("es-CO")}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Marcas</div>
        <div class="summary-val">${brands.toLocaleString("es-CO")}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Ubicaciones</div>
        <div class="summary-val">${locations.toLocaleString("es-CO")}</div>
      </div>
    </div>
    <div class="dist-card mobile-visible" data-dist="NETWORKING">
      <div class="dist-header">
        <div class="dist-name">Inventario Networking</div>
        <div class="dist-count">${items.length.toLocaleString("es-CO")} registros</div>
      </div>
      <div class="dist-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Marca</th>
              <th>Familia</th>
              <th>SKU</th>
              <th>Descripcion</th>
              <th class="right">Stock</th>
            </tr>
          </thead>
          <tbody>
  `;

  items.forEach((item) => {
    html += `
      <tr>
        <td>${escapeHtml(item.brand || "-")}</td>
        <td>${escapeHtml(item.family || "-")}</td>
        <td>
          <div class="prod-name">${escapeHtml(item.sku || "-")}</div>
          <div class="prod-seg">${escapeHtml(item.type || "")}</div>
        </td>
        <td>
          <div class="prod-name">${escapeHtml(String(item.description || "").substring(0, 110))}</div>
          <div class="prod-seg">${escapeHtml(item.availability || item.leadTime || "")}</div>
        </td>
        <td class="td-right">${(Number(item.stock) || 0).toLocaleString("es-CO")}</td>
      </tr>
    `;
  });

  html += `
          </tbody>
        </table>
      </div>
    </div>
  `;

  elements.resultsArea.innerHTML = html;
}

function getFilteredItems() {
  const filters = getActiveFilters();
  return state.items
    .filter((item) => matchesItem(item, filters))
    .sort((left, right) => {
      const brandCompare = String(left.brand || "").localeCompare(String(right.brand || ""), "es");
      if (brandCompare !== 0) {
        return brandCompare;
      }

      const familyCompare = String(left.family || "").localeCompare(String(right.family || ""), "es");
      if (familyCompare !== 0) {
        return familyCompare;
      }

      return (Number(right.stock) || 0) - (Number(left.stock) || 0);
    });
}

function setSelectOptions(select, values, allLabel) {
  if (!select) {
    return;
  }

  const previousValue = select.value;
  const options = [`<option value="">${escapeHtml(allLabel)}</option>`]
    .concat(values.map((value) => `<option value="${escapeAttribute(value)}">${escapeHtml(value)}</option>`))
    .join("");

  select.innerHTML = options;
  select.disabled = values.length === 0;
  if (values.includes(previousValue)) {
    select.value = previousValue;
    return;
  }

  select.value = "";
}

function getUniqueValues(items, key) {
  return Array.from(
    new Set(
      items
        .map((item) => String(item[key] || "").trim())
        .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right, "es", { sensitivity: "base" }));
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}
