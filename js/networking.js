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

function getBaseItemsForOptions() {
  return state.items.filter((item) => {
    if (elements.brandFilter.value && item.brand !== elements.brandFilter.value) {
      return false;
    }

    if (elements.sourceFilter.value && item.source !== elements.sourceFilter.value) {
      return false;
    }

    return true;
  });
}

function syncFilterOptions() {
  const baseItems = getBaseItemsForOptions();
  const availableFamilies = getUniqueValues(baseItems, "family");
  const availableLocations = getUniqueValues(baseItems, "location");
  const availableSources = getUniqueValues(state.items, "source");
  const availableBrands = getUniqueValues(state.items, "brand");

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
              <th>Ubicacion</th>
              <th>Fuente</th>
              <th class="right">Precio</th>
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
        <td class="td-right price-cell">${(Number(item.stock) || 0).toLocaleString("es-CO")}</td>
        <td>${escapeHtml(item.location || "-")}</td>
        <td>${escapeHtml(item.source || "-")}</td>
        <td class="td-right price-cell">${escapeHtml(item.priceText || "-")}</td>
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
  const queryWords = normalizeText(elements.searchInput.value).split(/\s+/).filter(Boolean);

  return state.items
    .filter((item) => {
      if (elements.brandFilter.value && item.brand !== elements.brandFilter.value) {
        return false;
      }

      if (elements.familyFilter.value && item.family !== elements.familyFilter.value) {
        return false;
      }

      if (elements.locationFilter.value && item.location !== elements.locationFilter.value) {
        return false;
      }

      if (elements.sourceFilter.value && item.source !== elements.sourceFilter.value) {
        return false;
      }

      if (!queryWords.length) {
        return true;
      }

      return queryWords.every((word) => item.searchText.includes(word));
    })
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
  if (values.includes(previousValue)) {
    select.value = previousValue;
  }
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
