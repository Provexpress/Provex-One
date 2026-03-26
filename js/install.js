const elements = {
  banner: document.getElementById("installBanner"),
  text: document.getElementById("installBannerText"),
  button: document.getElementById("installBannerButton"),
};

let deferredPrompt = null;

initializeInstallPrompt();

function initializeInstallPrompt() {
  if (!elements.banner || !elements.text || !elements.button) {
    return;
  }

  if (isStandalone()) {
    hideInstallBanner();
    return;
  }

  window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  window.addEventListener("appinstalled", handleAppInstalled);

  if (isAndroidDevice()) {
    showManualInstallHint();
  }

  elements.button.addEventListener("click", handleInstallClick);
}

function handleBeforeInstallPrompt(event) {
  event.preventDefault();
  deferredPrompt = event;
  elements.text.textContent = "Instala Provex One en tu Android para abrirla como una app.";
  elements.button.hidden = false;
  elements.button.textContent = "Instalar app";
  elements.banner.hidden = false;
}

async function handleInstallClick() {
  if (!deferredPrompt) {
    showManualInstallHint();
    return;
  }

  deferredPrompt.prompt();
  await deferredPrompt.userChoice.catch(() => null);
  deferredPrompt = null;
  showManualInstallHint();
}

function handleAppInstalled() {
  deferredPrompt = null;
  hideInstallBanner();
}

function showManualInstallHint() {
  elements.text.textContent =
    "Si no ves el aviso automatico, abre el menu del navegador y toca 'Instalar app' o 'Agregar a pantalla de inicio'.";
  elements.button.hidden = true;
  elements.banner.hidden = false;
}

function hideInstallBanner() {
  elements.banner.hidden = true;
  elements.button.hidden = true;
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function isAndroidDevice() {
  return /android/i.test(window.navigator.userAgent || "");
}
