  function openAppMenu(button){
    const dialog=$("#appMenuDialog");
    if(!dialog||dialog.open)return;
    state.appMenuOpener=button||null;
    $$("[data-app-menu]").forEach(item=>item.setAttribute("aria-expanded","true"));
    dialog.showModal();
    const active=dialog.querySelector(".nav-button.active:not([hidden])")||dialog.querySelector(".nav-button");
    if(active)active.focus();
  }
  function closeAppMenu(){
    const dialog=$("#appMenuDialog");
    if(dialog&&dialog.open)dialog.close();
  }
  function toggleAppMenu(button){
    const dialog=$("#appMenuDialog");
    if(dialog&&dialog.open)closeAppMenu();
    else openAppMenu(button);
  }
  function activateView(viewName){
    closeAppMenu();
    if(viewName!=="home"&&state.dashboardEditing)setDashboardEditing(false);
    if(viewName!=="devices"&&!pullRefreshState.refreshing)resetPullRefresh();
    $$(".nav-button").forEach(item=>item.classList.toggle("active",item.dataset.view===viewName));
    $$(".view").forEach(view=>view.classList.toggle("active",view.id===viewName));
    document.body.dataset.activeView=viewName;
    if(viewName==="automations"){renderAutomations();loadAutomations().then(renderAutomations).catch(error=>showToast(error.message,true))}
    if(viewName!=="connections")stopMatterWatch();
    if(viewName==="connections")loadMatter();
    if(viewName==="connections")loadSettings();
    if(viewName==="settings")loadSettings();
    if(viewName==="home")requestAnimationFrame(maybeStartDashboardTour);
    if(viewName==="devices")requestAnimationFrame(maybeStartDeviceHint);
    closeScreensaver();
    scheduleScreensaver();
    scheduleIdleHomeReturn();
  }
  function showDevice(id,options={}){
    $("#search").value="";
    syncSearchClear();
    activateView("devices");
    filterDevices();
    bindCards();
    openDeviceDetail(id,options);
    requestAnimationFrame(()=>{
      const card=$$("[data-device-card]").find(item=>item.dataset.deviceCard===id);
      if(!card)return;
      card.classList.add("focused");
      card.scrollIntoView({behavior:reducedMotion()?"auto":"smooth",block:"center"});
      setTimeout(()=>card.classList.remove("focused"),1800);
    });
  }
  function navigateHomeMetric(metric){
    if(metric==="alerts"){
      const alertDevice=state.devices.find(isAlert);
      if(alertDevice){showDevice(alertDevice.id);return}
      if(state.settings?.debug?.enabled===true&&state.debugErrors.length){
        activateView("settings");
        requestAnimationFrame(()=>$("#debugCard").scrollIntoView({behavior:"smooth",block:"start"}));
        return;
      }
    }
    if(metric==="signal"){
      const weakest=[...state.devices]
        .filter(device=>rawLinkQuality(device)!==null)
        .sort((a,b)=>rawLinkQuality(a)-rawLinkQuality(b))[0];
      if(weakest){showDevice(weakest.id);return}
    }
    activateView("devices");
    $("#search").value="";
    filterDevices();
    bindCards();
    requestAnimationFrame(()=>$("#allDevices").scrollIntoView({behavior:"smooth",block:"start"}));
  }
  function applyDeviceLayout(){
    [$("#allDevices"),$("#attentionDevices")].forEach(container=>{
      container.classList.toggle("devices-grid-view",state.deviceLayout==="grid");
      container.classList.toggle("devices-list-view",state.deviceLayout==="list");
    });
    $$("[data-device-layout]").forEach(button=>{
      const active=button.dataset.deviceLayout===state.deviceLayout;
      button.classList.toggle("active",active);
      button.setAttribute("aria-pressed",String(active));
      const label=t(button.dataset.deviceLayout==="grid"?"gridView":"listView");
      button.setAttribute("aria-label",label);
      button.title=label;
    });
    $("[data-device-layout-toggle]").setAttribute("aria-label",t("deviceLayout"));
    const gridMode=state.deviceLayout==="grid";
    applyDeviceColumns(state.deviceColumns);
    $("[data-device-columns-field]").hidden=!gridMode;
    $("#deviceColumns").value=String(state.deviceColumns);
    $("#deviceColumns").disabled=!gridMode;
    $("#deviceColumns").setAttribute("aria-label",t("devicesPerRow"));
  }
  const effectiveDeviceColumns=columns=>{
    const value=Math.min(4,Math.max(1,Math.round(Number(columns))||1));
    const width=window.innerWidth||0;
    if(width<=560)return Math.min(value,2);
    if(width<=900)return Math.min(value,3);
    if(width<=1150)return Math.min(value,4);
    return value;
  };
  function applyDeviceColumns(columns){
    document.documentElement.style.setProperty("--device-columns",String(columns));
    [$("#allDevices"),$("#attentionDevices")].forEach(container=>container.dataset.deviceColumns=String(columns));
    $("#deviceColumnsValue").textContent=String(effectiveDeviceColumns(columns));
  }
  function setDeviceLayout(layout){
    state.deviceLayout=layout==="list"?"list":"grid";
    try{localStorage.setItem("villa-device-layout",state.deviceLayout)}catch{}
    applyDeviceLayout();
    /* İki kipin içeriği farklıdır (kart ↔ tablo), yalnız sınıf değiştirmek yetmez; yeniden çizilir. */
    filterDevices();
    bindCards();
  }
  function setAttentionOpen(open){
    state.attentionOpen=open===true;
    try{localStorage.setItem("villa-attention-open",String(state.attentionOpen))}catch{}
  }
  function setDeviceColumns(value){
    const columns=Math.min(4,Math.max(1,Math.round(Number(value))||1));
    state.deviceColumns=columns;
    try{localStorage.setItem("villa-device-columns",String(columns))}catch{}
    applyDeviceLayout();
  }
  function applyTheme(){
    const resolved=state.themeMode==="system"?(themeMedia?.matches?"dark":"light"):state.themeMode;
    document.documentElement.dataset.theme=resolved;
    document.documentElement.style.colorScheme=resolved;
    document.querySelector('meta[name="theme-color"]').content=resolved==="dark"?"#101514":"#edf0f2";
    $$("[data-theme-mode]").forEach(button=>{
      const active=button.dataset.themeMode===state.themeMode;
      button.classList.toggle("active",active);
      button.setAttribute("aria-pressed",String(active));
      button.title=t(`theme${button.dataset.themeMode[0].toUpperCase()}${button.dataset.themeMode.slice(1)}`);
    });
    $$(".theme-switch").forEach(group=>group.setAttribute("aria-label",t("appearance")));
    const resolvedLabel=t(resolved==="dark"?"themeDark":"themeLight");
    $$("[data-theme-toggle]").forEach(button=>{
      button.setAttribute("aria-label",`${t("appearance")}: ${resolvedLabel}`);
      button.title=`${t("appearance")}: ${resolvedLabel}`;
    });
  }
  function setThemeMode(mode){
    if(!["light","dark","system"].includes(mode))return;
    state.themeMode=mode;
    try{localStorage.setItem("villa-theme",state.themeMode)}catch{}
    applyTheme();
  }
  function applyLanguage(){
    document.documentElement.lang=state.language;
    $$("[data-i18n]").forEach(element=>element.textContent=t(element.dataset.i18n));
    $("#addWidget").setAttribute("aria-label",t("addWidget"));
    $("#addWidget").title=t("addWidget");
    $("#devicesAddDevice").setAttribute("aria-label",t("addDevice"));
    $("#devicesAddDevice").title=t("addDevice");
    $("#refreshButton").setAttribute("aria-label",t("refresh"));
    $("#refreshButton").title=t("refresh");
    $("#homeHub").setAttribute("aria-label",t("hubLabel"));
    $("#hubClockZone").setAttribute("aria-label",t("hubClockZoneLabel"));
    $("#hubClockZone").title=t("hubClockTitle");
    $("#hubWeatherZone").setAttribute("aria-label",t("hubWeatherZoneLabel"));
    $("#hubWeatherZone").title=t("weather");
    $("#widgetScrollLeft").setAttribute("aria-label",t("moreWidgetsLeft"));
    $("#widgetScrollLeft").title=t("moreWidgetsLeft");
    $("#widgetScrollHint").setAttribute("aria-label",t("moreWidgetsRight"));
    $("#widgetScrollHint").title=t("moreWidgetsRight");
    $("#quickScrollLeft").setAttribute("aria-label",t("moreQuickControlsLeft"));
    $("#quickScrollLeft").title=t("moreQuickControlsLeft");
    $("#quickScrollRight").setAttribute("aria-label",t("moreQuickControlsRight"));
    $("#quickScrollRight").title=t("moreQuickControlsRight");
    $("#screensaver").setAttribute("aria-label",t("screensaverTitle"));
    setLoginMode(state.loginMode);
    applyAuthUi();
    $$("[data-i18n-placeholder]").forEach(element=>element.placeholder=t(element.dataset.i18nPlaceholder));
    $$("[data-i18n-aria]").forEach(element=>element.setAttribute("aria-label",t(element.dataset.i18nAria)));
    $("#clearSearch").setAttribute("aria-label",t("clearSearch"));
    $("#clearSearch").title=t("clearSearch");
    $$("[data-language]").forEach(button=>button.classList.toggle("active",button.dataset.language===state.language));
    $$(".language-switch").forEach(group=>group.setAttribute("aria-label",t("language")));
    const languageLabel=`${t("language")}: ${languageMetadata[state.language]?.name||state.language.toUpperCase()}`;
    $$("[data-language-cycle]").forEach(button=>{
      button.setAttribute("aria-label",languageLabel);
      button.title=languageLabel;
    });
    $("#closeLight").setAttribute("aria-label",t("close"));
    if($("#nameDialog").open)configureNameDialog(state.editing?.afterPairing===true,state.editing?.reconnected===true);
    if($("#imageDialog").open)renderImageChooser();
    if($("#deviceRoleDialog").open)renderDeviceRoleDialog();
    if($("#deviceRoomDialog").open)renderDeviceRoomDialog();
    if($("#widgetDialog").open){$("#groupDialogTitle").textContent=t(state.groupEditing?.id?"editGroup":"createDeviceGroup");renderRoomSuggestions();updateGroupOrderControls();renderGroupDeviceChoices();renderWidgetCatalog()}
    if($("#clockDialog").open){renderClockDialogRows();renderLocationSearchResults("clock")}
    if($("#weatherDialog").open)renderWeatherDialog();
    if($("#weatherLocationDialog").open)renderLocationSearchResults("weather");
    if($("#homeLocationDialog").open){renderHomeLocationDialog();renderLocationSearchResults("home")}
    if($("#simpleLinkDialog").open)renderSimpleLink();
    if($("#automationDialog").open)renderAutomationWizard();
    renderHomeLocation();
    render();
    renderFabrics();
    renderHomeAssistant();
    renderConnectedServerAddress();
    renderDebugSettings();
    renderDebugErrors();
    renderDebugNetworkEvents();
    applyWidgetLayout();
    applyDeviceLayout();
    applyTheme();
    if($("#onboardingDialog").open)renderOnboarding();
    if(state.coach)renderCoach();
  }
  const screensaverDelay=120000;
  let screensaverTimer=null;
  let screensaverClockTimer=null;
  function clearScreensaverTimer(){if(screensaverTimer!==null){clearTimeout(screensaverTimer);screensaverTimer=null}}
  function clearScreensaverClock(){if(screensaverClockTimer!==null){clearTimeout(screensaverClockTimer);screensaverClockTimer=null}}
  function screensaverAllowed(){
    return document.body.dataset.activeView==="home"
      &&!document.querySelector("dialog[open]");
  }
  function scheduleScreensaver(){
    clearScreensaverTimer();
    if(document.body.dataset.activeView!=="home")return;
    screensaverTimer=setTimeout(()=>{
      screensaverTimer=null;
      if(screensaverAllowed())openScreensaver();
      else scheduleScreensaver();
    },screensaverDelay);
  }
  const idleHomeReturnDelay=300000;
  let idleHomeReturnTimer=null;
  function clearIdleHomeReturn(){if(idleHomeReturnTimer!==null){clearTimeout(idleHomeReturnTimer);idleHomeReturnTimer=null}}
  function typingInField(){
    const element=document.activeElement;
    return element?.tagName==="INPUT"||element?.tagName==="TEXTAREA";
  }
  function idleHomeReturnAllowed(){
    return document.body.dataset.activeView!=="home"
      &&!document.querySelector("dialog[open]")
      &&!state.pairingSession
      &&!$("#onboardingDialog").open
      &&!typingInField();
  }
  function scheduleIdleHomeReturn(){
    clearIdleHomeReturn();
    if(document.body.dataset.activeView==="home")return;
    idleHomeReturnTimer=setTimeout(()=>{
      idleHomeReturnTimer=null;
      if(idleHomeReturnAllowed())activateView("home");
      else scheduleIdleHomeReturn();
    },idleHomeReturnDelay);
  }
  function scheduleScreensaverClock(){
    clearScreensaverClock();
    const now=new Date();
    screensaverClockTimer=setTimeout(()=>{
      screensaverClockTimer=null;
      if(!state.screensaverOpen)return;
      renderScreensaver();
      scheduleScreensaverClock();
    },(60-now.getSeconds())*1000-now.getMilliseconds()+40);
  }
  function renderScreensaver(){
    const locale=state.language==="tr"?"tr-TR":"en-GB";
    const now=new Date();
    $("#screensaverClock").textContent=new Intl.DateTimeFormat(locale,{hour:"2-digit",minute:"2-digit",hour12:false}).format(now);
    $("#screensaverDate").textContent=new Intl.DateTimeFormat(locale,{weekday:"long",day:"numeric",month:"long"}).format(now);
    const weather=$("#screensaverWeather");
    const current=weatherState.data?.current;
    const temperature=Number(current?.temperature_2m);
    if(Number.isFinite(temperature)){
      const presentation=weatherPresentation(Number(current.weather_code),Number(current.is_day)!==0);
      const units=weatherState.data.current_units||{};
      weather.innerHTML=`<span class="screensaver-weather-icon" aria-hidden="true">${presentation.icon}</span><span>${Math.round(temperature)}${esc(units.temperature_2m||"°C")} · ${t(presentation.label)}</span>`;
      weather.hidden=false;
    }else{
      weather.innerHTML="";
      weather.hidden=true;
    }
    const alertBox=$("#screensaverAlert");
    const critical=state.devices.filter(device=>criticalAlert(device));
    if(critical.length){
      const device=critical[0];
      const alert=criticalAlert(device);
      const message=t(criticalAlertKeys[alert.code]||"deviceNeedsAttention",{name:device.name});
      alertBox.textContent=critical.length>1?`${message} ${t("moreCriticalAlerts",{count:critical.length-1})}`:message;
      alertBox.hidden=false;
    }else{
      alertBox.textContent="";
      alertBox.hidden=true;
    }
  }
  function openScreensaver(){
    if(state.screensaverOpen)return;
    state.screensaverOpen=true;
    document.body.classList.add("screensaver-open");
    const overlay=$("#screensaver");
    overlay.hidden=false;
    renderScreensaver();
    scheduleScreensaverClock();
    overlay.focus();
  }
  function closeScreensaver(){
    clearScreensaverClock();
    if(!state.screensaverOpen)return;
    state.screensaverOpen=false;
    document.body.classList.remove("screensaver-open");
    $("#screensaver").hidden=true;
  }
  function dismissScreensaver(event){
    if(event){event.preventDefault();event.stopPropagation()}
    closeScreensaver();
    scheduleScreensaver();
  }
  function bindScreensaver(){
    const overlay=$("#screensaver");
    overlay.addEventListener("pointerdown",event=>{event.preventDefault();event.stopPropagation()});
    ["pointerup","click","keydown","wheel"].forEach(type=>overlay.addEventListener(type,dismissScreensaver));
    ["pointerdown","keydown","wheel"].forEach(type=>document.addEventListener(type,()=>{if(!state.screensaverOpen){scheduleScreensaver();scheduleIdleHomeReturn()}},{capture:true,passive:true}));
    scheduleScreensaver();
    scheduleIdleHomeReturn();
  }
  function bindLanguageButtons(){
    $$("[data-language]").forEach(button=>button.onclick=()=>setLanguage(button.dataset.language));
  }
  async function loadLanguages(){
    const data=await api("/api/locales");
    for(const locale of data.locales||[]){
      if(!locale?.code||!locale?.translations)continue;
      translations[locale.code]=locale.translations;
      languageMetadata[locale.code]={name:locale.name||locale.code};
    }
    const available=Object.keys(translations);
    if(!available.length)throw new Error("No language packs found.");
    state.language=translations[state.language]?state.language:(translations[data.defaultLanguage]?data.defaultLanguage:available[0]);
    const languageButtons=available.map(code=>`<button type="button" data-language="${esc(code)}" title="${esc(languageMetadata[code]?.name||code)}">${esc(code.toUpperCase())}</button>`).join("");
    $$(".language-switch").forEach(group=>{group.innerHTML=languageButtons});
    bindLanguageButtons();
  }
  function setLanguage(language){
    if(!translations[language])return;
    state.language=language;
    try{localStorage.setItem("villa-language",state.language)}catch{}
    applyLanguage();
  }
  function cycleLanguage(){
    const available=Object.keys(translations);
    if(available.length<2)return;
    const index=Math.max(0,available.indexOf(state.language));
    setLanguage(available[(index+1)%available.length]);
  }
