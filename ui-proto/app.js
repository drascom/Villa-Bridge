(function () {
  "use strict";

  var $ = function (selector, root) { return (root || document).querySelector(selector); };
  var $$ = function (selector, root) { return Array.prototype.slice.call((root || document).querySelectorAll(selector)); };
  var toastTimer = null;
  var riveInstance = null;
  var currentView = "home";
  var motionEnabled = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var stateChangingMethods = ["POST", "PUT", "PATCH", "DELETE"];
  var favoriteKinds = ["switch", "fan", "siren", "cover", "position", "lock", "climate"];
  var wallpaperStorageKey = "villa-bridge-ui-wallpaper";
  var antalyaCollection = ["beach", "saklikent", "highland", "snow", "cruise", "kaleici"];
  var wallpapers = {
    villa: { label: "Villa gecesi", url: "assets/backgrounds/villa-twilight.jpg", position: "center" },
    beach: { label: "Sahil gün batımı", url: "assets/backgrounds/antalya/antalya-beach.webp", position: "center" },
    saklikent: { label: "Saklıkent Kanyonu", url: "assets/backgrounds/antalya/saklikent-canyon.webp", position: "center" },
    highland: { label: "Eğrigöl yaylası", url: "assets/backgrounds/antalya/egrigol-highland.webp", position: "center" },
    snow: { label: "Karlı Beydağları", url: "assets/backgrounds/antalya/snowy-beydaglari.webp", position: "center" },
    cruise: { label: "Alanya kruvaziyer limanı", url: "assets/backgrounds/antalya/cruise-port.webp", position: "center" },
    kaleici: { label: "Kaleiçi yat limanı", url: "assets/backgrounds/antalya/kaleici-harbor.webp", position: "center" }
  };
  var state = {
    devices: [],
    favorites: [],
    groups: [],
    automations: [],
    health: null,
    csrfToken: null,
    panel: null,
    favoriteDraft: [],
    sceneBusy: new Set(),
    commandBusy: new Set()
  };

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character];
    });
  }

  function icon(id) {
    return '<svg aria-hidden="true"><use href="#' + id + '"></use></svg>';
  }

  function collectionWallpaper() {
    var today = new Date();
    var dayNumber = Math.floor(new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() / 86400000);
    return antalyaCollection[Math.abs(dayNumber) % antalyaCollection.length];
  }

  function storedWallpaper() {
    try { return window.localStorage.getItem(wallpaperStorageKey) || "antalya"; }
    catch (_error) { return "antalya"; }
  }

  function applyWallpaper(choice, remember) {
    var selectedChoice = choice === "calm" || choice === "antalya" || wallpapers[choice] ? choice : "antalya";
    var resolvedChoice = selectedChoice === "antalya" ? collectionWallpaper() : selectedChoice;
    var wallpaper = wallpapers[resolvedChoice] || null;
    var isFlat = selectedChoice === "calm";
    var root = document.documentElement;
    document.body.classList.toggle("is-flat", isFlat);
    if (wallpaper) {
      root.style.setProperty("--wallpaper-image", 'url("' + wallpaper.url + '")');
      root.style.setProperty("--wallpaper-position", wallpaper.position || "center");
      root.style.setProperty("--preview-image", 'url("' + wallpaper.url + '")');
    } else {
      root.style.setProperty("--preview-image", "none");
    }
    $$("[data-wallpaper]").forEach(function (button) {
      var selected = button.dataset.wallpaper === selectedChoice;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", selected ? "true" : "false");
    });
    var previewLabel = $("#wallpaperPreviewLabel");
    if (previewLabel) previewLabel.textContent = isFlat ? "Sade lacivert · Cam odak" : (selectedChoice === "antalya" ? "Antalya koleksiyonu · " + wallpaper.label : wallpaper.label) + " · Cam odak";
    if (remember !== false) {
      try { window.localStorage.setItem(wallpaperStorageKey, selectedChoice); } catch (_error) {}
    }
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function smoothstep(value) {
    var bounded = clamp(value, 0, 1);
    return bounded * bounded * (3 - (2 * bounded));
  }

  function solarPhaseFromAltitude(altitude) {
    var night = smoothstep((5 - altitude) / 17);
    var twilight = smoothstep(1 - (Math.abs(altitude + 1) / 9));
    return { night: night, twilight: twilight };
  }

  function approximateSolarCycle() {
    var hour = new Date().getHours() + (new Date().getMinutes() / 60);
    var approximateAltitude = hour < 6 || hour > 20 ? -14 : 48 * Math.sin(((hour - 6) / 14) * Math.PI);
    applySolarVisuals({
      localTime: "",
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      sun: { position: { altitudeDegrees: approximateAltitude }, sunrise: null, sunset: null },
      moon: { position: null, aboveHorizon: false }
    }, true);
  }

  function formatSolarTime(value, timeZone) {
    if (!value) return "";
    var parsed = new Date(value);
    if (Number.isNaN(parsed.valueOf())) return "";
    return parsed.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: timeZone });
  }

  function applySolarVisuals(celestial, approximate) {
    var sun = celestial && celestial.sun;
    var altitude = sun && sun.position && Number(sun.position.altitudeDegrees);
    if (!Number.isFinite(altitude)) return;
    var phase = solarPhaseFromAltitude(altitude);
    var root = document.documentElement;
    root.style.setProperty("--solar-night", phase.night.toFixed(3));
    root.style.setProperty("--solar-twilight", phase.twilight.toFixed(3));

    var moon = celestial.moon || {};
    var moonPosition = moon.position || {};
    var moonAltitude = Number(moonPosition.altitudeDegrees);
    var moonAzimuth = Number(moonPosition.azimuthDegrees);
    var moonVisible = moon.aboveHorizon === true && Number.isFinite(moonAltitude) ? phase.night * clamp(moonAltitude / 12, 0, 1) : 0;
    if (Number.isFinite(moonAzimuth)) root.style.setProperty("--moon-x", (12 + (moonAzimuth / 360) * 76).toFixed(1) + "%");
    if (Number.isFinite(moonAltitude)) root.style.setProperty("--moon-y", (48 - clamp(moonAltitude, 0, 75) * .48).toFixed(1) + "%");
    root.style.setProperty("--moon-opacity", moonVisible.toFixed(3));

    var status = $("#solarStatus");
    if (!status) return;
    if (approximate) {
      status.textContent = phase.night > .7 ? "Gece" : phase.twilight > .2 ? "Alacakaranlık" : "Gündüz";
      return;
    }
    var isNight = phase.night >= .78;
    var isTwilight = !isNight && phase.twilight >= .22;
    var nextLabel = isNight ? "Gün doğumu" : "Gün batımı";
    var nextValue = formatSolarTime(isNight ? sun.sunrise : sun.sunset, celestial.timeZone);
    status.textContent = (isNight ? "Gece" : isTwilight ? "Alacakaranlık" : "Gündüz") + (nextValue ? " · " + nextLabel + " " + nextValue : "");
  }

  async function refreshSolarCycle() {
    try {
      var result = await api("/api/celestial");
      if (result && result.celestial) applySolarVisuals(result.celestial, false);
    } catch (_error) {
      // The local-clock approximation remains active while the server is unavailable.
    }
  }

  function updateClock() {
    var now = new Date();
    $("#clock").textContent = now.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
    $("#date").textContent = now.toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long" });
  }

  function showToast(message, isError) {
    var toast = $("#toast");
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.toggle("is-error", Boolean(isError));
    toast.classList.add("is-visible");
    toastTimer = window.setTimeout(function () { toast.classList.remove("is-visible"); }, isError ? 4200 : 2400);
  }

  async function refreshSession() {
    var response = await fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin" });
    var data = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(data.error || "Oturum başlatılamadı.");
    state.csrfToken = typeof data.csrfToken === "string" ? data.csrfToken : null;
    return data;
  }

  async function api(url, options, retrySecurity) {
    options = options || {};
    retrySecurity = retrySecurity !== false;
    var method = String(options.method || "GET").toUpperCase();
    if (stateChangingMethods.indexOf(method) >= 0 && !state.csrfToken) await refreshSession();
    var headers = Object.assign(
      {},
      options.body === undefined ? {} : { "content-type": "application/json" },
      stateChangingMethods.indexOf(method) >= 0 && state.csrfToken ? { "x-villa-csrf": state.csrfToken } : {},
      options.headers || {}
    );
    var response = await fetch(url, Object.assign({ cache: "no-store", credentials: "same-origin" }, options, { headers: headers }));
    var data = await response.json().catch(function () { return {}; });
    if (response.status === 403 && data.code === "INVALID_CSRF_TOKEN" && retrySecurity) {
      await refreshSession();
      return api(url, options, false);
    }
    if (!response.ok) {
      var failure = new Error(data.error || "İşlem tamamlanamadı.");
      failure.status = response.status;
      failure.code = data.code;
      throw failure;
    }
    return data;
  }

  function deviceById(id) {
    return state.devices.find(function (device) { return device.id === id; }) || null;
  }

  function controlById(device, id) {
    return device && Array.isArray(device.controls)
      ? device.controls.find(function (control) { return control.id === id; }) || null
      : null;
  }

  function favoriteKey(deviceId, controlId) {
    return deviceId + "|" + controlId;
  }

  function isFavorite(deviceId, controlId, source) {
    return (source || state.favorites).some(function (favorite) {
      return favorite.deviceId === deviceId && favorite.controlId === controlId;
    });
  }

  function controlName(device, control) {
    if (!control || control.id === "main" || control.name === device.name) return device.name;
    return device.name + " · " + control.name;
  }

  function activeControl(control) {
    if (!control) return false;
    if (typeof control.value === "boolean") return control.value;
    if (typeof control.value === "number") return control.value > 0;
    var value = String(control.value == null ? "" : control.value).toLowerCase();
    return ["on", "open", "opening", "heat", "cool", "locked", "true"].indexOf(value) >= 0;
  }

  function controlStatus(device, control) {
    if (!device || device.availability === "offline") return "Çevrimdışı";
    if (device.preparing === true) return "Hazırlanıyor";
    if (!control) return "Çevrimiçi";
    var value = control.value;
    if (control.kind === "lock") return activeControl(control) ? "Kilitli" : "Açık";
    if (control.kind === "cover" || control.kind === "position") {
      if (typeof value === "number") return "%" + Math.round(value) + " açık";
      return String(value || "Hazır");
    }
    if (control.kind === "climate") return value == null ? "Hazır" : String(value);
    if (typeof value === "boolean" || ["switch", "fan", "siren"].indexOf(control.kind) >= 0) {
      return activeControl(control) ? "Açık" : "Kapalı";
    }
    if (typeof value === "number") return String(Math.round(value * 10) / 10);
    return value == null || value === "" ? "Hazır" : String(value);
  }

  function controlIcon(device, control) {
    var kind = control ? control.kind : "";
    var category = control && control.category ? control.category : device.category;
    if (kind === "fan" || category === "fan") return "i-fan";
    if (kind === "cover" || kind === "position" || category === "cover") return "i-curtain";
    if (category === "light") return "i-bulb";
    if (!control || category === "sensor") return "i-sensor";
    return "i-switch";
  }

  function favoriteEntries() {
    return state.favorites.map(function (favorite) {
      var device = deviceById(favorite.deviceId);
      var control = controlById(device, favorite.controlId);
      return device && control ? { device: device, control: control } : null;
    }).filter(Boolean);
  }

  function roomNames(deviceId) {
    return state.groups.filter(function (group) {
      return Array.isArray(group.items) && group.items.some(function (item) { return item.deviceId === deviceId; });
    }).map(function (group) { return group.name; });
  }

  function roomEntries(group) {
    return (group && Array.isArray(group.items) ? group.items : []).map(function (item) {
      var device = deviceById(item.deviceId);
      if (!device) return null;
      var control = item.controlId === "@device" ? null : controlById(device, item.controlId);
      if (item.controlId !== "@device" && !control) return null;
      return { device: device, control: control, controlId: item.controlId };
    }).filter(Boolean);
  }

  function eligibleControls() {
    var result = [];
    state.devices.forEach(function (device) {
      (device.controls || []).forEach(function (control) {
        if (favoriteKinds.indexOf(control.kind) < 0 || control.adminOnly === true) return;
        result.push({ device: device, control: control });
      });
    });
    return result.sort(function (left, right) {
      var leftFavorite = isFavorite(left.device.id, left.control.id, state.favoriteDraft) ? 0 : 1;
      var rightFavorite = isFavorite(right.device.id, right.control.id, state.favoriteDraft) ? 0 : 1;
      if (leftFavorite !== rightFavorite) return leftFavorite - rightFavorite;
      return controlName(left.device, left.control).localeCompare(controlName(right.device, right.control), "tr");
    });
  }

  function manualAutomations() {
    return state.automations.filter(function (automation) { return automation.manual === true; });
  }

  function sceneIcon(automation) {
    var name = String(automation.name || "").toLocaleLowerCase("tr");
    if (name.indexOf("gece") >= 0) return "i-moon";
    if (name.indexOf("misafir") >= 0) return "i-guest";
    if (name.indexOf("ışık") >= 0 || name.indexOf("isik") >= 0) return "i-bulb";
    if (name.indexOf("akşam") >= 0 || name.indexOf("aksam") >= 0) return "i-sun";
    return "i-power";
  }

  function renderFavorites() {
    var container = $("#favoriteList");
    var entries = favoriteEntries();
    if (!entries.length) {
      container.innerHTML = '<button class="surface-empty" type="button" data-open-favorite-editor>' + icon("i-star") + '<span><strong>Henüz favori yok</strong><small>Favori cihazları seçin</small></span></button>';
      return;
    }
    container.innerHTML = entries.map(function (entry, index) {
      var device = entry.device;
      var control = entry.control;
      var online = device.availability !== "offline";
      var active = online && activeControl(control);
      return '<button class="focus-row' + (index === 0 ? " is-selected" : "") + '" type="button" data-device-id="' + esc(device.id) + '" data-control-id="' + esc(control.id) + '">' +
        '<span class="row-icon">' + icon(controlIcon(device, control)) + '</span>' +
        '<span class="row-copy"><strong>' + esc(controlName(device, control)) + '</strong><small>' + esc(controlStatus(device, control)) + '</small></span>' +
        '<span class="state-dot' + (active ? " is-on" : "") + (online ? "" : " is-offline") + '"></span></button>';
    }).join("");
  }

  function renderHealth() {
    var health = state.health;
    var connected = health && health.sourceConnected === true;
    $("#healthKicker").textContent = connected ? "EV HAZIR" : "BAĞLANTI";
    $("#healthTitle").textContent = connected ? "Her şey yolunda" : "Villa Bridge bekleniyor";
    $("#healthMeta").textContent = health && Number.isFinite(health.deviceCount)
      ? health.deviceCount + " cihaz bağlı"
      : state.devices.length + " cihaz";
    $(".home-status").classList.toggle("is-warning", !connected);
  }

  function renderRooms() {
    var container = $("#roomGrid");
    var groups = state.groups.filter(function (group) { return roomEntries(group).length > 0; });
    if (!groups.length) {
      container.innerHTML = '<div class="surface-empty static">' + icon("i-rooms") + '<span><strong>Oda bulunamadı</strong><small>Cihazlara oda atayın</small></span></div>';
      return;
    }
    container.innerHTML = groups.map(function (group) {
      var entries = roomEntries(group);
      var uniqueDevices = Array.from(new Set(entries.map(function (entry) { return entry.device.id; })));
      var active = entries.filter(function (entry) { return entry.control && activeControl(entry.control); }).length;
      var offline = uniqueDevices.filter(function (id) { return deviceById(id).availability === "offline"; }).length;
      var summary = uniqueDevices.length + " cihaz" + (offline ? " · " + offline + " çevrimdışı" : active ? " · " + active + " açık" : " · Hepsi kapalı");
      return '<button type="button" data-room-id="' + esc(group.id) + '"><span class="room-symbol">' + esc(String(group.name || "?").charAt(0).toLocaleUpperCase("tr")) + '</span><strong>' + esc(group.name) + '</strong><small>' + esc(summary) + '</small>' + icon("i-chevron") + '</button>';
    }).join("");
  }

  function renderRoutines() {
    var container = $("#routineList");
    var automations = manualAutomations();
    if (!automations.length) {
      container.innerHTML = '<div class="surface-empty static">' + icon("i-routine") + '<span><strong>Elle çalıştırılan rutin yok</strong><small>Otomasyonlardan eklenebilir</small></span></div>';
    } else {
      container.innerHTML = automations.map(function (automation) {
        var busy = state.sceneBusy.has(automation.id);
        var actionCount = Array.isArray(automation.actions) ? automation.actions.length : 0;
        var disabled = automation.enabled !== true || busy;
        return '<button type="button" data-automation-id="' + esc(automation.id) + '" data-automation-name="' + esc(automation.name) + '"' + (disabled ? " disabled" : "") + ' class="' + (automation.enabled ? "" : "is-disabled") + '">' +
          '<span class="scene-symbol">' + icon(sceneIcon(automation)) + '</span><strong>' + esc(automation.name) + '</strong><small>' + actionCount + ' eylem</small><span>' + (busy ? "Çalışıyor" : automation.enabled ? "Çalıştır" : "Kapalı") + '</span></button>';
      }).join("");
    }
    renderSceneDock();
  }

  function renderSceneDock() {
    var container = $("#sceneDockItems");
    var automations = manualAutomations().filter(function (automation) { return automation.enabled === true; }).slice(0, 5);
    container.style.setProperty("--scene-count", String(Math.max(1, automations.length)));
    container.innerHTML = automations.length ? automations.map(function (automation) {
      var busy = state.sceneBusy.has(automation.id);
      return '<button type="button" data-automation-id="' + esc(automation.id) + '" data-automation-name="' + esc(automation.name) + '"' + (busy ? " disabled" : "") + ' class="' + (busy ? "is-running" : "") + '">' + icon(sceneIcon(automation)) + '<span>' + esc(automation.name) + '</span></button>';
    }).join("") : '<div class="surface-loading">Etkin hızlı sahne yok</div>';
  }

  function renderAll() {
    renderFavorites();
    renderHealth();
    renderRooms();
    renderRoutines();
    if (!state.panel) return;
    if (state.panel.type === "room") renderRoomPanel(state.panel.id, false);
    if (state.panel.type === "device") renderDevicePanel(state.panel.deviceId, state.panel.controlId, state.panel.roomId, false);
  }

  function setView(name) {
    currentView = name;
    $$(".view").forEach(function (view) { view.classList.toggle("is-active", view.id === "view-" + name); });
    $$(".quiet-nav [data-view]").forEach(function (button) { button.classList.toggle("is-active", button.dataset.view === name); });
    window.setTimeout(function () {
      var target = $("#view-" + name + " button");
      if (target) positionAura(target);
    }, 100);
  }

  function positionAura(target) {
    if (!target || window.innerWidth < 721) return;
    var rect = target.getBoundingClientRect();
    var aura = $("#focusAura");
    var width = Math.max(rect.width * 1.35, 260);
    var height = Math.max(rect.height * 2.2, 150);
    aura.style.width = width + "px";
    aura.style.height = height + "px";
    aura.style.transform = "translate3d(" + (rect.left + rect.width / 2 - width / 2) + "px," + (rect.top + rect.height / 2 - height / 2) + "px,0)";
  }

  function showPanel(eyebrow, title, html, panelState, animate) {
    var overlay = $("#panelOverlay");
    var panel = $("#sidePanel");
    $("#panelEyebrow").textContent = eyebrow;
    $("#panelTitle").textContent = title;
    $("#panelContent").innerHTML = html;
    state.panel = panelState;
    if (animate === false && panel.classList.contains("is-open")) return;
    overlay.hidden = false;
    requestAnimationFrame(function () { overlay.classList.add("is-open"); panel.classList.add("is-open"); });
    panel.setAttribute("aria-hidden", "false");
    window.setTimeout(function () { $("[data-close='panel']").focus(); }, 260);
  }

  function closePanel() {
    var overlay = $("#panelOverlay");
    var panel = $("#sidePanel");
    overlay.classList.remove("is-open");
    panel.classList.remove("is-open");
    panel.setAttribute("aria-hidden", "true");
    state.panel = null;
    window.setTimeout(function () { overlay.hidden = true; }, 260);
  }

  function renderRoomPanel(groupId, animate) {
    var group = state.groups.find(function (candidate) { return candidate.id === groupId; });
    if (!group) { closePanel(); return; }
    var entries = roomEntries(group);
    var deviceIds = Array.from(new Set(entries.map(function (entry) { return entry.device.id; })));
    var online = deviceIds.filter(function (id) { return deviceById(id).availability !== "offline"; }).length;
    var list = entries.map(function (entry) {
      var status = controlStatus(entry.device, entry.control);
      return '<button class="room-device-row" type="button" data-device-id="' + esc(entry.device.id) + '" data-control-id="' + esc(entry.control ? entry.control.id : "@device") + '" data-from-room="' + esc(group.id) + '">' +
        '<span class="room-device-icon">' + icon(controlIcon(entry.device, entry.control)) + '</span><span><strong>' + esc(controlName(entry.device, entry.control)) + '</strong><small>' + esc(status) + '</small></span><span class="state-dot' + (entry.control && activeControl(entry.control) ? " is-on" : "") + (entry.device.availability === "offline" ? " is-offline" : "") + '"></span>' + icon("i-chevron") + '</button>';
    }).join("");
    var html = '<div class="panel-summary"><article><span>Cihaz</span><strong>' + deviceIds.length + '</strong></article><article><span>Bağlı</span><strong>' + online + '</strong></article></div>' +
      '<div class="room-device-list">' + (list || '<div class="surface-loading">Bu odada cihaz yok</div>') + '</div>';
    showPanel("Oda kontrolleri", group.name, html, { type: "room", id: group.id }, animate);
  }

  function renderDevicePanel(deviceId, controlId, roomId, animate) {
    var device = deviceById(deviceId);
    if (!device) { closePanel(); return; }
    var control = controlId === "@device" ? null : controlById(device, controlId);
    var rooms = roomNames(device.id);
    var busyKey = favoriteKey(device.id, control ? control.property : "");
    var canToggle = control && ["switch", "fan"].indexOf(control.kind) >= 0 && typeof control.value === "boolean" && device.availability !== "offline";
    var busy = state.commandBusy.has(busyKey);
    var back = roomId ? '<button class="panel-back" type="button" data-back-room="' + esc(roomId) + '">← Odaya dön</button>' : "";
    var command = canToggle ? '<button type="button" class="switch' + (activeControl(control) ? " is-on" : "") + '" data-command-device="' + esc(device.id) + '" data-command-control="' + esc(control.id) + '" aria-label="Aç veya kapat"' + (busy ? " disabled" : "") + '></button>' : "";
    var html = back + '<article class="control-card"><span>' + esc(control ? control.kind : device.category || "Cihaz") + '</span><div class="control-main"><strong>' + esc(controlStatus(device, control)) + '</strong>' + command + '</div></article>' +
      '<div class="metric-grid"><article class="metric"><span>Oda</span><strong>' + esc(rooms[0] || "Atanmamış") + '</strong></article><article class="metric"><span>Bağlantı</span><strong>' + esc(device.availability === "offline" ? "Çevrimdışı" : "İyi") + '</strong></article></div>' +
      '<article class="control-card"><span>Cihaz</span><div class="control-main"><strong>' + esc(device.model || device.description || "Zigbee") + '</strong><span>' + esc(device.vendor || "Villa Bridge") + '</span></div></article>';
    showPanel("Canlı cihaz", controlName(device, control), html, { type: "device", deviceId: device.id, controlId: control ? control.id : "@device", roomId: roomId || null }, animate);
  }

  function renderFavoriteEditor(animate) {
    var controls = eligibleControls();
    var count = state.favoriteDraft.length;
    var list = controls.map(function (entry) {
      var selected = isFavorite(entry.device.id, entry.control.id, state.favoriteDraft);
      var room = roomNames(entry.device.id)[0] || "Odasız";
      return '<button class="favorite-option' + (selected ? " is-selected" : "") + '" type="button" aria-pressed="' + selected + '" data-favorite-device="' + esc(entry.device.id) + '" data-favorite-control="' + esc(entry.control.id) + '">' +
        '<span class="room-device-icon">' + icon(controlIcon(entry.device, entry.control)) + '</span><span><strong>' + esc(controlName(entry.device, entry.control)) + '</strong><small>' + esc(room + " · " + controlStatus(entry.device, entry.control)) + '</small></span><span class="favorite-star">' + icon("i-star") + '</span></button>';
    }).join("");
    var html = '<div class="editor-summary"><strong>' + count + '</strong><span>favori seçildi</span></div><div class="favorite-editor-list">' +
      (list || '<div class="surface-loading">Favoriye eklenebilecek kontrol yok</div>') + '</div><div class="panel-actions"><button class="secondary-button" type="button" data-close="panel">Vazgeç</button><button class="primary-button" type="button" id="saveFavorites">Kaydet</button></div>';
    showPanel("Ana sayfa", "Favorileri düzenle", html, { type: "favorites" }, animate);
  }

  function openFavoriteEditor() {
    state.favoriteDraft = state.favorites.map(function (favorite) { return { deviceId: favorite.deviceId, controlId: favorite.controlId }; });
    renderFavoriteEditor(true);
  }

  function toggleFavoriteOption(deviceId, controlId) {
    if (isFavorite(deviceId, controlId, state.favoriteDraft)) {
      state.favoriteDraft = state.favoriteDraft.filter(function (favorite) { return favoriteKey(favorite.deviceId, favorite.controlId) !== favoriteKey(deviceId, controlId); });
    } else {
      state.favoriteDraft.push({ deviceId: deviceId, controlId: controlId });
    }
    renderFavoriteEditor(false);
  }

  async function saveFavorites() {
    var button = $("#saveFavorites");
    if (button) button.disabled = true;
    try {
      var data = await api("/api/favorites", { method: "PUT", body: JSON.stringify({ favorites: state.favoriteDraft }) });
      state.favorites = Array.isArray(data.favorites) ? data.favorites : state.favoriteDraft;
      renderFavorites();
      closePanel();
      showToast("Favoriler güncellendi");
    } catch (error) {
      if (button) button.disabled = false;
      showToast(error.message, true);
    }
  }

  async function runAutomation(id, name) {
    if (!id || state.sceneBusy.has(id)) return;
    state.sceneBusy.add(id);
    renderRoutines();
    try {
      var result = await api("/api/automations/" + encodeURIComponent(id) + "/run", { method: "POST" });
      if (result.blocked) showToast(result.error || "Koşullar sağlanmadı", true);
      else showToast(name + " çalıştırıldı");
    } catch (error) {
      showToast(error.message, true);
    } finally {
      state.sceneBusy.delete(id);
      renderRoutines();
    }
  }

  async function toggleDevice(deviceId, controlId) {
    var device = deviceById(deviceId);
    var control = controlById(device, controlId);
    if (!device || !control || typeof control.value !== "boolean") return;
    var key = favoriteKey(device.id, control.property);
    if (state.commandBusy.has(key)) return;
    state.commandBusy.add(key);
    renderDevicePanel(device.id, control.id, state.panel && state.panel.roomId, false);
    try {
      await api("/api/devices/" + encodeURIComponent(device.id) + "/command", { method: "POST", body: JSON.stringify({ property: control.property, value: !control.value }) });
      await refreshData(true);
      showToast(controlName(device, control) + " güncellendi");
    } catch (error) {
      showToast(error.message, true);
    } finally {
      state.commandBusy.delete(key);
      var latest = controlById(deviceById(device.id), control.id);
      if (latest && state.panel && state.panel.type === "device") renderDevicePanel(device.id, latest.id, state.panel.roomId, false);
    }
  }

  function openSettings() {
    var sheet = $("#settingsSheet");
    sheet.classList.add("is-open");
    sheet.setAttribute("aria-hidden", "false");
    window.setTimeout(function () { $("[data-close='settings']").focus(); }, 180);
  }

  function closeSettings() {
    var sheet = $("#settingsSheet");
    sheet.classList.remove("is-open");
    sheet.setAttribute("aria-hidden", "true");
  }

  function initRive() {
    if (!window.rive || !motionEnabled) return;
    try {
      window.rive.RuntimeLoader.setWasmUrl("/vendor/rive/rive.wasm");
      riveInstance = new window.rive.Rive({
        src: "assets/rive/focus-aura.riv",
        canvas: $("#focusCanvas"),
        autoplay: true,
        stateMachine: "Focus Pulse",
        fit: window.rive.Fit.cover,
        onLoad: function () { riveInstance.resizeDrawingSurfaceToCanvas(); }
      });
    } catch (error) {
      document.body.classList.add("rive-fallback");
    }
  }

  function renderLoadFailure(message) {
    var html = '<div class="surface-empty static">' + icon("i-info") + '<span><strong>Veriler alınamadı</strong><small>' + esc(message) + '</small></span></div>';
    $("#favoriteList").innerHTML = html;
    $("#roomGrid").innerHTML = html;
    $("#routineList").innerHTML = html;
    $("#sceneDockItems").innerHTML = '<div class="surface-loading">Bağlantı bekleniyor</div>';
  }

  async function refreshData(quiet) {
    try {
      var responses = await Promise.all([
        api("/api/devices"),
        api("/api/favorites"),
        api("/api/home-groups"),
        api("/api/automations"),
        api("/api/health")
      ]);
      state.devices = Array.isArray(responses[0].devices) ? responses[0].devices : [];
      state.favorites = Array.isArray(responses[1].favorites) ? responses[1].favorites : [];
      state.groups = Array.isArray(responses[2].groups) ? responses[2].groups : [];
      state.automations = Array.isArray(responses[3].automations) ? responses[3].automations : [];
      state.health = responses[4] || null;
      renderAll();
    } catch (error) {
      if (!quiet) renderLoadFailure(error.message);
    }
  }

  document.addEventListener("click", function (event) {
    var viewButton = event.target.closest("[data-view]");
    if (viewButton) { setView(viewButton.dataset.view); return; }
    var favoriteEditor = event.target.closest("#editFavorites,[data-open-favorite-editor]");
    if (favoriteEditor) { openFavoriteEditor(); return; }
    var favoriteOption = event.target.closest("[data-favorite-device]");
    if (favoriteOption) { toggleFavoriteOption(favoriteOption.dataset.favoriteDevice, favoriteOption.dataset.favoriteControl); return; }
    if (event.target.closest("#saveFavorites")) { saveFavorites(); return; }
    var room = event.target.closest("[data-room-id]");
    if (room) { renderRoomPanel(room.dataset.roomId, true); return; }
    var backRoom = event.target.closest("[data-back-room]");
    if (backRoom) { renderRoomPanel(backRoom.dataset.backRoom, false); return; }
    var device = event.target.closest("[data-device-id]");
    if (device) { renderDevicePanel(device.dataset.deviceId, device.dataset.controlId, device.dataset.fromRoom || null, true); return; }
    var automation = event.target.closest("[data-automation-id]");
    if (automation) { runAutomation(automation.dataset.automationId, automation.dataset.automationName); return; }
    var command = event.target.closest("[data-command-device]");
    if (command) { toggleDevice(command.dataset.commandDevice, command.dataset.commandControl); return; }
    var close = event.target.closest("[data-close='panel']");
    if (close) { closePanel(); return; }
    var settingClose = event.target.closest("[data-close='settings']");
    if (settingClose) { closeSettings(); return; }
    var open = event.target.closest("[data-open]");
    if (open && open.dataset.open === "settings") { openSettings(); return; }
    if (open && open.dataset.open === "weather") { showToast("14° · Yağmur ihtimali %20 · En yüksek 16°"); return; }
    if (open && open.dataset.open === "admin") { $("#adminDialog").showModal(); }
  });

  document.addEventListener("pointerover", function (event) {
    var target = event.target.closest(".focus-row, .dock-items button, .room-grid button, .routine-list button");
    if (target) positionAura(target);
  });
  document.addEventListener("focusin", function (event) {
    var target = event.target.closest(".focus-row, .dock-items button, .room-grid button, .routine-list button");
    if (target) positionAura(target);
  });

  $("#panelOverlay").addEventListener("click", closePanel);
  $$("[data-wallpaper]").forEach(function (button) {
    button.addEventListener("click", function () {
      applyWallpaper(button.dataset.wallpaper, true);
    });
  });

  $("#motionToggle").addEventListener("click", function () {
    motionEnabled = !motionEnabled;
    $("#motionToggle").classList.toggle("is-selected", motionEnabled);
    $("#motionToggle small").textContent = motionEnabled ? "Açık" : "Kapalı";
    document.body.classList.toggle("reduce-motion", !motionEnabled);
    if (riveInstance) {
      if (motionEnabled) riveInstance.play(); else riveInstance.pause();
    } else if (motionEnabled) initRive();
  });

  $("#adminDialog").addEventListener("close", function () {
    if ($("#adminDialog").returnValue === "confirm") showToast("Yönetici görünümü sonraki aşamada bağlanacak");
  });

  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") return;
    if ($("#adminDialog").open) return;
    if ($("#settingsSheet").classList.contains("is-open")) closeSettings();
    else closePanel();
  });

  document.addEventListener("visibilitychange", function () {
    if (riveInstance && motionEnabled) {
      if (document.hidden) riveInstance.pause(); else riveInstance.play();
    }
    if (!document.hidden) {
      refreshData(true);
      refreshSolarCycle();
    }
  });

  window.addEventListener("resize", function () {
    var selected = $("#view-" + currentView + " button");
    if (selected) positionAura(selected);
    if (riveInstance) riveInstance.resizeDrawingSurfaceToCanvas();
  });

  async function initialize() {
    applyWallpaper(storedWallpaper(), false);
    approximateSolarCycle();
    updateClock();
    window.setInterval(updateClock, 30000);
    refreshSolarCycle();
    window.setInterval(function () { if (!document.hidden) refreshSolarCycle(); }, 60000);
    initRive();
    try { await refreshSession(); } catch (error) { renderLoadFailure(error.message); return; }
    await refreshData(false);
    window.setInterval(function () { if (!document.hidden) refreshData(true); }, 12000);
    window.setTimeout(function () { positionAura($(".focus-row.is-selected")); }, 180);
  }

  initialize();
}());
