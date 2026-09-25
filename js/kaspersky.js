import { fetchTRM } from "./trm.js";

const KASPERSKY_CATALOG_PATH = "catalogs/kaspersky_products.json";
const SUGGESTION_LIMIT = 8;
const MIN_PROFIT_PCT = 0;
const DEFAULT_PROFIT_PCT = 15;

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const copFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const plainFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const SEARCH_ALIASES = {
  ksos: "small office security",
  sos: "small office security",
  std: "standard",
  prem: "premium",
  renovacion: "renovacion",
  rnl: "renovacion",
  renewal: "renovacion",
  base: "base",
  nueva: "base",
  "1a": "1 ano",
  "1y": "1 ano",
  "2a": "2 anos",
  "2y": "2 anos",
  "3a": "3 anos",
  "3y": "3 anos",
  dvc: "dispositivo",
  device: "dispositivo",
  servidor: "fileserver",
  movil: "mobile",
};

const state = {
  products: [],
  filteredProducts: [],
  isLoading: true,
  loadError: false,
  activeFamily: "",
  activeType: "",
  activeDuration: "",
  activeNodes: "",
  searchQuery: "",
  searchSuggestions: [],
  activeSuggestionIndex: -1,
  profitPct: DEFAULT_PROFIT_PCT,
  qty: 1,
  trm: 4200,
};

const elements = {
  view: document.getElementById("kasperskyView"),
  totalCount: document.getElementById("kasperskyTotalCount"),
  familyTabs: document.getElementById("kasperskyFamilyTabs"),
  familyHelper: document.getElementById("kasperskyFamilyHelper"),
  searchComposer: document.getElementById("kasperskySearchComposer"),
  searchInput: document.getElementById("kasperskySearchInput"),
  searchClearBtn: document.getElementById("kasperskySearchClearBtn"),
  searchButton: document.getElementById("kasperskySearchButton"),
  searchResultsCount: document.getElementById("kasperskyResultsCount"),
  searchSuggestions: document.getElementById("kasperskySearchSuggestions"),
  typeFilter: document.getElementById("kasperskyTypeFilter"),
  durationFilter: document.getElementById("kasperskyDurationFilter"),
  nodesFilter: document.getElementById("kasperskyNodesFilter"),
  profitPct: document.getElementById("kasperskyProfitPct"),
  qtyInput: document.getElementById("kasperskyQtyInput"),
  trmInput: document.getElementById("kasperskyTrmInput"),
  trmStatus: document.getElementById("kasperskyTrmStatus"),
  copyQuoteBtn: document.getElementById("kasperskyCopyQuoteBtn"),
  resultsArea: document.getElementById("kasperskyResultsArea"),
};

initialize();

function initialize() {
  if (!elements.view) return;
  bindEvents();
  loadProducts();
  fetchTRM({
    statusEl: elements.trmStatus,
    inputEl: elements.trmInput,
    onUpdated: () => {
      const parsed = parseFloat(String(elements.trmInput.value).replace(/[^0-9.]/g, ""));
      if (Number.isFinite(parsed) && parsed > 0) {
        state.trm = parsed;
        renderResults();
      }
    },
  });
}

