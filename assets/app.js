/* ============================================================
   SkyBharat — mock flight-booking site
   Vanilla JS, no dependencies, no build step, no network calls.
   Each page sets <body data-page="search|auth|checkout"> and this
   file dispatches to the right init function on load.
   ============================================================ */

const CITIES = [
  { code: "DEL", name: "Delhi" },
  { code: "BOM", name: "Mumbai" },
  { code: "BLR", name: "Bengaluru" },
  { code: "MAA", name: "Chennai" },
  { code: "CCU", name: "Kolkata" },
  { code: "HYD", name: "Hyderabad" },
  { code: "GOI", name: "Goa" },
  { code: "PNQ", name: "Pune" },
  { code: "JAI", name: "Jaipur" },
  { code: "AMD", name: "Ahmedabad" },
  { code: "COK", name: "Kochi" },
  { code: "IXC", name: "Chandigarh" },
];

const AIRLINES = ["IndiJet", "SkyBharat Air", "BlueSky Airways", "Zenith Air"];

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/* ---------- Autocomplete combobox, used for From/To city fields ---------- */

function setupCombo(inputId, listId) {
  const input = document.getElementById(inputId);
  const list = document.getElementById(listId);
  if (!input || !list) return;

  function renderOptions(items) {
    list.innerHTML = "";
    if (items.length === 0) {
      list.hidden = true;
      return;
    }
    items.forEach((city) => {
      const li = document.createElement("li");
      li.className = "combo-option";
      li.setAttribute("role", "option");
      li.dataset.code = city.code;
      li.innerHTML = `<span>${city.name}</span><span class="code">${city.code}</span>`;
      li.addEventListener("click", () => {
        input.value = `${city.name} (${city.code})`;
        input.dataset.code = city.code;
        list.hidden = true;
      });
      list.appendChild(li);
    });
    list.hidden = false;
  }

  // Suggestions appear as the person types — this dropdown, and the
  // results list below, are the "content that updates after the page
  // has already loaded" moments the change-aware sampling pass should
  // pick up as a diff, not a full re-scan.
  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    delete input.dataset.code;
    if (!q) {
      list.hidden = true;
      return;
    }
    const matches = CITIES.filter(
      (c) => c.name.toLowerCase().startsWith(q) || c.code.toLowerCase().startsWith(q)
    ).slice(0, 6);
    renderOptions(matches);
  });

  input.addEventListener("focus", () => {
    if (input.value.trim() && !input.dataset.code) {
      input.dispatchEvent(new Event("input"));
    }
  });

  document.addEventListener("click", (e) => {
    if (e.target !== input && !list.contains(e.target)) list.hidden = true;
  });
}

/* ---------- Search page ---------- */

function randomFlight(fromCode, toCode) {
  const airline = AIRLINES[Math.floor(Math.random() * AIRLINES.length)];
  const depHour = 5 + Math.floor(Math.random() * 16);
  const depMin = Math.random() < 0.5 ? "00" : "30";
  const durationMin = 90 + Math.floor(Math.random() * 120);

  const arr = new Date(2000, 0, 1, depHour, Number(depMin));
  arr.setMinutes(arr.getMinutes() + durationMin);

  const price = 3200 + Math.floor(Math.random() * 6500);
  const flightNo = airline.slice(0, 2).toUpperCase() + (100 + Math.floor(Math.random() * 800));

  return {
    airline,
    flightNo,
    fromCode,
    toCode,
    dep: `${String(depHour).padStart(2, "0")}:${depMin}`,
    arr: `${String(arr.getHours()).padStart(2, "0")}:${String(arr.getMinutes()).padStart(2, "0")}`,
    duration: `${Math.floor(durationMin / 60)}h ${durationMin % 60}m`,
    price,
  };
}

function initSearchPage() {
  setupCombo("fromCity", "fromList");
  setupCombo("toCity", "toList");

  const form = document.getElementById("searchForm");
  const resultsSection = document.getElementById("resultsSection");
  const resultsList = document.getElementById("resultsList");
  const resultsMeta = document.getElementById("resultsMeta");
  if (!form) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const fromInput = document.getElementById("fromCity");
    const toInput = document.getElementById("toCity");
    const dateInput = document.getElementById("departDate");

    const fromCode = fromInput.dataset.code || "DEL";
    const toCode = toInput.dataset.code || "BOM";
    const fromLabel = fromInput.value || "Delhi (DEL)";
    const toLabel = toInput.value || "Mumbai (BOM)";
    const date = dateInput.value;

    resultsSection.hidden = false;
    resultsMeta.textContent = "Searching flights…";
    resultsList.innerHTML = "";
    resultsList.setAttribute("aria-busy", "true");

    for (let i = 0; i < 3; i++) {
      const sk = document.createElement("div");
      sk.className = "skeleton";
      resultsList.appendChild(sk);
    }

    // Simulated network round-trip before results land in the DOM.
    setTimeout(() => {
      resultsList.innerHTML = "";
      resultsList.removeAttribute("aria-busy");

      const flights = [
        randomFlight(fromCode, toCode),
        randomFlight(fromCode, toCode),
        randomFlight(fromCode, toCode),
      ].sort((a, b) => a.price - b.price);

      resultsMeta.textContent =
        `${flights.length} flights · ${fromLabel.split(" (")[0]} → ${toLabel.split(" (")[0]}` +
        (date ? ` · ${formatDate(date)}` : "");

      flights.forEach((f) => {
        const card = document.createElement("div");
        card.className = "card flight-card";
        card.innerHTML = `
          <div class="flight-airline">${f.airline}<div class="hint" style="margin-top:2px;">${f.flightNo}</div></div>
          <div class="flight-times">
            <span class="time">${f.dep}</span>
            <span class="route">${f.fromCode}<div class="line"></div>${f.duration}</span>
            <span class="time">${f.arr}</span>
          </div>
          <div class="flight-price">₹${f.price.toLocaleString("en-IN")}</div>
          <button class="btn btn-primary select-btn" type="button">Select</button>
        `;
        card.querySelector(".select-btn").addEventListener("click", () => {
          const params = new URLSearchParams({
            airline: f.airline,
            flightNo: f.flightNo,
            from: fromLabel,
            to: toLabel,
            dep: f.dep,
            arr: f.arr,
            date: date || "",
            price: String(f.price),
          });
          window.location.href = `checkout.html?${params.toString()}`;
        });
        resultsList.appendChild(card);
      });
    }, 700);
  });
}

