import { t, tf, LANGS } from "./i18n.js";
import {
  getState, subscribe, isReady, initStore, getRoom, applyRoomFromUrl, getLang, setLang,
  getBasket, removeFromBasket, postcardsForRoom, getDismissedPostcards, dismissPostcard,
} from "./store.js";
import { escapeHtml, FONT_MAP } from "./util.js";
import { icon } from "./icons.js";
import { vaseLogo, wordmarkLogo } from "./logo.js";
import { setupActive, renderRoomSetup, initRoomSetup } from "./roomSetup.js";
import { renderBrandHeader } from "./views/shared.js";
import { startView } from "./views/start.js";
import {
  serviceDetailView, openService, openServiceForEdit, optSet, optToggle, optStep,
  confirmAddToBasket, serviceDetailAfterMount,
} from "./views/serviceDetail.js";
import { basketView, doSubmitBasket } from "./views/basket.js";
import { confirmationView, setConfirmation } from "./views/confirmation.js";
import { myRequestsView } from "./views/myRequests.js";
import { bookingDetailsView } from "./views/bookingDetails.js";
import { houseRulesView } from "./views/houseRules.js";
import { surroundingsView, setSurroundingsFilter } from "./views/surroundings.js";

const app = document.getElementById("app");

let route = "home";
let lang = getLang();
let room = getRoom();
let afterMount = null;

function navigate(r, mount = null) {
  route = r;
  afterMount = mount;
  render();
  window.scrollTo(0, 0);
}

function toast(msg) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

// ---------- INCOMING POSTCARD (sent by staff, shown automatically) ----------
function getPendingPostcard() {
  const dismissed = getDismissedPostcards();
  const candidates = postcardsForRoom(room)
    .filter((p) => !dismissed.has(p.id))
    .sort((a, b) => b.createdAt - a.createdAt);
  return candidates[0] || null;
}

function viewIncomingPostcard(pending) {
  const dateStr = new Date(pending.createdAt).toLocaleDateString(lang === "de" ? "de-CH" : lang === "th" ? "th-TH" : "en-GB", {
    day: "2-digit", month: "long", year: "numeric",
  });
  const [kicker, ...rest] = t("hotelName", lang).split(" ");
  const fontFamily = FONT_MAP[pending.font] || FONT_MAP.elegant;
  const fsWord =
    lang === "th"
      ? `<div class="postcard-fs-word"><span class="brand-kicker">${escapeHtml(kicker)}</span> <span lang="${lang}">${escapeHtml(rest.join(" "))}</span></div>`
      : `<div class="postcard-fs-word">${wordmarkLogo({ height: 34 })}</div>`;
  return `
    ${renderBrandHeader(lang)}
    <main class="postcard-takeover">
      <div class="postcard-panel">
        <div class="postcard-panel-border">
          <div class="postcard-fs-logo">
            <div class="postcard-fs-icon">${vaseLogo({ size: 44 })}</div>
            ${fsWord}
            <div class="postcard-fs-tagline">${escapeHtml(t("brandLabel", lang))}</div>
          </div>
          <div class="postcard-fs-message" style="font-family:${fontFamily};" lang="${lang}">${escapeHtml(pending.text)}</div>
          <div class="postcard-fs-footer">${escapeHtml(t("postcardFrom", lang))} ${escapeHtml(t("hotelName", lang))} · ${escapeHtml(t("room", lang))} ${escapeHtml(room)} · ${dateStr}</div>
        </div>
      </div>
      <button class="btn-primary" data-action="dismiss-postcard" data-id="${pending.id}" style="max-width:280px;align-self:center;">${t("postcardThanks", lang)}</button>
    </main>`;
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
  const pending = getPendingPostcard();
  app.innerHTML = pending ? viewIncomingPostcard(pending) : views[route]();
  if (!pending && afterMount) {
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
    case "nav":
      return navigate(target.dataset.route);
    case "go-home":
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

    case "dismiss-postcard":
      dismissPostcard(target.dataset.id);
      return render();
  }
});

subscribe(() => render());
render();
initStore().then(() => {
  if (applyRoomFromUrl()) room = getRoom();
  render();
});
initRoomSetup(render);
