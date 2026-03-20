export const DIST_ORDER = ["LOL", "INTCOMEX", "INGRAM"];

const DIST_CLASS_SUFFIX = {
  LOL: "lol",
  INTCOMEX: "intcomex",
  INGRAM: "ingram",
};

const TERM_LABELS = {
  p1m: "Mensual",
  p1y: "Anual",
  p3y: "Trianual",
  onetime: "One Time",
  anual: "Anual",
  mensual: "Mensual",
  nan: "-",
  "": "-",
};

const BILLING_LABELS = {
  monthly: "Mes",
  annual: "Ano",
  triennial: "Trienal",
  onetime: "Unico",
  anual: "Ano",
  mensual: "Mes",
  nan: "-",
  "": "-",
};

const MAX_ROWS_PER_DIST = 50;
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

export function showEmptyState(resultsArea, { icon = "&#128269;", title, message }) {
  resultsArea.innerHTML = `
    <div class="empty-state">
      <div class="icon">${icon}</div>
      <h3>${escHtml(title)}</h3>
      <p>${escHtml(message)}</p>
    </div>
  `;
}

export function showLoadingState(resultsArea, message = "Buscando...") {
  resultsArea.innerHTML = `
    <div class="loading">
      <div class="spinner"></div>
      ${escHtml(message)}
    </div>
  `;
}

export function renderTables({
  resultsArea,
  currentResults,
  activeDists,
  activeMobileDist,
  profitPct,
  qty,
  currency,
  trm,
  selectionCount = 0,
}) {
  const visibleDists = DIST_ORDER.filter((dist) => activeDists.has(dist));
  const visibleTotal = getVisibleTotal(currentResults, visibleDists);

  if (visibleTotal === 0) {
    showEmptyState(resultsArea, {
      icon: "&#128533;",
      title: "Sin resultados",
      message: "Activa otro mayorista o ajusta la busqueda.",
    });
    return;
  }

  const bestByName = getBestByName(currentResults, visibleDists);
  const displayedTotal = visibleDists.reduce(
    (sum, dist) => sum + Math.min(currentResults[dist].length, MAX_ROWS_PER_DIST),
    0,
  );

  let html = buildSummaryStrip({
    currentResults,
    visibleDists,
    profitPct,
    qty,
    currency,
    trm,
    visibleTotal,
  });

  const resultsLabel =
    selectionCount > 0
      ? `Comparando ${selectionCount} producto${selectionCount === 1 ? "" : "s"} seleccionados`
      : "Mostrando resultados por mayorista";

  html += `
    <div class="results-header">
      <div class="results-count">
        ${resultsLabel} - <span>${displayedTotal.toLocaleString("es-CO")}</span> registros
      </div>
    </div>
    <div class="tables-grid">
  `;

  for (const dist of visibleDists) {
    html += buildDistributorCard({
      dist,
      products: currentResults[dist],
      bestByName,
      profitPct,
      qty,
      currency,
      trm,
    });
  }

  html += "</div>";
  resultsArea.innerHTML = html;
  applyMobileVisibility(resultsArea, activeMobileDist);
}

export function applyMobileVisibility(resultsArea, activeDist) {
  const cards = Array.from(resultsArea.querySelectorAll(".dist-card"));

  if (!cards.length) {
    return;
  }

  const resolvedDist = activeDist || cards[0].dataset.dist;
  cards.forEach((card) => {
    card.classList.toggle("mobile-visible", card.dataset.dist === resolvedDist);
  });
}

export function getPriceDisplay(price, currency, trm) {
  const safePrice = Number(price) || 0;

  if (currency === "COP") {
    return copFormatter.format(Math.round(safePrice * trm));
  }

  return usdFormatter.format(safePrice);
}

function buildSummaryStrip({ currentResults, visibleDists, profitPct, qty, currency, trm, visibleTotal }) {
  const allPrices = [];

  visibleDists.forEach((dist) => {
    currentResults[dist].forEach((product) => {
      allPrices.push(Number(product.price) || 0);
    });
  });

  if (!allPrices.length) {
    return "";
  }

  const minPrice = Math.min(...allPrices);
  const averagePrice = allPrices.reduce((sum, value) => sum + value, 0) / allPrices.length;
  const minimumSale = minPrice * (1 + profitPct / 100) * qty;

  return `
    <div class="summary-strip">
      <div class="summary-card">
        <div class="summary-label">Precio minimo</div>
        <div class="summary-val">${getPriceDisplay(minPrice, currency, trm)}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Precio promedio</div>
        <div class="summary-val">${getPriceDisplay(averagePrice, currency, trm)}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Venta minima (x${qty})</div>
        <div class="summary-val green">${getPriceDisplay(minimumSale, currency, trm)}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Resultados visibles</div>
        <div class="summary-val">${visibleTotal.toLocaleString("es-CO")}</div>
      </div>
    </div>
  `;
}

