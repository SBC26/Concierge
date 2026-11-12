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
import { invoiceView } from "./views/invoice.js";
import { bookingDetailsView } from "./views/bookingDetails.js";
import { houseRulesView } from "./views/houseRules.js";
import { surroundingsView, setSurroundingsFilter } from "./views/surroundings.js";
import { weatherView, setWeatherListener, loadWeather } from "./views/weather.js";

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
  invoice: () => invoiceView({ lang, room }),
  houseRules: () => houseRulesView({ lang }),
  surroundings: () => surroundingsView({ lang }),
  weather: () => weatherView({ lang }),
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
    case "go-start":
      // Brand logo: back to the resting screen (postcard / Fallblattanzeige). On
      // that screen itself the logo behaves like any other tap and opens the menu.
      if (showIdle) return exitIdle();
      return enterIdle();
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

    case "weather-retry":
      loadWeather(true);
      return;

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

// ---------- Night rest (Fully Kiosk Browser) ----------
// Fully's own "Schedule Wakeup and Sleep" switches the screen off once, at the
// set time. If a guest wakes the tablet by touch during the night, nothing ever
// switches it off again. So the page does it itself: at night, once nobody has
// touched the screen for a minute, it asks Fully to turn the screen off. Needs
// Fully's "Enable JavaScript Interface (PLUS)" switched on; without Fully (or
// with the interface off) `window.fully` doesn't exist and none of this runs.
// Window and idle time can be set per device in localStorage:
//   sbc_night_window = "23:00-06:30", sbc_night_idle_s = 60
const NIGHT_DEFAULT_WINDOW = "23:00-06:30";
const NIGHT_TZ = "Asia/Bangkok";
let lastActivity = Date.now();

function nightWindow() {
  let w = NIGHT_DEFAULT_WINDOW;
  try {
    w = localStorage.getItem("sbc_night_window") || w;
  } catch {
    /* storage unavailable — default window */
  }
  const m = /^(\d\d:\d\d)-(\d\d:\d\d)$/.exec(w);
  return m ? { start: m[1], end: m[2] } : { start: "23:00", end: "06:30" };
}
function isNight(now = new Date()) {
  const hm = new Intl.DateTimeFormat("en-GB", { timeZone: NIGHT_TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
  const { start, end } = nightWindow();
  return start > end ? hm >= start || hm < end : hm >= start && hm < end; // window may span midnight
}
function nightIdleMs() {
  let sec = 60;
  try {
    sec = Number(localStorage.getItem("sbc_night_idle_s")) || sec;
  } catch {
    /* default */
  }
  return sec * 1000;
}
let nightBound = false;
function nightSleepTick() {
  const f = window.fully;
  if (!f || typeof f.turnScreenOff !== "function") return;
  if (!nightBound && typeof f.bind === "function") {
    nightBound = true;
    // A guest waking the tablet starts a fresh minute of grace (the waking touch
    // itself doesn't reach the page).
    window.__sbcWake = () => { lastActivity = Date.now(); };
    try { f.bind("screenOn", "window.__sbcWake && window.__sbcWake();"); } catch { /* optional */ }
  }
  if (!isNight() || Date.now() - lastActivity < nightIdleMs()) return;
  try {
    f.turnScreenOff(false);
  } catch {
    /* Fully refused — try again on the next tick */
  }
}
["click", "touchstart", "keydown"].forEach((evt) => document.addEventListener(evt, () => { lastActivity = Date.now(); }, true));
setInterval(nightSleepTick, 15000);

// Weather loads asynchronously (page + the booking card's live line) — redraw
// when data arrives, but only while one of them is on screen (never over the
// idle screen or another page).
setWeatherListener(() => {
  if ((route === "weather" || route === "home") && !showIdle) render();
});
subscribe(() => render());
render();
initStore().then(() => {
  if (applyRoomFromUrl()) room = getRoom();
  render();
});
initRoomSetup(render);
