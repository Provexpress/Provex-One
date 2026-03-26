const TRM_ENDPOINT = "https://www.datos.gov.co/resource/32sa-8pi3.json";

export async function fetchTRM({ statusEl, inputEl, onUpdated }) {
  setStatus(statusEl, "cargando...", "is-muted");

  try {
    const now = new Date(Date.now() - 5 * 60 * 60 * 1000);
    const today = now.toISOString().slice(0, 10);
    const params = new URLSearchParams({
      $select: "valor,vigenciadesde",
      $where: `vigenciadesde <= '${today}' and vigenciahasta >= '${today}'`,
    });

    const response = await fetch(`${TRM_ENDPOINT}?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`TRM request failed with status ${response.status}`);
    }

    const data = await response.json();
    const record = data?.[0];
    const trm = Number(record?.valor);
    if (!Number.isFinite(trm) || trm <= 100) {
      throw new Error("TRM value missing");
    }

    inputEl.value = formatInputNumber(trm);
    setStatus(statusEl, `oficial ${String(record.vigenciadesde || "").slice(0, 10)}`, "is-success");

    if (typeof onUpdated === "function") {
      onUpdated();
    }
  } catch (error) {
    inputEl.value = "--";
    setStatus(statusEl, "sin dato oficial", "is-muted");
  }
}

function setStatus(statusEl, text, modifierClass) {
  statusEl.textContent = text;
  statusEl.classList.remove("is-success", "is-muted");
  statusEl.classList.add(modifierClass);
}

function formatInputNumber(value) {
  return Number(value).toFixed(2).replace(/\.?0+$/, "");
}