function bindEvents() {
  elements.searchButton?.addEventListener("click", () => {
    hideSuggestions();
    runSearch();
  });

  elements.searchInput?.addEventListener("input", handleSearchInput);
  elements.searchInput?.addEventListener("keydown", handleSearchKeydown);
  elements.searchInput?.addEventListener("focus", () => {
    updateSuggestions();
  });

  elements.searchClearBtn?.addEventListener("click", () => {
    elements.searchInput.value = "";
    elements.searchClearBtn.hidden = true;
    elements.searchInput.focus();
    updateSuggestions();
    runSearch();
  });

  elements.familyTabs?.addEventListener("click", handleFamilyTabClick);
  elements.typeFilter?.addEventListener("change", handleFilterChange);
  elements.durationFilter?.addEventListener("change", handleFilterChange);
  elements.nodesFilter?.addEventListener("change", handleFilterChange);

  elements.profitPct?.addEventListener("input", () => {
    state.profitPct = getProfitPct();
    renderResults();
  });

  elements.qtyInput?.addEventListener("input", () => {
    state.qty = Math.max(1, parseInt(elements.qtyInput.value, 10) || 1);
    renderResults();
  });

  elements.trmInput?.addEventListener("input", () => {
    const parsed = parseFloat(String(elements.trmInput.value).replace(/[^0-9.]/g, ""));
    if (Number.isFinite(parsed) && parsed > 0) {
      state.trm = parsed;
      renderResults();
    }
  });

  elements.searchSuggestions?.addEventListener("click", handleSuggestionClick);
  elements.resultsArea?.addEventListener("click", handleResultsAreaClick);
  elements.copyQuoteBtn?.addEventListener("click", handleCopyAllQuote);

  document.addEventListener("click", (event) => {
    if (
      elements.searchComposer?.contains(event.target) ||
      elements.searchSuggestions?.contains(event.target)
    ) {
      return;
    }
    hideSuggestions();
  });
}

async function loadProducts() {
  state.isLoading = true;
  showLoadingState();

  try {
    const response = await fetch(KASPERSKY_CATALOG_PATH);
    if (!response.ok) {
      throw new Error(`Error cargando catalogo Kaspersky: ${response.status}`);
    }
    state.products = await response.json();
    state.isLoading = false;
    state.loadError = false;

    if (elements.totalCount) {
      elements.totalCount.textContent = `${state.products.length.toLocaleString("es-CO")} productos`;
    }

    populateFilterOptions();
    updateFamilyHelper();
    runSearch();
  } catch (error) {
    console.error("Error al cargar productos Kaspersky:", error);
    state.isLoading = false;
    state.loadError = true;
    showErrorState();
  }
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function expandAliases(query) {
  return normalizeText(query)
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => SEARCH_ALIASES[word] || word)
    .join(" ");
}

function handleSearchInput() {
  const hasText = Boolean(elements.searchInput.value.trim());
  if (elements.searchClearBtn) {
    elements.searchClearBtn.hidden = !hasText;
  }
  state.activeSuggestionIndex = -1;
  updateSuggestions();
  runSearch();
}

function handleSearchKeydown(event) {
  if (event.key === "Escape") {
    hideSuggestions();
    return;
  }

  const buttons = Array.from(
    elements.searchSuggestions ? elements.searchSuggestions.querySelectorAll(".search-suggestion") : [],
  );

  if (buttons.length > 0 && !elements.searchSuggestions.hidden) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      state.activeSuggestionIndex = (state.activeSuggestionIndex + 1) % buttons.length;
      updateActiveSuggestion(buttons);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      state.activeSuggestionIndex =
        (state.activeSuggestionIndex - 1 + buttons.length) % buttons.length;
      updateActiveSuggestion(buttons);
      return;
    }

    if (event.key === "Enter" && state.activeSuggestionIndex >= 0) {
      event.preventDefault();
      const selectedBtn = buttons[state.activeSuggestionIndex];
      if (selectedBtn?.dataset.productName) {
        selectSuggestion(selectedBtn.dataset.productName);
        return;
      }
    }
  }

  if (event.key === "Enter") {
    event.preventDefault();
    hideSuggestions();
    runSearch();
  }
}

function updateActiveSuggestion(buttons) {
  buttons.forEach((btn, idx) => {
    btn.classList.toggle("active", idx === state.activeSuggestionIndex);
    if (idx === state.activeSuggestionIndex) {
      btn.scrollIntoView({ block: "nearest" });
    }
  });
}

function handleSuggestionClick(event) {
  const button = event.target.closest("[data-product-name]");
  if (button?.dataset.productName) {
    selectSuggestion(button.dataset.productName);
  }
}