/* ---------- Auth page (login / sign up / OTP) ---------- */

function initAuthPage() {
  const tabs = document.querySelectorAll(".auth-tab");
  const panels = document.querySelectorAll(".auth-panel");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.setAttribute("aria-selected", "false"));
      panels.forEach((p) => (p.hidden = true));
      tab.setAttribute("aria-selected", "true");
      document.getElementById(tab.dataset.panel).hidden = false;
    });
  });

  const loginForm = document.getElementById("loginForm");
  if (loginForm) {
    loginForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const status = document.getElementById("loginStatus");
      status.className = "status-banner success show";
      status.textContent = "Logged in — redirecting…";
    });
  }

  const signupForm = document.getElementById("signupForm");
  const otpStep = document.getElementById("otpStep");
  if (signupForm) {
    signupForm.addEventListener("submit", (e) => {
      e.preventDefault();
      // Swapping the form for the OTP step is itself a DOM mutation
      // that happens well after initial load/render.
      signupForm.hidden = true;
      otpStep.hidden = false;
      document.getElementById("otpCode").focus();
    });
  }

  const verifyBtn = document.getElementById("verifyOtpBtn");
  if (verifyBtn) {
    verifyBtn.addEventListener("click", () => {
      const status = document.getElementById("otpStatus");
      status.className = "status-banner success show";
      status.textContent = "Account created — you're verified.";
    });
  }
}

/* ---------- Checkout page ---------- */

function initCheckoutPage() {
  const params = new URLSearchParams(window.location.search);
  const summaryEl = document.getElementById("tripSummary");

  const from = params.get("from") || "Delhi (DEL)";
  const to = params.get("to") || "Mumbai (BOM)";
  const airline = params.get("airline") || "IndiJet";
  const flightNo = params.get("flightNo") || "ID482";
  const dep = params.get("dep") || "09:15";
  const arr = params.get("arr") || "11:20";
  const date = params.get("date") || "";
  const price = Number(params.get("price")) || 4599;
  const taxes = Math.round(price * 0.12);

  if (summaryEl) {
    summaryEl.innerHTML = `
      <div class="trip-summary-row"><span class="muted">Route</span><span>${from.split(" (")[0]} → ${to.split(" (")[0]}</span></div>
      <div class="trip-summary-row"><span class="muted">Flight</span><span>${airline} · ${flightNo}</span></div>
      <div class="trip-summary-row"><span class="muted">Departure</span><span>${dep}${date ? " · " + formatDate(date) : ""}</span></div>
      <div class="trip-summary-row"><span class="muted">Arrival</span><span>${arr}</span></div>
    `;
  }

  const priceBase = document.getElementById("priceBase");
  const priceTaxes = document.getElementById("priceTaxes");
  const priceTotal = document.getElementById("priceTotal");
  if (priceBase) priceBase.textContent = `₹${price.toLocaleString("en-IN")}`;
  if (priceTaxes) priceTaxes.textContent = `₹${taxes.toLocaleString("en-IN")}`;
  if (priceTotal) priceTotal.textContent = `₹${(price + taxes).toLocaleString("en-IN")}`;

  // Pay and Remove-card are ordinary, honestly-labelled buttons — this
  // page does not implement any confirmation step of its own. Deciding
  // whether to block or confirm a click on either of these belongs to
  // the extension's own Action Safety Firewall (P6), not to the page.
  const payBtn = document.getElementById("payBtn");
  const payStatus = document.getElementById("payStatus");
  if (payBtn) {
    payBtn.addEventListener("click", () => {
      payBtn.disabled = true;
      payStatus.className = "status-banner processing show";
      payStatus.textContent = "Processing payment…";
      setTimeout(() => {
        payStatus.className = "status-banner success show";
        payStatus.textContent = "Payment successful — booking confirmed.";
      }, 1100);
    });
  }

  const removeCardBtn = document.getElementById("removeCardBtn");
  const savedCardRow = document.getElementById("savedCardRow");
  if (removeCardBtn) {
    removeCardBtn.addEventListener("click", () => {
      savedCardRow.querySelector(".card-dots").textContent = "Card removed";
      removeCardBtn.disabled = true;
      removeCardBtn.textContent = "Removed";
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const page = document.body.dataset.page;
  if (page === "search") initSearchPage();
  if (page === "auth") initAuthPage();
  if (page === "checkout") initCheckoutPage();
});
