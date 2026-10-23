(function () {
  "use strict";

  var $ = function (selector, root) { return (root || document).querySelector(selector); };
  var $$ = function (selector, root) { return Array.prototype.slice.call((root || document).querySelectorAll(selector)); };
  var toastTimer = null;
  var riveInstance = null;
  var currentView = "home";
  var motionEnabled = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var details = {
    "living-light": { eyebrow: "Favori cihaz", title: "Salon anahtarı", kind: "Işık", on: true, value: 72, room: "Salon" },
    "balcony-light": { eyebrow: "Favori cihaz", title: "Balkon lambası", kind: "Işık", on: false, value: 0, room: "Bahçe" },
    "curtain": { eyebrow: "Favori cihaz", title: "Salon perdesi", kind: "Perde", on: true, value: 68, room: "Salon" },
    "fan": { eyebrow: "Favori cihaz", title: "Tuvalet fanı", kind: "Anahtar", on: false, value: 0, room: "Banyo" }
  };

  function icon(id) {
    return '<svg aria-hidden="true"><use href="#' + id + '"></use></svg>';
  }

  function updateClock() {
    var now = new Date();
    $("#clock").textContent = now.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
    $("#date").textContent = now.toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long" });
  }

  function showToast(message) {
    var toast = $("#toast");
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add("is-visible");
    toastTimer = window.setTimeout(function () { toast.classList.remove("is-visible"); }, 2200);
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

  function openPanel(config, roomName) {
    var overlay = $("#panelOverlay");
    var panel = $("#sidePanel");
    var content = $("#panelContent");
    var isRoom = Boolean(roomName);
    $("#panelEyebrow").textContent = isRoom ? "Oda kontrolleri" : config.eyebrow;
    $("#panelTitle").textContent = isRoom ? roomName : config.title;
    if (isRoom) {
      content.innerHTML =
        '<article class="control-card"><span>Oda durumu</span><div class="control-main"><strong>3 cihaz bağlı</strong><button type="button" class="switch is-on" aria-label="Odadaki her şeyi aç"></button></div></article>' +
        '<div class="metric-grid"><article class="metric"><span>Sıcaklık</span><strong>22.4°</strong></article><article class="metric"><span>Nem</span><strong>%48</strong></article></div>' +
        '<article class="control-card"><span>Cihazlar</span><div class="control-main"><strong>Ana ışık</strong><button type="button" class="switch is-on"></button></div><div class="control-main"><strong>Perde</strong><span>%68 açık</span></div></article>';
    } else {
      content.innerHTML =
        '<article class="control-card"><span>' + config.kind + '</span><div class="control-main"><strong>' + (config.on ? "Açık" : "Kapalı") + '</strong><button type="button" class="switch ' + (config.on ? "is-on" : "") + '" aria-label="Aç veya kapat"></button></div>' +
        (config.kind === "Işık" || config.kind === "Perde" ? '<div class="range-line" aria-label="Seviye ' + config.value + '"></div>' : '') + '</article>' +
        '<div class="metric-grid"><article class="metric"><span>Oda</span><strong>' + config.room + '</strong></article><article class="metric"><span>Bağlantı</span><strong>İyi</strong></article></div>' +
        '<article class="control-card"><span>Hızlı bilgi</span><div class="control-main"><strong>Son değişiklik</strong><span>2 dk önce</span></div></article>';
    }
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
    window.setTimeout(function () { overlay.hidden = true; }, 260);
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

  function runScene(button) {
    var name = button.dataset.scene;
    button.classList.add("is-running");
    showToast(name + " sahnesi çalıştırıldı");
    window.setTimeout(function () { button.classList.remove("is-running"); }, 1100);
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

  $$("[data-view]").forEach(function (button) {
    button.addEventListener("click", function () { setView(button.dataset.view); });
  });

  $$("[data-open]").forEach(function (button) {
    button.addEventListener("click", function () {
      if (button.dataset.open === "settings") openSettings();
      if (button.dataset.open === "weather") showToast("14° · Yağmur ihtimali %20 · En yüksek 16°");
      if (button.dataset.open === "admin") $("#adminDialog").showModal();
    });
  });

  $$("[data-close='panel']").forEach(function (button) { button.addEventListener("click", closePanel); });
  $$("[data-close='settings']").forEach(function (button) { button.addEventListener("click", closeSettings); });
  $("#panelOverlay").addEventListener("click", closePanel);

  $$("[data-detail]").forEach(function (button) {
    button.addEventListener("click", function () {
      $$("[data-detail]").forEach(function (item) { item.classList.toggle("is-selected", item === button); });
      openPanel(details[button.dataset.detail]);
    });
  });
  $$("[data-room]").forEach(function (button) { button.addEventListener("click", function () { openPanel(null, button.dataset.room); }); });
  $$("[data-scene]").forEach(function (button) { button.addEventListener("click", function () { runScene(button); }); });

  $$(".focus-row, .dock-items button, .room-grid button, .routine-list button").forEach(function (button) {
    button.addEventListener("pointerenter", function () { positionAura(button); });
    button.addEventListener("focus", function () { positionAura(button); });
  });

  document.addEventListener("click", function (event) {
    var switchButton = event.target.closest(".switch");
    if (switchButton) switchButton.classList.toggle("is-on");
  });

  $$("[data-wallpaper]").forEach(function (button) {
    button.addEventListener("click", function () {
      $$("[data-wallpaper]").forEach(function (item) { item.classList.toggle("is-selected", item === button); });
      document.body.classList.toggle("is-flat", button.dataset.wallpaper === "calm");
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
    if ($("#adminDialog").returnValue === "confirm") showToast("Prototip: Yönetici görünümü burada açılacak");
  });

  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") return;
    if ($("#adminDialog").open) return;
    if ($("#settingsSheet").classList.contains("is-open")) closeSettings();
    else closePanel();
  });

  document.addEventListener("visibilitychange", function () {
    if (!riveInstance || !motionEnabled) return;
    if (document.hidden) riveInstance.pause(); else riveInstance.play();
  });

  window.addEventListener("resize", function () {
    var selected = $("#view-" + currentView + " button");
    if (selected) positionAura(selected);
    if (riveInstance) riveInstance.resizeDrawingSurfaceToCanvas();
  });

  updateClock();
  window.setInterval(updateClock, 30000);
  initRive();
  window.setTimeout(function () { positionAura($(".focus-row.is-selected")); }, 180);
}());