function selectSuggestion(name) {
  elements.searchInput.value = name;
  if (elements.searchClearBtn) {
    elements.searchClearBtn.hidden = false;
  }
  hideSuggestions();
  runSearch();
}

function updateSuggestions() {
  const query = normalizeText(elements.searchInput.value);
  if (!query || state.isLoading || state.loadError) {
    state.searchSuggestions = [];
    state.activeSuggestionIndex = -1;
    renderSuggestions();
    return;
  }

  const words = expandAliases(query).split(/\s+/).filter(Boolean);
  const candidates = [];
  const seenParts = new Set();

  for (const product of state.products) {
    if (state.activeFamily && product.familyKey !== state.activeFamily) continue;

    const matchesAll = words.every((w) => product.searchText.includes(w));
    if (!matchesAll) continue;

    if (!seenParts.has(product.partNumber)) {
      seenParts.add(product.partNumber);
      const score = getRelevanceScore(product, query, words);
      candidates.push({ ...product, score });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  state.searchSuggestions = candidates.slice(0, SUGGESTION_LIMIT);
  state.activeSuggestionIndex = -1;
  renderSuggestions();
}

function getRelevanceScore(product, rawQuery, words) {
  let score = 0;
  const cleanName = normalizeText(product.nameShort || product.name);
  const cleanPart = normalizeText(product.partNumber);

  if (cleanName === rawQuery || cleanPart === rawQuery) {
    score += 1000;
  } else if (cleanName.startsWith(rawQuery) || cleanPart.startsWith(rawQuery)) {
    score += 600;
  } else if (cleanName.includes(rawQuery) || cleanPart.includes(rawQuery)) {
    score += 350;
  } else {
    score += 100;
  }

  return score;
}

function renderSuggestions() {
  const query = normalizeText(elements.searchInput.value);
  if (!query) {
    hideSuggestions();
    return;
  }

  if (!state.searchSuggestions.length) {
    elements.searchSuggestions.innerHTML =
      '<div class="search-suggestion-empty">Presiona Enter para buscar todas las coincidencias</div>';
    elements.searchSuggestions.hidden = false;
    return;
  }

  elements.searchSuggestions.innerHTML = state.searchSuggestions
    .map((item, index) => {
      const typeBadge =
        item.licenseTypeKey === "renewal"
          ? '<span class="tag-pill tag-renewal text-[10px] uppercase font-bold">Renovación</span>'
          : '<span class="tag-pill tag-base text-[10px] uppercase font-bold">Base</span>';

      return `
        <button type="button" class="search-suggestion ${index === state.activeSuggestionIndex ? "active" : ""}" data-product-name="${escapeAttribute(item.nameShort || item.name)}">
          <div class="flex flex-col gap-0.5 truncate pr-2">
            <span class="truncate font-medium">${highlightMatch(item.nameShort || item.name, query)}</span>
            <span class="text-[11px] text-muted">${escapeHtml(item.partNumber)} · ${escapeHtml(item.duration)}</span>
          </div>
          ${typeBadge}
        </button>
      `;
    })
    .join("");

  elements.searchSuggestions.hidden = false;
}

function hideSuggestions() {
  if (elements.searchSuggestions) {
    elements.searchSuggestions.hidden = true;
  }
}

function highlightMatch(text, query) {
  if (!query) return escapeHtml(text);
  const words = query.split(/\s+/).filter(Boolean);
  let result = escapeHtml(text);
  words.forEach((w) => {
    if (w.length >= 2) {
      const regex = new RegExp(`(${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
      result = result.replace(regex, '<span class="search-suggestion-match">$1</span>');
    }
  });
  return result;
}

function handleFamilyTabClick(event) {
  const tab = event.target.closest("[data-family]");
  if (!tab) return;

  const familyKey = tab.dataset.family || "";
  state.activeFamily = familyKey;

  const tabs = elements.familyTabs.querySelectorAll("[data-family]");
  tabs.forEach((t) => {
    const active = t.dataset.family === familyKey;
    t.classList.toggle("active", active);
    t.setAttribute("aria-selected", String(active));
  });

  updateFamilyHelper();
  populateFilterOptions();
  runSearch();
}

function handleFilterChange() {
  state.activeType = elements.typeFilter?.value || "";
  state.activeDuration = elements.durationFilter?.value || "";
  state.activeNodes = elements.nodesFilter?.value || "";
  runSearch();
}

function updateFamilyHelper() {
  if (!elements.familyHelper) return;

  const familyLabels = {
    "": "Mostrando todo el catálogo Kaspersky (209 productos)",
    ksos: "Kaspersky Small Office Security (162 licencias para PyMEs)",
    standard: "Kaspersky Standard (13 licencias esenciales)",
    plus: "Kaspersky Plus (12 licencias avanzadas con VPN)",
    premium: "Kaspersky Premium (16 licencias completas con soporte prioritario)",
    otros: "Herramientas complementarias (Password Manager, Safe Kids, etc.)",
  };

  elements.familyHelper.textContent = familyLabels[state.activeFamily] || "";
}

function populateFilterOptions() {
  // Extract available device node options based on active family
  const relevantProducts = state.activeFamily
    ? state.products.filter((p) => p.familyKey === state.activeFamily)
    : state.products;

  const nodeMap = new Map();
  relevantProducts.forEach((p) => {
    if (p.deviceCount > 0) {
      nodeMap.set(p.deviceCount, `${p.deviceCount} Dispositivos / Usuarios`);
    }
  });

  const sortedNodes = Array.from(nodeMap.entries()).sort((a, b) => a[0] - b[0]);
  if (elements.nodesFilter) {
    const currentVal = elements.nodesFilter.value;
    elements.nodesFilter.innerHTML =
      '<option value="">Todos los dispositivos</option>' +
      sortedNodes
        .map(([val, label]) => `<option value="${val}" ${currentVal === String(val) ? "selected" : ""}>${escapeHtml(label)}</option>`)
        .join("");
  }
}

function runSearch() {
  const query = elements.searchInput ? normalizeText(elements.searchInput.value) : "";
  const words = query ? expandAliases(query).split(/\s+/).filter(Boolean) : [];

  let results = state.products.filter((product) => {
    // 1. Family filter
    if (state.activeFamily && product.familyKey !== state.activeFamily) {
      return false;
    }

    // 2. Type filter (base vs renewal)
    if (state.activeType && product.licenseTypeKey !== state.activeType) {
      return false;
    }

    // 3. Duration filter
    if (state.activeDuration && String(product.durationYears) !== state.activeDuration) {
      return false;
    }

    // 4. Nodes filter
    if (state.activeNodes && String(product.deviceCount) !== state.activeNodes) {
      return false;
    }

    // 5. Search query
    if (words.length > 0) {
      const matchesAll = words.every((w) => product.searchText.includes(w));
      if (!matchesAll) return false;
    }

    return true;
  });

  // Sort by relevance if query exists, else by family and duration
  if (words.length > 0) {
    results.sort((a, b) => getRelevanceScore(b, query, words) - getRelevanceScore(a, query, words));
  } else {
    results.sort((a, b) => a.familyKey.localeCompare(b.familyKey) || a.deviceCount - b.deviceCount || a.durationYears - b.durationYears);
  }

  state.filteredProducts = results;
  renderResults();
}

function getProfitPct() {
  const value = Number(elements.profitPct?.value);
  return Number.isFinite(value) ? Math.max(MIN_PROFIT_PCT, value) : DEFAULT_PROFIT_PCT;
}

function renderResults() {
  const count = state.filteredProducts.length;

  if (elements.searchResultsCount) {
    const hasSearch = Boolean(elements.searchInput?.value.trim());
    const hasFilters = Boolean(
      elements.typeFilter?.value ||
      elements.durationFilter?.value ||
      elements.nodesFilter?.value ||
      state.activeFamily
    );
    if (hasSearch || hasFilters) {
      elements.searchResultsCount.textContent = `${count.toLocaleString("es-CO")} ${count === 1 ? "resultado" : "resultados"}`;
    } else {
      elements.searchResultsCount.textContent = "";
    }
  }

  if (count === 0) {
    showEmptyState();
    return;
  }

  const marginRatio = Math.min(0.99, state.profitPct / 100);
  const qty = state.qty;
  const trm = state.trm;

  const rowsHtml = state.filteredProducts
    .map((product) => {
      const costFob = product.cost;
      const msrp = product.msrp;
      const saleUnitUsd = costFob / (1 - marginRatio);
      const subtotalUsd = saleUnitUsd * qty;
      const saleUnitCop = saleUnitUsd * trm;
      const subtotalCop = subtotalUsd * trm;

      const typeBadge =
        product.licenseTypeKey === "renewal"
          ? '<span class="tag-pill tag-renewal">Renovación</span>'
          : '<span class="tag-pill tag-base">Base (Nueva)</span>';

      return `
        <tr class="dist-row hover:bg-slate-50/80 transition-colors">
          <td class="font-mono text-xs font-semibold text-action whitespace-nowrap" data-label="Part Number">
            ${escapeHtml(product.partNumber)}
          </td>
          <td class="td-name" data-label="Producto">
            <div class="prod-name font-semibold text-slate-900 text-[13px] leading-snug">
              ${escapeHtml(product.nameShort || product.name)}
            </div>
            <div class="text-[11px] text-muted mt-0.5 flex flex-wrap items-center gap-1.5">
              ${typeBadge}
              <span class="font-medium text-slate-700">${escapeHtml(product.family)}</span>
              ${product.nodesInfo ? `<span class="text-slate-500 font-medium">· ${escapeHtml(product.nodesInfo)}</span>` : ""}
            </div>
          </td>
          <td class="whitespace-nowrap font-medium text-slate-700" data-label="Duración">
            <span class="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px] font-semibold">
              ${escapeHtml(product.duration)}
            </span>
          </td>
          <td class="text-right text-xs text-muted font-medium whitespace-nowrap" data-label="MSRP">
            ${usdFormatter.format(msrp)}
          </td>
          <td class="text-right text-xs font-semibold text-slate-700 whitespace-nowrap" data-label="Costo FOB">
            ${usdFormatter.format(costFob)}
          </td>
          <td class="text-right whitespace-nowrap" data-label="Venta Unit.">
            <div class="font-bold text-slate-900 text-xs">${usdFormatter.format(saleUnitUsd)}</div>
            <div class="text-[11px] text-muted">${copFormatter.format(saleUnitCop)}</div>
          </td>
          <td class="text-right whitespace-nowrap bg-blue-50/40" data-label="Subtotal (${qty} uds)">
            <div class="font-bold text-action text-xs">${usdFormatter.format(subtotalUsd)}</div>
            <div class="text-[11px] text-action/80 font-medium">${copFormatter.format(subtotalCop)}</div>
          </td>
          <td class="text-center whitespace-nowrap td-action" data-label="Acción">
            <button type="button" class="dist-copy-button" data-copy-part="${escapeAttribute(product.partNumber)}" title="Copiar cotización">
              Copiar cotización
            </button>
          </td>
        </tr>
      `;
    })
    .join("");

  elements.resultsArea.innerHTML = `
    <div class="table-card overflow-hidden shadow-card rounded-card border border-sep/60 bg-white">
      <div class="overflow-x-auto">
        <table class="dist-table w-full text-left border-collapse">
          <thead>
            <tr class="bg-slate-50 border-b border-sep text-[11px] font-bold text-muted uppercase tracking-wider">
              <th class="py-3 px-3">Part Number</th>
              <th class="py-3 px-3">Producto / Edición</th>
              <th class="py-3 px-3">Duración</th>
              <th class="py-3 px-3 text-right">MSRP</th>
              <th class="py-3 px-3 text-right">Costo FOB</th>
              <th class="py-3 px-3 text-right">Venta Unitario</th>
              <th class="py-3 px-3 text-right bg-blue-50/60">Subtotal (${qty} uds)</th>
              <th class="py-3 px-3 text-center">Acción</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-sep/60 text-xs">
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function showLoadingState() {
  if (!elements.resultsArea) return;
  elements.resultsArea.innerHTML = `
    <div class="loading p-8 text-center">
      <div class="spinner mb-2"></div>
      <p class="text-sm font-medium text-slate-600">Cargando catálogo de licencias Kaspersky...</p>
    </div>
  `;
}

function showErrorState() {
  if (!elements.resultsArea) return;
  elements.resultsArea.innerHTML = `
    <div class="empty-state p-8 text-center">
      <div class="icon text-3xl mb-2">&#9888;</div>
      <h3 class="text-base font-bold text-slate-800">Error al cargar productos</h3>
      <p class="text-sm text-muted">No se pudo cargar catalogs/kaspersky_products.json.</p>
    </div>
  `;
}

function showEmptyState() {
  if (!elements.resultsArea) return;
  const quickSearches = [
    "Small Office Security 5",
    "Kaspersky Standard",
    "Kaspersky Plus",
    "Kaspersky Premium",
    "Renovación 1 Año",
    "Renovación 2 Años",
  ];

  elements.resultsArea.innerHTML = `
    <div class="empty-state p-8 text-center">
      <div class="icon text-3xl mb-2">&#128269;</div>
      <h3 class="text-base font-bold text-slate-800 mb-1">Sin coincidencias para esta búsqueda</h3>
      <p class="text-sm text-muted max-w-md mx-auto mb-4">
        Prueba ajustando los filtros de categoría, tipo o escribiendo el número de parte (SKU).
      </p>
      <button type="button" class="empty-reset-btn mb-4" id="kasperskyResetFilters">
        <span>↻</span> Restablecer filtros y ver todo
      </button>
      <div class="empty-quick-searches flex flex-wrap gap-2 justify-center">
        <span class="text-xs text-muted w-full block mb-1">Búsquedas sugeridas:</span>
        ${quickSearches
          .map((term) => `<button type="button" class="empty-quick-chip" data-quick="${escapeAttribute(term)}">${escapeHtml(term)}</button>`)
          .join("")}
      </div>
    </div>
  `;
}

function handleResultsAreaClick(event) {
  const resetBtn = event.target.closest("#kasperskyResetFilters");
  if (resetBtn) {
    resetAllFilters();
    return;
  }

  const quickChip = event.target.closest("[data-quick]");
  if (quickChip?.dataset.quick) {
    elements.searchInput.value = quickChip.dataset.quick;
    if (elements.searchClearBtn) elements.searchClearBtn.hidden = false;
    runSearch();
    return;
  }

  const copyBtn = event.target.closest("[data-copy-part]");
  if (copyBtn?.dataset.copyPart) {
    handleCopySingleProduct(copyBtn, copyBtn.dataset.copyPart);
  }
}

function resetAllFilters() {
  state.activeFamily = "";
  state.activeType = "";
  state.activeDuration = "";
  state.activeNodes = "";
  if (elements.searchInput) elements.searchInput.value = "";
  if (elements.searchClearBtn) elements.searchClearBtn.hidden = true;
  if (elements.typeFilter) elements.typeFilter.value = "";
  if (elements.durationFilter) elements.durationFilter.value = "";
  if (elements.nodesFilter) elements.nodesFilter.value = "";

  const tabs = elements.familyTabs?.querySelectorAll("[data-family]");
  tabs?.forEach((t) => {
    const active = t.dataset.family === "";
    t.classList.toggle("active", active);
    t.setAttribute("aria-selected", String(active));
  });

  updateFamilyHelper();
  populateFilterOptions();
  runSearch();
}

async function handleCopySingleProduct(button, partNumber) {
  const product = state.products.find((p) => p.partNumber === partNumber);
  if (!product) return;

  const marginRatio = Math.min(0.99, state.profitPct / 100);
  const qty = state.qty;
  const trm = state.trm;
  const costFob = product.cost;
  const saleUnitUsd = costFob / (1 - marginRatio);
  const subtotalUsd = saleUnitUsd * qty;
  const saleUnitCop = saleUnitUsd * trm;
  const subtotalCop = subtotalUsd * trm;

  const headers = [
    "Part Number",
    "Producto",
    "Tipo",
    "Duración",
    "Nodos / Dispositivos",
    "Cantidad",
    "Costo FOB (USD)",
    "Venta Unit (USD)",
    "Venta Unit (COP)",
    "Subtotal (USD)",
    "Subtotal (COP)",
    "Rentabilidad",
    "TRM",
  ];

  const row = [
    product.partNumber,
    product.name,
    product.licenseType,
    product.duration,
    product.nodesInfo,
    String(qty),
    plainFormatter.format(costFob),
    plainFormatter.format(saleUnitUsd),
    plainFormatter.format(saleUnitCop),
    plainFormatter.format(subtotalUsd),
    plainFormatter.format(subtotalCop),
    `${state.profitPct}%`,
    plainFormatter.format(trm),
  ];

  const text = [headers.join("\t"), row.join("\t")].join("\n");
  const copied = await copyToClipboard(text);
  flashButton(button, copied ? "Copiado" : "Error");
}

async function handleCopyAllQuote() {
  if (!state.filteredProducts.length) return;

  const marginRatio = Math.min(0.99, state.profitPct / 100);
  const qty = state.qty;
  const trm = state.trm;

  const headers = [
    "Part Number",
    "Producto",
    "Tipo",
    "Duración",
    "Nodos / Dispositivos",
    "Cantidad",
    "Costo FOB (USD)",
    "Venta Unit (USD)",
    "Venta Unit (COP)",
    "Subtotal (USD)",
    "Subtotal (COP)",
    "Rentabilidad",
    "TRM",
  ];

  const rows = state.filteredProducts.map((product) => {
    const costFob = product.cost;
    const saleUnitUsd = costFob / (1 - marginRatio);
    const subtotalUsd = saleUnitUsd * qty;
    const saleUnitCop = saleUnitUsd * trm;
    const subtotalCop = subtotalUsd * trm;

    return [
      product.partNumber,
      product.name,
      product.licenseType,
      product.duration,
      product.nodesInfo,
      String(qty),
      plainFormatter.format(costFob),
      plainFormatter.format(saleUnitUsd),
      plainFormatter.format(saleUnitCop),
      plainFormatter.format(subtotalUsd),
      plainFormatter.format(subtotalCop),
      `${state.profitPct}%`,
      plainFormatter.format(trm),
    ].join("\t");
  });

  const text = [headers.join("\t"), ...rows].join("\n");
  const copied = await copyToClipboard(text);
  flashButton(elements.copyQuoteBtn, copied ? "Cotización copiada" : "Error al copiar");
}

async function copyToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err) {
    // fallback below
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch (err) {
    ok = false;
  }
  document.body.removeChild(textarea);
  return ok;
}

function flashButton(btn, text) {
  if (!btn) return;
  const original = btn.textContent;
  btn.textContent = text;
  btn.disabled = true;
  setTimeout(() => {
    btn.textContent = original;
    btn.disabled = false;
  }, 1600);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
