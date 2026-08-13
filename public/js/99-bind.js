  /* TEK KAPI: her `showModal()` sonrası odak pencerenin başlığına taşınır. Tarayıcı, `autofocus`
     yokken diyalogun ilk odaklanabilir öğesine odaklanır — bu çoğu pencerede bir metin alanı ve
     tablette Android klavyesi açılıp ekranın yarısını kapatıyordu. Açan yer sonradan başka bir
     öğeye odaklanmak isterse (düğme, sekme) kendi çağrısı bunun ÜSTÜNE yazar; çağrı sırası
     korunur. Diyalog başına ayrı kural yazılmaz, yeni pencereler de kendiliğinden uyar. */
  const nativeShowModal=HTMLDialogElement.prototype.showModal;
  HTMLDialogElement.prototype.showModal=function(...args){
    nativeShowModal.apply(this,args);
    focusModalHeading(this);
  };
  $$(".nav-button").forEach(button=>button.onclick=()=>activateView(button.dataset.view));
  $$("[data-app-menu]").forEach(button=>button.onclick=()=>toggleAppMenu(button));
  // Ana ekrandaki "Otomasyon" gibi kestirme düğmeler: pencere açmaz, doğrudan görünüm değiştirir.
  // `.nav-button` DEĞİL — o sınıf menü ızgarasının biçimini ve `active` işaretini taşıyor.
  // (Alt sayfa başlıklarındaki düğme artık ana ekrana atmıyor, menüyü açıyor — yukarıdaki
  // `[data-app-menu]` kancası hepsini birden bağlıyor; ana ekrana dönüş menüdeki Home satırında.)
  $$("[data-view-link]").forEach(button=>button.onclick=()=>activateView(button.dataset.viewLink));
  $("#closeAppMenu").onclick=closeAppMenu;
  $("#appMenuDialog").addEventListener("close",()=>{
    $$("[data-app-menu]").forEach(item=>item.setAttribute("aria-expanded","false"));
    const opener=state.appMenuOpener;
    state.appMenuOpener=null;
    if(opener&&opener.isConnected&&opener.offsetParent!==null)opener.focus();
  });
  $("#appMenuDialog").addEventListener("click",event=>{if(event.target===$("#appMenuDialog"))closeAppMenu()});
  $$("[data-device-layout]").forEach(button=>button.onclick=()=>setDeviceLayout(button.dataset.deviceLayout));
  window.addEventListener("resize",()=>{if(state.deviceLayout==="grid")applyDeviceColumns(state.deviceColumns)},{passive:true});
  function syncSearchClear(){$("#clearSearch").hidden=$("#search").value.length===0}
  $("#clearSearch").onclick=()=>{$("#search").value="";syncSearchClear();filterDevices();bindCards();$("#search").focus()};
  $("#deviceAttention").ontoggle=()=>setAttentionOpen($("#deviceAttention").open);
  $("#deviceColumns").oninput=()=>applyDeviceColumns($("#deviceColumns").value);
  $("#deviceColumns").onchange=()=>setDeviceColumns($("#deviceColumns").value);
  $$("[data-theme-mode]").forEach(button=>button.onclick=()=>setThemeMode(button.dataset.themeMode));
  $$("[data-theme-toggle]").forEach(button=>button.onclick=()=>setThemeMode(document.documentElement.dataset.theme==="dark"?"light":"dark"));
  $$("[data-language-cycle]").forEach(button=>button.onclick=cycleLanguage);
  /* ARKA PLAN AYARLARI. Kaydırıcılar `input` ile ANINDA boyar (canlı önizleme), kayıt
     `updateSkySettings` içinde gecikmeli — sürüklerken kare başına iş yalnız birkaç değişken
     yazımı, yeniden düzen yok. */
  $$("[data-sky-milkyway]").forEach(button=>button.onclick=()=>updateSkySettings({milkyway:button.dataset.skyMilkyway}));
  $("#skyDensity").oninput=()=>updateSkySettings({density:Number($("#skyDensity").value)/100});
  $("#skyStarGain").oninput=()=>updateSkySettings({starGain:Number($("#skyStarGain").value)/100});
  $("#skyMountainOn").onchange=()=>updateSkySettings({mountain:$("#skyMountainOn").checked});
  $("#skyMountainHeight").oninput=()=>updateSkySettings({mountainHeight:Number($("#skyMountainHeight").value)});
  $("#skyResetButton").onclick=resetSkySettings;
  $("#skyModeSwitch").onclick=()=>setThemeMode("sun");
  /* SAAT ÖNİZLEMESİ. Kaydırıcı gökyüzünü sürüklendiği dakikada dondurur, hızlı sıçramalar gerçek
     gün doğumu/batımından hesaplanır, "şimdiye dön" ve rozet önizlemeyi kapatır. Hiçbir yere
     kaydedilmez; arka plan sayfasından çıkınca `activateView` zaten kapatıyor. */
  /* OYNAT/DURAKLAT: aynı 40 sn'lik döngüyü (`?sky=preview` ile ortak) açar/kapatır; duraklatınca
     saat bulunduğu dakikada donar. Kaydırıcıya ya da sıçrama çipine dokunmak akışı bitirir. */
  $("#skyPreviewPlay").onclick=()=>setSkyPlay(!skyPlay.on);
  $("#skyPreviewHour").oninput=()=>setSkyScrub(Number($("#skyPreviewHour").value));
  $$("[data-sky-jump]").forEach(button=>button.onclick=()=>setSkyScrub(skyScrubMarks()[button.dataset.skyJump]));
  $("#skyPreviewNow").onclick=()=>setSkyScrub(null);
  $("#skyPreviewBadge").onclick=()=>setSkyScrub(null);
  /* AY EVRESİ ÖNİZLEMESİ. Kaydırıcı bir sinodik ayı 0..100 olarak sürer, sıçramalar dördünlere
     oturur, "gerçek evre" yalnız evreyi bırakır (saat donmuşsa donmuş kalır); rozet ve "şimdiye
     dön" ikisini birden kapatır. */
  $("#skyPreviewPhase").oninput=()=>setSkyPhase(Number($("#skyPreviewPhase").value)/100);
  const skyMoonMarks={new:0,first:.25,full:.5,last:.75};
  $$("[data-sky-moon]").forEach(button=>button.onclick=()=>setSkyPhase(skyMoonMarks[button.dataset.skyMoon]));
  $("#skyPreviewMoonNow").onclick=()=>setSkyPhase(null);
  /* Önizleme sahnesinin ölçeği çerçevesinin iki kenarından çıkar; düzen yeniden boyutlanınca
     (tablet dönünce, pencere değişince, tek sütuna düşünce) yeniden ölçülmeli. `ResizeObserver`
     varsa hem ızgayı hem çerçeveyi izler — düzenin oturduğu anı yakalayan tek yol o. `resize`
     olayı her hâlde bağlanır: pencere yalnız BOYCA değişirse genişlikler sabit kalır ve
     gözlemci hiç tetiklenmez. */
  const skyStageFrame=$(".sky-stage-frame");
  const skyLayout=$(".sky-layout");
  if(typeof ResizeObserver==="function"){
    const skyStageObserver=new ResizeObserver(measureSkyStage);
    if(skyLayout)skyStageObserver.observe(skyLayout);
    if(skyStageFrame)skyStageObserver.observe(skyStageFrame);
  }
  window.addEventListener("resize",measureSkyStage);
  /* "Güneşe göre" kipi de dinler: gün doğumu/batımı hiç bilinmiyorsa o kip sistem tercihine
     düşüyor, o hâlde sistem değişince yeniden boyanmalı. */
  const handleSystemThemeChange=()=>{if(state.themeMode==="system"||state.themeMode==="sun")applyTheme()};
  if(themeMedia){
    if(typeof themeMedia.addEventListener==="function")themeMedia.addEventListener("change",handleSystemThemeChange);
    else if(typeof themeMedia.addListener==="function")themeMedia.addListener(handleSystemThemeChange);
  }
  $("#hidePairing").onclick=()=>{if(state.pairingSession)state.pairingSession.hidden=true;$("#pairingDialog").close();render()};
  $("#showPairing").onclick=()=>{if(!state.pairingSession)return;state.pairingSession.hidden=false;renderPairingProgress();$("#pairingDialog").showModal();render()};
  $("#cancelPairing").onclick=()=>startPairing(false);
  $("#pairingDialog").onclose=()=>{if(state.pairingSession&&state.pairing?.open)state.pairingSession.hidden=true;render()};
  $("#nameForm").onsubmit=event=>{event.preventDefault();saveName()};
  $("#cancelName").onclick=cancelName;
  $("#nameDialog").onclose=()=>{const editing=state.editing;state.editing=null;if(editing?.afterPairing)continuePairingFlow(editing.id)};
  $("#noteForm").onsubmit=saveDeviceNote;
  $("#cancelNote").onclick=()=>$("#noteDialog").close();
  $("#noteDialog").onclose=()=>{state.noteEditing=null};
  $("#deviceOptionsForm").onsubmit=saveDeviceOptions;
  $("#cancelDeviceOptions").onclick=()=>$("#deviceOptionsDialog").close();
  $("#deviceOptionsDialog").onclose=()=>{state.optionsDevice=null};
  $("#imageForm").onsubmit=event=>{event.preventDefault();saveImage()};
  $("#cancelImage").onclick=()=>$("#imageDialog").close();
  $("#imageDialog").onclose=()=>{const editing=state.imageEditing;state.imageEditing=null;$("#saveImage").disabled=false;if(editing?.afterPairing)askDeviceRole(editing.id,true)};
  $("#skipDeviceRole").onclick=()=>$("#deviceRoleDialog").close();
  /* Rolden sonra oda adımı gelir; oda atlanırsa cihaz "Odasız" kartında bekler. */
  $("#deviceRoleDialog").onclose=()=>{const editing=state.roleEditing;state.roleEditing=null;if(editing?.afterPairing)askDeviceRoom(editing.id,true);else render()};
  $("#skipDeviceRoom").onclick=()=>$("#deviceRoomDialog").close();
  $("#deviceRoomForm").onsubmit=createDeviceRoom;
  $("#closeDeviceLost").onclick=closeDeviceLost;$("#retryDeviceLost").onclick=retryDeviceLost;$("#deviceLostDialog").onclose=()=>{state.deviceLost=null};
  $("#deviceRoomDialog").onclose=()=>{const editing=state.roomEditing;state.roomEditing=null;if(editing?.afterPairing)finishPairingFlow(editing.id);else render()};
  $("#groupForm").onsubmit=event=>{event.preventDefault();saveDashboardGroup()};
  $("#groupName").oninput=updateGroupSelection;
  /* Cihaz süzgeci yalnız listeyi yeniden çizer; seçim kümesine dokunmaz. Enter formu
     göndermesin — arama kutusundayken kaydetme beklenmeyen bir sonuç olur. */
  $("#groupDeviceSearch").oninput=renderGroupDeviceChoices;
  $("#groupDeviceSearch").onkeydown=event=>{if(event.key==="Enter")event.preventDefault()};
  $("#cancelGroup").onclick=closeAddDialog;
  $("#deleteGroup").onclick=requestGroupDelete;$("#groupMoveLeft").onclick=()=>moveDashboardGroup(-1);$("#groupMoveRight").onclick=()=>moveDashboardGroup(1);$("#cancelGroupDelete").onclick=()=>$("#groupDeleteDialog").close();$("#confirmGroupDelete").onclick=confirmGroupDelete;$("#groupDeleteDialog").onclose=()=>{state.groupDeleting=null};
  $$("[data-open-group-create]").forEach(button=>button.onclick=()=>openGroupEditor());
  $("#closeDeviceActions").onclick=()=>$("#deviceActionDialog").close();
  $("#confirmDeviceAction").onclick=()=>{const pending=state.pendingConfirm;$("#deviceActionDialog").close();if(!pending)return;command(pending.id,pending.property,pending.value)};
  $("#deviceActionDialog").onclose=()=>{state.pendingConfirm=null};
  $("#onboardingNext").onclick=nextOnboardingStep;
  $("#onboardingBack").onclick=previousOnboardingStep;
  $("#skipOnboarding").onclick=skipOnboarding;
  $("#onboardingDialog").oncancel=event=>event.preventDefault();
  $("#authSetupForm").onsubmit=submitAuthSetup;
  $("#authLoginForm").onsubmit=submitAuthLogin;
  $("#authSetupForm").addEventListener("input",()=>setAuthFormError("authSetupError"));
  $("#authLoginForm").addEventListener("input",()=>setAuthFormError("authLoginError"));
  $$("[data-login-mode]").forEach(button=>button.onclick=()=>setLoginMode(button.dataset.loginMode));
  $$("[data-auth-logout]").forEach(button=>button.onclick=signOut);
  $("#residentPinForm").onsubmit=updateResidentPin;
  $("#adminPasswordForm").onsubmit=updateAdminPassword;
  $("#adminPasswordForm").addEventListener("input",()=>setAuthFormError("adminPasswordError"));
  $("#coachNext").onclick=nextCoachStep;
  $("#coachBack").onclick=previousCoachStep;
  $("#coachSkip").onclick=finishCoach;
  $("#agentTokenForm").onsubmit=createAgentToken;
  $("#copyAgentToken").onclick=copyAgentToken;
  $("#restartOnboarding").onclick=openOnboarding;
  $("#restartDashboardTour").onclick=restartDashboardGuide;
  $("#downloadZigbeeBackup").onclick=downloadZigbeeBackup;
  $("#chooseZigbeeRestore").onclick=()=>$("#zigbeeRestoreFile").click();
  $("#zigbeeRestoreFile").onchange=restoreZigbeeBackup;
  $("#downloadHomeBackup").onclick=downloadHomeBackup;
  $("#chooseHomeRestore").onclick=()=>$("#homeRestoreFile").click();
  $("#homeRestoreFile").onchange=chooseHomeRestore;
  $("#cancelHomeRestore").onclick=closeHomeRestore;
  $("#confirmHomeRestore").onclick=applyHomeRestore;
  $$("input[name=homeBackupMode]").forEach(radio=>{radio.onchange=previewHomeBackup});
  $("#addInstallCode").onclick=addInstallCode;
  $("#scanTouchlink").onclick=scanTouchlink;
  $("#scanNetworkMap").onclick=scanNetworkMap;
  $("#createZigbeeGroup").onclick=createZigbeeGroup;
  $("#bindDevices").onclick=()=>bindZigbeeDevices(true);
  $("#unbindDevices").onclick=()=>bindZigbeeDevices(false);
  $("#bindSource").onchange=renderBindingEndpoints;
  $("#bindTarget").onchange=renderBindingEndpoints;
  // "Yeni otomasyon" doğrudan modalı açar; yol seçimi de modalin ilk adımıdır.
  $("#newAutomation").onclick=()=>openAutomationWizard();
  $("#simpleLinkBack").onclick=stepBackSimpleLink;
  $("#simpleLinkSave").onclick=saveSimpleLink;
  $("#simpleLinkDialog").addEventListener("close",()=>{state.simpleLink=null});
  bindBackdropClose("#simpleLinkDialog",".simple-link-modal",()=>$("#simpleLinkDialog").close());
  $("#automationBack").onclick=stepBackAutomation;
  $("#automationNext").onclick=nextAutomationStep;
  $("#closeAutomationWizard").onclick=closeAutomationWizard;
  $("#automationDialog").addEventListener("close",()=>{cancelAutomationAdvance();state.automationWizard=null});
  bindBackdropClose("#automationDialog",".automation-modal",closeAutomationWizard);
  $("#closeAutomationActions").onclick=()=>$("#automationActionDialog").close();
  $("#runAutomationNow").onclick=runAutomationNow;
  $("#editAutomation").onclick=()=>{const id=state.automationContext;$("#automationActionDialog").close();if(id)openAutomationWizard(id)};
  $("#duplicateAutomation").onclick=duplicateAutomation;
  $("#deleteAutomation").onclick=deleteAutomation;
  $("#revertAgentAutomations").onclick=revertAgentAutomations;
  $("#automationActionDialog").onclose=()=>{state.automationContext=null};
  window.addEventListener("resize",()=>{if(state.coach)positionCoach();updateWidgetScrollHint()});
  $$(".add-device").forEach(button=>button.onclick=()=>startPairing(true));$("#stopPairing").onclick=()=>startPairing(false);$("#refreshButton").onclick=refresh;$("#search").oninput=()=>{syncSearchClear();filterDevices();bindCards()};$("#removeConfirmation").oninput=()=>{const disabled=!state.removing||!validRemovalConfirmation($("#removeConfirmation").value,state.removing.name);$("#confirmRemove").disabled=disabled;$("#forceRemove").disabled=disabled};$("#cancelRemove").onclick=()=>{$("#removeDialog").close();state.removing=null};$("#confirmRemove").onclick=()=>confirmDeviceRemoval(false);$("#forceRemove").onclick=()=>confirmDeviceRemoval(true);$("#openMatter").onclick=()=>loadMatter(true);$("#closeMatter").onclick=closeMatterDialog;$("#closeLight").onclick=()=>$("#lightDialog").close();$("#lightDialog").addEventListener("close",()=>{state.lightPointerDown=false});$("#lightControls").addEventListener("pointerdown",()=>{state.lightPointerDown=true},{passive:true});["pointerup","pointercancel"].forEach(type=>$("#lightControls").addEventListener(type,()=>{state.lightPointerDown=false},{passive:true}));$("#closeDeviceDetail").onclick=closeDeviceDetail;$("#deviceDetailDialog").addEventListener("close",()=>{state.detailDevice=null;state.detailFromPairing=false;state.detailPointerDown=false});$("#deviceDetailBody").addEventListener("pointerdown",()=>{state.detailPointerDown=true},{passive:true});["pointerup","pointercancel"].forEach(type=>$("#deviceDetailBody").addEventListener(type,()=>{state.detailPointerDown=false},{passive:true}));$("#showLightDevice").onclick=()=>{const id=state.lightDevice;$("#lightDialog").close();if(id)showDevice(id)};$("#settingsForm").onsubmit=saveSettings;$("#homeLocationManualForm").onsubmit=saveHomeLocationForm;$("#chooseHomeLocation").onclick=openHomeLocationManager;$("#closeHomeLocationDialog").onclick=()=>$("#homeLocationDialog").close();$("#homeLocationSearch").oninput=()=>scheduleLocationSearch("home");$("#useWeatherLocationForHome").onclick=useWeatherLocationForHome;$("#toggleHaSetup").onclick=toggleHomeAssistantSetup;$("#toggleHaDiscovery").onclick=toggleHomeAssistantDiscovery;$("#toggleHaPassword").onclick=()=>{state.mqttPasswordVisible=!state.mqttPasswordVisible;renderHomeAssistant()};$("#toggleDebug").onclick=toggleDebugMode;$("#refreshDebugErrors").onclick=loadDebugErrors;$("#clearDebugErrors").onclick=clearDebugErrors;$("#refreshDebugNetworkEvents").onclick=loadDebugNetworkEvents;$("#openWifiSettings").onclick=openWifiSettings;$("#stopRuntime").onclick=stopAndroidRuntime;$("#cancelRuntimeStop").onclick=()=>$("#runtimeStopDialog").close();$("#confirmRuntimeStop").onclick=confirmAndroidRuntimeStop;$("#addWidget").onclick=openWidgetCatalog;$("#editDashboard").onclick=()=>setDashboardEditing(!state.dashboardEditing);$("#dismissWidgetDialog").onclick=closeAddDialog;$("#hubClockZone").onclick=openClockManager;$("#hubWeatherZone").onclick=openWeatherDialog;$("#closeClockDialog").onclick=()=>$("#clockDialog").close();$("#changeWeatherLocation").onclick=()=>{$("#weatherDialog").close();openWeatherLocationManager()};$("#closeWeatherLocationDialog").onclick=()=>$("#weatherLocationDialog").close();$("#clockCitySearch").oninput=()=>scheduleLocationSearch("clock");$("#weatherLocationSearch").oninput=()=>scheduleLocationSearch("weather");$("#widgetScrollLeft").onclick=()=>scrollWidgetRail(-1);$("#widgetScrollHint").onclick=scrollWidgetRailForward;$("#quickScrollLeft").onclick=()=>scrollHomeTabs(-1);$("#quickScrollRight").onclick=()=>scrollHomeTabs(1);$("#widgetBoard").addEventListener("pointerdown",touchDashboardEditing,{passive:true});$("#widgetRail").addEventListener("scroll",()=>requestAnimationFrame(updateWidgetScrollHint),{passive:true});$("#homeTabs").addEventListener("scroll",()=>requestAnimationFrame(updateWidgetScrollHint),{passive:true});$("#homeTabs").addEventListener("wheel",railWheelScroll,{passive:false});$("#homeTabs").addEventListener("keydown",event=>{if(!["ArrowLeft","ArrowRight","Home","End"].includes(event.key))return;if(!event.target.closest("[data-home-tab]"))return;event.preventDefault();moveHomeTabFocus(event.key)});$$("[data-open-widget-catalog]").forEach(button=>button.onclick=openWidgetCatalog);$$("[data-add-tab]").forEach(button=>button.onclick=()=>setAddDialogTab(button.dataset.addTab));$(".modal-tabs").addEventListener("keydown",event=>{const steps={ArrowRight:1,ArrowLeft:-1,ArrowDown:1,ArrowUp:-1};if(!(event.key in steps))return;event.preventDefault();focusAddDialogTab(steps[event.key])});$("#widgetDialog").addEventListener("close",resetAddDialog);
  async function closeMatterDialog(){
    try{await api("/api/matter/commissioning",{method:"POST",body:JSON.stringify({open:false})})}catch{}
    $("#matterDialog").close();
  }
  $("#repairDialog").addEventListener("cancel",event=>event.preventDefault());
  bindBackdropClose("#widgetDialog",".add-modal",closeAddDialog);
  bindBackdropClose("#deviceDetailDialog",".device-detail-modal",closeDeviceDetail);
  bindBackdropClose("#lightDialog",".light-modal",()=>$("#lightDialog").close());
  /* Hızlı kumanda penceresi: kapatma çarpısı, `Esc` ve odak tuzağı `<dialog>`ın kendisinden gelir;
     açılışta odak başlığa verilir, hiçbir metin alanına gitmez. "Ayrıntılar" yeni bir ekran açmaz —
     pencereyi kapatıp bugün zaten var olan cihaz detay sayfasını açar. */
  $("#closeQuickControl").onclick=closeQuickControl;
  $("#quickControlDialog").addEventListener("close",()=>{state.quickControl=null;state.quickPointerDown=false});
  $("#quickControlBody").addEventListener("pointerdown",()=>{state.quickPointerDown=true},{passive:true});
  ["pointerup","pointercancel"].forEach(type=>$("#quickControlBody").addEventListener(type,()=>{state.quickPointerDown=false},{passive:true}));
  $("#quickControlDetails").onclick=()=>{const id=state.quickControl?.id;closeQuickControl();if(id)openDeviceDetail(id)};
  bindBackdropClose("#quickControlDialog",".quick-modal",closeQuickControl);
  bindBackdropClose("#matterDialog",".modal",closeMatterDialog);
  bindBackdropClose("#weatherDialog",".modal",()=>$("#weatherDialog").close());
  /* Sağ üst çarpılar: kapatmayı kestirmeden `close()` ile yapmaz, modalin KENDİ kapatma
     düğmesini tetikler (form sıfırlama, durum temizleme, akışın bir sonraki adımı aynı yerden
     geçsin). Kendi düğmesi olmayan modalde pencereyi doğrudan kapatır. Kimliği devraldığı için
     zaten bağlı olan çarpılar (ör. `#closeMatter`) bu listeye girmez. */
  $$("[data-dismiss-modal]").forEach(button=>button.onclick=()=>{
    const owner=button.dataset.dismissModal?$(`#${button.dataset.dismissModal}`):null;
    if(owner)owner.click();
    else button.closest("dialog")?.close();
  });
  $("#matterDialog").addEventListener("close",stopMatterWatch);
  /* Alarm: pencerede ayrı bir "Kaydet" yok, her alan değişince yazılır (saat penceresinin geri
     kalanı da böyle çalışıyor). Çalma katmanı `Esc` ya da düğmeyle kapanır; iki yol da aynı
     `close` olayından geçtiği için ses her hâlükârda susar. */
  $("#alarmEnabled").onchange=saveAlarmSetting;
  /* Saat seçimi panelin kendi pop-up'ından gelir (yerel saat penceresi yok). Yazma yalnız
     "Kaydet"te olur; kapatmanın üç yolu da (çarpı, "Vazgeç", Esc/dışarı tıklama) eski değeri
     bırakır. Dinleyiciler tekerleğin kendisinde: satırlar yeniden çizildiğinde bağ kopmaz. */
  $("#alarmTimeButton").onclick=openAlarmTimePicker;
  $("#closeAlarmTimeDialog").onclick=()=>$("#alarmTimeDialog").close();
  $("#cancelAlarmTime").onclick=()=>$("#alarmTimeDialog").close();
  $("#confirmAlarmTime").onclick=applyAlarmTimePicker;
  bindBackdropClose("#alarmTimeDialog",".time-picker-card",()=>$("#alarmTimeDialog").close());
  ["#alarmHourWheel","#alarmMinuteWheel"].forEach(selector=>{
    const wheel=$(selector);
    // Kaydırma olayı saniyede onlarca kez gelir; boyama kare başına bir kez yapılır.
    let painting=false;
    wheel.addEventListener("scroll",()=>{
      if(painting)return;
      painting=true;
      requestAnimationFrame(()=>{painting=false;alarmWheelPaint(wheel)});
    },{passive:true});
    wheel.addEventListener("keydown",event=>{if(alarmWheelKey(wheel,event.key))event.preventDefault()});
    wheel.addEventListener("click",event=>{
      const option=event.target.closest(".time-wheel-option");
      if(option)alarmWheelScrollTo(wheel,Array.prototype.indexOf.call(wheel.children,option),true);
    });
  });
  $("#alarmRepeat").onchange=saveAlarmSetting;
  $("#alarmWeekday").onchange=saveAlarmSetting;
  $("#stopAlarm").onclick=stopAlarmRing;
  $("#alarmDialog").addEventListener("close",stopAlarmRing);
  /* Otomatik oynatma kısıtı: ses bağlamı ilk kullanıcı dokunuşunda kurulur ve canlı tutulur.
     Dinleyici kalıcıdır — bağlam tarayıcı tarafından askıya alınırsa (uyku, sekme değişimi)
     bir sonraki dokunuş onu geri getirir. */
  ["pointerdown","keydown","touchstart"].forEach(type=>document.addEventListener(type,unlockAlarmAudio,{capture:true,passive:true}));
  async function startAuthenticatedApplication(){
    if(applicationStarted){
      const reload=[refresh(),loadHomeGroups(),loadHomeVisibility(),loadAutomations(),loadHomeLocation(),loadWeather(),loadWorldClockZones()];
      if(state.auth.user?.role==="admin")reload.push(loadSettings());
      await Promise.allSettled(reload);
      await migrateLocalGroups();
      await migrateWeatherLocation();
      await migrateWorldClockZones();
      return;
    }
    applicationStarted=true;
    setupPullToRefresh();setupQuickMouseScrolling();configureAndroidActions();bindScreensaver();bindWidgetControls();applyWidgetLayout();
    const startup=[refresh(),loadHomeGroups(),loadHomeVisibility(),loadAutomations(),loadHomeLocation(),loadWeather(),loadWorldClockZones(),loadInstallationOnboarding()];
    if(state.auth.user?.role==="admin")startup.push(loadSettings());
    await Promise.allSettled(startup);
    await migrateLocalGroups();
    // Sunucuda konum yoksa cihazda kalmış eski seçim bir kez yukarı taşınır; hava okunduktan
    // SONRA çalışır, yoksa sunucunun kendi konumunu ezerdi.
    await migrateWeatherLocation();
    // Aynı kural dünya saati şehirleri için: sunucuda liste yoksa cihazdaki bir kez yukarı taşınır.
    await migrateWorldClockZones();
    if(!onboardingComplete())openOnboarding();
    else requestAnimationFrame(maybeStartDashboardTour);
    setInterval(()=>{if(!document.hidden&&state.auth.authenticated)refresh()},8000);
    scheduleWorldClockTick();
    // Hava sunucudan okunuyor: sormak ucuz, kör 30 dakikalık bekleme kalktı.
    setInterval(()=>{if(!document.hidden)refreshWeatherIfNeeded()},300000);
    setInterval(()=>{if(state.pairing?.open)render()},1000);
    // Ekran yeniden görünür olduğunda hava HEMEN tazelenir — uykudan dönen tablet eski değeri
    // göstermesin.
    document.addEventListener("visibilitychange",()=>{if(document.hidden||!state.auth.authenticated)return;refresh();loadWeather()});
  }
  async function initialize(){
    // Arka plan ayarları temadan ÖNCE okunur: `applyTheme` güneş takibini kurabiliyor ve o da
    // ilk karede `--star-a`'yı kullanıcının çarpanıyla yazsın.
    loadSkySettings();
    applySkySettings();
    applyTheme();
    document.body.dataset.activeView="home";
    // Kökteki ikiz: güneş katmanı `html::before` üstünde duruyor, o da ekran işaretini görsün.
    document.documentElement.dataset.activeView="home";
    try{await loadLanguages()}
    catch(error){showToast(error.message,true)}
    if(Object.keys(translations).length)applyLanguage();
    configureAndroidActions();
    try{await loadAuthSession()}
    catch(error){showToast(error.message,true);openAuthGate();return}
    if(!state.auth.authenticated){openAuthGate();return}
    await startAuthenticatedApplication();
  }
  initialize();
