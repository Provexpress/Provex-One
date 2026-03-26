import {
  DIST_ORDER,
  applyMobileVisibility,
  renderTables,
  showEmptyState,
  showLoadingState,
} from "./tables.js";
import { fetchTRM } from "./trm.js";

const SUGGESTION_LIMIT = 8;
const CLOUD_CATALOG_PATHS = ["catalogs/cloud_products.json", "products.json"];
const TYPE_OPTION_DEFS = [
  { value: "NCE", label: "NCE" },
  { value: "SUSCRIPCION", label: "Suscripcion" },
  { value: "PERPETUO", label: "Perpetuo" },
];
const SEGMENT_OPTION_DEFS = [
  { value: "Commercial", label: "Commercial" },
  { value: "Education", label: "Education" },
];
const PERIOD_OPTION_DEFS = [
  { value: "mensual_mensual", label: "Mensual / Mensual" },
  { value: "anual_anual", label: "Anual / Anual" },
  { value: "anual_mensual", label: "Anual / Mensual" },
  { value: "trianual_anual", label: "Trianual / Anual" },
  { value: "trianual_trianual", label: "Trianual / Trianual" },
  { value: "trianual_mensual", label: "Trianual / Mensual" },
  { value: "onetime_onetime", label: "One Time / OneTime" },
];

const state = {
  products: [],
  activeDists: new Set(DIST_ORDER),
  currentResults: createEmptyResults(),
  hasSearched: false,
  activeMobileDist: DIST_ORDER[0],
  isLoadingProducts: true,
  loadError: false,
  selectedProducts: [],
  searchSuggestions: [],
  autoSelectedFilters: {
    type: false,
    segment: false,
    period: false,
  },
};

const elements = {
  totalCount: document.getElementById("totalCount"),
  searchComposer: document.getElementById("searchComposer"),
  searchInput: document.getElementById("searchInput"),
  searchButton: document.getElementById("searchButton"),
  searchSuggestions: document.getElementById("searchSuggestions"),
  selectedProductsSection: document.getElementById("selectedProductsSection"),
  selectedProductsList: document.getElementById("selectedProductsList"),
  clearSelectedProducts: document.getElementById("clearSelectedProducts"),
  typeFilter: document.getElementById("typeFilter"),
  segFilter: document.getElementById("segFilter"),
  termFilter: document.getElementById("termFilter"),
  filterChips: Array.from(document.querySelectorAll(".filter-chip")),
  profitPct: document.getElementById("profitPct"),
  qtyInput: document.getElementById("qtyInput"),
  trmInput: document.getElementById("trmInput"),
  trmStatus: document.getElementById("trmStatus"),
  mobileTabs: Array.from(document.querySelectorAll(".dist-tab")),
  resultsArea: document.getElementById("resultsArea"),
};

initialize();

function initialize() {
  bindEvents();
  syncFilterChips();
  syncMobileTabs();
  renderSelectedProducts();
  loadProducts();

  fetchTRM({
    statusEl: elements.trmStatus,
    inputEl: elements.trmInput,
  });
}

function bindEvents() {
  elements.searchButton.addEventListener("click", runSearch);
  elements.searchInput.addEventListener("keydown", handleSearchInputKeydown);
  elements.searchInput.addEventListener("input", handleSearchInputInput);
  elements.searchInput.addEventListener("focus", handleSearchInputFocus);
  elements.searchSuggestions.addEventListener("click", handleSuggestionClick);
  elements.selectedProductsList.addEventListener("click", handleSelectedProductRemove);
  elements.clearSelectedProducts.addEventListener("click", clearSelectedProducts);

  document.addEventListener("click", (event) => {
    if (
      elements.searchComposer.contains(event.target) ||
      elements.searchSuggestions.contains(event.target)
    ) {
      return;
    }

    hideSearchSuggestions();
  });

  [
    { element: elements.typeFilter, key: "type" },
    { element: elements.segFilter, key: "segment" },
    { element: elements.termFilter, key: "period" },
  ].forEach(({ element, key }) => {
    element.addEventListener("change", () => {
      state.autoSelectedFilters[key] = false;
      syncCloudFilterOptions();
      updateSearchSuggestions();
      if (state.hasSearched) {
        runSearch();
      }
    });
  });

  elements.filterChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      toggleDist(chip.dataset.dist);
    });
  });

  [elements.profitPct, elements.qtyInput].forEach((field) => {
    field.addEventListener("input", () => {
      if (state.hasSearched) {
        renderCurrentResults();
      }
    });
  });

  elements.mobileTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      setActiveMobileDist(tab.dataset.dist);
    });
  });
}

