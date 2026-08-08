  $$(".nav-button").forEach(button=>button.onclick=()=>activateView(button.dataset.view));
  $$("[data-app-menu]").forEach(button=>button.onclick=()=>toggleAppMenu(button));
  // Alt sayfa başlıklarındaki "Genel görünüm" ve ana ekrandaki "Otomasyon" düğmeleri:
  // pencere açmaz, doğrudan görünüm değiştirir. `.nav-button` DEĞİL — o sınıf menü ızgarasının
  // biçimini ve `active` işaretini taşıyor.
  $$("[data-view-link]").forEach(button=>button.onclick=()=>activateView(button.dataset.viewLink));
  $("#closeAppMenu").onclick=closeAppMenu;
  $("#appMenuDialog").addEventListener("close",()=>{
    $$("[data-app-menu]").forEach(item=>item.setAttribute("aria-expanded","false"));
    const opener=state.appMenuOpener;
    state.appMenuOpener=null;
    if(opener&&opener.isConnected&&opener.offsetParent!==null)opener.focus();
  });
  $("#appMenuDialog").addEventListener("click",event=>{if(event.target===$("#appMenuDialog"))closeAppMenu()});
  $$("[data-home-metric]").forEach(button=>button.onclick=()=>navigateHomeMetric(button.dataset.homeMetric));
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
  const handleSystemThemeChange=()=>{if(state.themeMode==="system")applyTheme()};
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
  $("#cancelGroup").onclick=closeAddDialog;
  $("#deleteGroup").onclick=requestGroupDelete;$("#groupMoveLeft").onclick=()=>moveDashboardGroup(-1);$("#groupMoveRight").onclick=()=>moveDashboardGroup(1);$("#cancelGroupDelete").onclick=()=>$("#groupDeleteDialog").close();$("#confirmGroupDelete").onclick=confirmGroupDelete;$("#groupDeleteDialog").onclose=()=>{state.groupDeleting=null};
  $$("[data-open-group-create]").forEach(button=>button.onclick=()=>openGroupEditor());
  $("#closeDeviceActions").onclick=()=>$("#deviceActionDialog").close();
  $("#showDeviceDetails").onclick=()=>{const id=state.contextDevice;$("#deviceActionDialog").close();if(id)showDevice(id)};
  $("#confirmDeviceAction").onclick=()=>{const pending=state.pendingConfirm;$("#deviceActionDialog").close();if(!pending)return;command(pending.id,pending.property,pending.value)};
  $("#deviceActionDialog").onclose=()=>{state.contextDevice=null;state.pendingConfirm=null};
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
  $("#deleteAutomation").onclick=deleteAutomation;
  $("#automationActionDialog").onclose=()=>{state.automationContext=null};
  window.addEventListener("resize",()=>{if(state.coach)positionCoach();updateWidgetScrollHint()});
  $$(".add-device").forEach(button=>button.onclick=()=>startPairing(true));$("#stopPairing").onclick=()=>startPairing(false);$("#refreshButton").onclick=refresh;$("#search").oninput=()=>{syncSearchClear();filterDevices();bindCards()};$("#removeConfirmation").oninput=()=>{const disabled=!state.removing||!validRemovalConfirmation($("#removeConfirmation").value,state.removing.name);$("#confirmRemove").disabled=disabled;$("#forceRemove").disabled=disabled};$("#cancelRemove").onclick=()=>{$("#removeDialog").close();state.removing=null};$("#confirmRemove").onclick=()=>confirmDeviceRemoval(false);$("#forceRemove").onclick=()=>confirmDeviceRemoval(true);$("#openMatter").onclick=()=>loadMatter(true);$("#closeMatter").onclick=closeMatterDialog;$("#closeLight").onclick=()=>$("#lightDialog").close();$("#lightDialog").addEventListener("close",()=>{state.lightPointerDown=false});$("#lightControls").addEventListener("pointerdown",()=>{state.lightPointerDown=true},{passive:true});["pointerup","pointercancel"].forEach(type=>$("#lightControls").addEventListener(type,()=>{state.lightPointerDown=false},{passive:true}));$("#closeDeviceDetail").onclick=closeDeviceDetail;$("#deviceDetailDialog").addEventListener("close",()=>{state.detailDevice=null;state.detailFromPairing=false;state.detailPointerDown=false});$("#deviceDetailBody").addEventListener("pointerdown",()=>{state.detailPointerDown=true},{passive:true});["pointerup","pointercancel"].forEach(type=>$("#deviceDetailBody").addEventListener(type,()=>{state.detailPointerDown=false},{passive:true}));$("#showLightDevice").onclick=()=>{const id=state.lightDevice;$("#lightDialog").close();if(id)showDevice(id)};$("#settingsForm").onsubmit=saveSettings;$("#homeLocationManualForm").onsubmit=saveHomeLocationForm;$("#chooseHomeLocation").onclick=openHomeLocationManager;$("#closeHomeLocationDialog").onclick=()=>$("#homeLocationDialog").close();$("#homeLocationSearch").oninput=()=>scheduleLocationSearch("home");$("#useWeatherLocationForHome").onclick=useWeatherLocationForHome;$("#toggleHaSetup").onclick=toggleHomeAssistantSetup;$("#toggleHaDiscovery").onclick=toggleHomeAssistantDiscovery;$("#toggleHaPassword").onclick=()=>{state.mqttPasswordVisible=!state.mqttPasswordVisible;renderHomeAssistant()};$("#toggleDebug").onclick=toggleDebugMode;$("#refreshDebugErrors").onclick=loadDebugErrors;$("#clearDebugErrors").onclick=clearDebugErrors;$("#refreshDebugNetworkEvents").onclick=loadDebugNetworkEvents;$("#openWifiSettings").onclick=openWifiSettings;$("#stopRuntime").onclick=stopAndroidRuntime;$("#cancelRuntimeStop").onclick=()=>$("#runtimeStopDialog").close();$("#confirmRuntimeStop").onclick=confirmAndroidRuntimeStop;$("#addWidget").onclick=openWidgetCatalog;$("#editDashboard").onclick=()=>setDashboardEditing(!state.dashboardEditing);$("#closeWidgetDialog").onclick=closeAddDialog;$("#hubClockZone").onclick=openClockManager;$("#hubWeatherZone").onclick=openWeatherDialog;$("#closeClockDialog").onclick=()=>$("#clockDialog").close();$("#closeWeatherDialog").onclick=()=>$("#weatherDialog").close();$("#changeWeatherLocation").onclick=()=>{$("#weatherDialog").close();openWeatherLocationManager()};$("#closeWeatherLocationDialog").onclick=()=>$("#weatherLocationDialog").close();$("#clockCitySearch").oninput=()=>scheduleLocationSearch("clock");$("#weatherLocationSearch").oninput=()=>scheduleLocationSearch("weather");$("#widgetScrollLeft").onclick=()=>scrollWidgetRail(-1);$("#widgetScrollHint").onclick=scrollWidgetRailForward;$("#quickScrollLeft").onclick=()=>scrollHomeTabs(-1);$("#quickScrollRight").onclick=()=>scrollHomeTabs(1);$("#widgetBoard").addEventListener("pointerdown",touchDashboardEditing,{passive:true});$("#widgetRail").addEventListener("scroll",()=>requestAnimationFrame(updateWidgetScrollHint),{passive:true});$("#homeTabs").addEventListener("scroll",()=>requestAnimationFrame(updateWidgetScrollHint),{passive:true});$("#homeTabs").addEventListener("keydown",event=>{if(!["ArrowLeft","ArrowRight","Home","End"].includes(event.key))return;event.preventDefault();moveHomeTabFocus(event.key)});$$("[data-open-widget-catalog]").forEach(button=>button.onclick=openWidgetCatalog);$$("[data-add-tab]").forEach(button=>button.onclick=()=>setAddDialogTab(button.dataset.addTab));$(".modal-tabs").addEventListener("keydown",event=>{const steps={ArrowRight:1,ArrowLeft:-1,ArrowDown:1,ArrowUp:-1};if(!(event.key in steps))return;event.preventDefault();focusAddDialogTab(steps[event.key])});$("#widgetDialog").addEventListener("close",resetAddDialog);
  async function closeMatterDialog(){
    try{await api("/api/matter/commissioning",{method:"POST",body:JSON.stringify({open:false})})}catch{}
    $("#matterDialog").close();
  }
  $("#repairDialog").addEventListener("cancel",event=>event.preventDefault());
  bindBackdropClose("#widgetDialog",".add-modal",closeAddDialog);
  bindBackdropClose("#deviceDetailDialog",".device-detail-modal",closeDeviceDetail);
  bindBackdropClose("#lightDialog",".light-modal",()=>$("#lightDialog").close());
  bindBackdropClose("#matterDialog",".modal",closeMatterDialog);
  bindBackdropClose("#weatherDialog",".modal",()=>$("#weatherDialog").close());
  $("#matterDialog").addEventListener("close",stopMatterWatch);
  async function startAuthenticatedApplication(){
    if(applicationStarted){
      const reload=[refresh(),loadHomeGroups(),loadHomeVisibility(),loadAutomations(),loadHomeLocation()];
      if(state.auth.user?.role==="admin")reload.push(loadSettings());
      await Promise.allSettled(reload);
      await migrateLocalGroups();
      return;
    }
    applicationStarted=true;
    setupPullToRefresh();setupQuickMouseScrolling();configureAndroidActions();bindScreensaver();bindWidgetControls();applyWidgetLayout();
    const startup=[refresh(),loadHomeGroups(),loadHomeVisibility(),loadAutomations(),loadHomeLocation(),loadInstallationOnboarding()];
    if(state.auth.user?.role==="admin")startup.push(loadSettings());
    await Promise.allSettled(startup);
    await migrateLocalGroups();
    if(!onboardingComplete())openOnboarding();
    else requestAnimationFrame(maybeStartDashboardTour);
    setInterval(()=>{if(!document.hidden&&state.auth.authenticated)refresh()},8000);
    scheduleWorldClockTick();
    setInterval(()=>{if(!document.hidden)refreshWeatherIfNeeded()},1800000);
    setInterval(()=>{if(state.pairing?.open)render()},1000);
    document.addEventListener("visibilitychange",()=>{if(!document.hidden&&state.auth.authenticated)refresh()});
  }
  async function initialize(){
    applyTheme();
    document.body.dataset.activeView="home";
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
