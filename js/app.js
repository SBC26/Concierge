import { t, tf, LANGS } from "./i18n.js";
import {
  getState, subscribe, isReady, initStore, getRoom, applyRoomFromUrl, getLang, setLang,
  getBasket, removeFromBasket, getIdleMode,
} from "./store.js";
import { icon } from "./icons.js";
import { setupActive, renderRoomSetup, initRoomSetup } from "./roomSetup.js";
import { idlePostcardHTML, mountFallblattBoard, updateFallblattBoard, unmountFallblattBoard, isFallblattBoardMounted } from "./views/idle.js";
import { startView } from "./views/start.js";
import {
  serviceDetailView, openService, openServiceForEdit, optSet, optToggle, optStep,
  confirmAddToBasket, serviceDetailAfterMount,
} from "./views/serviceDetail.js";
import { basketView, doSubmitBasket } from "./views/basket.js";
import { confirmationView, setConfirmation } from "./views/confirmation.js";
import { myRequestsView, clearRequestHighlights } from "./views/myRequests.js";
import { patchRequestsButton } from "./views/shared.js";
import { bookingDetailsView } from "./views/bookingDetails.js";
import { houseRulesView } from "./views/houseRules.js";
import { surroundingsView, setSurroundingsFilter } from "./views/surroundings.js";

const app = document.getElementById("app");

const IDLE_TIMEOUT_MS = 30 * 1000;

let route = "home";
let lang = getLang();
let room = getRoom();
let afterMount = null;
// The tablet's resting state — shown on load, and restored after 30 seconds
// without interaction. Content is either the latest postcard or the
// Fallblattanzeige split-flap board, per this room's idle_mode (see js/views/idle.js).
let showIdle = true;
let idleTimer = null;

function navigate(r, mount = null) {
  if (route === "myRequests" && r !== "myRequests") clearRequestHighlights();
  route = r;
  afterMount = mount;
  render();
  window.scrollTo(0, 0);
}

function resetIdleTimer() {
  clearTimeout(idleTimer);
  if (!showIdle) idleTimer = setTimeout(enterIdle, IDLE_TIMEOUT_MS);
}

function enterIdle() {
  clearTimeout(idleTimer);
  showIdle = true;
  clearRequestHighlights();
  route = "home";
  render();
}

function exitIdle() {
  if (!showIdle) return;
  showIdle = false;
  resetIdleTimer();
  render();
}

function toast(msg) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

// ---------- RENDER ----------
const views = {
  home: () => startView({ lang, room, basketCount: getBasket().length }),
  serviceDetail: () => serviceDetailView({ lang, room }),
  basket: () => basketView({ lang, room }),
  confirmation: () => confirmationView({ lang }),
  myRequests: () => myRequestsView({ lang, room }),
  bookingDetails: () => bookingDetailsView({ lang, room }),
  houseRules: () => houseRulesView({ lang }),
  surroundings: () => surroundingsView({ lang }),
};

function loadingScreen() {
  return `<div style="display:flex;align-items:center;justify-content:center;min-height:100vh;color:var(--sbc-copper);font-size:14px;">Lädt …</div>`;
}

function render() {
  document.documentElement.lang = lang;
  if (!isReady()) {
    app.innerHTML = loadingScreen();
    return;
  }
  if (setupActive()) {
    app.innerHTML = renderRoomSetup();
    return;
  }

  if (showIdle && getIdleMode(room) === "fallblatt") {
    if (!isFallblattBoardMounted(room)) mountFallblattBoard(app, { room, lang });
    else updateFallblattBoard({ room });
    patchRequestsButton(lang); // the board itself isn't re-rendered, so refresh the header button live
    return;
  }
  // Not (or no longer) the fallblatt idle screen — make sure any previously
  // mounted board's timers are stopped before this function does its usual
  // full innerHTML replace below (mounting again later starts fresh).
  unmountFallblattBoard();

  if (showIdle) {
    app.innerHTML = idlePostcardHTML({ lang, room });
    return;
  }

  app.innerHTML = views[route]();
  if (afterMount) {
    const mount = afterMount;
    afterMount = null; // run once, right after mount — later re-renders (e.g. from opt-set) must not re-stomp DOM-held field values
    mount();
  }
}

// ---------- EVENTS ----------
document.addEventListener("click", async (e) => {
  const target = e.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;

  switch (action) {
    case "idle-enter":
      return exitIdle();
    case "nav":
      return navigate(target.dataset.route);
    case "open-requests":
      // Also reachable from the idle screens — leave idle first, otherwise
      // render() would keep showing the postcard/board instead of the route.
      showIdle = false;
      resetIdleTimer();
      return navigate("myRequests");
    case "go-home":
      // The brand logo also sits inside the idle screens (renderBrandHeader) —
      // tapping it there must exit idle like any other tap, not just set a
      // route that render() won't reach while showIdle is still true.
      if (showIdle) return exitIdle();
      return navigate("home");
    case "set-lang":
      lang = target.dataset.lang;
      setLang(lang);
      return render();

    // service detail
    case "nav-service":
      openService(target.dataset.id, route);
      return navigate("serviceDetail");
    case "opt-set":
      optSet(target.dataset.key, target.dataset.value);
      return render();
    case "opt-toggle":
      optToggle(target.dataset.key, target.dataset.value);
      return render();
    case "opt-step":
      optStep(target.dataset.key, target.dataset.dir);
      return render();
    case "add-to-basket": {
      const to = confirmAddToBasket(lang);
      // null means required fields are missing — confirmAddToBasket() has
      // already recorded which ones, stay put and re-render to show it.
      if (!to) return render();
      return navigate(to);
    }

    // basket
    case "basket-edit":
      openServiceForEdit(target.dataset.key);
      return navigate("serviceDetail", serviceDetailAfterMount);
    case "basket-remove":
      removeFromBasket(target.dataset.key);
      return render();
    case "submit-basket": {
      const result = await doSubmitBasket({ room });
      if (result) {
        setConfirmation(result.request, result.lines);
        navigate("confirmation");
      }
      return;
    }

    // surroundings
    case "filter-tips":
      setSurroundingsFilter(target.dataset.tag);
      return render();

    // generic helpers
    case "open-maps":
      window.open(`https://maps.google.com/?q=${encodeURIComponent(target.dataset.address || "")}`, "_blank", "noopener");
      return;
    case "copy-text":
      try {
        await navigator.clipboard.writeText(target.dataset.text || "");
        toast(t("copiedToast", lang));
      } catch {
        /* clipboard unavailable — nothing to fall back to */
      }
      return;
    case "coming-soon":
      toast(t("comingSoonToast", lang));
      return;
  }
});

// Any interaction while the interactive app is showing pushes the idle
// timeout back out; capture phase so it fires even for elements with their
// own stopPropagation(). No-ops while already idle (resetIdleTimer() only
// arms the timer when !showIdle) — nothing to time out from there.
["click", "touchstart", "keydown"].forEach((evt) => document.addEventListener(evt, resetIdleTimer, true));

subscribe(() => render());
render();
initStore().then(() => {
  if (applyRoomFromUrl()) room = getRoom();
  render();
});
initRoomSetup(render);
