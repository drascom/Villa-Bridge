  const isAlert=device=>Array.isArray(device.alerts)&&device.alerts.length>0;
  const signalToneForPercent=percent=>percent<25?"weak":percent<50?"fair":percent<75?"good":"strong";
  const signalToneKeys={weak:"homeSignalLow",fair:"homeSignalMedium",good:"homeSignalGood",strong:"homeSignalHigh"};
  const criticalAlert=device=>Array.isArray(device.alerts)?device.alerts.find(alert=>alert?.severity==="critical")||null:null;
  const criticalAlertKeys={smoke:"smokeAlarmDevice",carbon_monoxide:"carbonMonoxideAlarmDevice"};
  const batteryPercent=device=>typeof device.state?.battery==="number"?Math.round(Math.max(0,Math.min(100,device.state.battery))):null;
  const lowBatteryThreshold=()=>state.settings?.alerts?.lowBatteryThreshold??15;
  const hasLowBattery=device=>{
    if(Array.isArray(device.alerts)&&device.alerts.some(alert=>alert?.code==="low_battery"))return true;
    const battery=batteryPercent(device);
    return battery!==null&&battery<=lowBatteryThreshold();
  };
  const deviceNeedsAttention=device=>device.availability==="offline"
    ||device.supported===false
    ||device.interviewCompleted===false
    ||isAlert(device);
  // Otomatik onarım izi: cihaz kendini ilan edince köprünün yazdığı `self_heal` olayı.
  const selfHealLabelKeys={attempt:"selfHealAttempt",ok:"selfHealOk",failed:"selfHealFailed"};
  const eventPresentation=event=>{
    const enabled=event.value===true||String(event.value).toUpperCase()==="ON";
    if(event.property==="action")return{icon:"◉",label:String(event.value).replaceAll("_"," ")};
    if(event.property==="contact")return{icon:"⌑",label:event.value?t("doorClosed"):t("doorOpen")};
    if(event.property==="occupancy"||event.property==="presence")return{icon:"⌁",label:event.value?t("motionDetected"):t("motionClear")};
    if(event.property==="smoke")return{icon:"△",label:event.value?t("smokeDetected"):t("noSmoke")};
    if(event.property==="carbon_monoxide")return{icon:"△",label:event.value?t("coDetected"):t("coClear")};
    if(event.property==="battery_low")return{icon:"▱",label:event.value?t("batteryLow"):t("batteryOkay")};
    if(event.property==="battery_threshold")return{icon:"▱",label:event.value?t("batteryLow"):t("batteryOkay")};
    if(event.property==="availability")return{icon:"●",label:event.value==="online"?t("ready"):t("unreachable")};
    if(event.property==="self_heal")return{icon:"⟳",label:t(selfHealLabelKeys[event.value]||"selfHealAttempt")};
    if(event.property==="state")return{icon:"◉",label:enabled?t("on"):t("off")};
    return{icon:"•",label:String(event.value).replaceAll("_"," ")};
  };
  // Alt yazı önce sunucunun sınıfına bakar (tahmin ya da kullanıcının seçtiği rol); sınıf
  // belirsizse eski kontrol tabanlı yedeğe düşer, böylece hiçbir cihaz etiketsiz kalmaz.
  const deviceCategoryLabels={light:"lightDevice",switch:"switchDevice",cover:"coverDevice",climate:"climateDevice",lock:"lockDevice",fan:"fanDevice"};
  // Sınıfı yalnız ana kontroller belirler: `find_switch` gibi ayar niteliğindeki (adminOnly)
  // aç/kapa alanları sayılmaz, yoksa bir varlık sensörü "Controller" diye etiketlenir.
  const hasMainControl=(device,...kinds)=>device.controls.some(control=>kinds.includes(control.kind)&&control.adminOnly!==true);
  const deviceKind=device=>{
    const labelled=deviceCategoryLabels[device.category];
    if(labelled&&!hasMainControl(device,"siren"))return t(labelled);
    return hasMainControl(device,"cover","position")?t("coverDevice"):device.controls.some(control=>control.kind==="climate")?t("climateDevice"):hasMainControl(device,"lock")?t("lockDevice"):hasMainControl(device,"fan")?t("fanDevice"):hasMainControl(device,"siren")?t("sirenDevice"):hasMainControl(device,"switch")?t("controller"):device.features.includes("contact")?t("doorSensor"):device.features.some(x=>x==="presence"||x==="occupancy")?t("motionSensor"):device.features.includes("smoke")?t("smokeSensor"):device.features.includes("carbon_monoxide")?t("coSensor"):t("sensor");
  };
  // Bir kanal gösteriliyorsa sınıf o kanalın rolünden gelir: çok kanallı anahtarda bir kanal
  // lamba, diğeri priz olabilir. Kanal yoksa cihazın (kanallardan türetilen) sınıfı kullanılır.
  const deviceIconKind=(device,control)=>{
    const features=device.features||[];
    const identity=`${device.name||""} ${device.model||""}`.toLowerCase();
    const category=(control?.kind==="switch"&&control.category)||device.category;
    if(features.includes("smoke")||features.includes("carbon_monoxide"))return"smoke";
    if(category==="cover"||device.controls.some(control=>control.kind==="cover"||control.kind==="position"))return"cover";
    if(category==="lock"||device.controls.some(control=>control.kind==="lock"))return"lock";
    if(category==="fan"||device.controls.some(control=>control.kind==="fan"))return"fan";
    if(device.controls.some(control=>control.kind==="siren"))return"siren";
    if(features.includes("contact"))return"door";
    if(features.some(feature=>feature==="presence"||feature==="occupancy"))return"motion";
    if(category==="light")return"light";
    if(/\b(remote|kumanda)\b/.test(identity))return"remote";
    if(/\b(plug|socket|outlet|priz)\b/.test(identity))return"plug";
    if(category==="switch")return"switch";
    if(features.some(feature=>["brightness","color","color_temp"].includes(feature))||/\b(light|lamp|bulb|led|ışık|lamba)\b/.test(identity))return"light";
    if(device.controls.some(control=>control.kind==="switch"))return"switch";
    if(features.some(feature=>["temperature","humidity","illuminance"].includes(feature)))return"climate";
    return"sensor";
  };
  const deviceIconSvg=kind=>{
    const icons={
      light:'<path d="M9 18h6m-5 3h4m-6.1-7.1A6 6 0 1 1 16.1 14c-.8.7-1.1 1.4-1.1 2H9c0-.7-.3-1.4-1.1-2.1Z"/>',
      switch:'<path d="M12 3v8m-4.9-5.1a7 7 0 1 0 9.8 0"/>',
      plug:'<path d="M8 3v5m8-5v5m-9 0h10v2a5 5 0 0 1-5 5v6m-3 0h6"/>',
      remote:'<rect x="7" y="2.5" width="10" height="19" rx="3"/><circle cx="12" cy="7" r="1.5"/><path d="M10 12h4m-4 4h.1m3.8 0h.1"/>',
      door:'<path d="M5 21V4l12-1v18M5 21h14M14 12h.1"/>',
      motion:'<circle cx="12" cy="6" r="2.2"/><path d="m9 21 1-6-2-3 2-2 4 1 2 4m-1 6-3-6m6-7c1.5 1 2.5 2.4 3 4M6 8c-1.5 1-2.5 2.4-3 4"/>',
      smoke:'<path d="M12 3 3 20h18L12 3Z"/><path d="M12 9v5m0 3v.1"/>',
      climate:'<path d="M10 14.8V5a2 2 0 1 1 4 0v9.8a4 4 0 1 1-4 0Z"/><path d="M12 8v8"/>',
      cover:'<path d="M5 4h14v16H5zM5 8h14M5 12h14M5 16h14"/><path d="m9 2 3 3 3-3"/>',
      lock:'<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
      fan:'<circle cx="12" cy="12" r="2"/><path d="M12 10c-1-5 1-7 3-7 3 1 3 5-1 8M14 12c5-1 7 1 7 3-1 3-5 3-8-1M12 14c1 5-1 7-3 7-3-1-3-5 1-8M10 12c-5 1-7-1-7-3 1-3 5-3 8 1"/>',
      siren:'<path d="M8 18v-7a4 4 0 0 1 8 0v7M5 21h14M4 10H2m20 0h-2M6 4 4.5 2.5M18 4l1.5-1.5M12 3V1"/>',
      sensor:'<circle cx="12" cy="12" r="3"/><path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/>',
      overview:'<path d="M4 11 12 4l8 7"/><path d="M6 10v9h12v-9"/><path d="M10 19v-5h4v5"/>',
      group:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'
    };
    return`<svg class="device-type-svg" viewBox="0 0 24 24" aria-hidden="true">${icons[kind]||icons.sensor}</svg>`;
  };
  const deviceTypeIcon=(device,control)=>deviceIconSvg(deviceIconKind(device,control));
  const deviceVisualFor=(device,imageModel)=>{
    const fallback=`<span class="device-fallback"${imageModel?" hidden":""}>${deviceTypeIcon(device)}</span>`;
    if(!imageModel)return`<div class="device-visual">${fallback.replace(" hidden","")}</div>`;
    const source=`/api/device-image/${encodeURIComponent(imageModel)}`;
    return`<div class="device-visual"><img class="device-photo" src="${esc(source)}" alt="" data-device-image data-model="${esc(imageModel)}">${fallback}</div>`;
  };
  // Sinyal rozeti ve yeniden adlandırma kalemi başlıktaki adın yanında durur; gövdede ayrı satır yok.
  const deviceDetailMetaHtml=device=>`${linkQualityBadge(device)}<button class="device-name-edit" type="button" data-admin-only data-rename="${esc(device.id)}" aria-label="${esc(t("changeName"))}" title="${esc(t("changeName"))}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16-1 5 5-1L19 9l-4-4L4 16Z"/><path d="m13.5 6.5 4 4"/></svg></button>`;
  const deviceDetailPhoto=device=>{
    const imageModel=device.image?device.image.model:device.model;
    if(!imageModel)return"";
    return`<div class="device-detail-photo" data-device-photo hidden><img class="device-photo" src="/api/device-image/${encodeURIComponent(imageModel)}" alt="" data-device-image data-model="${esc(imageModel)}"><button class="image-edit-overlay" type="button" data-admin-only data-change-image="${esc(device.id)}" aria-label="${esc(t("changeImage"))}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h4l2-2h4l2 2h4v15H4V5Z"/><circle cx="12" cy="12" r="4"/></svg><span>${t("changeImage")}</span></button></div>`;
  };
  /* Ham LQI (0-255). Sunucu son değeri cihaz başına saklar (`device.linkquality`); doğrudan kipte
     sinyal cihaz durumunun parçası olmadığı için tek güvenilir kaynak odur. Eski gölge payload'ı
     için `state.linkquality` yedekte kalır. Değer yoksa `null` döner — uydurma değer yok. */
  const rawLinkQuality=device=>{
    const value=Number(device.linkquality??device.state?.linkquality);
    return Number.isFinite(value)?Math.round(Math.max(0,Math.min(255,value))):null;
  };
  const linkQualityPercent=device=>{
    const value=rawLinkQuality(device);
    return value===null?null:Math.round(value/255*100);
  };
  const linkQualityBadge=device=>{
    const percent=linkQualityPercent(device);
    const tone=percent===null?"":percent>=70?"strong":percent>=25?"good":"weak";
    const label=`${t("signal")} ${percent===null?"—":`${percent}%`}`;
    return`<span class="device-link-level${tone?` ${tone}`:""}" title="${esc(label)}" aria-label="${esc(label)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 16a10 10 0 0 1 14 0M8 19a6 6 0 0 1 8 0M11 22a2 2 0 0 1 2 0"/></svg><span>${percent===null?"—":`${percent}%`}</span></span>`;
  };
  const facts=device=>{
    const list=[];
    if(typeof device.state.battery==="number")list.push(`${t("battery")} ${device.state.battery}%`);
    if(device.state.contact!==undefined)list.push(device.state.contact?t("doorClosed"):t("doorOpen"));
    if(device.state.presence!==undefined)list.push(device.state.presence?t("motionDetected"):t("motionClear"));
    else if(device.state.occupancy!==undefined)list.push(device.state.occupancy?t("motionDetected"):t("motionClear"));
    if(device.state.smoke!==undefined)list.push(device.state.smoke?t("smokeDetected"):t("noSmoke"));
    if(device.state.carbon_monoxide!==undefined)list.push(device.state.carbon_monoxide?t("coDetected"):t("coClear"));
    if(typeof device.state.illuminance==="number")list.push(`${device.state.illuminance} lux`);
    if(typeof device.state.power==="number")list.push(`${device.state.power} W`);
    if(typeof device.state.action==="string")list.push(`◉ ${String(device.state.action).replaceAll("_"," ")}`);
    const primaryLabel=primaryStatusForDevice(device).label;
    return list.filter(fact=>fact!==primaryLabel).slice(0,5);
  };
  /* Gizlenenler listesi: kayıtta olmayan her şey görünür. Yıldız/favori değil — "oda kartında
     göster/gizle". Anahtar cihaz kimliği + kontrol kimliği; kontrolü olmayan cihaz `@device`. */
  const isTileHidden=(deviceId,controlId)=>state.hiddenTiles.has(tileVisibilityKey(deviceId,controlId));
  /* Sunucudaki şekil: `{hiddenDevices:[{deviceId,controlId}],hiddenGroups:[groupId]}`. Panelde
     cihaz gizlemesi tek dizeli anahtarla (`<IEEE>::<controlId>`) taşınır; çeviri burada. */
  function visibilityPayload(){
    return{
      hiddenDevices:[...state.hiddenTiles].map(key=>{
        const index=key.lastIndexOf("::");
        return index<0?null:{deviceId:key.slice(0,index),controlId:key.slice(index+2)};
      }).filter(entry=>entry&&entry.deviceId&&entry.controlId),
      hiddenGroups:[...state.hiddenGroups]
    };
  }
  /* Yerel yansı yalnız çevrimdışı açılış içindir: karar sunucudadır, bu kayıt onu ezmez. */
  function cacheVisibility(){
    try{localStorage.setItem(visibilityCacheKey,JSON.stringify({
      hiddenDevices:[...state.hiddenTiles],
      hiddenGroups:[...state.hiddenGroups]
    }))}catch{}
  }
  function applyVisibility(visibility){
    const devices=Array.isArray(visibility?.hiddenDevices)?visibility.hiddenDevices:[];
    const groups=Array.isArray(visibility?.hiddenGroups)?visibility.hiddenGroups:[];
    state.hiddenTiles=new Set(devices
      .filter(entry=>entry&&typeof entry.deviceId==="string"&&typeof entry.controlId==="string")
      .map(entry=>tileVisibilityKey(entry.deviceId,entry.controlId)));
    state.hiddenGroups=new Set(groups.filter(id=>typeof id==="string"&&id));
    cacheVisibility();
  }
  /* Yazma hatası sessiz kalmaz: kullanıcı görünür uyarı alır, sunucu tarafında da
     `RecentErrorLog`'a düşer. Panel son bilinen değerle çalışmaya devam eder. */
  async function saveHomeVisibility(){
    cacheVisibility();
    try{
      await api("/api/home-visibility",{method:"PUT",body:JSON.stringify({visibility:visibilityPayload()})});
      return true;
    }catch(error){showToast(t("visibilitySaveFailed",{error:error.message}),true);return false}
  }
  function toggleTileVisibility(deviceId,controlId){
    if(!deviceId)return;
    const key=tileVisibilityKey(deviceId,controlId);
    if(state.hiddenTiles.has(key))state.hiddenTiles.delete(key);
    else state.hiddenTiles.add(key);
    void saveHomeVisibility();
    render();
  }
  const visibilityIcon=hidden=>hidden
    ?'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 3 18 18"/><path d="M10.6 5.2A9.3 9.3 0 0 1 12 5.1c5 0 9 4.4 9 6.9 0 1-.7 2.3-1.9 3.5"/><path d="M6.4 6.8C4.3 8.2 3 10.1 3 12c0 2.5 4 6.9 9 6.9 1.7 0 3.2-.5 4.5-1.2"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>'
    :'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12c0-2.5 4-6.9 9-6.9s9 4.4 9 6.9-4 6.9-9 6.9-9-4.4-9-6.9Z"/><circle cx="12" cy="12" r="3"/></svg>';
  const visibilityLabel=hidden=>t(hidden?"showOnRoomCard":"hideFromRoomCard");
  const visibilityButton=(device,control)=>{
    const hidden=isTileHidden(device.id,control.id);
    const label=`${visibilityLabel(hidden)}: ${control.name||device.name}`;
    return`<button class="visibility-toggle${hidden?" is-hidden":""}" type="button" role="switch" aria-checked="${hidden?"false":"true"}" data-visibility-device="${esc(device.id)}" data-visibility-control="${esc(control.id)}" aria-label="${esc(label)}" title="${esc(visibilityLabel(hidden))}">${visibilityIcon(hidden)}</button>`;
  };
  const commandValue=value=>esc(JSON.stringify(value));
  const optionValue=(values,pattern,fallback)=>values?.find(value=>pattern.test(String(value).toUpperCase()))??fallback;
  const dashboardControlKinds=new Set(["switch","fan","siren","cover","position","lock","climate"]);
  const isDashboardControl=control=>dashboardControlKinds.has(control.kind)&&control.adminOnly!==true;
  const dashboardControlForDevice=device=>device.controls.find(control=>isDashboardControl(control)&&control.id==="main")
    ||device.controls.find(control=>isDashboardControl(control)&&["switch","fan","siren","cover","lock"].includes(control.kind))
    ||device.controls.find(isDashboardControl);
  const binaryControlActive=control=>
    control.value===true
    ||String(control.value).toUpperCase()===String(control.valueOn??"ON").toUpperCase();
  const dashboardControlValueForState=(control,active)=>{
    if(["switch","fan","siren"].includes(control.kind))return Boolean(active);
    if(control.kind==="cover"){
      const values=control.values||[];
      return active?optionValue(values,/OPEN|UP/,"OPEN"):optionValue(values,/CLOSE|DOWN/,"CLOSE");
    }
    if(control.kind==="lock"){
      const values=control.values||[];
      return active?optionValue(values,/^LOCK(?:ED)?$/,"LOCK"):optionValue(values,/UNLOCK/,"UNLOCK");
    }
    return undefined;
  };
  const dashboardControlAction=control=>{
    if(!control)return null;
    if(["switch","fan","siren"].includes(control.kind)){
      const active=binaryControlActive(control);
      return{active,value:dashboardControlValueForState(control,!active)};
    }
    if(control.kind==="cover"){
      const active=/OPEN|OPENING|UP/.test(String(control.value??"").toUpperCase());
      return{active,value:dashboardControlValueForState(control,!active)};
    }
    if(control.kind==="lock"){
      const active=/^LOCK(?:ED)?$/.test(String(control.value??"").toUpperCase());
      return{active,value:dashboardControlValueForState(control,!active)};
    }
    return null;
  };
  const confirmCommandKey=(control,action)=>{
    if(!control||!action)return"";
    if(control.kind==="lock")return action.active===true?"confirmUnlockDevice":"";
    if(control.kind==="siren")return action.active===true?"":"confirmSirenDevice";
    return"";
  };
  const confirmCommandAttribute=(control,action)=>{
    const key=confirmCommandKey(control,action);
    return key?` data-confirm-command="${key}"`:"";
  };
  const levelValueHtml=(value,unit)=>`${esc(value)}${unit?`<span class="control-unit">${esc(unit)}</span>`:""}`;
  const renameGlyph=`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16-1 5 5-1L19 9l-4-4L4 16Z"/><path d="m13.5 6.5 4 4"/></svg>`;
  // Ayrı adı olan tek şey aç/kapa kanalıdır: `state`/`state_lN` kanalları `<ieee>:<kanal>` takma adını
  // okur, kimlikleri de o kanaldır ("main", "l1"). Perde, kilit, fan, siren ve cihazın yayımladığı
  // ikili ayarların kimliği `cover:...`, `switch:child_lock` gibidir; adları cihazın kendi etiketinden
  // gelir, takma ad okunmaz — bu satırlarda kalem gösterilmez.
  const isNamedChannel=control=>control?.kind==="switch"&&!String(control.id||"").includes(":");
  const deviceNamedChannels=device=>(device?.controls||[]).filter(isNamedChannel);
  // Tek kanallı cihazda "kanal adı" diye ayrı bir kavram yok: cihaz adı kanalın da adıdır, tek kalem
  // (başlıktaki) yeter. Ayrı kanal adları yalnız birden çok aç/kapa kanalı olan cihazda anlamlı.
  const deviceHasChannelNames=device=>deviceNamedChannels(device).length>1;
  const channelDisplayName=(device,control)=>
    isNamedChannel(control)&&!deviceHasChannelNames(device)?device.name:control.name;
  const renameControlButton=(device,control)=>{
    if(!isNamedChannel(control)||!deviceHasChannelNames(device))return"";
    const label=control.name?`${t("nameChannel")}: ${control.name}`:t("nameChannel");
    return`<button class="control-rename" type="button" data-admin-only data-rename-channel="${esc(device.id)}" data-channel="${esc(control.id)}" aria-label="${esc(label)}" title="${esc(t("nameChannel"))}">${renameGlyph}</button>`;
  };
  const controlHtml=(device,control)=>{
    const adminClass=control.adminOnly?" admin-control":"";
    const adminAttr=control.adminOnly?" data-admin-only":"";
    if(["switch","fan","siren"].includes(control.kind)){
      const active=binaryControlActive(control);
      const known=typeof control.value==="boolean";
      const valueLabel=control.value===null?t("unknownState"):active?t("on"):t("off");
      const pending=commandPending(device.id,control.property);
      const name=channelDisplayName(device,control);
      return`<div class="control-row${adminClass}"${adminAttr}><div><div class="control-name">${esc(name)}${renameControlButton(device,control)}</div><div class="control-value">${pending?t("sendingCommand"):valueLabel}</div></div><div class="control-actions">${isDashboardControl(control)?visibilityButton(device,control):""}<button class="switch ${active?"on":""}${pending?" pending":""}" data-command-value="${commandValue(!active)}" data-device="${esc(device.id)}" data-property="${esc(control.property)}" aria-label="${esc(name)}" aria-pressed="${active}"${pending?' aria-busy="true"':""}${pending?" disabled":""}><span></span></button></div></div>`;
    }
    if(control.kind==="cover"){
      const values=control.values||[];
      const openValue=optionValue(values,/OPEN|UP/,"OPEN");
      const stopValue=optionValue(values,/STOP/,"STOP");
      const closeValue=optionValue(values,/CLOSE|DOWN/,"CLOSE");
      const current=String(control.value??"").toUpperCase();
      return`<div class="control-row${adminClass}"${adminAttr}><div><div class="control-name">${esc(control.name||t("cover"))}</div><div class="control-value">${esc(control.value??t("unknownState"))}</div></div><div class="control-icon-actions">${isDashboardControl(control)?visibilityButton(device,control):""}<button class="control-command ${current===String(openValue).toUpperCase()?"active":""}" data-command-value="${commandValue(openValue)}" data-device="${esc(device.id)}" data-property="${esc(control.property)}" aria-label="${t("open")}" title="${t("open")}">↑</button><button class="control-command stop" data-command-value="${commandValue(stopValue)}" data-device="${esc(device.id)}" data-property="${esc(control.property)}" aria-label="${t("stop")}" title="${t("stop")}">■</button><button class="control-command close-action ${current===String(closeValue).toUpperCase()?"active":""}" data-command-value="${commandValue(closeValue)}" data-device="${esc(device.id)}" data-property="${esc(control.property)}" aria-label="${t("close")}" title="${t("close")}">↓</button></div></div>`;
    }
    if(control.kind==="lock"){
      const values=control.values||[];
      const lockValue=optionValue(values,/^LOCK(?:ED)?$/,"LOCK");
      const unlockValue=optionValue(values,/UNLOCK/,"UNLOCK");
      const locked=/^LOCK(?:ED)?$/.test(String(control.value??"").toUpperCase());
      return`<div class="control-row${adminClass}"${adminAttr}><div><div class="control-name">${esc(control.name||t("lockDevice"))}</div><div class="control-value">${locked?t("lock"):t("unlock")}</div></div><div class="control-icon-actions">${isDashboardControl(control)?visibilityButton(device,control):""}<button class="control-command ${locked?"active":""}" data-command-value="${commandValue(lockValue)}" data-device="${esc(device.id)}" data-property="${esc(control.property)}" aria-label="${t("lock")}" title="${t("lock")}">▣</button><button class="control-command ${!locked?"active":""}" data-command-value="${commandValue(unlockValue)}" data-device="${esc(device.id)}" data-property="${esc(control.property)}" aria-label="${t("unlock")}" title="${t("unlock")}">□</button></div></div>`;
    }
    if(control.kind==="select"){
      return`<div class="control-row${adminClass}"${adminAttr}><div><div class="control-name">${esc(control.name)}</div>${control.adminOnly?`<div class="control-value">${t("deviceSetting")}</div>`:""}</div><select class="control-select" data-select="${esc(device.id)}" data-property="${esc(control.property)}" aria-label="${esc(control.name)}">${(control.values||[]).map(value=>`<option value="${esc(value)}"${String(value)===String(control.value)?" selected":""}>${esc(String(value).replaceAll("_"," "))}</option>`).join("")}</select></div>`;
    }
    if(control.kind==="color")return`<div class="control-row${adminClass}"${adminAttr}><div><div class="control-name">${t("color")}</div><div class="control-value">${esc(control.value)}</div></div><input type="color" value="${esc(control.value||"#ffffff")}" data-color="${esc(device.id)}" data-property="${esc(control.property)}" aria-label="${t("color")}"></div>`;
    const known=typeof control.value==="number";
    const label=control.kind==="position"?t("position"):control.kind==="climate"?t("targetTemperature"):control.name;
    return`<div class="control-row${adminClass}"${adminAttr}><div><div class="control-name">${esc(label)}</div><div class="control-value">${known?levelValueHtml(control.value,control.unit):t("unknownState")}</div></div><div class="control-actions">${isDashboardControl(control)?visibilityButton(device,control):""}<input type="range" min="${control.min??0}" max="${control.max??100}" step="${control.step??1}" value="${known?control.value:control.min??0}" data-level="${esc(device.id)}" data-property="${esc(control.property)}" data-unit="${esc(control.unit||"")}" aria-label="${esc(label)}"></div></div>`;
  };
  // Rol satırı cihazın yayımladığı ayarların en altında, "switch type" gibi görünür. Cihaza yazılmaz,
  // Villa Bridge'in kendi ayarıdır — alt yazısı bunu söyler. Satır her cihazda çıkar; seçim yalnız
  // lamba↔anahtar karışıklığının mümkün olduğu yerde, yani aç/kapa kontrolü olan cihazda sunulur.
  // Ölçüt cihazın yeteneği; ad ya da model listesi yok. Sensör, perde, kilit gibi cihazlarda satır
  // tespit edilen sınıfı düz metin gösterir.
  const deviceRoleChannels=device=>(device?.controls||[]).filter(control=>control.kind==="switch");
  const deviceRoleRowsHtml=device=>{
    const channels=deviceRoleChannels(device);
    if(!channels.length){
      return`<div class="control-row admin-control"><div><div class="control-name">${esc(t("deviceRoleLabel"))}</div><div class="control-value">${t("appSetting")}</div></div><div class="control-value device-role-fixed">${esc(t("deviceRoleFixed",{kind:deviceKind(device)}))}</div></div>`;
    }
    return channels.map(control=>{
      const guess=deviceCategoryLabels[control.detectedCategory||device.detectedCategory];
      const current=control.role||"auto";
      // Tek kanallı cihazda satır bugünküyle aynı; çoklu kanalda başlık kanalın adını taşır
      // (kullanıcının verdiği kanal adı varsa o gelir — kanal kimliği şeması ile aynı). Ayrı kanal
      // adı olmayan satırda cihaz adı kullanılır, kanal adı uydurulmaz.
      const label=channels.length>1?t("deviceRoleChannelLabel",{channel:channelDisplayName(device,control)}):t("deviceRoleLabel");
      const options=deviceRoleOptions.map(role=>{
        const optionLabel=role!=="auto"
          ?t(deviceRoleLabels[role])
          :`${t("deviceRoleAuto")} (${guess?t("deviceRoleAutoGuess",{kind:t(guess)}):t("deviceRoleAutoUnknown")})`;
        return`<option value="${role}"${role===current?" selected":""}>${esc(optionLabel)}</option>`;
      }).join("");
      return`<div class="control-row admin-control"><div><div class="control-name">${esc(label)}</div><div class="control-value">${t("appSetting")}</div></div><select class="control-select" data-device-role-select="${esc(device.id)}" data-device-role-channel="${esc(control.id)}" aria-label="${esc(label)}">${options}</select></div>`;
    }).join("");
  };
  const primaryStatusForDevice=(device,preparing=false)=>{
    if(preparing)return{label:t("preparing"),tone:"muted"};
    if(device.availability==="offline")return{label:device.lastSeen?t("unreachableSince",{time:ago(device.lastSeen)}):t("unreachable"),tone:"danger"};
    if(device.supported===false)return{label:t("unsupportedDevice"),tone:"danger"};
    if(device.interviewCompleted===false)return{label:t("setupIncomplete"),tone:"danger"};
    const value=device.state||{};
    if(value.smoke!==undefined)return{label:value.smoke?t("smokeDetected"):t("noSmoke"),tone:value.smoke?"danger":"muted"};
    if(value.carbon_monoxide!==undefined)return{label:value.carbon_monoxide?t("coDetected"):t("coClear"),tone:value.carbon_monoxide?"danger":"muted"};
    if(value.contact!==undefined)return{label:value.contact?t("doorClosed"):t("doorOpen"),tone:value.contact?"muted":"active"};
    const occupied=value.occupancy!==undefined?value.occupancy:value.presence;
    if(occupied!==undefined)return{label:occupied?t("motionDetected"):t("motionClear"),tone:occupied?"active":"muted"};
    if(hasLowBattery(device))return{label:t("batteryLow"),tone:"danger"};
    const mainControl=dashboardControlForDevice(device);
    if(typeof mainControl?.value==="boolean")return{label:mainControl.value?t("on"):t("off"),tone:mainControl.value?"active":"muted"};
    if(mainControl?.value!==null&&mainControl?.value!==undefined){
      return{label:String(mainControl.value).replaceAll("_"," "),tone:"muted"};
    }
    if(typeof value.action==="string")return{label:String(value.action).replaceAll("_"," "),tone:"active"};
    return{label:device.availability==="online"?t("ready"):t("standby"),tone:device.availability==="online"?"active":"muted"};
  };
  const deviceStatusIcon=(device,primaryStatus)=>`<span class="device-status-icon ${primaryStatus.tone}${device.availability==="offline"?" offline":""}" aria-hidden="true">${deviceTypeIcon(device)}</span>`;
  const cardStatusBadge=device=>{
    const percent=linkQualityPercent(device);
    if(percent!==null&&percent<25){
      const label=`${t("signal")} ${percent}%`;
      return`<span class="device-link-level compact weak" title="${esc(label)}" aria-label="${esc(label)}">${percent}%</span>`;
    }
    const battery=batteryPercent(device);
    if(battery!==null&&battery<=lowBatteryThreshold()){
      const label=`${t("battery")} ${battery}%`;
      return`<span class="quick-battery low card-battery" title="${esc(label)}" aria-label="${esc(label)}"><span class="battery-glyph" aria-hidden="true"><i style="width:${battery}%"></i></span>${battery}%</span>`;
    }
    return"";
  };
  const deviceCardToggle=(device,preparing)=>{
    const control=dashboardControlForDevice(device);
    const action=dashboardControlAction(control);
    if(!action)return"";
    const pending=commandPending(device.id,control.property);
    const disabled=preparing||pending||device.availability==="offline";
    const shown=pending?!action.active:action.active;
    return`<button class="device-card-toggle${shown?" on":""}${pending?" pending":""}" type="button" data-command-value="${commandValue(action.value)}" data-device="${esc(device.id)}" data-property="${esc(control.property)}" aria-label="${esc(device.name)}" aria-pressed="${action.active}"${pending?` aria-busy="true"`:""}${disabled?" disabled":""}><span class="toggle-track" aria-hidden="true"><span class="toggle-knob"></span>${pending?'<span class="command-spinner toggle-spinner"></span>':""}</span></button>`;
  };
  const deviceCardHtml=device=>{
    const preparing=device.preparing===true;
    const failed=commandFailed(device.id);
    const primaryStatus=failed?{label:t("commandFailed"),tone:"danger"}:primaryStatusForDevice(device,preparing);
    const offline=device.availability==="offline";
    const cardToggle=deviceCardToggle(device,preparing);
    const detailHint=`<span class="device-card-hint${cardToggle?" divided":""}" aria-hidden="true">›</span>`;
    return`<article class="device-card${failed?" command-failed":""}${offline?" device-card-offline":""}${preparing?" preparing":""}"${preparing?' inert aria-busy="true"':""} tabindex="0" data-device-card="${esc(device.id)}" data-name="${esc(device.name.toLowerCase())}" aria-label="${esc(device.name)} · ${esc(primaryStatus.label)}">
      <div class="device-card-header"><div class="device-card-lead">${deviceStatusIcon(device,primaryStatus)}${cardStatusBadge(device)}</div><div class="device-card-copy"><div class="device-name-row"><div class="device-name">${esc(device.name)}</div></div><div class="device-meta"><span class="device-meta-text"><span class="device-primary-status ${primaryStatus.tone}">${esc(primaryStatus.label)}</span></span></div></div><div class="device-header-status">${detailHint}${cardToggle}</div></div>
    </article>`;
  };
  /* Liste görünümü — Zigbee2MQTT'nin Devices tablosunun sütun düzeni, aynı sırayla:
     # · Görsel · Ad · UID · Üretici · Model · LQI · Durum · Güç · Eylemler.
     "En son görülme" Z2M'de ayrı sütun değildir; 1024×640'ta on birinci sütun sığmadığı için
     Durum hücresinin altına ikinci satır olarak konur (göreli metin, tam zaman `title`'da).
     Hiçbir hücrede uydurma değer yoktur: veri yoksa "—" yazar. */
  const deviceTableDash=`<span class="device-table-text" aria-hidden="true">—</span>`;
  const deviceTablePower=device=>{
    const battery=batteryPercent(device);
    const source=String(device.powerSource||"");
    if(battery!==null)return`${t("powerBattery")} ${battery}%`;
    if(/batter/i.test(source))return t("powerBattery");
    if(/mains|dc\s*source/i.test(source))return t("powerMains");
    /* `powerSource` yoksa pil özelliğinin varlığından türetilir; o da yoksa bilgi yoktur. */
    if(device.features?.includes("battery"))return t("powerBattery");
    return null;
  };
  const deviceTableAvailability=device=>{
    if(device.availability==="online")return{tone:"online",label:t("online")};
    if(device.availability==="offline")return{tone:"offline",label:t("unreachable")};
    return{tone:"",label:t("availabilityUnknown")};
  };
  /* Sıralama anahtarı olarak da kullanılır: karşılaştırılabilir bir skaler döndürür. */
  const deviceSortValue=(device,key)=>{
    if(key==="lqi")return rawLinkQuality(device)??-1;
    if(key==="status")return device.availability==="online"?2:device.availability==="offline"?0:1;
    if(key==="lastSeen")return device.lastSeen?new Date(device.lastSeen).getTime()||0:0;
    return null;
  };
  const sortedDeviceRows=devices=>{
    const{key,direction}=state.deviceSort;
    const factor=direction==="desc"?-1:1;
    const byName=(left,right)=>String(left.name).localeCompare(String(right.name),state.language);
    if(key==="name")return[...devices].sort((left,right)=>byName(left,right)*factor);
    return[...devices].sort((left,right)=>{
      const difference=deviceSortValue(left,key)-deviceSortValue(right,key);
      return difference!==0?difference*factor:byName(left,right);
    });
  };
  const deviceTableHeader=(key,label)=>{
    const active=state.deviceSort.key===key;
    const sort=active?(state.deviceSort.direction==="desc"?"descending":"ascending"):"none";
    /* `aria-sort` yalnızca başlık hücresine aittir; düğmedeki `data-sort` sadece okun CSS kancasıdır. */
    return`<th scope="col" aria-sort="${sort}"><button class="device-table-sort" type="button" data-device-sort="${esc(key)}" data-sort="${sort}" title="${esc(t("deviceTableSort",{label}))}"><span>${esc(label)}</span><span class="device-table-arrow" aria-hidden="true">${state.deviceSort.direction==="desc"?"▼":"▲"}</span></button></th>`;
  };
  const deviceTableActions=device=>[
    `<button class="device-table-action" type="button" data-admin-only data-rename="${esc(device.id)}" title="${esc(t("changeName"))}" aria-label="${esc(`${t("changeName")}: ${device.name}`)}">${renameGlyph}</button>`,
    `<button class="device-table-action" type="button" data-admin-only data-reconfigure="${esc(device.id)}" title="${esc(t("repairDevice"))}" aria-label="${esc(`${t("repairDevice")}: ${device.name}`)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5"/><path d="M19 12a7 7 0 1 0-2 5"/></svg></button>`,
    `<button class="device-table-action danger" type="button" data-admin-only data-remove="${esc(device.id)}" title="${esc(t("removeDevice"))}" aria-label="${esc(`${t("removeDevice")}: ${device.name}`)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14"/><path d="M9 7V5h6v2"/><path d="M7 7l1 13h8l1-13"/></svg></button>`
  ].join("");
  const deviceTableRowHtml=(device,index)=>{
    const availability=deviceTableAvailability(device);
    const lqi=rawLinkQuality(device);
    const percent=linkQualityPercent(device);
    const lqiTone=percent===null?"":percent>=70?"strong":percent>=25?"good":"weak";
    const power=deviceTablePower(device);
    const shortAddress=Number.isInteger(device.networkAddress)
      ?`<small>0x${device.networkAddress.toString(16).padStart(4,"0")}</small>`
      :"";
    const seen=device.lastSeen
      ?`<span class="device-table-seen" title="${esc(new Date(device.lastSeen).toLocaleString(state.language))}">${esc(ago(device.lastSeen))}</span>`
      :`<span class="device-table-seen">${esc(t("deviceTableLastSeen"))}: —</span>`;
    return`<tr tabindex="0" data-device-card="${esc(device.id)}" data-name="${esc(device.name.toLowerCase())}"${device.availability==="offline"?' class="device-row-offline"':""} aria-label="${esc(`${device.name} · ${availability.label}`)}">
      <td class="device-table-index">${index+1}</td>
      <td class="device-table-visual">${deviceVisualFor(device,device.image?device.image.model:device.model)}</td>
      <td class="device-table-name">${esc(device.name)}</td>
      <td class="device-table-uid">${esc(device.id)}${shortAddress}</td>
      <td class="device-table-text">${device.vendor?esc(device.vendor):deviceTableDash}</td>
      <td class="device-table-text">${device.model?esc(device.model):deviceTableDash}</td>
      <td class="device-table-lqi${lqiTone?` ${lqiTone}`:""}"${lqi===null?"":` title="${esc(`${t("signal")} ${percent}%`)}"`}>${lqi===null?"—":lqi}</td>
      <td><span class="device-table-state${availability.tone?` ${availability.tone}`:""}"><span class="device-table-dot" aria-hidden="true"></span>${esc(availability.label)}</span>${seen}</td>
      <td class="device-table-text">${power?esc(power):deviceTableDash}</td>
      <td class="device-table-actions"><div class="device-table-action-row">${deviceTableActions(device)}</div></td>
    </tr>`;
  };
  const deviceTableHtml=devices=>{
    const rows=sortedDeviceRows(devices).map(deviceTableRowHtml).join("");
    return`<div class="device-table-panel"><div class="device-table-wrap"><table class="device-table"><thead><tr>
      <th scope="col" class="device-table-index">#</th>
      <th scope="col">${esc(t("deviceTablePicture"))}</th>
      ${deviceTableHeader("name",t("deviceTableName"))}
      <th scope="col">${esc(t("uid"))}</th>
      <th scope="col">${esc(t("deviceTableVendor"))}</th>
      <th scope="col">${esc(t("model"))}</th>
      ${deviceTableHeader("lqi","LQI")}
      ${deviceTableHeader("status",t("deviceTableStatus"))}
      <th scope="col">${esc(t("deviceTablePower"))}</th>
      <th scope="col" class="device-table-actions">${esc(t("deviceTableActions"))}</th>
    </tr></thead><tbody>${rows}</tbody></table></div><p class="device-table-note">${esc(t("deviceTableCount",{count:devices.length}))}</p></div>`;
  };
  function setDeviceSort(key){
    const same=state.deviceSort.key===key;
    /* Ad artan başlar (alfabe), ölçüm sütunları azalan başlar: en güçlü/en yeni üstte. */
    const direction=same?(state.deviceSort.direction==="asc"?"desc":"asc"):key==="name"?"asc":"desc";
    state.deviceSort={key,direction};
    try{localStorage.setItem("villa-device-sort",`${key}:${direction}`)}catch{}
    filterDevices();
    bindCards();
  }
  const deviceRoomsHtml=device=>{
    if(!state.groups.length)return"";
    const chips=state.groups.map(group=>{
      const member=deviceInRoom(device,group.id);
      const label=t(member?"removeFromRoom":"addToRoom",{name:group.name});
      return`<button class="room-membership${member?" active":""}" type="button" data-toggle-room="${esc(group.id)}" data-room-device="${esc(device.id)}" aria-pressed="${member}" title="${esc(label)}" aria-label="${esc(label)}"><span class="room-membership-mark" aria-hidden="true">${member?"✓":"+"}</span>${esc(group.name)}</button>`;
    }).join("");
    return`<div class="device-rooms"><div class="device-rooms-head">${t("deviceRooms")}</div><div class="device-rooms-chips">${chips}</div></div>`;
  };
  /* Kontrolü olan cihazlarda göster/gizle kontrol satırında duruyor. Kontrolü olmayan cihazın
     (sensör) döşemesi de gizlenebildiği için Cihazlar sayfasında karşılığı burada verilir —
     yoksa gizlenen sensör yalnız düzenleme kipinden geri getirilebilirdi. */
  const deviceVisibilityHtml=device=>{
    if(device.controls.some(isDashboardControl))return"";
    const hidden=isTileHidden(device.id,null);
    const label=visibilityLabel(hidden);
    return`<div class="device-rooms"><div class="device-rooms-head">${t("roomCardVisibility")}</div><div class="device-rooms-chips"><button class="room-membership${hidden?"":" active"}" type="button" role="switch" aria-checked="${hidden?"false":"true"}" data-visibility-device="${esc(device.id)}" data-visibility-control="${esc(groupDeviceControlId)}" aria-label="${esc(label)}" title="${esc(label)}">${visibilityIcon(hidden)}${esc(label)}</button></div></div>`;
  };
  // §5.1.1 — düğmeler sunucudan alt varlık olarak gelir; arayüz ham `action` dizesini kendi çözmez.
  const deviceButtonNamedKeys={on:"deviceButtonOn",off:"deviceButtonOff",toggle:"deviceButtonToggle",up:"deviceButtonUp",down:"deviceButtonDown",left:"deviceButtonLeft",right:"deviceButtonRight",both:"deviceButtonBoth",open:"deviceButtonOpen",close:"deviceButtonClose",stop:"deviceButtonStop",brightness_up:"deviceButtonBrightnessUp",brightness_down:"deviceButtonBrightnessDown",arrow_left:"deviceButtonArrowLeft",arrow_right:"deviceButtonArrowRight",play_pause:"deviceButtonPlayPause",next:"deviceButtonNext",previous:"deviceButtonPrevious"};
  const deviceButtonKey=button=>button?.kind==="numbered"?"deviceButtonNumbered":button?.kind==="single"?"deviceButtonSingle":button?.kind==="ungrouped"?"deviceButtonOther":deviceButtonNamedKeys[button?.key]||"";
  const deviceButtonDefaultName=(button,language)=>{
    const template=translations[language]?.[deviceButtonKey(button)];
    return template?template.replace("{number}",String(button?.number??"")):"";
  };
  // Kullanıcının verdiği ad daima kazanır; ad yoksa sunucunun ürettiği varsayılan yerine arayüz dili.
  const deviceButtonName=button=>{
    const generated=deviceButtonDefaultName(button,"tr");
    const localized=deviceButtonDefaultName(button,state.language);
    if(generated&&localized&&button?.name===generated)return localized;
    return button?.name||localized||String(button?.id??"");
  };
  // Tanınmayan basış (`ungrouped` kovası) ham değeriyle gösterilir; boşluk ya da çökme olmaz.
  const deviceButtonPressLabel=press=>{const key=automationPressKeys[press];return key?t(key):String(press??"")};
  // Kullanıcıya yalnızca kısa basış ve basılı tutma sunulur; art arda basış seçeneği gösterilmez.
  // Eleme yalnız sunum katmanındadır: sunucu tüm basışları üretmeye, kayıtlı kurallar çalışmaya devam eder.
  const hiddenPressKinds=new Set(["double","triple","quadruple","quintuple","many"]);
  // Elemeden sonra hiçbir şey kalmazsa liste boş bırakılmaz; cihaz ne bildiriyorsa o gösterilir.
  // `keep`: hâlihazırda kayıtlı olan seçim, elense bile listede kalır (düzenleme seçimi kaybolmasın).
  const visiblePresses=(entries,keep)=>{
    const list=entries||[];
    const kept=list.filter(entry=>!hiddenPressKinds.has(entry.press)||(keep!=null&&keep===entry.action));
    return kept.length?kept:list;
  };
  const deviceButtonPressList=button=>visiblePresses(button?.actions).map(entry=>deviceButtonPressLabel(entry.press)).join(" · ");
  const deviceButtonRenameButton=(device,button)=>`<button class="control-rename" type="button" data-admin-only data-rename-channel="${esc(device.id)}" data-channel="${esc(button.id)}" aria-label="${esc(`${t("nameButton")}: ${deviceButtonName(button)}`)}" title="${esc(t("nameButton"))}">${renameGlyph}</button>`;
  // Vurgu penceresi 8 sn'lik yenilemeye eşit: her basış en az bir kez vurgulanır, yeni zamanlayıcı kurulmaz.
  const deviceButtonPressWindowMs=8000;
  const deviceButtonPressed=(device,button)=>{
    const last=device.lastAction;
    if(!last||last.buttonId!==button.id)return false;
    return Date.now()-new Date(last.at).getTime()<deviceButtonPressWindowMs;
  };
  // Cihaz tanımında `action` görünmesi düğme sinyali gönderdiğini KANITLAMAZ: duvar dimmer'ları da
  // bildirir ama hiç yaymaz. Tek kanıt cihazın kendi yaydığı basış — sunucudaki `lastAction` ve olay akışı.
  // Türetici (src/device-buttons.ts) değişmez; eleme yalnız burada, sunum katmanındadır.
  const deviceSeenPress=device=>Boolean(device?.lastAction)
    ||(state.events||[]).some(item=>item.sourceName===device?.sourceName&&item.property==="action");
  const deviceButtonLastLine=device=>{
    const last=device.lastAction;
    const button=last?(device.buttons||[]).find(item=>item.id===last.buttonId):null;
    if(!last||!button)return`<div class="device-buttons-hint">${esc(t("deviceButtonLearnHint"))}</div>`;
    const entry=button.actions.find(item=>item.action===last.action);
    return`<div class="device-buttons-last">${esc(t("deviceButtonLastPress",{button:deviceButtonName(button),press:deviceButtonPressLabel(entry?.press??last.action),time:ago(last.at)}))}</div>`;
  };
  const deviceButtonsHtml=device=>{
    const buttons=device.buttons||[];
    if(!buttons.length)return"";
    // Prizden beslenen cihaz (kumanda değil, duvar anahtarı/dimmer) hiç basış yaymadıysa bölüm çıkmaz:
    // orada bastıracak düğme yok, adlandırma kutusu yanıltıyor. Pilli kumandada bölüm kalır —
    // yeni eşleştirilmiş kumanda henüz basılmamış olabilir, ipucu satırı ona yol gösterir.
    if(device.type==="Router"&&!deviceSeenPress(device))return"";
    const rows=buttons.map(button=>`<div class="device-button-row${deviceButtonPressed(device,button)?" pressed":""}" data-device-button="${esc(button.id)}"><div class="device-button-name">${esc(deviceButtonName(button))}${deviceButtonRenameButton(device,button)}</div><div class="device-button-presses">${esc(deviceButtonPressList(button))}</div></div>`).join("");
    return`<div class="device-buttons"><div class="device-buttons-head">${t("deviceButtons")}</div>${deviceButtonLastLine(device)}${rows}</div>`;
  };
  // Otomatik onarım sessiz kalmasın: cihazın kendi kartında son denemenin izi görünür.
  const deviceSelfHealHtml=device=>{
    const event=(state.events||[]).find(item=>item.sourceName===device.sourceName&&item.property==="self_heal");
    if(!event)return"";
    return`<div class="device-buttons-last">${esc(t("selfHealLast",{status:t(selfHealLabelKeys[event.value]||"selfHealAttempt"),time:ago(event.at)}))}</div>`;
  };
  /* Büyük dikey ışık kumandası — yetenek bazlı çizilir. Hangi parçanın görüneceğini cihazın
     SUNDUĞU kumandalar belirler; model ya da ad listesi yoktur. Parçalar `DeviceControlView`
     kimliğinden okunur: `main` aç/kapa kanalı, `main:brightness`, `main:temperature`,
     `main:color` ve efekt `select`i. Yoksa o parça hiç çizilmez. */
  const lightPanelParts=device=>{
    const controls=device?.controls||[];
    const byId=(id,kind)=>controls.find(control=>control.id===id&&control.kind===kind)||null;
    return{
      power:controls.find(control=>control.kind==="switch"&&control.id==="main")||controls.find(isNamedChannel)||null,
      level:byId("main:brightness","level"),
      temperature:byId("main:temperature","temperature"),
      color:byId("main:color","color"),
      effect:controls.find(control=>control.kind==="select"&&/(^|_)effect$/.test(String(control.property||"")))||null
    };
  };
  /* Kumanda ışık profiline aittir: sınıf tanım verisinden (`light` expose tipi) çıkar, kullanıcının
     seçtiği rol onu ezebilir. Priz/anahtarda çizilmez — dolan bir kolon orada olmayan bir karartmayı
     vaat eder, o cihazlar zaten satır anahtarıyla açılıp kapanıyor. Lambayı süren röleyi kullanıcı
     rolüyle "Işık" yapınca kumanda kendiliğinden gelir; ölçüt yine yetenek, ad değil. */
  const lightPanelSupported=(device,parts)=>device?.category==="light"&&Boolean(parts.power||parts.level);
  /* Kumandanın güç düğmesi aç/kapa satırıyla aynı kanalı sürüyor; satırı elemek için o satırın TAŞIDIĞI
     her şeyin yukarı taşınmış olması gerekir. Göz (`visibilityButton`) kumandaya taşındı, kalem değil:
     kalem yalnız ÇOK KANALLI cihazda çıkar ve o satır kanalın adını da taşır — kumandada kanal adı diye
     bir yer yok, ayrıca kumanda yalnız ilk kanalı sürdüğünden öteki kanalların satırları listede kalır;
     birini eleyip ötekini bırakmak listeyi asimetrik yapardı. Bu yüzden çok kanallı cihazda satır DURUR,
     gözü de kendi satırında kalır (panelde çıkmaz) — her kanalın gözü tek yerde.
     Yönetici-only kanal da elenmez: orada satırda zaten göz yoktu, satırın `data-admin-only` gizlemesi
     korunur. Kısacası: satır elenir ⟺ gözü kumanda taşır. */
  const lightPanelCoversPower=(device,parts)=>Boolean(parts.power)&&isDashboardControl(parts.power)&&!deviceHasChannelNames(device);
  const lightPanelMode=(device,parts)=>{
    const stored=state.lightPanelMode;
    if(stored==="temperature"&&parts.temperature)return"temperature";
    if(stored==="color"&&parts.color)return"color";
    if(stored==="level"&&parts.level)return"level";
    return parts.level?"level":parts.temperature?"temperature":"switch";
  };
  /* Kolonun ne ayarladığı: parlaklık, renk sıcaklığı ya da (ikisi de yoksa) yalnız aç/kapat.
     Her kip aynı sözleşmeyi taşır: oran↔değer çevrimi ve okunacak metin. */
  const lightColumnSpec=(device,parts,mode)=>{
    if(mode==="temperature"&&parts.temperature){
      const control=parts.temperature;
      const min=Number(control.min??153);
      const max=Number(control.max??500);
      const span=max-min||1;
      // Mired ters çalışır: kolonu yukarı çekince görünen Kelvin ARTSIN diye eşleme çevrilir.
      return{kind:"temperature",control,known:typeof control.value==="number",
        value:typeof control.value==="number"?control.value:max,
        valueAt:fraction=>Math.round(max-fraction*span),
        fractionOf:value=>(max-Math.min(max,Math.max(min,Number(value))))/span,
        readoutAt:value=>`${temperatureKelvin(value)} K`};
    }
    if(parts.level){
      const control=parts.level;
      const min=Number(control.min??1);
      const max=Number(control.max??254);
      const span=max-min||1;
      return{kind:"level",control,known:typeof control.value==="number",
        value:typeof control.value==="number"?control.value:min,
        valueAt:fraction=>Math.round(min+fraction*span),
        fractionOf:value=>(Math.min(max,Math.max(min,Number(value)))-min)/span,
        readoutAt:value=>`${Math.round((Math.min(max,Math.max(min,Number(value)))-min)/span*100)}%`};
    }
    return{kind:"switch",control:parts.power,known:typeof parts.power?.value==="boolean",
      value:Boolean(parts.power&&binaryControlActive(parts.power)),
      valueAt:fraction=>fraction>=.5,
      fractionOf:value=>value?1:0,
      readoutAt:value=>t(value?"on":"off")};
  };
  // Kelvin → RGB yaklaşımı (siyah cisim eğrisi): kolon renk sıcaklığını gerçekten gösterir.
  const kelvinHex=kelvin=>{
    const temp=Math.max(1000,Math.min(12000,Number(kelvin)||2700))/100;
    const byte=value=>Math.max(0,Math.min(255,Math.round(value))).toString(16).padStart(2,"0");
    const red=temp<=66?255:329.7*Math.pow(temp-60,-.1332);
    const green=temp<=66?99.47*Math.log(temp)-161.12:288.12*Math.pow(temp-60,-.0755);
    const blue=temp>=66?255:temp<=19?0:138.52*Math.log(temp-10)-305.04;
    return`#${byte(red)}${byte(green)}${byte(blue)}`;
  };
  const lightColumnTint=parts=>{
    if(typeof parts.color?.value==="string"&&/^#[0-9a-f]{6}$/i.test(parts.color.value))return parts.color.value.toLowerCase();
    if(typeof parts.temperature?.value==="number")return kelvinHex(temperatureKelvin(parts.temperature.value));
    return"";
  };
  const lightColorPresets=["#ffcf8e","#ffffff","#ff5147","#ff9b2e","#ffe14d","#57d17f","#3f9dff","#a06bff"];
  const lightGlyphs={
    power:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v8"/><path d="M7.5 6.3a7.5 7.5 0 1 0 9 0"/></svg>',
    level:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.2 5.2l1.9 1.9M16.9 16.9l1.9 1.9M18.8 5.2l-1.9 1.9M7.1 16.9l-1.9 1.9"/></svg>',
    temperature:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7.4"/><path d="M12 4.6a7.4 7.4 0 0 1 0 14.8Z" fill="currentColor" stroke="none"/></svg>',
    color:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.4c4.3 3.6 6.6 6.5 6.6 9.2a6.6 6.6 0 0 1-13.2 0c0-2.7 2.3-5.6 6.6-9.2Z"/></svg>',
    column:'<svg class="light-column-glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v8"/><path d="M7.5 6.3a7.5 7.5 0 1 0 9 0"/></svg>'
  };
  const lightPanelHtml=device=>{
    const parts=lightPanelParts(device);
    if(!lightPanelSupported(device,parts))return"";
    const mode=lightPanelMode(device,parts);
    const spec=lightColumnSpec(device,parts,mode);
    const slider=spec.kind!=="switch";
    const lit=parts.power?binaryControlActive(parts.power):spec.fractionOf(spec.value)>0;
    const unknown=Boolean(parts.power&&parts.power.value===null);
    const percent=Math.round((lit&&spec.known?spec.fractionOf(spec.value):0)*100);
    const readout=unknown?t("unknownState"):lit?spec.readoutAt(spec.value):t("off");
    const label=`${device.name} · ${slider?(spec.kind==="temperature"?t("colorTemperature"):t("brightness")):t("lightPower")}`;
    const tint=lightColumnTint(parts);
    const offline=device.availability==="offline";
    const modeLabels={level:t("brightness"),temperature:t("colorTemperature"),color:t("color")};
    const modeButton=(key,control,active)=>control
      ?`<button class="light-mode${active?" active":""}" type="button" data-light-mode-button="${key}" aria-pressed="${active}" aria-label="${esc(modeLabels[key])}" title="${esc(modeLabels[key])}">${lightGlyphs[key]}</button>`
      :"";
    // Güç düğmesi genel komut yolunu kullanır (`data-command-value`), ayrı bir bağlama gerekmez.
    const powerButton=parts.power
      ?`<button class="light-mode${lit?" on":""}" type="button" data-device="${esc(device.id)}" data-property="${esc(parts.power.property)}" data-command-value="${commandValue(!lit)}" aria-pressed="${lit}" aria-label="${esc(`${device.name} · ${lit?t("off"):t("on")}`)}" title="${esc(t("lightPower"))}">${lightGlyphs.power}</button>`
      :"";
    const modeButtons=powerButton+modeButton("level",parts.level,mode==="level")+modeButton("temperature",parts.temperature,mode==="temperature")+modeButton("color",parts.color,mode==="color");
    const modesHtml=modeButtons?`<div class="light-modes" role="group" aria-label="${esc(t("quickControl"))}">${modeButtons}</div>`:"";
    /* Göz kip düğmelerinin yanında, kumandanın içinde durur. Yeni bileşen yok: satırdakiyle BİREBİR
       aynı `visibilityButton` çağrısı — aynı sınıf, aynı `role="switch"`/`aria-checked`, aynı
       `data-visibility-*` bağlaması. Panoya ekleme/çıkarma davranışı değişmedi, yalnız yeri değişti. */
    const eyeHtml=lightPanelCoversPower(device,parts)?visibilityButton(device,parts.power):"";
    const actionsHtml=modesHtml||eyeHtml?`<div class="light-actions">${modesHtml}${eyeHtml}</div>`:"";
    /* Hazır renklerin altında panelin KENDİ renk seçicisi durur (`.color-picker` + `data-color`):
       serbest renk için ikinci bir arayüz yazılmadı, mevcut olan yeniden kullanıldı. */
    const presetsHtml=parts.color
      ?`<div class="light-color"${mode==="color"?"":" hidden"}><div class="light-presets" role="group" aria-label="${esc(t("lightPresetColors"))}">${lightColorPresets.map(hex=>`<button class="light-preset" type="button" data-light-preset="${hex}" data-device="${esc(device.id)}" data-property="${esc(parts.color.property)}" aria-label="${esc(`${t("color")} ${hex}`)}" title="${hex}" style="background:${hex}"></button>`).join("")}</div><input class="color-picker" type="color" value="${esc(typeof parts.color.value==="string"?parts.color.value:"#ffffff")}" data-color="${esc(device.id)}" data-property="${esc(parts.color.property)}" aria-label="${esc(t("color"))}"></div>`
      :"";
    const effectHtml=parts.effect
      ?`<label class="light-effect"><span>${esc(t("lightEffect"))}</span><select class="control-select" data-select="${esc(device.id)}" data-property="${esc(parts.effect.property)}" aria-label="${esc(t("lightEffect"))}">${(parts.effect.values||[]).map(value=>`<option value="${esc(value)}"${String(value)===String(parts.effect.value)?" selected":""}>${esc(String(value).replaceAll("_"," "))}</option>`).join("")}</select></label>`
      :"";
    return`<div class="light-panel" data-light-panel="${esc(device.id)}">
        <div class="light-readout"><div class="light-readout-value" data-light-readout>${esc(readout)}</div><div class="light-readout-since">${esc(ago(device.stateUpdatedAt))}</div></div>
        <div class="light-column${lit?"":" off"}" data-light-column="${esc(device.id)}" data-light-kind="${spec.kind}" tabindex="0" role="${slider?"slider":"switch"}" ${slider?`aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}" aria-valuetext="${esc(readout)}"`:`aria-checked="${lit}"`} aria-label="${esc(label)}"${offline?' aria-disabled="true"':""}${tint?` style="--light-tint:${esc(tint)}"`:""}><div class="light-column-fill" style="height:${percent}%"></div>${lightGlyphs.column}</div>
        ${actionsHtml}${presetsHtml}${effectHtml}
      </div>`;
  };
  /* Büyük kumanda parlaklığı, renk sıcaklığını, rengi ve gücü zaten sürüyor; aynı kanalın satır
     kopyası listeden düşer, tek iş iki arayüzle yapılmaz. Eleme DAR tutulur: yalnız kumandanın
     çizildiği cihazda ve yalnız kumandanın gerçekten bağladığı kumanda NESNELERİ (`main:brightness`,
     `main:temperature`, `main:color` ve devraldığı güç kanalı) düşer — kumanda çizilmeyen cihazda, ve
     çok kanallı bir cihazın `l2:brightness` gibi kumandanın dokunmadığı kanallarında satır aynen kalır.
     Sessiz işlev kaybı yok. `level`/`temperature`/`color` satırları ne göz ne kalem taşıyordu: göz
     (`visibilityButton`) yalnız `dashboardControlKinds` üyelerinde çıkar ve bu üç kind o kümede DEĞİL,
     kalem (`renameControlButton`) yalnız adlı aç/kapa kanalında çıkar. Renk satırı ayrıca bedelsiz:
     kumanda renk kipinde aynı `.color-picker` + `data-color` arayüzünü gösteriyor. Aç/kapa satırı ise
     yalnız `lightPanelCoversPower` doğruyken düşer — yani gözü kumandaya taşınmış, kalemi olmayan
     kanalda; gerekçesi orada yazılı. */
  const lightPanelCoveredControls=device=>{
    const parts=lightPanelParts(device);
    if(!lightPanelSupported(device,parts))return new Set();
    return new Set([parts.level,parts.temperature,parts.color,lightPanelCoversPower(device,parts)?parts.power:null].filter(Boolean));
  };
  /* Adı hiç verilmemiş cihaz: listede ham kimliğiyle duruyor demektir (kurulum yarım kalmış).
     Aynı ölçü hem isim adımının kutusunu boş açmak hem de kurtarma düğmesini göstermek için. */
  function deviceNeedsName(device){
    const name=String(device?.name??"").trim();
    if(!name)return true;
    return name===device.id||/^0x[0-9a-f]+$/i.test(name);
  }
  const deviceDetailBodyHtml=device=>{
    const deviceFacts=facts(device);
    const updateState=device.state.update&&typeof device.state.update==="object"?device.state.update:{};
    const updateRunning=updateState.state==="updating";
    const updateScheduled=updateState.state==="scheduled";
    const updateLabel=updateRunning?t("updatingFirmware",{progress:Math.round(Number(updateState.progress)||0)}):t(updateScheduled?"cancelScheduledUpdate":"scheduleUpdate");
    const otaButton=device.otaSupported?`<button class="secondary" data-admin-only data-ota-check="${esc(device.id)}"${updateRunning?" disabled":""}>↻ ${t("checkForUpdate")}</button><button class="secondary" data-admin-only data-ota="${esc(device.id)}" data-ota-enabled="${updateScheduled?"false":"true"}"${updateRunning?" disabled":""}>⇧ ${esc(updateLabel)}</button>`:"";
    const photoHtml=`${deviceDetailPhoto(device)}`;
    const factsHtml=deviceFacts.length?`<div class="facts">${deviceFacts.map(fact=>`<span class="fact">${esc(fact)}</span>`).join("")}</div>`:"";
    // Rol satırları resmin altındaki boşluğa oturur; sol sütun resimsiz cihazda da bu blokla dolar.
    const rolesHtml=`<div class="controls device-detail-roles">${deviceRoleRowsHtml(device)}</div>`;
    const mediaHtml=`<div class="device-detail-media">${photoHtml}${factsHtml}${rolesHtml}</div>`;
    // Düğme de bir kontroldür: kumandayı zaten onunla kullanıyoruz. Bu yüzden düğmeler kontrol
    // sütununda, kontrollerin altında durur; aşağıda ikinci bir kopya gösterilmez.
    const covered=lightPanelCoveredControls(device);
    const controlsBodyHtml=device.controls.filter(control=>!covered.has(control)).map(control=>controlHtml(device,control)).join("")+deviceButtonsHtml(device);
    /* Boş-durum metni yalnızca ne kontrol ne de düğme kaldığında (sensör gibi) çıkar. Kumanda
       çizilmişken çıkmaz: her şeyi kumanda devraldıysa "kumanda yok" demek yanlış olurdu. */
    /* Bitirme düğmesi tehlike satırının ALTINDA ve tam genişlikte: "Kaldır"ın yanına konursa
       yanlış basma davetiyesi olur, ayrıca o satır `data-admin-only` — ev sakini bitiremezdi.
       Kaydedilecek bir şey yok (ad/oda/rol kendi pencerelerinde kaydedildi), bu yüzden "Bitti". */
    const panelHtml=lightPanelHtml(device);
    /* Kurulumu yarım kalmış cihaz için tek düğmelik kurtarma: yeni ekran yok, aynı isim/oda/rol
       adımları açılır. Adı verilmiş cihazda bu satır hiç çizilmez. */
    const setupHtml=deviceNeedsName(device)
      ?`<div class="device-setup-recovery"><p>${esc(t("finishSetupLead"))}</p><button class="primary" type="button" data-finish-setup="${esc(device.id)}">${esc(t("finishSetup"))}</button></div>`
      :"";
    /* Kumanda ayrı bir tam genişlik bloğu DEĞİL: ayar satırlarının durduğu sütunun ilk öğesi.
       Üstte tek başına dururken pencerenin başını boş bir şeride çeviriyordu; sütuna girince
       aynı akışın içinde, satırların hemen üstünde okunuyor ve toplam yükseklik artmıyor
       (öncesi: panel + max(medya,satırlar); sonrası: max(medya, panel+satırlar) — asla daha büyük değil).
       Kurulum kurtarma şeridi taşınmadı, pencerenin en üstünde kalır. */
    return`${setupHtml}<div class="device-detail-layout">
        <div class="device-detail-controls">${panelHtml}<div class="controls">${controlsBodyHtml||(panelHtml?"":`<div class="device-exposed-empty">${t("noExposedControls")}</div>`)}</div></div>
        ${mediaHtml}
      </div>
      ${deviceRoomsHtml(device)}
      ${deviceVisibilityHtml(device)}
      <details class="technical-details" data-admin-only${state.detailTechnicalOpen?" open":""}><summary>${t("technicalDetails")}</summary><div class="technical-body"><div class="technical">${t("uid")}: ${esc(device.id)}<br>${t("source")}: ${esc(device.sourceName)}<br>${t("model")}: ${esc(device.model||"—")}<br>${t("rawSignal")}: ${rawLinkQuality(device)===null?"—":esc(rawLinkQuality(device))} LQI</div></div></details>
      ${deviceSelfHealHtml(device)}
      <div class="card-actions"><button class="secondary" data-note="${esc(device.id)}">📝 ${t("note")}</button><button class="secondary" data-admin-only data-options="${esc(device.id)}">⚙ ${t("options")}</button><button class="secondary" data-admin-only data-reconfigure="${esc(device.id)}">${t("repairDevice")}</button>${otaButton}</div>
      <div class="card-actions card-actions-danger" data-admin-only><button class="remove" data-admin-only data-remove="${esc(device.id)}">${t("removeDevice")}</button></div>
      <div class="card-actions card-actions-done"><button class="primary" type="button" data-close-detail>${esc(t(state.detailFromPairing?"finishSetup":"close"))}</button></div>`;
  };