function buildDistributorCard({ dist, products, bestByName, profitPct, qty, currency, trm }) {
  const shownProducts = products.slice(0, MAX_ROWS_PER_DIST);
  const badgeClass = `dist-badge-${DIST_CLASS_SUFFIX[dist]}`;

  let html = `
    <div class="dist-card" data-dist="${dist}">
      <div class="dist-header">
        <div class="dist-name">
          <div class="dist-badge ${badgeClass}"></div>
          ${escHtml(dist)}
        </div>
        <div class="dist-count">${products.length.toLocaleString("es-CO")} productos</div>
      </div>
      <div class="dist-table-wrap">
  `;

  if (!products.length) {
    html += '<div class="dist-empty">Sin resultados para este mayorista</div>';
  } else {
    html += `
      <table>
        <thead>
          <tr>
            <th>Producto</th>
            <th>Periodo</th>
            <th class="right">P. Unit.</th>
            <th class="right">Venta x${qty}</th>
            <th class="right">Ganancia</th>
          </tr>
        </thead>
        <tbody>
    `;

    shownProducts.forEach((product) => {
      const unitPrice = Number(product.price) || 0;
      const saleUnit = unitPrice * (1 + profitPct / 100);
      const saleTotal = saleUnit * qty;
      const costTotal = unitPrice * qty;
      const profit = saleTotal - costTotal;
      const isBestPrice = unitPrice === bestByName[product.name];
      const { tagClass, label } = getTypeMeta(product.type);

      html += `
        <tr class="${isBestPrice ? "best-price" : ""}">
          <td class="td-name">
            <div class="prod-name">
              ${escHtml(String(product.name || "").substring(0, 70))}
              ${isBestPrice ? '<span class="best-badge">Mejor</span>' : ""}
            </div>
            <div class="prod-seg">
              <span class="tag-pill ${tagClass}">${label}</span>
              ${escHtml(product.segment || "")}
            </div>
          </td>
          <td><span class="term-text">${escHtml(formatTerm(product.term))} / ${escHtml(formatBilling(product.billing))}</span></td>
          <td class="td-right price-cell">${getPriceDisplay(unitPrice, currency, trm)}</td>
          <td class="td-right price-cell sale-cell">${getPriceDisplay(saleTotal, currency, trm)}</td>
          <td class="td-right profit-cell ${profit >= 0 ? "profit-positive" : "profit-negative"}">${getPriceDisplay(profit, currency, trm)}</td>
        </tr>
      `;
    });

    html += "</tbody></table>";

    if (products.length > MAX_ROWS_PER_DIST) {
      html += `
        <div class="limit-note">
          Mostrando ${MAX_ROWS_PER_DIST} de ${products.length} - refina la busqueda para ver mas
        </div>
      `;
    }
  }

  html += "</div></div>";
  return html;
}

function getVisibleTotal(currentResults, visibleDists) {
  return visibleDists.reduce((sum, dist) => sum + currentResults[dist].length, 0);
}

function getBestByName(currentResults, visibleDists) {
  const bestByName = {};

  visibleDists.forEach((dist) => {
    currentResults[dist].forEach((product) => {
      const unitPrice = Number(product.price) || 0;
      if (!bestByName[product.name] || unitPrice < bestByName[product.name]) {
        bestByName[product.name] = unitPrice;
      }
    });
  });

  return bestByName;
}

function getTypeMeta(type) {
  if (type === "NCE") {
    return { tagClass: "tag-nce", label: "NCE" };
  }

  if (type === "SUSCRIPCION") {
    return { tagClass: "tag-subs", label: "SUBS" };
  }

  return { tagClass: "tag-perp", label: "PERP" };
}

function formatTerm(term) {
  const normalized = String(term ?? "").trim();
  const key = normalized.toLowerCase();
  return TERM_LABELS[key] || normalized || "-";
}

function formatBilling(billing) {
  const normalized = String(billing ?? "").trim();
  const key = normalized.toLowerCase();
  return BILLING_LABELS[key] || normalized || "-";
}

function escHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
