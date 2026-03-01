(() => {
  "use strict";

  const STORAGE_KEY = "amsterdam26k-planner-v1";
  const SUPPORTED_TABS = ["itinerary", "map", "checklist", "options"];
  const DEFAULT_FILTERS = {
    day: "all",
    category: "all",
    indoor: "all",
    budget: "all",
    aptoLluvia: false,
    sinReserva: false,
    onlyFavorites: false,
    search: ""
  };

  const DAYS = window.DAY_ORDER || ["day1", "day2", "day3"];
  const SEGMENTS = window.SEGMENT_ORDER || ["morning", "afternoon", "night"];
  const HOTEL_ID = window.HOTEL_REFERENCE?.id || "hotel-best-western-amsterdam";
  const poiById = new Map((window.POIS || []).map((poi) => [poi.id, poi]));

  let appState = buildInitialState();
  let doneSet = new Set(appState.done || []);
  let favoriteSet = new Set(appState.favorites || []);

  let map;
  let markerLayer;
  let fixedMarkerLayer;
  let routeLine;
  let userMarker;
  let hotelMarker;
  let mapInitialized = false;
  let markersByPoiId = new Map();
  let distanceByPoi = new Map();
  let sortables = [];
  let uidCounter = 0;

  const dom = {};

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    cacheDom();
    injectTripMeta();
    renderTravelLogistics();
    populateCategoryFilter();
    bindGlobalEvents();
    renderDaySwitcher();
    renderChecklist();
    syncControlsFromState();
    applyTheme(appState.darkMode);
    renderItinerary();
    updateCounters();
    setActiveTab(appState.selectedTab || "itinerary", false);
    initServiceWorker();
  }

  function cacheDom() {
    dom.body = document.body;
    dom.appTitle = document.getElementById("app-title");
    dom.appSubtitle = document.getElementById("app-subtitle");
    dom.globalWarning = document.getElementById("global-warning");
    dom.travelStrip = document.getElementById("travel-strip");

    dom.daySwitcher = document.getElementById("day-switcher");
    dom.weatherButtons = Array.from(document.querySelectorAll("[data-weather]"));
    dom.darkModeToggle = document.getElementById("dark-mode-toggle");
    dom.darkModeToggleAlt = document.getElementById("btn-dark-mode-alt");

    dom.doneCounter = document.getElementById("done-counter");
    dom.favoriteCounter = document.getElementById("favorite-counter");

    dom.tabButtons = Array.from(document.querySelectorAll(".tab-nav [data-tab]"));
    dom.panels = {
      itinerary: document.getElementById("tab-itinerary"),
      map: document.getElementById("tab-map"),
      checklist: document.getElementById("tab-checklist"),
      options: document.getElementById("tab-options")
    };

    dom.departureTime = document.getElementById("departure-time");
    dom.itineraryDayView = document.getElementById("itinerary-day-view");
    dom.departureMini = document.getElementById("departure-mini");

    dom.btnExport = document.getElementById("btn-export");
    dom.btnExportAlt = document.getElementById("btn-export-alt");
    dom.btnPrint = document.getElementById("btn-print");
    dom.importFile = document.getElementById("import-file");
    dom.importFileAlt = document.getElementById("import-file-alt");

    dom.searchInput = document.getElementById("search-input");
    dom.filterDay = document.getElementById("filter-day");
    dom.filterCategory = document.getElementById("filter-category");
    dom.filterIndoor = document.getElementById("filter-indoor");
    dom.filterBudget = document.getElementById("filter-budget");
    dom.filterRain = document.getElementById("filter-rain");
    dom.filterNoBooking = document.getElementById("filter-no-booking");
    dom.filterFavorites = document.getElementById("filter-favorites");
    dom.btnNearMe = document.getElementById("btn-near-me");
    dom.btnClearNear = document.getElementById("btn-clear-near");
    dom.distanceHint = document.getElementById("distance-hint");
    dom.poiList = document.getElementById("poi-list");

    dom.checklistGroups = document.getElementById("checklist-groups");
    dom.btnResetProgress = document.getElementById("btn-reset-progress");

    dom.toastContainer = document.getElementById("toast-container");
    dom.swStatus = document.getElementById("sw-status");
  }

  function injectTripMeta() {
    if (window.TRIP_META) {
      dom.appTitle.textContent = window.TRIP_META.title || dom.appTitle.textContent;
      dom.appSubtitle.textContent = window.TRIP_META.subtitle || "";
      dom.globalWarning.textContent = window.TRIP_META.warning || "";
    }
  }

  function renderTravelLogistics() {
    if (!dom.travelStrip) return;

    const logistics = window.TRAVEL_LOGISTICS;
    const hotel = logistics?.hotel || window.HOTEL_REFERENCE || null;
    const flights = Array.isArray(logistics?.flights) ? logistics.flights : [];

    if (!hotel && !flights.length) {
      dom.travelStrip.hidden = true;
      return;
    }

    const flightCards = flights
      .map((flight) => {
        return `
          <article class="travel-card">
            <h3>${escapeHtml(flight.ruta || "Vuelo")}</h3>
            <p><strong>${escapeHtml(flight.numero || "")}</strong></p>
            <p>Salida: ${escapeHtml(flight.salida || "-")}</p>
            <p>Llegada: ${escapeHtml(flight.llegada || "-")}</p>
            ${flight.equipaje_apertura ? `<p>Equipaje: ${escapeHtml(flight.equipaje_apertura)} - ${escapeHtml(flight.equipaje_cierre || "")}</p>` : ""}
            ${flight.nota ? `<p>${escapeHtml(flight.nota)}</p>` : ""}
          </article>
        `;
      })
      .join("");

    dom.travelStrip.innerHTML = `
      <article class="travel-card travel-card-hotel">
        <h3>Hotel base (referencia fija en mapa)</h3>
        <p><strong>${escapeHtml(hotel?.nombre || "")}</strong></p>
        <p>${escapeHtml(hotel?.direccion || "")}</p>
        <p>Check-in ${escapeHtml(hotel?.checkin || "-")} · Check-out ${escapeHtml(hotel?.checkout || "-")}</p>
        <p>Hotel: ${escapeHtml(hotel?.telefono_hotel || "-")} · Reservas: ${escapeHtml(hotel?.telefono_reservas || "-")}</p>
      </article>
      ${flightCards}
    `;
  }

  function bindGlobalEvents() {
    dom.daySwitcher.addEventListener("click", onDayChange);

    dom.weatherButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const mode = button.dataset.weather;
        if (!mode || mode === appState.weatherMode) return;
        appState.weatherMode = mode;
        syncControlsFromState();
        renderItinerary();
        refreshMap();
        saveState();
        showToast(mode === "sun" ? "Plan A activado" : "Plan B activado");
      });
    });

    dom.darkModeToggle.addEventListener("click", toggleTheme);
    dom.darkModeToggleAlt.addEventListener("click", toggleTheme);

    dom.tabButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const tabId = button.dataset.tab;
        setActiveTab(tabId, true);
      });
    });

    dom.departureTime.addEventListener("change", (event) => {
      appState.departureTimes[appState.selectedDay] = event.target.value || "";
      renderItinerary();
      refreshMap();
      saveState();
      showToast("Hora de salida actualizada");
    });

    dom.itineraryDayView.addEventListener("click", onItineraryAction);

    dom.btnExport.addEventListener("click", exportPlan);
    dom.btnExportAlt.addEventListener("click", exportPlan);
    dom.btnPrint.addEventListener("click", () => window.print());

    dom.importFile.addEventListener("change", (event) => importPlanFromInput(event.target));
    dom.importFileAlt.addEventListener("change", (event) => importPlanFromInput(event.target));

    const filterHandler = () => {
      appState.filters.search = dom.searchInput.value.trim();
      appState.filters.day = dom.filterDay.value;
      appState.filters.category = dom.filterCategory.value;
      appState.filters.indoor = dom.filterIndoor.value;
      appState.filters.budget = dom.filterBudget.value;
      appState.filters.aptoLluvia = dom.filterRain.checked;
      appState.filters.sinReserva = dom.filterNoBooking.checked;
      appState.filters.onlyFavorites = dom.filterFavorites.checked;
      refreshMap();
      saveState();
    };

    dom.searchInput.addEventListener("input", filterHandler);
    dom.filterDay.addEventListener("change", filterHandler);
    dom.filterCategory.addEventListener("change", filterHandler);
    dom.filterIndoor.addEventListener("change", filterHandler);
    dom.filterBudget.addEventListener("change", filterHandler);
    dom.filterRain.addEventListener("change", filterHandler);
    dom.filterNoBooking.addEventListener("change", filterHandler);
    dom.filterFavorites.addEventListener("change", filterHandler);

    dom.btnNearMe.addEventListener("click", useNearMe);
    dom.btnClearNear.addEventListener("click", clearNearMe);

    dom.poiList.addEventListener("click", (event) => {
      const item = event.target.closest(".poi-item");
      if (!item) return;
      focusPoiOnMap(item.dataset.poiId, true);
    });

    dom.poiList.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const item = event.target.closest(".poi-item");
      if (!item) return;
      event.preventDefault();
      focusPoiOnMap(item.dataset.poiId, true);
    });

    dom.checklistGroups.addEventListener("change", onChecklistChange);

    dom.btnResetProgress.addEventListener("click", () => {
      const ok = window.confirm("Esto reinicia progreso, favoritos y filtros. ¿Continuar?");
      if (!ok) return;
      const keepTheme = appState.darkMode;
      appState = getDefaultState();
      appState.darkMode = keepTheme;
      doneSet = new Set();
      favoriteSet = new Set();
      syncControlsFromState();
      renderDaySwitcher();
      renderChecklist();
      renderItinerary();
      refreshMap();
      updateCounters();
      saveState();
      showToast("Progreso reiniciado");
    });
  }

  function renderDaySwitcher() {
    dom.daySwitcher.innerHTML = "";
    DAYS.forEach((day) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "chip";
      button.dataset.day = day;
      button.textContent = window.DAY_LABELS?.[day] || day;
      if (day === appState.selectedDay) button.classList.add("active");
      dom.daySwitcher.appendChild(button);
    });
  }

  function onDayChange(event) {
    const button = event.target.closest("button[data-day]");
    if (!button) return;
    const day = button.dataset.day;
    if (!DAYS.includes(day) || day === appState.selectedDay) return;
    appState.selectedDay = day;
    syncControlsFromState();
    renderDaySwitcher();
    renderItinerary();
    refreshMap();
    saveState();
  }

  function syncControlsFromState() {
    dom.weatherButtons.forEach((button) => {
      const active = button.dataset.weather === appState.weatherMode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });

    dom.departureTime.value = appState.departureTimes[appState.selectedDay] || "";

    dom.filterDay.value = appState.filters.day;
    dom.filterCategory.value = appState.filters.category;
    dom.filterIndoor.value = appState.filters.indoor;
    dom.filterBudget.value = appState.filters.budget;
    dom.filterRain.checked = Boolean(appState.filters.aptoLluvia);
    dom.filterNoBooking.checked = Boolean(appState.filters.sinReserva);
    dom.filterFavorites.checked = Boolean(appState.filters.onlyFavorites);
    dom.searchInput.value = appState.filters.search || "";

    dom.darkModeToggle.setAttribute("aria-pressed", String(Boolean(appState.darkMode)));
    dom.darkModeToggle.textContent = appState.darkMode ? "Tema claro" : "Tema oscuro";
    dom.darkModeToggleAlt.textContent = appState.darkMode ? "Cambiar a claro" : "Cambiar a oscuro";
  }

  function renderItinerary() {
    const day = appState.selectedDay;
    const dayData = appState.itinerary[day];
    const timeline = computeTimeline(day);

    dom.itineraryDayView.innerHTML = "";

    SEGMENTS.forEach((segment) => {
      const column = document.createElement("article");
      column.className = "segment-column card";

      const header = document.createElement("header");
      header.className = "segment-header";
      header.innerHTML = `
        <div>
          <h2>${window.SEGMENT_LABELS?.[segment] || segment}</h2>
          <p class="segment-sub">${appState.weatherMode === "sun" ? "Plan A" : "Plan B"} activo</p>
        </div>
        <span class="badge">${(dayData[segment] || []).length} paradas</span>
      `;

      const list = document.createElement("ul");
      list.className = "segment-list";
      list.dataset.day = day;
      list.dataset.segment = segment;

      const entries = dayData[segment] || [];

      if (!entries.length) {
        const empty = document.createElement("li");
        empty.innerHTML = '<div class="stop-card"><p class="segment-sub">Arrastra paradas aqui.</p></div>';
        list.appendChild(empty);
      }

      entries.forEach((entry) => {
        const poi = getPoiForEntry(entry);
        if (!poi) return;

        const li = document.createElement("li");
        li.dataset.entryId = entry.entryId;

        const isDone = doneSet.has(poi.id);
        const isFav = favoriteSet.has(poi.id);
        const startTime = timeline.get(entry.entryId);
        const isHighlighted = appState.lastHighlightedPoi === poi.id;
        const catClass = categoryClass(poi.categoria);
        const catIcon = getCategoryIcon(poi.categoria);

        li.innerHTML = `
          <article class="stop-card ${isHighlighted ? "highlighted" : ""}" data-poi-id="${poi.id}">
            <div class="stop-head">
              <div class="stop-thumb ${catClass}" aria-hidden="true">${catIcon}</div>
              <div class="stop-main">
                <h3 class="stop-title">${escapeHtml(poi.nombre)}</h3>
                <p class="stop-zone">${escapeHtml(poi.barrio)} · ${escapeHtml(poi.direccion)}</p>
              </div>
              <span class="stop-time">${startTime ? `Inicio ${startTime}` : ""}</span>
            </div>
            <p class="segment-sub">${escapeHtml(poi.descripcion_corta)}</p>
            <div class="stop-meta">
              <span class="badge ${poi.indoor ? "indoor" : "outdoor"}">${poi.indoor ? "Indoor" : "Outdoor"}</span>
              <span class="badge">${escapeHtml(poi.categoria)}</span>
              <span class="badge">${poi.coste_nivel}</span>
              <span class="badge">${Number(poi.duracion_min) || 0} min</span>
              ${poi.reserva_requerida ? '<span class="badge reserve">Reserva</span>' : '<span class="badge">Sin reserva previa</span>'}
              ${poi.apto_lluvia ? '<span class="badge">Apto para lluvia</span>' : ""}
            </div>
            <div class="stop-actions">
              <button class="icon-btn done" type="button" data-action="toggle-done" data-poi-id="${poi.id}" data-active="${isDone}">
                ${isDone ? "Hecho" : "Marcar hecho"}
              </button>
              <button class="icon-btn" type="button" data-action="toggle-favorite" data-poi-id="${poi.id}" data-active="${isFav}">
                ${isFav ? "Favorita" : "Favorito"}
              </button>
              <button class="icon-btn" type="button" data-action="focus-map" data-poi-id="${poi.id}">
                Ver en mapa
              </button>
            </div>
          </article>
        `;
        list.appendChild(li);
      });

      column.appendChild(header);
      column.appendChild(list);
      dom.itineraryDayView.appendChild(column);
    });

    initSortables();
    renderDepartureMini();
    updateCounters();
  }

  function renderDepartureMini() {
    if (!dom.departureMini) return;
    const departurePlan = window.DEPARTURE_DAY_PLAN;
    if (!departurePlan) {
      dom.departureMini.hidden = true;
      return;
    }

    const inboundFlight = (window.TRAVEL_LOGISTICS?.flights || []).find((flight) => flight.numero === "HV6227");
    const hotel = window.HOTEL_REFERENCE;

    const rows = (departurePlan.items || [])
      .map((item) => {
        return `
          <li class="departure-item">
            <span class="departure-time">${escapeHtml(item.hora || "-")}</span>
            <div class="departure-content">
              <h4>${escapeHtml(item.titulo || "")}</h4>
              <p>${escapeHtml(item.detalle || "")}</p>
            </div>
          </li>
        `;
      })
      .join("");

    dom.departureMini.hidden = false;
    dom.departureMini.innerHTML = `
      <article class="departure-card card">
        <header class="departure-head">
          <div>
            <h3>${escapeHtml(departurePlan.label || "Día de salida")}</h3>
            <p>${escapeHtml(departurePlan.subtitle || "")}</p>
          </div>
          <span class="badge">No editable</span>
        </header>
        <ul class="departure-list">${rows}</ul>
        <footer class="departure-foot">
          <span class="badge">Hotel base: ${escapeHtml(hotel?.nombre || "Best Western Amsterdam")}</span>
          <span class="badge">Check-out: ${escapeHtml(hotel?.checkout || "11:00 CEST")}</span>
          <span class="badge">Vuelo: ${escapeHtml(inboundFlight?.numero || "HV6227")} · ${escapeHtml(inboundFlight?.salida || "20:15")}</span>
        </footer>
      </article>
    `;
  }

  function initSortables() {
    sortables.forEach((sortable) => sortable.destroy());
    sortables = [];

    const lists = dom.itineraryDayView.querySelectorAll(".segment-list");
    lists.forEach((list) => {
      const sortable = new Sortable(list, {
        group: `it-${appState.selectedDay}`,
        animation: 170,
        ghostClass: "sortable-ghost",
        onEnd: (event) => {
          const fromSeg = event.from?.dataset.segment;
          const toSeg = event.to?.dataset.segment;
          const day = event.from?.dataset.day;
          if (!fromSeg || !toSeg || !day) return;
          moveEntry(day, fromSeg, toSeg, event.oldIndex, event.newIndex);
        }
      });
      sortables.push(sortable);
    });
  }

  function moveEntry(day, fromSeg, toSeg, oldIndex, newIndex) {
    if (oldIndex == null || newIndex == null) return;

    const fromList = appState.itinerary?.[day]?.[fromSeg];
    const toList = appState.itinerary?.[day]?.[toSeg];
    if (!Array.isArray(fromList) || !Array.isArray(toList)) return;

    const moved = fromList.splice(oldIndex, 1)[0];
    if (!moved) return;
    toList.splice(newIndex, 0, moved);

    renderItinerary();
    refreshMap();
    saveState();
    showToast("Itinerario reordenado");
  }

  function computeTimeline(day) {
    const timeline = new Map();
    const start = timeToMinutes(appState.departureTimes[day]);
    if (start == null) return timeline;

    let cursor = start;
    const dayData = appState.itinerary[day];
    SEGMENTS.forEach((segment) => {
      (dayData[segment] || []).forEach((entry) => {
        const poi = getPoiForEntry(entry);
        if (!poi) return;
        timeline.set(entry.entryId, minutesToTime(cursor));
        cursor += Number(poi.duracion_min) || 0;
      });
    });

    return timeline;
  }

  function onItineraryAction(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const action = button.dataset.action;
    const poiId = button.dataset.poiId;
    if (!poiId || !poiById.has(poiId)) return;

    if (action === "toggle-done") {
      toggleSetValue(doneSet, poiId);
      renderItinerary();
      refreshMap();
      saveState();
      showToast(doneSet.has(poiId) ? "Marcada como hecha" : "Hecha desmarcada");
      return;
    }

    if (action === "toggle-favorite") {
      toggleSetValue(favoriteSet, poiId);
      renderItinerary();
      refreshMap();
      saveState();
      showToast(favoriteSet.has(poiId) ? "Añadida a favoritas" : "Quitada de favoritas");
      return;
    }

    if (action === "focus-map") {
      ensurePoiVisible(poiId);
      setActiveTab("map", true);
      focusPoiOnMap(poiId, true);
    }
  }

  function setActiveTab(tabId, persist = true) {
    if (!SUPPORTED_TABS.includes(tabId)) tabId = "itinerary";

    dom.tabButtons.forEach((button) => {
      const active = button.dataset.tab === tabId;
      button.setAttribute("aria-selected", String(active));
    });

    Object.entries(dom.panels).forEach(([panelKey, panel]) => {
      const active = panelKey === tabId;
      panel.hidden = !active;
      panel.classList.toggle("active", active);
    });

    appState.selectedTab = tabId;

    if (tabId === "map") {
      if (!mapInitialized) initMap();
      window.setTimeout(() => {
        if (!map) return;
        map.invalidateSize();
        refreshMap();
      }, 70);
    }

    if (persist) saveState();
  }

  function initMap() {
    map = L.map("map", { zoomControl: true }).setView([52.3702, 4.8952], 12);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    markerLayer = L.layerGroup().addTo(map);
    fixedMarkerLayer = L.layerGroup().addTo(map);
    renderHotelReferenceMarker();
    mapInitialized = true;
    refreshMap();
  }

  function renderHotelReferenceMarker() {
    if (!map || !fixedMarkerLayer) return;

    const hotel = window.HOTEL_REFERENCE || poiById.get(HOTEL_ID);
    if (!hotel || !isFiniteNumber(hotel.lat) || !isFiniteNumber(hotel.lng)) return;

    fixedMarkerLayer.clearLayers();

    const icon = L.divIcon({
      className: "hotel-ref-icon",
      html: '<span>HOTEL</span>',
      iconSize: [58, 24],
      iconAnchor: [29, 12]
    });

    hotelMarker = L.marker([hotel.lat, hotel.lng], { icon });
    hotelMarker.bindPopup(
      `<div><strong>${escapeHtml(hotel.nombre || "Hotel")}</strong><br /><small>${escapeHtml(hotel.direccion || "")}</small><br /><small>Check-in ${escapeHtml(hotel.checkin || "-")} · Check-out ${escapeHtml(hotel.checkout || "-")}</small></div>`,
      { maxWidth: 280 }
    );
    hotelMarker.addTo(fixedMarkerLayer);
  }

  function refreshMap() {
    if (!mapInitialized) return;

    const filteredPois = getFilteredPois();
    renderPoiList(filteredPois);
    renderMapMarkers(filteredPois);
    drawRoutePolyline();
    renderDistanceHint(filteredPois.length);
    applyHighlightClasses();
  }

  function getFilteredPois() {
    distanceByPoi = new Map();

    const filters = appState.filters;
    const query = normalize(filters.search || "");
    const daySet = filters.day !== "all" ? getPoiIdsByDay(filters.day) : null;

    let results = (window.POIS || []).filter((poi) => {
      if (daySet && !daySet.has(poi.id)) return false;
      if (filters.category !== "all" && poi.categoria !== filters.category) return false;
      if (filters.indoor === "indoor" && !poi.indoor) return false;
      if (filters.indoor === "outdoor" && poi.indoor) return false;
      if (filters.budget !== "all" && poi.coste_nivel !== filters.budget) return false;
      if (filters.aptoLluvia && !poi.apto_lluvia) return false;
      if (filters.sinReserva && poi.reserva_requerida) return false;
      if (filters.onlyFavorites && !favoriteSet.has(poi.id)) return false;

      if (query) {
        const haystack = normalize(`${poi.nombre} ${poi.barrio} ${poi.categoria} ${poi.tags.join(" ")} ${poi.descripcion_corta}`);
        if (!haystack.includes(query)) return false;
      }

      return true;
    });

    if (appState.nearMe) {
      results = results
        .map((poi) => {
          const km = distanceKm(appState.nearMe.lat, appState.nearMe.lng, poi.lat, poi.lng);
          distanceByPoi.set(poi.id, km);
          return poi;
        })
        .sort((a, b) => (distanceByPoi.get(a.id) || 0) - (distanceByPoi.get(b.id) || 0));
    } else {
      results.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    }

    return results;
  }

  function getPoiIdsByDay(dayKey) {
    const set = new Set();
    const dayData = appState.itinerary?.[dayKey];
    if (!dayData) return set;

    SEGMENTS.forEach((segment) => {
      (dayData[segment] || []).forEach((entry) => {
        if (entry.planA) set.add(entry.planA);
        if (entry.planB) set.add(entry.planB);
      });
    });

    return set;
  }

  function renderPoiList(pois) {
    dom.poiList.innerHTML = "";

    if (!pois.length) {
      const empty = document.createElement("li");
      empty.className = "poi-item";
      empty.innerHTML = "<h3>Sin resultados</h3><p>Prueba quitar filtros o cambiar el texto de búsqueda.</p>";
      dom.poiList.appendChild(empty);
      return;
    }

    const fragment = document.createDocumentFragment();

    pois.forEach((poi) => {
      const li = document.createElement("li");
      li.className = "poi-item";
      li.tabIndex = 0;
      li.dataset.poiId = poi.id;

      const km = distanceByPoi.get(poi.id);
      const distanceBadge = typeof km === "number" ? `<span class="badge">${km.toFixed(1)} km</span>` : "";
      const catClass = categoryClass(poi.categoria);
      const catIcon = getCategoryIcon(poi.categoria);

      li.innerHTML = `
        <div class="poi-head">
          <div class="poi-thumb ${catClass}" aria-hidden="true">${catIcon}</div>
          <div>
            <h3>${escapeHtml(poi.nombre)}</h3>
            <p class="poi-zone">${escapeHtml(poi.barrio)}</p>
          </div>
        </div>
        <div class="meta-line">
          <span class="badge">${escapeHtml(poi.categoria)}</span>
          <span class="badge">${poi.indoor ? "Indoor" : "Outdoor"}</span>
          <span class="badge">${poi.coste_nivel}</span>
          ${poi.reserva_requerida ? '<span class="badge reserve">Reserva</span>' : '<span class="badge">Sin reserva previa</span>'}
          ${distanceBadge}
        </div>
        <p>${escapeHtml(poi.direccion)}</p>
        <p>${escapeHtml(poi.descripcion_corta)}</p>
      `;

      fragment.appendChild(li);
    });

    dom.poiList.appendChild(fragment);
  }

  function renderMapMarkers(pois) {
    markerLayer.clearLayers();
    markersByPoiId = new Map();
    if (hotelMarker) {
      markersByPoiId.set(HOTEL_ID, hotelMarker);
    }

    pois.forEach((poi) => {
      if (poi.id === HOTEL_ID) return;
      if (!isFiniteNumber(poi.lat) || !isFiniteNumber(poi.lng)) return;

      const marker = L.circleMarker([poi.lat, poi.lng], {
        radius: 8,
        color: "#0c1020",
        weight: 2,
        fillColor: categoryColor(poi.categoria),
        fillOpacity: 0.94
      });
      marker.bindPopup(buildPopupHtml(poi), { maxWidth: 280 });
      marker.on("click", () => {
        appState.lastHighlightedPoi = poi.id;
        applyHighlightClasses();
      });

      marker.addTo(markerLayer);
      markersByPoiId.set(poi.id, marker);
    });

    if (userMarker && appState.nearMe) {
      userMarker.addTo(map);
    }
  }

  function buildPopupHtml(poi) {
    const link = poi.enlace_oficial
      ? `<a href="${escapeHtml(poi.enlace_oficial)}" target="_blank" rel="noopener noreferrer">Web oficial</a>`
      : "";

    return `
      <div>
        <strong>${escapeHtml(poi.nombre)}</strong><br />
        <small>${escapeHtml(poi.barrio)} - ${escapeHtml(poi.categoria)}</small><br />
        <small>${escapeHtml(poi.direccion)}</small><br />
        ${link}
      </div>
    `;
  }

  function drawRoutePolyline() {
    if (!map) return;

    if (routeLine) {
      routeLine.remove();
      routeLine = null;
    }

    const coords = [];
    const dayData = appState.itinerary?.[appState.selectedDay];
    SEGMENTS.forEach((segment) => {
      (dayData[segment] || []).forEach((entry) => {
        const poi = getPoiForEntry(entry);
        if (!poi || !isFiniteNumber(poi.lat) || !isFiniteNumber(poi.lng)) return;
        coords.push([poi.lat, poi.lng]);
      });
    });

    if (coords.length < 2) return;

    routeLine = L.polyline(coords, {
      color: "#ff4b3e",
      weight: 4.5,
      opacity: 0.88,
      dashArray: "8 6"
    }).addTo(map);
  }

  function focusPoiOnMap(poiId, openPopup) {
    if (!poiId || !mapInitialized) return;

    const marker = markersByPoiId.get(poiId) || (poiId === HOTEL_ID ? hotelMarker : null);
    if (!marker) {
      showToast("Ese lugar esta oculto por filtros actuales.");
      return;
    }

    const latLng = marker.getLatLng();
    map.flyTo(latLng, Math.max(map.getZoom(), 14), {
      animate: true,
      duration: 0.8
    });

    if (openPopup) marker.openPopup();
    appState.lastHighlightedPoi = poiId;
    applyHighlightClasses(true);
  }

  function applyHighlightClasses(scrollToListItem = false) {
    document.querySelectorAll(".poi-item[data-poi-id]").forEach((item) => {
      item.classList.toggle("active", item.dataset.poiId === appState.lastHighlightedPoi);
    });

    document.querySelectorAll(".stop-card[data-poi-id]").forEach((card) => {
      card.classList.toggle("highlighted", card.dataset.poiId === appState.lastHighlightedPoi);
    });

    if (scrollToListItem && appState.lastHighlightedPoi) {
      const item = dom.poiList.querySelector(`[data-poi-id="${cssEscape(appState.lastHighlightedPoi)}"]`);
      item?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }

  function ensurePoiVisible(poiId) {
    const visible = getFilteredPois().some((poi) => poi.id === poiId);
    if (visible) return;

    appState.filters = { ...DEFAULT_FILTERS };
    syncControlsFromState();
    refreshMap();
    showToast("Se limpiaron filtros para mostrar la parada en el mapa.");
  }

  function useNearMe() {
    if (!navigator.geolocation) {
      showToast("Tu navegador no soporta geolocalización.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        appState.nearMe = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };

        if (userMarker) userMarker.remove();
        userMarker = L.circleMarker([appState.nearMe.lat, appState.nearMe.lng], {
          radius: 7,
          color: "#b3403b",
          fillColor: "#e38b2f",
          fillOpacity: 0.9,
          weight: 2
        }).bindPopup("Tu ubicación aproximada");

        userMarker.addTo(map);
        map.flyTo([appState.nearMe.lat, appState.nearMe.lng], 13, { animate: true, duration: 0.9 });

        refreshMap();
        saveState();
        showToast("Ordenado por distancia (aprox).", 2800);
      },
      () => {
        showToast("No se pudo obtener tu ubicación.");
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 60000
      }
    );
  }

  function clearNearMe() {
    appState.nearMe = null;
    if (userMarker) {
      userMarker.remove();
      userMarker = null;
    }

    refreshMap();
    saveState();
    showToast("Orden por distancia desactivado.");
  }

  function renderDistanceHint(total) {
    if (appState.nearMe) {
      dom.distanceHint.textContent = `${total} lugares ordenados por distancia aproximada.`;
      return;
    }
    dom.distanceHint.textContent = "";
  }

  function renderChecklist() {
    const items = window.CHECKLIST_ITEMS || [];
    const grouped = items.reduce((acc, item) => {
      if (!acc[item.grupo]) acc[item.grupo] = [];
      acc[item.grupo].push(item);
      return acc;
    }, {});

    dom.checklistGroups.innerHTML = "";

    Object.entries(grouped).forEach(([groupName, groupItems]) => {
      const section = document.createElement("section");
      section.className = "checklist-group";

      const h3 = document.createElement("h3");
      h3.textContent = capitalize(groupName);
      section.appendChild(h3);

      groupItems.forEach((item) => {
        const wrapper = document.createElement("div");
        wrapper.className = "check-item";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.id = item.id;
        checkbox.dataset.checkId = item.id;
        checkbox.checked = Boolean(appState.checklist[item.id]);

        const label = document.createElement("label");
        label.setAttribute("for", item.id);
        label.textContent = item.texto;

        wrapper.appendChild(checkbox);
        wrapper.appendChild(label);
        section.appendChild(wrapper);
      });

      dom.checklistGroups.appendChild(section);
    });
  }

  function onChecklistChange(event) {
    const checkbox = event.target.closest("input[data-check-id]");
    if (!checkbox) return;

    appState.checklist[checkbox.dataset.checkId] = checkbox.checked;
    saveState();
    showToast("Checklist guardado");
  }

  function updateCounters() {
    const total = window.POIS?.length || 0;
    dom.doneCounter.textContent = `${doneSet.size} hechas / ${total}`;
    dom.favoriteCounter.textContent = `${favoriteSet.size} favoritas`;
  }

  function toggleTheme() {
    appState.darkMode = !appState.darkMode;
    applyTheme(appState.darkMode);
    syncControlsFromState();
    saveState();
  }

  function applyTheme(isDark) {
    dom.body.classList.toggle("theme-dark", Boolean(isDark));
    const mapElement = document.getElementById("map");
    if (mapElement) {
      mapElement.classList.toggle("dark-map", Boolean(isDark));
    }
  }

  function exportPlan() {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      state: serializeState()
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `amsterdam-plan-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();

    URL.revokeObjectURL(url);
    showToast("Plan exportado en JSON");
  }

  function importPlanFromInput(input) {
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || "{}"));
        const incomingState = parsed.state ? parsed.state : parsed;
        applyImportedState(incomingState);
        input.value = "";
        showToast("Plan importado correctamente");
      } catch (error) {
        showToast("JSON no valido para importar.");
      }
    };

    reader.readAsText(file);
  }

  function applyImportedState(rawState) {
    const normalized = normalizeState(rawState, getDefaultState());
    appState = normalized;
    doneSet = new Set(normalized.done || []);
    favoriteSet = new Set(normalized.favorites || []);

    applyTheme(appState.darkMode);
    renderDaySwitcher();
    renderChecklist();
    syncControlsFromState();
    renderItinerary();
    refreshMap();
    updateCounters();
    saveState();
  }

  function initServiceWorker() {
    if (!("serviceWorker" in navigator)) {
      dom.swStatus.textContent = "Service Worker no soportado en este navegador.";
      return;
    }

    navigator.serviceWorker
      .register("sw.js")
      .then(() => {
        dom.swStatus.textContent = "Service Worker activo. UI disponible offline tras primera carga.";
      })
      .catch(() => {
        dom.swStatus.textContent = "No se pudo registrar Service Worker.";
      });
  }

  function serializeState() {
    return {
      selectedTab: appState.selectedTab,
      selectedDay: appState.selectedDay,
      weatherMode: appState.weatherMode,
      darkMode: appState.darkMode,
      departureTimes: { ...appState.departureTimes },
      itinerary: deepClone(appState.itinerary),
      filters: { ...appState.filters },
      checklist: { ...appState.checklist },
      done: Array.from(doneSet),
      favorites: Array.from(favoriteSet),
      nearMe: appState.nearMe ? { ...appState.nearMe } : null,
      lastHighlightedPoi: appState.lastHighlightedPoi || null
    };
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeState()));
    } catch (error) {
      showToast("No se pudo guardar en localStorage.");
    }
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (error) {
      return null;
    }
  }

  function buildInitialState() {
    const defaults = getDefaultState();
    const stored = loadState();
    return stored ? normalizeState(stored, defaults) : defaults;
  }

  function getDefaultState() {
    return {
      selectedTab: "itinerary",
      selectedDay: "day1",
      weatherMode: "sun",
      darkMode: true,
      departureTimes: {
        day1: "09:00",
        day2: "09:30",
        day3: "10:00"
      },
      itinerary: deepClone(window.DEFAULT_ITINERARY || {}),
      filters: { ...DEFAULT_FILTERS },
      checklist: {},
      done: [],
      favorites: [],
      nearMe: null,
      lastHighlightedPoi: null
    };
  }

  function normalizeState(source, defaults) {
    const safe = {
      ...defaults,
      selectedTab: SUPPORTED_TABS.includes(source?.selectedTab) ? source.selectedTab : defaults.selectedTab,
      selectedDay: DAYS.includes(source?.selectedDay) ? source.selectedDay : defaults.selectedDay,
      weatherMode: source?.weatherMode === "rain" ? "rain" : "sun",
      darkMode: typeof source?.darkMode === "boolean" ? source.darkMode : defaults.darkMode,
      departureTimes: normalizeDepartureTimes(source?.departureTimes, defaults.departureTimes),
      itinerary: normalizeItinerary(source?.itinerary || defaults.itinerary),
      filters: normalizeFilters(source?.filters),
      checklist: normalizeChecklist(source?.checklist),
      done: normalizePoiArray(source?.done),
      favorites: normalizePoiArray(source?.favorites),
      nearMe: normalizeNearMe(source?.nearMe),
      lastHighlightedPoi: poiById.has(source?.lastHighlightedPoi) ? source.lastHighlightedPoi : null
    };

    return safe;
  }

  function normalizeDepartureTimes(times, fallback) {
    const safe = { ...fallback };
    DAYS.forEach((day) => {
      const value = times?.[day];
      safe[day] = typeof value === "string" ? value : fallback[day] || "";
    });
    return safe;
  }

  function normalizeFilters(filters) {
    return {
      day: DAYS.includes(filters?.day) || filters?.day === "all" ? filters.day : "all",
      category:
        filters?.category === "all" || (window.CATEGORIES || []).includes(filters?.category)
          ? filters.category
          : "all",
      indoor: ["all", "indoor", "outdoor"].includes(filters?.indoor) ? filters.indoor : "all",
      budget: ["all", "€", "€€", "€€€"].includes(filters?.budget) ? filters.budget : "all",
      aptoLluvia: Boolean(filters?.aptoLluvia),
      sinReserva: Boolean(filters?.sinReserva),
      onlyFavorites: Boolean(filters?.onlyFavorites),
      search: typeof filters?.search === "string" ? filters.search : ""
    };
  }

  function normalizeChecklist(checklist) {
    if (!checklist || typeof checklist !== "object") return {};
    const safe = {};
    (window.CHECKLIST_ITEMS || []).forEach((item) => {
      safe[item.id] = Boolean(checklist[item.id]);
    });
    return safe;
  }

  function normalizePoiArray(arr) {
    if (!Array.isArray(arr)) return [];
    return arr.filter((id) => poiById.has(id));
  }

  function normalizeNearMe(nearMe) {
    if (!nearMe || !isFiniteNumber(nearMe.lat) || !isFiniteNumber(nearMe.lng)) return null;
    return { lat: Number(nearMe.lat), lng: Number(nearMe.lng) };
  }

  function normalizeItinerary(raw) {
    const base = deepClone(window.DEFAULT_ITINERARY || {});
    DAYS.forEach((day) => {
      SEGMENTS.forEach((segment) => {
        const incoming = raw?.[day]?.[segment];
        if (!Array.isArray(incoming)) return;
        base[day][segment] = incoming
          .map((entry) => normalizeEntry(entry))
          .filter((entry) => entry && (poiById.has(entry.planA) || poiById.has(entry.planB)));
      });
    });
    return base;
  }

  function normalizeEntry(entry) {
    if (!entry || typeof entry !== "object") return null;

    let planA = poiById.has(entry.planA) ? entry.planA : null;
    let planB = poiById.has(entry.planB) ? entry.planB : null;

    if (!planA && planB) planA = planB;
    if (!planB && planA) planB = planA;
    if (!planA && !planB) return null;

    return {
      entryId: typeof entry.entryId === "string" && entry.entryId ? entry.entryId : nextEntryId(),
      planA,
      planB
    };
  }

  function getPoiForEntry(entry) {
    if (!entry) return null;
    const activeId = appState.weatherMode === "sun" ? entry.planA : entry.planB;
    return poiById.get(activeId) || poiById.get(entry.planA) || poiById.get(entry.planB) || null;
  }

  function populateCategoryFilter() {
    const categories = window.CATEGORIES || [];
    categories.forEach((category) => {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      dom.filterCategory.appendChild(option);
    });
  }

  function showToast(message, timeoutMs = 2200) {
    if (!message || !dom.toastContainer) return;
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    dom.toastContainer.appendChild(toast);

    window.setTimeout(() => {
      toast.remove();
    }, timeoutMs);
  }

  function toggleSetValue(set, value) {
    if (set.has(value)) {
      set.delete(value);
    } else {
      set.add(value);
    }
  }

  function timeToMinutes(value) {
    if (typeof value !== "string" || !value.includes(":")) return null;
    const [hours, minutes] = value.split(":").map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    return hours * 60 + minutes;
  }

  function minutesToTime(totalMinutes) {
    const mins = ((totalMinutes % 1440) + 1440) % 1440;
    const h = Math.floor(mins / 60)
      .toString()
      .padStart(2, "0");
    const m = Math.floor(mins % 60)
      .toString()
      .padStart(2, "0");
    return `${h}:${m}`;
  }

  function distanceKm(lat1, lng1, lat2, lng2) {
    const r = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return r * c;
  }

  function toRad(value) {
    return (value * Math.PI) / 180;
  }

  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function categoryClass(category) {
    return `cat-${normalize(category || "general")
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")}`;
  }

  function getCategoryIcon(category) {
    const iconMap = {
      hotel: "HT",
      museo: "MU",
      paseo: "PS",
      mirador: "MR",
      ciencia: "SC",
      "street-art": "SA",
      mercado: "MK",
      parque: "PK",
      experiencia: "XP",
      zoo: "ZO",
      barco: "BR",
      transporte: "TR",
      historia: "HS"
    };
    return iconMap[categoryClass(category).replace("cat-", "")] || "PO";
  }

  function categoryColor(category) {
    const colorMap = {
      hotel: "#00b7ff",
      museo: "#4ea5ff",
      paseo: "#7be495",
      mirador: "#ffb04a",
      ciencia: "#4dd0e1",
      "street-art": "#b980ff",
      mercado: "#ff7f7f",
      parque: "#4bcf89",
      experiencia: "#ffd166",
      zoo: "#f29e4c",
      barco: "#3c8dff",
      transporte: "#d16dff",
      historia: "#f4c95d"
    };
    return colorMap[categoryClass(category).replace("cat-", "")] || "#ff4b3e";
  }

  function capitalize(value) {
    if (!value) return "";
    return value[0].toUpperCase() + value.slice(1);
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === "function") {
      return window.CSS.escape(value);
    }
    return String(value).replace(/"/g, '\\"');
  }

  function isFiniteNumber(value) {
    return Number.isFinite(Number(value));
  }

  function nextEntryId() {
    uidCounter += 1;
    return `entry-${Date.now()}-${uidCounter}`;
  }
})();
