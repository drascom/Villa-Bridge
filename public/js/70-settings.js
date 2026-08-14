  async function loadSettings(){
    try{
      const data=await api("/api/settings");
      state.settings=data.settings;
      state.network=data.network||null;
      state.mqttAccess=data.mqttAccess||null;
      renderConnectedServerAddress();
      $("#zigbeeAdapterUrl").value=state.settings.zigbee.adapterUrl;
      $("#zigbeeChannel").value=String(state.settings.zigbee.channel);
      $("#lowBatteryThreshold").value=String(state.settings.alerts?.lowBatteryThreshold??15);
      $("#selfHealingEnabled").value=state.settings.selfHealing?.enabled===false?"false":"true";
      $("#mqttUrl").value=state.settings.mqtt.url;
      $("#mqttBaseTopic").value=state.settings.mqtt.baseTopic;
      $("#matterWsUrl").value=state.settings.matter.wsUrl;
      renderHomeAssistant();
      renderDebugSettings();
      if(state.settings.debug?.enabled===true)await loadDebugErrors();
      await loadDebugNetworkEvents();
      await loadAgentTokens();
    }catch(error){showToast(t("settingsUnavailable"),true)}
  }
  const themeHex=value=>{
    const text=String(value||"").trim();
    if(/^#[0-9a-f]{6}$/i.test(text))return text;
    const match=text.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    return match?`#${[match[1],match[2],match[3]].map(part=>Math.max(0,Math.min(255,Number(part))).toString(16).padStart(2,"0")).join("")}`:"#000000";
  };
  function renderAppearanceSettings(){
    const select=$("#themePackageSelect");
    if(!select||!themeRuntime.ready)return;
    const active=activeThemePackage();
    select.innerHTML=themeRuntime.packages.map(item=>`<option value="${esc(item.id)}">${esc(item.name)}</option>`).join("");
    select.value=active?.id||"";
    const overrides=themeRuntime.appearance?.overrides?.[active?.id]||{};
    $$('[data-theme-override]').forEach(input=>{
      const parts=input.dataset.themeOverride.split(".");
      let value;
      if(parts[0]==="solar")value=overrides.solar?.[parts[1]]?.[parts[2]]??active?.palettes.solar.anchors[parts[1]].colors[parts[2]];
      else value=overrides[parts[0]]?.[parts[1]]??active?.palettes[parts[0]].colors[parts[1]];
      input.value=themeHex(value);
    });
  }
  async function persistAppearancePalette(){
    const theme=activeThemePackage();
    if(!theme)return;
    const item={light:{},dark:{},solar:{night:{},dawn:{},day:{},dusk:{}}};
    $$('[data-theme-override]').forEach(input=>{
      const parts=input.dataset.themeOverride.split(".");
      if(parts[0]==="solar")item.solar[parts[1]][parts[2]]=input.value;
      else item[parts[0]][parts[1]]=input.value;
    });
    try{await saveThemeOverrides({[theme.id]:item});showToast(t("themeColorsSaved"));renderAppearanceSettings()}
    catch(error){showToast(error.message,true)}
  }
  async function resetAppearancePalette(){
    const theme=activeThemePackage();
    if(!theme||!themeRuntime.appearance)return;
    const overrides={...themeRuntime.appearance.overrides};delete overrides[theme.id];
    try{
      const response=await api("/api/appearance",{method:"PUT",body:JSON.stringify({...themeRuntime.appearance,overrides})});
      themeRuntime.appearance=response.appearance;applyThemePackage();renderAppearanceSettings();showToast(t("themeColorsReset"));
    }catch(error){showToast(error.message,true)}
  }
  /* Ajan token'ları: kullanıcının kendi yazdığı LLM istemcisi `/mcp` ucuna bu token'la bağlanır.
     Ham değer yalnız üretim yanıtında bir kez gelir; listede yalnız ad ve zaman damgaları durur.
     Kart `data-admin-only` taşır, ev kullanıcısı hiç görmez. */
  function renderAgentTokens(){
    const tokens=state.agentTokens||[];
    $("#agentTokenList").innerHTML=tokens.length?tokens.map(token=>`<article class="agent-token-row"><div><strong>${esc(token.name)}</strong><small>${t("agentTokenCreatedAt",{at:ago(token.createdAt)})} · ${token.lastUsedAt?t("agentTokenLastUsed",{at:ago(token.lastUsedAt)}):t("agentTokenNeverUsed")}</small></div><button class="quiet" type="button" data-revoke-agent-token="${esc(token.id)}">${t("agentTokenRevoke")}</button></article>`).join(""):`<div class="agent-token-empty">${t("agentTokenEmpty")}</div>`;
    $$("[data-revoke-agent-token]").forEach(button=>button.onclick=()=>revokeAgentToken(button.dataset.revokeAgentToken));
  }
  async function loadAgentTokens(){
    try{
      const data=await api("/api/agent-tokens");
      state.agentTokens=Array.isArray(data.tokens)?data.tokens:[];
    }catch(error){state.agentTokens=[]}
    renderAgentTokens();
  }
  async function createAgentToken(event){
    event.preventDefault();
    const input=$("#agentTokenName");
    if(!input.reportValidity())return;
    const button=$("#agentTokenForm button");
    button.disabled=true;
    try{
      const data=await api("/api/agent-tokens",{method:"POST",body:JSON.stringify({name:input.value.trim()})});
      input.value="";
      $("#agentTokenValue").textContent=data.token;
      $("#agentTokenReveal").hidden=false;
      await loadAgentTokens();
    }catch(error){showToast(error.message,true)}
    finally{button.disabled=false}
  }
  async function copyAgentToken(){
    const value=$("#agentTokenValue").textContent||"";
    if(!value)return;
    try{
      /* Android WebView'de pano API'si her zaman yok; eski seçim yoluna düşülür. */
      if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(value);
      else{
        const field=document.createElement("textarea");
        field.value=value;
        field.setAttribute("readonly","");
        field.style.position="fixed";
        field.style.opacity="0";
        document.body.appendChild(field);
        field.select();
        document.execCommand("copy");
        field.remove();
      }
      showToast(t("agentTokenCopied"));
    }catch(error){showToast(t("agentTokenCopyFailed"),true)}
  }
  async function revokeAgentToken(id){
    const token=(state.agentTokens||[]).find(item=>item.id===id);
    if(!token||!confirm(t("agentTokenRevokeConfirm",{name:token.name})))return;
    try{
      await api(`/api/agent-tokens/${encodeURIComponent(id)}`,{method:"DELETE"});
      $("#agentTokenReveal").hidden=true;
      $("#agentTokenValue").textContent="";
      showToast(t("agentTokenRevoked"));
      await loadAgentTokens();
    }catch(error){showToast(error.message,true)}
  }
  const onboardingStepCount=6;
  const onboardingIcon=kind=>{
    const paths={
      welcome:'<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10M9 20v-6h6v6"/>',
      hub:'<rect x="5" y="3" width="14" height="18" rx="3"/><path d="M9 8h6M9 12h6M9 16h2"/>',
      zigbee:'<path d="M6 17c5-1 8-4 9-10 3 4 3 9-1 12-3 2-7 1-8-2Z"/><path d="M7 18c2-3 5-5 9-6"/>',
      services:'<path d="M8 12a4 4 0 0 1 4-4h3a4 4 0 1 1 0 8h-2"/><path d="M16 12a4 4 0 0 1-4 4H9a4 4 0 1 1 0-8h2"/>',
      network:'<path d="M5 9a10 10 0 0 1 14 0M8 12a6 6 0 0 1 8 0m-5 4a2 2 0 0 1 2 0"/><circle cx="12" cy="19" r=".8" fill="currentColor" stroke="none"/>',
      ready:'<circle cx="12" cy="12" r="9"/><path d="m8 12 2.6 2.6L16.5 9"/>'
    };
    return`<div class="onboarding-icon" aria-hidden="true"><svg viewBox="0 0 24 24">${paths[kind]||paths.welcome}</svg></div>`;
  };
  function onboardingHero(icon,title,lead,content,values={}){
    return`<div class="onboarding-hero">${onboardingIcon(icon)}<div class="onboarding-copy"><h2>${t(title,values)}</h2><p>${t(lead,values)}</p></div></div><div class="onboarding-content">${content}</div>`;
  }
  function onboardingSettingsFromDraft(){
    return{
      zigbee:{adapterUrl:state.onboardingDraft.zigbeeAdapterUrl,channel:state.onboardingDraft.zigbeeChannel},
      mqtt:{url:state.onboardingDraft.mqttUrl,baseTopic:state.onboardingDraft.mqttBaseTopic},
      matter:{wsUrl:state.onboardingDraft.matterWsUrl},
      homeAssistant:{discoveryEnabled:state.settings?.homeAssistant?.discoveryEnabled===true},
      alerts:{lowBatteryThreshold:state.settings?.alerts?.lowBatteryThreshold??15},
      selfHealing:{enabled:state.settings?.selfHealing?.enabled!==false,probeOffline:state.settings?.selfHealing?.probeOffline===true},
      debug:{enabled:state.settings?.debug?.enabled!==false}
    };
  }
  function settingsWithChannelConfirmation(settings){
    const previous=Number(state.settings?.zigbee?.channel);
    const next=Number(settings.zigbee?.channel);
    if(Number.isInteger(previous)&&previous!==next){
      if(!confirm(t("zigbeeChannelConfirm",{from:previous,to:next})))return null;
      return{...settings,zigbeeChannelConfirmation:"CHANGE"};
    }
    return settings;
  }
  function renderOnboarding(){
    const draft=state.onboardingDraft;
    if(!draft)return;
    if(state.remoteOnboarding){
      const address=connectedServerAddress();
      $("#onboardingProgress").hidden=true;
      $("#onboardingBody").innerHTML=onboardingHero(
        "services",
        "serverSetupDetectedTitle",
        "serverSetupDetectedLead",
        `<div class="onboarding-summary"><div class="onboarding-summary-row"><span>${t("serverAddress")}</span><code>${esc(address)}</code></div></div><p class="onboarding-help">${t("serverSetupDetectedHelp")}</p>`,
        {address}
      );
      $("#onboardingBack").hidden=true;
      $("#skipOnboarding").hidden=true;
      $(".onboarding-actions").classList.add("final");
      $("#onboardingNext").textContent=t("openServerSettings");
      return;
    }
    $("#onboardingProgress").hidden=false;
    const step=state.onboardingStep;
    $("#onboardingProgress").innerHTML=Array.from({length:onboardingStepCount},(_,index)=>`<span class="${index<=step?"active":""}"></span>`).join("");
    let body="";
    if(step===0)body=onboardingHero("welcome","setupWelcomeTitle","setupWelcomeLead",`<div class="onboarding-choices"><button class="onboarding-choice ${state.language==="en"?"selected":""}" type="button" data-onboarding-language="en">English<small>Continue in English</small></button><button class="onboarding-choice ${state.language==="tr"?"selected":""}" type="button" data-onboarding-language="tr">Türkçe<small>Türkçe devam et</small></button></div>`);
    if(step===1)body=onboardingHero("hub","setupHubTitle","setupHubLead",`<div class="onboarding-features"><div class="onboarding-feature"><strong>Zigbee</strong><span>${t("setupHubZigbee")}</span></div><div class="onboarding-feature"><strong>MQTT</strong><span>${t("setupHubMqtt")}</span></div><div class="onboarding-feature"><strong>Matter</strong><span>${t("setupHubMatter")}</span></div></div>`);
    if(step===2)body=onboardingHero("zigbee","setupZigbeeTitle","setupZigbeeLead",`<div class="onboarding-fields"><div class="onboarding-field"><label for="onboardingZigbeeUrl">${t("adapterUrl")}</label><input id="onboardingZigbeeUrl" type="url" value="${esc(draft.zigbeeAdapterUrl)}" placeholder="tcp://192.168.0.248:6638" required></div></div><p class="onboarding-help">${t("setupRecommendedValues")}</p>`);
    if(step===3)body=onboardingHero("services","setupServicesTitle","setupServicesLead",`<div class="onboarding-fields"><div class="onboarding-field"><label for="onboardingMqttUrl">${t("mqttUrl")}</label><input id="onboardingMqttUrl" type="url" value="${esc(draft.mqttUrl)}" required></div><div class="onboarding-field"><label for="onboardingMqttTopic">${t("baseTopic")}</label><input id="onboardingMqttTopic" value="${esc(draft.mqttBaseTopic)}" required></div><div class="onboarding-field"><label for="onboardingMatterUrl">${t("matterUrl")}</label><input id="onboardingMatterUrl" type="url" value="${esc(draft.matterWsUrl)}" required></div></div><p class="onboarding-help">${t("setupRecommendedValues")}</p>`);
    if(step===4){
      const ip=state.network?.preferredAddress||state.network?.addresses?.[0]||t("ipUnavailable");
      body=onboardingHero("network","setupNetworkTitle","setupNetworkLead",`<div class="onboarding-ip"><div><span>${t("haCurrentIp")}</span><br><code>${esc(ip)}</code></div><button id="onboardingWifiSettings" class="secondary" type="button">${t("openWifiSettings")}</button></div><p class="onboarding-help">${t("setupNetworkHelp")}</p>`);
    }
    if(step===5)body=onboardingHero("ready","setupReadyTitle","setupReadyLead",`<div class="onboarding-summary"><div class="onboarding-summary-row"><span>Zigbee</span><code>${esc(draft.zigbeeAdapterUrl)}</code></div><div class="onboarding-summary-row"><span>MQTT</span><code>${esc(draft.mqttUrl)}</code></div><div class="onboarding-summary-row"><span>Matter</span><code>${esc(draft.matterWsUrl)}</code></div></div>`);
    $("#onboardingBody").innerHTML=body;
    $("#onboardingBack").hidden=step===0;
    $("#skipOnboarding").hidden=step===5;
    $(".onboarding-actions").classList.toggle("final",step===5);
    $("#onboardingNext").textContent=t(step===5?"finishSetup":"next");
    $$("[data-onboarding-language]").forEach(button=>button.onclick=()=>{
      state.onboardingDraft.language=button.dataset.onboardingLanguage;
      setLanguage(button.dataset.onboardingLanguage);
      renderOnboarding();
    });
    const wifi=$("#onboardingWifiSettings");
    if(wifi){
      wifi.hidden=typeof window.VillaAndroid?.openWifiSettings!=="function";
      wifi.onclick=openWifiSettings;
    }
  }
  function captureOnboardingStep(){
    const draft=state.onboardingDraft;
    if(state.onboardingStep===2){
      const input=$("#onboardingZigbeeUrl");
      if(!input.reportValidity())return false;
      draft.zigbeeAdapterUrl=input.value.trim();
    }
    if(state.onboardingStep===3){
      const inputs=[$("#onboardingMqttUrl"),$("#onboardingMqttTopic"),$("#onboardingMatterUrl")];
      if(inputs.some(input=>!input.reportValidity()))return false;
      draft.mqttUrl=inputs[0].value.trim();
      draft.mqttBaseTopic=inputs[1].value.trim();
      draft.matterWsUrl=inputs[2].value.trim();
    }
    return true;
  }
  function openOnboarding(){
    if(!state.settings)return showToast(t("settingsUnavailable"),true);
    state.remoteOnboarding=state.androidMonitor;
    state.onboardingStep=0;
    state.onboardingDraft=state.remoteOnboarding?{}:{
      language:state.language,
      zigbeeAdapterUrl:state.settings.zigbee.adapterUrl,
      zigbeeChannel:state.settings.zigbee.channel,
      mqttUrl:state.settings.mqtt.url,
      mqttBaseTopic:state.settings.mqtt.baseTopic,
      matterWsUrl:state.settings.matter.wsUrl
    };
    renderOnboarding();
    if(!$("#onboardingDialog").open)$("#onboardingDialog").showModal();
  }
  function skipOnboarding(){
    $("#onboardingDialog").close();
    state.remoteOnboarding=false;
    activateView("devices");
    window.scrollTo({top:0,behavior:"smooth"});
    requestAnimationFrame(maybeStartDeviceHint);
  }
  async function finishOnboarding(){
    const button=$("#onboardingNext");
    button.disabled=true;
    try{
      const settings=onboardingSettingsFromDraft();
      const current={
        zigbee:state.settings.zigbee,
        mqtt:state.settings.mqtt,
        matter:state.settings.matter,
        homeAssistant:state.settings.homeAssistant,
        alerts:state.settings.alerts,
        debug:state.settings.debug
      };
      if(JSON.stringify(settings)!==JSON.stringify(current)){
        const payload=settingsWithChannelConfirmation(settings);
        if(!payload)return;
        const data=await api("/api/settings",{method:"PUT",body:JSON.stringify(payload)});
        state.settings=data.settings;
        showToast(t("setupSavedRestart"));
      }
      await markOnboardingComplete();
      $("#onboardingDialog").close();
      activateView("devices");
      window.scrollTo({top:0,behavior:"smooth"});
      requestAnimationFrame(maybeStartDeviceHint);
    }catch(error){showToast(error.message,true)}
    finally{button.disabled=false}
  }
  function nextOnboardingStep(){
    if(state.remoteOnboarding){
      $("#onboardingDialog").close();
      state.remoteOnboarding=false;
      state.onboardingDraft=null;
      activateView("settings");
      requestAnimationFrame(()=>$("#settingsForm").scrollIntoView({behavior:"smooth",block:"start"}));
      return;
    }
    if(!captureOnboardingStep())return;
    if(state.onboardingStep===onboardingStepCount-1){finishOnboarding();return}
    state.onboardingStep+=1;
    renderOnboarding();
  }
  function previousOnboardingStep(){
    if(state.onboardingStep===0)return;
    captureOnboardingStep();
    state.onboardingStep-=1;
    renderOnboarding();
  }
  const dashboardTourSteps=()=>[
    {target:"#homeSummary",fallback:"#home .home-heading",title:"tourStatusTitle",text:"tourStatusLead"},
    {target:"#homeTabs",title:"tourQuickTitle",text:"tourQuickLead"},
    {target:"#addWidget",title:"tourAddTitle",text:"tourAddLead"},
    {target:"#editDashboard",title:"tourEditTitle",text:"tourEditLead"},
    {target:"#widgetRail",fallback:"#widgetBoard",title:"tourWidgetsTitle",text:"tourWidgetsLead"},
    {target:'#home [data-app-menu]',fallback:"#home .home-actions",title:"tourMenuTitle",text:"tourMenuLead"}
  ];
  function coachTarget(step){
    const primary=$(step.target);
    const rect=primary?.getBoundingClientRect();
    if(primary&&rect.width>2&&rect.height>2)return primary;
    return step.fallback?$(step.fallback):primary;
  }
  function positionCoach(){
    if(!state.coach)return;
    const step=state.coach.steps[state.coach.index];
    const target=coachTarget(step);
    if(!target){nextCoachStep();return}
    const rect=target.getBoundingClientRect();
    const pad=7;
    const spotlight=$("#coachSpotlight");
    spotlight.style.left=`${Math.max(5,rect.left-pad)}px`;
    spotlight.style.top=`${Math.max(5,rect.top-pad)}px`;
    spotlight.style.width=`${Math.min(innerWidth-10,rect.width+pad*2)}px`;
    spotlight.style.height=`${Math.min(innerHeight-10,rect.height+pad*2)}px`;
    const tooltip=$("#coachTooltip");
    const tooltipRect=tooltip.getBoundingClientRect();
    const below=rect.bottom+tooltipRect.height+22<innerHeight;
    const top=below?rect.bottom+16:Math.max(12,rect.top-tooltipRect.height-16);
    const left=Math.max(14,Math.min(innerWidth-tooltipRect.width-14,rect.left+(rect.width-tooltipRect.width)/2));
    tooltip.style.top=`${top}px`;
    tooltip.style.left=`${left}px`;
  }
  function renderCoach(){
    const coach=state.coach;
    if(!coach)return;
    const step=coach.steps[coach.index];
    const target=coachTarget(step);
    if(!target){nextCoachStep();return}
    const rect=target.getBoundingClientRect();
    if(rect.top<78||rect.bottom>innerHeight-16)target.scrollIntoView({block:"center",behavior:"smooth"});
    $("#coachStep").textContent=t("tourStep",{current:coach.index+1,total:coach.steps.length});
    $("#coachTitle").textContent=t(step.title);
    $("#coachText").textContent=t(step.text);
    $("#coachBack").hidden=coach.index===0;
    $("#coachNext").textContent=t(coach.index===coach.steps.length-1?"finishTour":"next");
    requestAnimationFrame(()=>setTimeout(positionCoach,rect.top<78||rect.bottom>innerHeight-16?220:0));
  }
  function startCoach(name,steps){
    if(state.coach||document.querySelector("dialog[open]"))return;
    state.coach={name,steps,index:0};
    $("#coachLayer").hidden=false;
    renderCoach();
  }
  function finishCoach(){
    if(!state.coach)return;
    const key=state.coach.name==="dashboard"?dashboardTourStorageKey:deviceHintStorageKey;
    try{localStorage.setItem(key,"true")}catch{}
    state.coach=null;
    $("#coachLayer").hidden=true;
  }
  function nextCoachStep(){
    if(!state.coach)return;
    if(state.coach.index>=state.coach.steps.length-1){finishCoach();return}
    state.coach.index+=1;
    renderCoach();
  }
  function previousCoachStep(){
    if(!state.coach||state.coach.index===0)return;
    state.coach.index-=1;
    renderCoach();
  }
  function maybeStartDashboardTour(){
    if(document.body.dataset.activeView!=="home"||!onboardingComplete()||dashboardTourComplete())return;
    startCoach("dashboard",dashboardTourSteps());
  }
  function maybeStartDeviceHint(){
    if(document.body.dataset.activeView!=="devices"||!onboardingComplete()||deviceHintComplete()||!state.overviewLoaded||state.devices.length)return;
    startCoach("device",[{target:"#devices .add-device",title:"deviceHintTitle",text:"deviceHintLead"}]);
  }
  function restartDashboardGuide(){
    try{localStorage.removeItem(dashboardTourStorageKey)}catch{}
    activateView("home");
    requestAnimationFrame(maybeStartDashboardTour);
  }
  function renderDebugErrors(){
    const errors=state.debugErrors;
    $("#debugLogTitle").textContent=t("recentErrors",{count:errors.length});
    $("#debugErrorList").innerHTML=errors.length?errors.map(error=>`<article class="debug-error-row"><strong>${esc(error.operation)} · HTTP ${esc(error.statusCode)}</strong><time datetime="${esc(error.timestamp)}">${ago(error.timestamp)}</time><p>${esc(error.message)}</p></article>`).join(""):`<div class="debug-empty">${t("noDebugErrors")}</div>`;
    renderSystemAlertBar();
  }
  function renderDebugSettings(){
    const enabled=state.settings?.debug?.enabled===true;
    $("#toggleDebug").classList.toggle("on",enabled);
    $("#toggleDebug").setAttribute("aria-pressed",String(enabled));
    $("#toggleDebug").setAttribute("aria-label",t("debugMode"));
    $("#debugModeStatus").textContent=t(enabled?"enabled":"disabled");
    $("#debugLogPanel").hidden=!enabled;
    if(!enabled){state.debugErrors=[];renderDebugErrors()}
  }
  async function loadDebugErrors(){
    if(state.settings?.debug?.enabled!==true)return;
    try{
      const data=await api("/api/debug/errors");
      state.debugErrors=Array.isArray(data.errors)?data.errors:[];
      renderDebugErrors();
    }catch(error){showToast(error.message,true)}
  }
  const debugNetworkReasonKeys={joined:"deviceEventJoined",left:"deviceEventLeft",removed:"deviceEventRemoved"};
  const debugNetworkFullTime=iso=>{const at=new Date(iso);return Number.isNaN(at.getTime())?"":at.toLocaleString(state.language||undefined)};
  function renderDebugNetworkEvents(){
    // Sunucu en yeniden eskiye veriyor; sıralama yine de burada garanti edilir.
    const events=[...(state.debugNetworkEvents||[])].sort((a,b)=>String(b.at||"").localeCompare(String(a.at||"")));
    $("#debugNetworkTitle").textContent=t("deviceNetworkEvents",{count:events.length});
    $("#debugNetworkList").innerHTML=events.length?events.map(event=>{
      const label=t(debugNetworkReasonKeys[event.reason]||"deviceEventLeft");
      return`<article class="debug-network-row" data-network-reason="${esc(event.reason)}"><strong>${esc(event.name||event.id)}</strong><time datetime="${esc(event.at)}" title="${esc(debugNetworkFullTime(event.at))}">${ago(event.at)}</time><p>${esc(label)} · ${esc(event.id)}</p></article>`;
    }).join(""):`<div class="debug-empty">${t("noDeviceNetworkEvents")}</div>`;
  }
  async function loadDebugNetworkEvents(){
    try{
      const data=await api("/api/debug/network-events");
      state.debugNetworkEvents=Array.isArray(data.events)?data.events:[];
    }catch(error){state.debugNetworkEvents=[]}
    renderDebugNetworkEvents();
  }
  async function toggleDebugMode(){
    if(!state.settings)return;
    const button=$("#toggleDebug");
    button.disabled=true;
    const enabled=state.settings.debug?.enabled!==true;
    try{
      const settings={...state.settings,debug:{enabled}};
      await api("/api/settings",{method:"PUT",body:JSON.stringify(settings)});
      state.settings=settings;
      renderDebugSettings();
      if(enabled)await loadDebugErrors();
      showToast(t(enabled?"debugEnabled":"debugDisabled"));
    }catch(error){showToast(error.message,true)}
    finally{button.disabled=false}
  }
  async function clearDebugErrors(){
    const button=$("#clearDebugErrors");
    button.disabled=true;
    try{
      await api("/api/debug/errors",{method:"DELETE"});
      state.debugErrors=[];
      renderDebugErrors();
    }catch(error){showToast(error.message,true)}
    finally{button.disabled=false}
  }
  function renderHomeAssistant(){
    if(!state.settings)return;
    const broker=new URL(state.settings.mqtt.url);
    const localNames=["127.0.0.1","localhost","::1","[::1]","0.0.0.0"];
    const preferredAddress=state.network?.preferredAddress||null;
    $("#haBroker").textContent=localNames.includes(broker.hostname)&&preferredAddress?preferredAddress:broker.hostname;
    $("#haPort").textContent=broker.port||"1883";
    $("#haProtocol").textContent=state.mqttAccess?.protocol||"3.1.1";
    const authenticationRequired=state.mqttAccess?.authenticationRequired===true;
    $("#haUsername").textContent=authenticationRequired?state.mqttAccess.username:t("leaveBlank");
    const password=authenticationRequired?String(state.mqttAccess.password??""):"";
    $("#haPassword").textContent=authenticationRequired?(state.mqttPasswordVisible?password:"••••••••"):t("leaveBlank");
    $("#toggleHaPassword").hidden=!authenticationRequired;
    $("#toggleHaPassword").textContent=state.mqttPasswordVisible?"◌":"◉";
    $("#toggleHaPassword").setAttribute("aria-label",t(state.mqttPasswordVisible?"hidePassword":"showPassword"));
    $("#haBaseTopic").textContent=state.settings.mqtt.baseTopic;
    $("#haCurrentIp").textContent=preferredAddress||state.network?.addresses?.[0]||t("ipUnavailable");
    const enabled=state.settings.homeAssistant?.discoveryEnabled===true;
    const status=$("#haDiscoveryStatus");
    status.textContent=t(enabled?"enabled":"disabled");
    status.className=enabled?"online-text":"unknown-text";
    $("#toggleHaDiscovery").textContent=t(enabled?"disableDiscovery":"enableDiscovery");
    const setupExpanded=!$("#haSetupDetails").hidden;
    $("#toggleHaSetup").textContent=t(setupExpanded?"hideHomeAssistantSetup":"connectHomeAssistant");
    $("#toggleHaSetup").setAttribute("aria-expanded",String(setupExpanded));
  }
  function connectedServerAddress(){
    const discoveredAddress=state.androidMonitor&&typeof window.VillaAndroid?.connectedServerAddress==="function"
      ?String(window.VillaAndroid.connectedServerAddress()||"").trim():"";
    return discoveredAddress||state.network?.preferredAddress||state.network?.addresses?.[0]||t("ipUnavailable");
  }
  function renderConnectedServerAddress(){
    const address=connectedServerAddress();
    $("#connectedServerAddress").textContent=address;
    $("#restartOnboarding").textContent=t(state.androidMonitor?"openServerSettings":"runSetupAgain");
    $(".onboarding-settings-card p").textContent=t(state.androidMonitor?"serverGuidesLead":"guidesLead");
    renderAuthRuntimeContext();
  }
  function renderAuthRuntimeContext(){
    const runtimeAvailable=typeof window.VillaAndroid?.runtimeStatus==="function";
    const ensureContext=(form,id,before)=>{
      let context=$("#"+id);
      if(context)return context;
      context=document.createElement("div");
      context.id=id;
      context.className="auth-runtime-context";
      form.insertBefore(context,before);
      return context;
    };
    const login=ensureContext($("#authLoginForm"),"authLoginRuntimeContext",$(".auth-mode-toggle"));
    const setup=ensureContext($("#authSetupForm"),"authSetupRuntimeContext",$("#authSetupForm .auth-fields"));
    const address=connectedServerAddress();
    login.hidden=!state.androidMonitor;
    if(state.androidMonitor){
      login.classList.remove("local");
      login.innerHTML=`<span class="auth-runtime-dot" aria-hidden="true"></span><div><strong>${t("serverAccountTitle")}</strong><small>${t("serverAccountLead",{address})}</small></div><code>${esc(address)}</code>`;
      setup.hidden=false;
      setup.classList.remove("local");
      setup.innerHTML=`<span class="auth-runtime-dot" aria-hidden="true"></span><div><strong>${t("serverFirstAdminTitle")}</strong><small>${t("serverFirstAdminLead",{address})}</small></div><code>${esc(address)}</code>`;
      return;
    }
    setup.hidden=!runtimeAvailable;
    setup.classList.toggle("local",runtimeAvailable);
    if(runtimeAvailable){
      setup.innerHTML=`<span class="auth-runtime-dot" aria-hidden="true"></span><div><strong>${t("localFirstAdminTitle")}</strong><small>${t("localFirstAdminLead")}</small></div>`;
    }
  }
  function configureAndroidActions(){
    const button=$("#openWifiSettings");
    const available=typeof window.VillaAndroid?.openWifiSettings==="function";
    button.hidden=!available;
    const runtimeAvailable=
      typeof window.VillaAndroid?.stopRuntime==="function"&&
      typeof window.VillaAndroid?.runtimeStatus==="function";
    document.body.classList.toggle("android-app",runtimeAvailable);
    const status=runtimeAvailable?window.VillaAndroid.runtimeStatus():"";
    state.androidMonitor=status==="android-monitor";
    $("#tabletIpGuide").hidden=state.androidMonitor;
    $("#androidRuntimeCard").hidden=!runtimeAvailable||status==="android-monitor";
    renderConnectedServerAddress();
    renderSystemAlertBar();
    if(runtimeAvailable){
      $("#runtimeStatusText").textContent=t(status==="stopped"?"runtimeStopped":"runtimeRunning");
    }
  }
  function openWifiSettings(){
    if(typeof window.VillaAndroid?.openWifiSettings==="function"){
      window.VillaAndroid.openWifiSettings();
      return;
    }
    showToast(t("wifiSettingsAndroidOnly"),true);
  }
  function stopAndroidRuntime(){
    if(typeof window.VillaAndroid?.stopRuntime!=="function")return;
    $("#runtimeStopDialog").showModal();
  }
  function confirmAndroidRuntimeStop(){
    $("#runtimeStopDialog").close();
    $("#stopRuntime").disabled=true;
    window.VillaAndroid.stopRuntime();
  }
  function toggleHomeAssistantSetup(){
    const details=$("#haSetupDetails");
    details.hidden=!details.hidden;
    const expanded=!details.hidden;
    $("#toggleHaSetup").textContent=t(expanded?"hideHomeAssistantSetup":"connectHomeAssistant");
    $("#toggleHaSetup").setAttribute("aria-expanded",String(expanded));
    renderHomeAssistant();
  }
  async function toggleHomeAssistantDiscovery(){
    if(!state.settings)return;
    const button=$("#toggleHaDiscovery");
    const enabled=state.settings.homeAssistant?.discoveryEnabled!==true;
    button.disabled=true;
    try{
      const data=await api("/api/home-assistant/discovery",{method:"PUT",body:JSON.stringify({enabled})});
      state.settings=data.settings;
      renderHomeAssistant();
      showToast(t(enabled?"discoveryEnabledLive":"discoveryDisabledLive"));
    }catch(error){showToast(error.message,true)}
    finally{button.disabled=false}
  }
  async function loadHomeGroups(){
    try{
      const data=await api("/api/home-groups");
      const groups=Array.isArray(data.groups)?data.groups:[];
      if(!groups.length&&!groupsMigrated()&&savedGroups.length){state.pendingGroupMigration=true;render();return}
      state.groups=groups;
      saveDashboardGroups();
      markGroupsMigrated();
      applyWidgetLayout();
      render();
    }catch(error){showToast(error.message,true)}
  }
  /* Göç bir kez ve sessiz: bugüne kadar cihazda tutulan seçimler sunucuya taşınır, sonra yerel
     kayıt silinir. Grup görünürlüğü eski düzende kart sırasının içindeydi
     (`villa-dashboard-removed-widgets` içindeki `group:` girdileri); o da buraya alınır. */
  function legacyVisibility(){
    const read=(key,fallback)=>{try{
      const value=JSON.parse(localStorage.getItem(key)||fallback);
      return Array.isArray(value)?value.filter(item=>typeof item==="string"&&item):[];
    }catch{return[]}};
    return{
      hiddenDevices:read(hiddenTilesStorageKey,"[]"),
      hiddenGroups:read(removedWidgetsKey,"[]")
        .filter(id=>id.startsWith(groupWidgetPrefix))
        .map(id=>id.slice(groupWidgetPrefix.length))
    };
  }
  function clearLegacyVisibility(){
    try{localStorage.removeItem(hiddenTilesStorageKey)}catch{}
    let dropped=false;
    for(const id of[...state.removedWidgets]){
      if(!id.startsWith(groupWidgetPrefix))continue;
      state.removedWidgets.delete(id);
      dropped=true;
    }
    if(dropped)saveRemovedWidgets();
  }
  async function loadHomeVisibility(){
    let visibility;
    try{
      visibility=(await api("/api/home-visibility")).visibility;
    }catch(error){
      // Çevrimdışı: panel son bilinen değerle çalışmaya devam eder, kayıt sıfırlanmaz.
      showToast(t("visibilityLoadFailed",{error:error.message}),true);
      return;
    }
    const legacy=legacyVisibility();
    const serverEmpty=!(visibility?.hiddenDevices||[]).length&&!(visibility?.hiddenGroups||[]).length;
    if(serverEmpty&&(legacy.hiddenDevices.length||legacy.hiddenGroups.length)){
      state.hiddenTiles=new Set(legacy.hiddenDevices);
      state.hiddenGroups=new Set(legacy.hiddenGroups);
      // Yazma başarısızsa yerel kayıt yerinde kalır: seçimler bir sonraki açılışta yeniden denenir.
      if(await saveHomeVisibility())clearLegacyVisibility();
    }else{
      applyVisibility(visibility);
      clearLegacyVisibility();
    }
    applyWidgetLayout();
    render();
  }
  /* Favoriler görünürlükle aynı yolu izler: karar sunucuda, panel yalnız okur ve yazar. Göç yok —
     depo (`home-favorites.json`) baştan sunucudaydı, cihazda hiç yerel bir favori kaydı olmadı.
     Çevrimdışıysa panel son bilinen kayıtla çalışmaya devam eder, liste sıfırlanmaz. */
  async function loadHomeFavorites(){
    let favorites;
    try{
      favorites=(await api("/api/favorites")).favorites;
    }catch(error){
      showToast(t("favoritesLoadFailed",{error:error.message}),true);
      return;
    }
    applyFavorites(favorites);
    applyWidgetLayout();
    render();
  }
  function migratableLocalGroups(){
    if(!state.devices.length)return savedGroups;
    return savedGroups.map(group=>({id:group.id,name:group.name,items:group.items.filter(item=>{
      const device=state.devices.find(candidate=>candidate.id===item.deviceId);
      if(!device)return false;
      return item.controlId===groupDeviceControlId||device.controls.some(control=>control.id===item.controlId&&isDashboardControl(control));
    })})).filter(group=>group.items.length>0);
  }
  async function migrateLocalGroups(){
    if(!state.pendingGroupMigration)return;
    state.pendingGroupMigration=false;
    const groups=migratableLocalGroups();
    if(!groups.length){markGroupsMigrated();return}
    try{
      const data=await api("/api/home-groups",{method:"PUT",body:JSON.stringify({groups})});
      state.groups=Array.isArray(data.groups)?data.groups:groups;
      saveDashboardGroups();
      markGroupsMigrated();
      applyWidgetLayout();
      render();
      showToast(t("groupsMigrated",{count:state.groups.length}));
    }catch(error){showToast(t("groupsMigrationFailed",{error:error.message}),true)}
  }
  async function persistHomeGroups(groups,successKey){
    state.groups=groups;
    saveDashboardGroups();
    applyWidgetLayout();
    render();
    try{
      const data=await api("/api/home-groups",{method:"PUT",body:JSON.stringify({groups})});
      if(Array.isArray(data.groups)){state.groups=data.groups;saveDashboardGroups();applyWidgetLayout();render()}
      markGroupsMigrated();
      if(successKey)showToast(t(successKey));
    }catch(error){showToast(t("groupSaveFailed",{error:error.message}),true)}
  }