async function loadProducts() {
  state.isLoadingProducts = true;
  state.loadError = false;

  try {
    const data = await fetchCatalogData(CLOUD_CATALOG_PATHS);
    state.products = Array.isArray(data)
      ? data
          .filter((product) => normalizeText(product.segment) !== "charity")
          .map(enrichProduct)
      : [];

    if (elements.totalCount) {
      elements.totalCount.textContent = `${state.products.length.toLocaleString("es-CO")} productos - 3 mayoristas`;
    }
  } catch (error) {
    state.products = [];
    state.loadError = true;
    if (elements.totalCount) {
      elements.totalCount.textContent = "Error cargando datos";
    }
  } finally {
    state.isLoadingProducts = false;
    syncCloudFilterOptions();
    updateSearchSuggestions();
  }
}

async function fetchCatalogData(paths) {
  let lastError = null;

  for (const path of paths) {
    try {
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error(`Catalog request failed with status ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Catalog request failed");
}

function handleSearchInputKeydown(event) {
  if (event.key === "Escape") {
    hideSearchSuggestions();
    return;
  }

  if (event.key === "Enter") {
    event.preventDefault();
    runSearch();
  }
}

function handleSearchInputInput() {
  syncCloudFilterOptions();
  updateSearchSuggestions();
}

function handleSearchInputFocus() {
  syncCloudFilterOptions();
  updateSearchSuggestions();
}

function syncCloudFilterOptions() {
  if (!state.products.length || state.loadError) {
    return;
  }

  const context = getSelectionContext();
  const activeFilters = getActiveSecondaryFilters();
  const baseProducts = state.products.filter((product) => matchesSelectionContext(product, context));
  const productsForOptions = baseProducts.length ? baseProducts : state.products;
  const autoSelectSingle = context.hasFocus;

  const availableTypes = getOrderedFilterValues(
    productsForOptions.filter((product) => matchesSecondaryFilters(product, activeFilters, new Set(["type"]))),
    "type",
    TYPE_OPTION_DEFS,
  );
  const availableSegments = getOrderedFilterValues(
    productsForOptions.filter((product) => matchesSecondaryFilters(product, activeFilters, new Set(["segment"]))),
    "segment",
    SEGMENT_OPTION_DEFS,
  );
  const availablePeriods = getOrderedFilterValues(
    productsForOptions.filter((product) => matchesSecondaryFilters(product, activeFilters, new Set(["period"]))),
    "strictPeriodKey",
    PERIOD_OPTION_DEFS,
  );

  setDynamicSelectOptions("type", elements.typeFilter, availableTypes, {
    allLabel: "Todos los tipos",
    autoSelectSingle,
  });
  setDynamicSelectOptions("segment", elements.segFilter, availableSegments, {
    allLabel: "Todos",
    autoSelectSingle,
  });
  setDynamicSelectOptions("period", elements.termFilter, availablePeriods, {
    allLabel: "Todos",
    autoSelectSingle,
  });
}

function getSelectionContext() {
  const query = normalizeText(elements.searchInput.value);
  const words = query.split(/\s+/).filter(Boolean);

  return {
    words,
    hasFocus: words.length > 0,
  };
}

function getActiveSecondaryFilters() {
  return {
    type: elements.typeFilter.value,
    segment: normalizeText(elements.segFilter.value),
    period: elements.termFilter.value,
  };
}

function matchesSelectionContext(product, context) {
  if (!context.hasFocus) {
    return true;
  }

  const searchableName = product.searchText || normalizeText(product.name || "");
  return context.words.every((word) => searchableName.includes(word));
}

function handleSuggestionClick(event) {
  const button = event.target.closest("[data-product-name]");
  if (!button) {
    return;
  }

  addSelectedProduct(button.dataset.productName);
}

function handleSelectedProductRemove(event) {
  const button = event.target.closest("[data-remove-product]");
  if (!button) {
    return;
  }

  removeSelectedProduct(button.dataset.removeProduct);
}

function runSearch() {
  const query = normalizeText(elements.searchInput.value);
  const hasSelectedProducts = state.selectedProducts.length > 0;

  if (!hasSelectedProducts && !query) {
    state.hasSearched = false;
    state.currentResults = createEmptyResults();
    showEmptyState(elements.resultsArea, {
      title: "Selecciona o escribe algo para buscar",
      message: "Puedes comparar varios productos al mismo tiempo.",
    });
    return;
  }

  if (state.isLoadingProducts) {
    showLoadingState(elements.resultsArea, "Cargando catalogo...");
    return;
  }

  if (state.loadError) {
    showEmptyState(elements.resultsArea, {
      icon: "&#9888;",
      title: "No se pudieron cargar los productos",
      message: "Revisa catalogs/cloud_products.json o products.json e intenta de nuevo.",
    });
    return;
  }

  const criteria = getSearchCriteria(query);
  state.hasSearched = true;
  showLoadingState(elements.resultsArea);
  hideSearchSuggestions();

  window.setTimeout(() => {
    const filteredProducts = state.products.filter((product) => matchesProduct(product, criteria));
    state.currentResults = groupResultsByDistributor(filteredProducts);
    renderCurrentResults();
  }, 30);
}

function getSearchCriteria(query) {
  return {
    currentInput: {
      words: query.split(/\s+/).filter(Boolean),
      type: elements.typeFilter.value,
      segment: normalizeText(elements.segFilter.value),
      period: elements.termFilter.value,
    },
    selectedProducts: [...state.selectedProducts],
  };
}

function matchesProduct(product, criteria) {
  if (criteria.selectedProducts.some((selection) => matchesSelectedProductProfile(product, selection))) {
    return true;
  }

  return (
    matchesSelectionOrQuery(product, criteria.currentInput) &&
    matchesSecondaryFilters(product, criteria.currentInput)
  );
}

function matchesSelectionOrQuery(product, criteria) {
  const productName = String(product.name || "").trim();

  if (!criteria.words.length) {
    return false;
  }

  const searchableName = product.searchText || normalizeText(productName);
  return criteria.words.every((word) => searchableName.includes(word));
}

function matchesSecondaryFilters(product, criteria, ignoredKeys = new Set()) {
  const segment = normalizeText(product.segment);

  if (!ignoredKeys.has("type") && criteria.type && product.type !== criteria.type) {
    return false;
  }

  if (!ignoredKeys.has("segment") && criteria.segment && segment !== criteria.segment) {
    return false;
  }

  if (!ignoredKeys.has("period") && criteria.period && product.strictPeriodKey !== criteria.period) {
    return false;
  }

  return true;
}

function updateSearchSuggestions() {
  const query = normalizeText(elements.searchInput.value);

  if (!query || state.isLoadingProducts || state.loadError) {
    state.searchSuggestions = [];
    renderSearchSuggestions();
    return;
  }

  const activeFilters = getActiveSecondaryFilters();
  const selectedIds = new Set(state.selectedProducts.map((selection) => selection.id));
  const suggestions = [];
  const seenNames = new Set();
  const criteria = {
    words: query.split(/\s+/).filter(Boolean),
    ...activeFilters,
  };

  for (const product of state.products) {
    const productName = product.canonicalName || String(product.name || "").trim();
    const candidateSelectionId = getSelectedProductId(productName, activeFilters);

    if (!productName || selectedIds.has(candidateSelectionId) || seenNames.has(productName)) {
      continue;
    }

    if (!matchesSecondaryFilters(product, criteria)) {
      continue;
    }

    if (!(product.searchText || normalizeText(productName)).includes(query)) {
      continue;
    }

    suggestions.push(productName);
    seenNames.add(productName);

    if (suggestions.length >= SUGGESTION_LIMIT) {
      break;
    }
  }

  state.searchSuggestions = suggestions;
  renderSearchSuggestions();
}

function renderSearchSuggestions() {
  const query = normalizeText(elements.searchInput.value);

  if (!query) {
    elements.searchSuggestions.hidden = true;
    elements.searchSuggestions.innerHTML = "";
    return;
  }

  if (!state.searchSuggestions.length) {
    elements.searchSuggestions.innerHTML =
      '<div class="search-suggestion-empty">Sin coincidencias para agregar</div>';
    elements.searchSuggestions.hidden = false;
    return;
  }

  elements.searchSuggestions.innerHTML = state.searchSuggestions
    .map(
      (name) => `
        <button type="button" class="search-suggestion" data-product-name="${escapeAttribute(name)}">
          ${escapeHtml(name)}
        </button>
      `,
    )
    .join("");

  elements.searchSuggestions.hidden = false;
}

function hideSearchSuggestions() {
  elements.searchSuggestions.hidden = true;
}

function addSelectedProduct(name) {
  const selection = createSelectedProductSelection(name);

  if (!selection || state.selectedProducts.some((item) => item.id === selection.id)) {
    return;
  }

  state.selectedProducts = [...state.selectedProducts, selection];
  elements.searchInput.value = "";
  state.searchSuggestions = [];
  resetCurrentInputFilters();
  syncCloudFilterOptions();
  renderSelectedProducts();
  renderSearchSuggestions();

  if (state.hasSearched) {
    runSearch();
  }
}

function removeSelectedProduct(selectionId) {
  state.selectedProducts = state.selectedProducts.filter((item) => item.id !== selectionId);
  syncCloudFilterOptions();
  renderSelectedProducts();
  updateSearchSuggestions();

  if (!state.hasSearched) {
    return;
  }

  if (state.selectedProducts.length || normalizeText(elements.searchInput.value)) {
    runSearch();
    return;
  }

  state.hasSearched = false;
  state.currentResults = createEmptyResults();
  showEmptyState(elements.resultsArea, {
    title: "Selecciona o escribe algo para buscar",
    message: "Puedes comparar varios productos al mismo tiempo.",
  });
}

function clearSelectedProducts() {
  if (!state.selectedProducts.length) {
    return;
  }

  state.selectedProducts = [];
  syncCloudFilterOptions();
  renderSelectedProducts();
  updateSearchSuggestions();

  if (!state.hasSearched) {
    return;
  }

  if (normalizeText(elements.searchInput.value)) {
    runSearch();
    return;
  }

  state.hasSearched = false;
  state.currentResults = createEmptyResults();
  showEmptyState(elements.resultsArea, {
    title: "Selecciona o escribe algo para buscar",
    message: "Puedes comparar varios productos al mismo tiempo.",
  });
}

function renderSelectedProducts() {
  if (!state.selectedProducts.length) {
    elements.selectedProductsSection.hidden = true;
    elements.selectedProductsList.innerHTML = "";
    return;
  }

  elements.selectedProductsSection.hidden = false;
  elements.selectedProductsList.innerHTML = state.selectedProducts
    .map(
      (selection) => `
        <div class="selected-product-chip">
          <div class="selected-product-copy">
            <span class="selected-product-name">${escapeHtml(selection.name)}</span>
            ${
              selection.metaLabel
                ? `<span class="selected-product-meta">${escapeHtml(selection.metaLabel)}</span>`
                : ""
            }
          </div>
          <button
            type="button"
            class="selected-product-remove"
            data-remove-product="${escapeAttribute(selection.id)}"
            aria-label="Quitar ${escapeAttribute(selection.displayLabel)}"
          >
            &times;
          </button>
        </div>
      `,
    )
    .join("");
}

function groupResultsByDistributor(products) {
  const grouped = createEmptyResults();
  const dedupedProducts = dedupeLogicalProducts(products);

  dedupedProducts.forEach((product) => {
    if (grouped[product.distributor]) {
      grouped[product.distributor].push(product);
    }
  });

  Object.values(grouped).forEach((distProducts) => {
    distProducts.sort((left, right) => compareProducts(left, right, state.selectedProducts));
  });

  return grouped;
}

function dedupeLogicalProducts(products) {
  const bestByLogicalKey = new Map();

  products.forEach((product) => {
    const logicalKey = [product.distributor, product.comparisonKey || ""].join("__");
    const existing = bestByLogicalKey.get(logicalKey);

    if (!existing || isPreferredProduct(product, existing)) {
      bestByLogicalKey.set(logicalKey, product);
    }
  });

  return Array.from(bestByLogicalKey.values());
}

function isPreferredProduct(candidate, current) {
  const candidatePrice = Number(candidate.price) || 0;
  const currentPrice = Number(current.price) || 0;

  if (candidatePrice !== currentPrice) {
    return candidatePrice < currentPrice;
  }

  const candidateName = String(candidate.name || "");
  const currentName = String(current.name || "");

  if (candidateName.length !== currentName.length) {
    return candidateName.length < currentName.length;
  }

  return candidateName.localeCompare(currentName, "es", { sensitivity: "base" }) < 0;
}

function compareProducts(left, right, selectedProducts) {
  const leftName = left.canonicalName || left.name;
  const rightName = right.canonicalName || right.name;
  const leftOrder = getSelectedProductOrder(left, selectedProducts);
  const rightOrder = getSelectedProductOrder(right, selectedProducts);

  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }

  const nameCompare = String(leftName || "").localeCompare(String(rightName || ""), "es", {
    sensitivity: "base",
  });

  if (nameCompare !== 0) {
    return nameCompare;
  }

  return (Number(left.price) || 0) - (Number(right.price) || 0);
}

function toggleDist(dist) {
  if (!dist) {
    return;
  }

  if (state.activeDists.has(dist)) {
    if (state.activeDists.size === 1) {
      return;
    }

    state.activeDists.delete(dist);
  } else {
    state.activeDists.add(dist);
  }

  syncFilterChips();
  syncMobileTabs();

  if (state.hasSearched) {
    renderCurrentResults();
  }
}

function setActiveMobileDist(dist) {
  if (!state.activeDists.has(dist)) {
    return;
  }

  state.activeMobileDist = dist;
  updateMobileTabState();

  if (state.hasSearched) {
    applyMobileVisibility(elements.resultsArea, state.activeMobileDist);
  }
}

function syncFilterChips() {
  elements.filterChips.forEach((chip) => {
    chip.classList.toggle("active", state.activeDists.has(chip.dataset.dist));
  });
}

function syncMobileTabs() {
  elements.mobileTabs.forEach((tab) => {
    tab.hidden = !state.activeDists.has(tab.dataset.dist);
  });

  if (!state.activeDists.has(state.activeMobileDist)) {
    state.activeMobileDist = DIST_ORDER.find((dist) => state.activeDists.has(dist)) || DIST_ORDER[0];
  }

  updateMobileTabState();
}

function updateMobileTabState() {
  elements.mobileTabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.dist === state.activeMobileDist);
  });
}

function renderCurrentResults() {
  renderTables({
    resultsArea: elements.resultsArea,
    currentResults: state.currentResults,
    activeDists: state.activeDists,
    activeMobileDist: state.activeMobileDist,
    profitPct: Math.max(0, Number(elements.profitPct.value) || 0),
    qty: Math.max(1, parseInt(elements.qtyInput.value, 10) || 1),
    selectionCount: state.selectedProducts.length,
  });
}

function createSelectedProductSelection(name) {
  if (!name) {
    return null;
  }

  const filters = getActiveSecondaryFilters();
  const metaParts = [];

  if (filters.type) {
    metaParts.push(getOptionLabel(filters.type, TYPE_OPTION_DEFS));
  }

  if (filters.segment) {
    metaParts.push(getOptionLabel(filters.segment, SEGMENT_OPTION_DEFS));
  }

  if (filters.period) {
    metaParts.push(getOptionLabel(filters.period, PERIOD_OPTION_DEFS));
  }

  const metaLabel = metaParts.join(" · ");

  return {
    id: getSelectedProductId(name, filters),
    name,
    type: filters.type,
    segment: filters.segment,
    period: filters.period,
    metaLabel,
    displayLabel: metaLabel ? `${name} · ${metaLabel}` : name,
  };
}

function getSelectedProductId(name, filters) {
  return [name, filters.type || "", filters.segment || "", filters.period || ""].join("__");
}

function resetCurrentInputFilters() {
  elements.typeFilter.value = "";
  elements.segFilter.value = "";
  elements.termFilter.value = "";
  state.autoSelectedFilters.type = false;
  state.autoSelectedFilters.segment = false;
  state.autoSelectedFilters.period = false;
}

function matchesSelectedProductProfile(product, selection) {
  if ((product.canonicalName || product.name) !== selection.name) {
    return false;
  }

  return matchesSecondaryFilters(product, selection);
}

function getSelectedProductOrder(product, selectedProducts) {
  const index = selectedProducts.findIndex((selection) => matchesSelectedProductProfile(product, selection));
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function getStrictPeriodKey(product) {
  if (product?.strictPeriodKey) {
    return product.strictPeriodKey;
  }

  const term = product?.normalizedTerm || canonicalizeTerm(product);
  const billing = product?.normalizedBilling || canonicalizeBilling(product);
  const combo = `${term}|${billing}`;

  switch (combo) {
    case "mensual|mensual":
      return "mensual_mensual";
    case "anual|anual":
      return "anual_anual";
    case "anual|mensual":
      return "anual_mensual";
    case "trianual|anual":
      return "trianual_anual";
    case "trianual|trianual":
      return "trianual_trianual";
    case "trianual|mensual":
      return "trianual_mensual";
    case "onetime|onetime":
      return "onetime_onetime";
    default:
      return "";
  }
}

function canonicalizeTerm(product) {
  const term = normalizeText(product?.term);
  const partNumber = normalizeText(product?.partNumber);
  const name = normalizeText(product?.name)
    .replace(/\u00a0/g, " ")
    .replace(/â€“|–/g, "-");

  if (hasAnySuffix(partNumber, ["p3yt", "p3ya", "p3ym", ":p3y"])) {
    return "trianual";
  }

  if (hasAnySuffix(partNumber, ["p1ya", "p1ym", ":p1y"])) {
    return "anual";
  }

  if (hasAnySuffix(partNumber, ["p1mm", ":p1m"])) {
    return "mensual";
  }

  if (term.includes("p3y") || term.includes("trianual") || term.includes("trien") || /3\s*year/.test(name)) {
    return "trianual";
  }

  if (term.includes("p1y") || term.includes("anual") || /1\s*year/.test(name)) {
    return "anual";
  }

  if (term.includes("p1m") || term.includes("mensual") || term.includes("month")) {
    return "mensual";
  }

  if (term.includes("onetime") || term.includes("one time")) {
    return "onetime";
  }

  return "";
}

function canonicalizeBilling(product) {
  const billing = normalizeText(product?.billing);
  const partNumber = normalizeText(product?.partNumber);
  const name = normalizeText(product?.name)
    .replace(/\u00a0/g, " ")
    .replace(/â€“|–/g, "-");

  if (hasAnySuffix(partNumber, ["p3yt"])) {
    return "trianual";
  }

  if (hasAnySuffix(partNumber, ["p3ya", "p1ya"])) {
    return "anual";
  }

  if (hasAnySuffix(partNumber, ["p3ym", "p1ym", "p1mm", ":p1m"])) {
    return "mensual";
  }

  if (/\b(?:nce|csp)\s+(?:com|edu|nfp)\s+tri\b|\((?:nce|csp)\s+(?:com|edu|nfp)\s+tri\)/i.test(name)) {
    return "trianual";
  }

  if (/\b(?:nce|csp)\s+(?:com|edu|nfp)\s+ann\b|\((?:nce|csp)\s+(?:com|edu|nfp)\s+ann\)/i.test(name)) {
    return "anual";
  }

  if (/\b(?:nce|csp)\s+(?:com|edu|nfp)\s+mth\b|\((?:nce|csp)\s+(?:com|edu|nfp)\s+mth\)/i.test(name)) {
    return "mensual";
  }

  if (billing.includes("trien") || billing.includes("trianual")) {
    return "trianual";
  }

  if (billing.includes("annual") || billing.includes("anual")) {
    return "anual";
  }

  if (billing.includes("monthly") || billing.includes("mensual")) {
    return "mensual";
  }

  if (billing.includes("onetime") || billing.includes("one time")) {
    return "onetime";
  }

  return "";
}

function createEmptyResults() {
  return DIST_ORDER.reduce((accumulator, dist) => {
    accumulator[dist] = [];
    return accumulator;
  }, {});
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function enrichProduct(product) {
  const canonicalName = String(product.canonicalName || getCanonicalProductName(product.name || "")).trim();
  const normalizedTerm = String(product.normalizedTerm || canonicalizeTerm(product)).trim();
  const normalizedBilling = String(product.normalizedBilling || canonicalizeBilling(product)).trim();
  const strictPeriodKey = String(
    product.strictPeriodKey ||
      getStrictPeriodKey({
        ...product,
        normalizedTerm,
        normalizedBilling,
      }),
  ).trim();
  const comparisonKey = [
    canonicalName,
    strictPeriodKey || "sin_periodo",
    product.type || "",
    normalizeText(product.segment),
  ].join("__");
  return {
    ...product,
    canonicalName,
    normalizedTerm,
    normalizedBilling,
    strictPeriodKey,
    comparisonKey,
    searchText: normalizeText(`${canonicalName} ${product.name || ""}`),
  };
}

function getCanonicalProductName(value) {
  let normalized = String(value || "")
    .replace(/\u00A0/g, " ")
    .replace(/â€“|–/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  normalized = normalized.replace(/\s+\((?:NCE|CSP)[^)]+\)$/i, "");
  normalized = normalized.replace(/\s+NCE\s+[A-Z]{3}\s+(?:ANN|MTH|TRI)$/i, "");
  normalized = normalized.replace(/\s*-\s*(?:1|3)\s*year(?:\s+subscription)?$/i, "");
  normalized = normalized.replace(/\s+(?:1|3)\s*year(?:\s+subscription)?$/i, "");
  normalized = normalized.replace(/\s*-\s*$/, "");

  return normalized.replace(/\s+/g, " ").trim();
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

function hasAnySuffix(value, suffixes) {
  return suffixes.some((suffix) => value.endsWith(suffix));
}

function getOrderedFilterValues(products, key, optionDefs) {
  const rawValues = products
    .map((product) => {
      if (key === "segment") {
        return String(product.segment || "").trim();
      }

      return String(product[key] || "").trim();
    })
    .filter(Boolean);
  const uniqueValues = Array.from(new Set(rawValues));
  const orderedValues = optionDefs
    .map((option) => option.value)
    .filter((value) => uniqueValues.includes(value));
  const dynamicValues = uniqueValues
    .filter((value) => !orderedValues.includes(value))
    .sort((left, right) => left.localeCompare(right, "es", { sensitivity: "base" }));

  return orderedValues.concat(dynamicValues).map((value) => ({
    value,
    label: getOptionLabel(value, optionDefs),
  }));
}

function getOptionLabel(value, optionDefs) {
  const normalizedValue = normalizeText(value);
  const optionDef = optionDefs.find((option) => normalizeText(option.value) === normalizedValue);
  return optionDef?.label || value;
}

function setDynamicSelectOptions(filterKey, select, options, { allLabel, autoSelectSingle = false }) {
  if (!select) {
    return;
  }

  const previousValue = select.value;
  const previousWasAuto = state.autoSelectedFilters[filterKey];
  select.innerHTML = [`<option value="">${escapeHtml(allLabel)}</option>`]
    .concat(
      options.map(
        (option) =>
          `<option value="${escapeAttribute(option.value)}">${escapeHtml(option.label)}</option>`,
      ),
    )
    .join("");

  select.disabled = options.length === 0;
  const availableValues = options.map((option) => option.value);
  const hasSingleAutoOption = autoSelectSingle && availableValues.length === 1;
  const nextAutoValue = hasSingleAutoOption ? availableValues[0] : "";

  if (availableValues.includes(previousValue)) {
    if (previousWasAuto && previousValue !== nextAutoValue) {
      select.value = "";
      state.autoSelectedFilters[filterKey] = false;
      return;
    }

    select.value = previousValue;
    return;
  }

  if (hasSingleAutoOption) {
    select.value = nextAutoValue;
    state.autoSelectedFilters[filterKey] = true;
    return;
  }

  select.value = "";
  state.autoSelectedFilters[filterKey] = false;
}
