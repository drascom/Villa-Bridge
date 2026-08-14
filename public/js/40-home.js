  /* Alt şerit sekmeleri: "Genel görünüm" hep ilk sırada ve kaldırılamaz, ardından gruplar.
     Sekme grubun kendi kimliğiyle anılır; dostane ad yalnız sunum. */
  function homeTabItems(){
    const groups=dashboardGroups();
    const cards=groups.filter(group=>groupInOverview(group)&&groupHasVisibleEntries(group)).length;
    const hidden=state.hiddenTiles.size;
    return[{
      id:overviewTabId,
      name:t("overviewTab"),
      icon:"overview",
      locked:true,
      inOverview:false,
      sub:t("overviewTabSummary",{cards,hidden}),
      on:0
    },...groups.map(group=>{
      const entries=groupControlEntries(group);
      const on=entries.filter(({device,control})=>control?dashboardControlAction(control)?.active===true:["active","alert"].includes(groupDeviceVisualState(device))).length;
      return{
        id:group.id,
        name:group.name,
        icon:group.id===lightsGroupId?"light":"group",
        locked:group.locked===true,
        inOverview:groupInOverview(group)&&entries.length>0,
        /* Alt satır yalnız cihaz sayısıdır. "Hepsi kapalı" artık yazılmaz: sakin hâl her sekmede
           tekrarlanan bir cümleydi ve hiçbir şey söylemiyordu. Açık olan varsa sayısı renkli bir
           göstergeyle çıkar (aşağıdaki `home-tab-live`), yani bilgi kelime yerine renk taşır. */
        sub:t("groupTabDevices",{count:entries.length}),
        on
      };
    })];
  }
  function homeTabHtml(item){
    const selected=state.homeTab===item.id;
    const mark=item.locked
      ?`<span class="home-tab-mark" aria-hidden="true">🔒</span>`
      :item.inOverview?`<span class="home-tab-dot" aria-hidden="true" title="${esc(t("showInOverview"))}"></span>`:"<span></span>";
    const live=item.on
      ?`<span class="home-tab-live" title="${esc(t("groupSummaryOn",{count:item.on}))}" aria-label="${esc(t("groupSummaryOn",{count:item.on}))}">${item.on}</span>`
      :"";
    return`<button class="quick-card home-tab${selected?" selected":""}" type="button" role="tab" id="hometab-${esc(item.id)}" aria-selected="${selected?"true":"false"}" tabindex="${selected?"0":"-1"}" aria-controls="${item.id===overviewTabId?"widgetRail":"groupPanel"}" data-home-tab="${esc(item.id)}"><span class="home-tab-body"><span class="quick-device-icon" aria-hidden="true">${deviceIconSvg(item.icon)}</span><span class="home-tab-copy"><span class="device-name">${esc(item.name)}</span><small>${esc(item.sub)}${live}</small></span>${mark}</span></button>`;
  }
  function renderHomeTabs(){
    const items=homeTabItems();
    if(!items.some(item=>item.id===state.homeTab))state.homeTab=overviewTabId;
    $("#homeTabList").innerHTML=items.map(homeTabHtml).join("");
    $$("[data-home-tab]").forEach(button=>button.onclick=()=>selectHomeTab(button.dataset.homeTab));
    $("#createHomeGroup").onclick=()=>openGroupEditor();
  }
  function saveHomeTab(){
    try{localStorage.setItem(homeTabStorageKey,state.homeTab)}catch{}
  }
  function selectHomeTab(id){
    if(!id)return;
    state.homeTab=id;
    saveHomeTab();
    applyWidgetLayout();
    const tab=$(`#homeTabs [data-home-tab="${CSS.escape(id)}"]`);
    if(!tab)return;
    tab.scrollIntoView({behavior:reducedMotion()?"auto":"smooth",block:"nearest",inline:"nearest"});
    tab.focus();
  }
  /* Şeritte ok/Home/End ile gezinme. "+ yeni grup" düğmesi kaydırma kabının içinde ama
     tablist'in (`#homeTabList`) DIŞINDA durur: sekme değil, o yüzden gezinmeye de girmez. */
  function moveHomeTabFocus(key){
    const tabs=$$("#homeTabs [data-home-tab]");
    if(!tabs.length)return;
    const current=Math.max(0,tabs.findIndex(tab=>tab.dataset.homeTab===state.homeTab));
    const steps={ArrowLeft:-1,ArrowRight:1};
    const next=key==="Home"?0:key==="End"?tabs.length-1:(current+steps[key]+tabs.length)%tabs.length;
    selectHomeTab(tabs[next].dataset.homeTab);
  }
  function bindDeviceImages(){
    $$("[data-device-image]").forEach(image=>{
      if(image.dataset.bound==="true")return;
      image.dataset.bound="true";
      const photo=image.closest("[data-device-photo]");
      const fail=()=>{
        if(photo){photo.hidden=true;return}
        image.hidden=true;
        image.nextElementSibling.hidden=false;
      };
      const succeed=()=>{if(photo)photo.hidden=false};
      image.onerror=fail;
      image.onload=succeed;
      if(image.complete)image.naturalWidth===0?fail():succeed();
    });
  }
  function setupQuickMouseScrolling(){
    const scroller=$("#homeTabs");
    if(!scroller||scroller.dataset.mouseDragBound==="true")return;
    scroller.dataset.mouseDragBound="true";
    let pointerId=null,startX=0,startScrollLeft=0,dragged=false,startCard=null;
    const reset=()=>{
      pointerId=null;
      startCard=null;
      dragged=false;
      scroller.classList.remove("mouse-dragging");
    };
    scroller.addEventListener("pointerdown",event=>{
      if(event.pointerType!=="mouse"||event.button!==0)return;
      pointerId=event.pointerId;
      startX=event.clientX;
      startScrollLeft=scroller.scrollLeft;
      dragged=false;
      startCard=event.target.closest("[data-home-tab]");
    });
    window.addEventListener("pointermove",event=>{
      if(pointerId===null||event.pointerId!==pointerId)return;
      const distance=event.clientX-startX;
      if(!dragged&&Math.abs(distance)>6){
        dragged=true;
        startCard?.dispatchEvent(new Event("pointercancel"));
        scroller.classList.add("mouse-dragging");
      }
      if(!dragged)return;
      event.preventDefault();
      scroller.scrollLeft=startScrollLeft-distance;
    },{passive:false});
    const finish=event=>{
      if(pointerId===null||event.pointerId!==pointerId)return;
      const suppressClick=dragged;
      reset();
      if(!suppressClick)return;
      scroller.dataset.suppressMouseClick="true";
      setTimeout(()=>delete scroller.dataset.suppressMouseClick,0);
    };
    window.addEventListener("pointerup",finish);
    window.addEventListener("pointercancel",finish);
    scroller.addEventListener("click",event=>{
      if(scroller.dataset.suppressMouseClick!=="true")return;
      delete scroller.dataset.suppressMouseClick;
      event.preventDefault();
      event.stopImmediatePropagation();
    },true);
    scroller.addEventListener("dragstart",event=>event.preventDefault());
  }
  function confirmDashboardCommand(deviceId,property,value,messageKey){
    const device=state.devices.find(item=>item.id===deviceId);
    if(!device)return;
    state.pendingConfirm={id:deviceId,property,value};
    $("#deviceActionName").textContent=device.name;
    $("#deviceActionLead").textContent=t(messageKey,{name:device.name});
    const dialog=$("#deviceActionDialog");
    if(!dialog.open)dialog.showModal();
  }
  function runDashboardCommand(button,deviceId,property,value){
    const messageKey=button?.dataset.confirmCommand;
    if(messageKey){confirmDashboardCommand(deviceId,property,value,messageKey);return}
    command(deviceId,property,value);
  }
  /* Hızlı kumanda penceresinin üç hâli VERİDEN türetilir; ad ya da model kuralı yoktur:
       none  → cihazın hiç aç/kapa kumandası yok (kapı/hareket/CO sensörü, buton). Pencere hiç
               açılmaz ve uyarı da verilmez; doğrudan mevcut cihaz detay sayfası açılır.
       dim   → panelin ışık kolonunu (`lightPanelHtml`) çizebildiği kanal: dikey kaydırıcı,
               varsa renk sıcaklığı ve renk seçenekleri.
       onoff → kalan her aç/kapa kanalı: kaydırıcı yok, tek büyük aç/kapa düğmesi.
     Kolon yalnız KENDİ sürdüğü kanalı temsil eder; çok kanallı bir cihazın öteki kanalının
     döşemesinde "onoff" kalır, yoksa orada olmayan bir karartma vaat edilirdi. */
  function quickControlMode(device,control){
    if(!dashboardControlAction(control))return"none";
    const parts=lightPanelParts(device);
    if(!lightPanelSupported(device,parts)||!(parts.level||parts.temperature))return"onoff";
    return!parts.power||parts.power.id===control.id?"dim":"onoff";
  }
  /* Pencerede sürülen kanal döşemenin kanalıdır: kayıt cihaz kimliği + kontrol kimliğidir,
     dostane ad değil. Kontrolü olmayan döşemede kimlik `@device` olur ve kanal `null` kalır. */
  function quickControlEntry(){
    const stored=state.quickControl;
    const device=stored?state.devices.find(item=>item.id===stored.id):null;
    if(!device)return null;
    const control=stored.controlId&&stored.controlId!==groupDeviceControlId
      ?device.controls.find(item=>item.id===stored.controlId&&isDashboardControl(item))||null
      :null;
    return{device,control};
  }
  /* Kısılamayan cihazda kaydırıcı ve renk yok, tek büyük aç/kapa var. Komut yolu değişmiyor:
     panelin genel `data-command-value` ucu kullanılır, böylece bekleyen komut ve onay isteyen
     kilit/siren davranışı bugünküyle aynı kalır. */
  function quickToggleHtml(device,control){
    const action=dashboardControlAction(control);
    if(!action)return"";
    const pending=commandPending(device.id,control.property);
    const active=pending?!action.active:action.active;
    const label=pending?t("sendingCommand"):t(active?"on":"off");
    const disabled=device.preparing===true||pending||device.availability==="offline";
    return`<div class="quick-toggle-wrap"><button class="quick-toggle${active?" on":""}${pending?" pending":""}" type="button" data-command-value="${commandValue(action.value)}" data-device="${esc(device.id)}" data-property="${esc(control.property)}"${confirmCommandAttribute(control,action)} aria-pressed="${active}" aria-label="${esc(`${device.name} · ${pending?t("sendingCommand"):active?t("off"):t("on")}`)}"${disabled?" disabled":""}>${lightGlyphs.power}<span>${esc(label)}</span></button></div>`;
  }
  /* Parmak kolonun üstündeyken ya da bir alan düzenlenirken pencere yeniden çizilmez —
     `renderDeviceDetail`in `detailBodyBusy` emniyetiyle aynı kural. */
  const quickControlBusy=()=>{
    if(state.quickPointerDown)return true;
    const body=$("#quickControlBody");
    const active=document.activeElement;
    return Boolean(body&&active&&body.contains(active)&&active.closest('select,textarea,input:not([type="range"])'));
  };
  function renderQuickControl(){
    const entry=quickControlEntry();
    if(!entry){closeQuickControl();return}
    const{device,control}=entry;
    $("#quickControlTitle").textContent=control?channelDisplayName(device,control):device.name;
    if(quickControlBusy())return;
    $("#quickControlBody").innerHTML=quickControlMode(device,control)==="dim"
      ?lightPanelHtml(device,{compact:true})
      :quickToggleHtml(device,control);
    bindCards();
  }
  function openQuickControl(deviceId,controlId){
    const device=state.devices.find(item=>item.id===deviceId);
    if(!device)return;
    const control=controlId&&controlId!==groupDeviceControlId
      ?device.controls.find(item=>item.id===controlId&&isDashboardControl(item))||null
      :null;
    if(quickControlMode(device,control)==="none"){openDeviceDetail(deviceId);return}
    state.quickControl={id:deviceId,controlId:control?control.id:groupDeviceControlId};
    state.quickPointerDown=false;
    state.lightPanelMode=null;
    renderQuickControl();
    const dialog=$("#quickControlDialog");
    if(!dialog.open)dialog.showModal();
    focusModalHeading(dialog.querySelector(".quick-modal"));
  }
  function closeQuickControl(){
    state.quickControl=null;
    const dialog=$("#quickControlDialog");
    if(dialog&&dialog.open)dialog.close();
  }
  /* Gerçek eve yazıyoruz: sürüklerken cihaz komutla boğulmasın. Arayüz İYİMSER (parmakla birlikte
     anında boyanır), yazma KISITLI (en çok `lightWriteInterval` ms'de bir ve aynı anda tek uçuşta
     komut), bırakınca KESİN değer bir kez daha yazılır. Uçuşta komut varken son değer düşmez —
     `job` yerinde kalır, sıra boşalınca yazılır; ara değerler üstüne yazıldığı için birleşir. */
  const lightWriteInterval=200;
  const lightWrite={at:0,timer:null,job:null};
  // Sürükleme durumu modül düzeyinde: komut sonrası yeniden bağlama olsa da parmak takibi kopmaz.
  const lightDrag={pointerId:null,startY:0,moved:false,fraction:0};
  function flushLightWrite(){
    if(lightWrite.timer){clearTimeout(lightWrite.timer);lightWrite.timer=null}
    const job=lightWrite.job;
    if(!job)return;
    if(commandPending(job.id,job.property)){lightWrite.timer=setTimeout(flushLightWrite,80);return}
    lightWrite.job=null;
    lightWrite.at=Date.now();
    command(job.id,job.property,job.value);
  }
  function queueLightWrite(id,property,value,immediate){
    lightWrite.job={id,property,value};
    const wait=immediate?0:lightWriteInterval-(Date.now()-lightWrite.at);
    if(wait<=0){flushLightWrite();return}
    if(!lightWrite.timer)lightWrite.timer=setTimeout(flushLightWrite,wait);
  }
  function bindLightPanel(){
    const column=$("[data-light-column]");
    if(!column)return;
    const device=state.devices.find(item=>item.id===column.dataset.lightColumn);
    if(!device)return;
    const parts=lightPanelParts(device);
    const spec=lightColumnSpec(device,parts,lightPanelMode(device,parts));
    const slider=spec.kind!=="switch";
    const blocked=()=>column.getAttribute("aria-disabled")==="true";
    const readFraction=()=>slider
      ?Number(column.getAttribute("aria-valuenow")||0)/100
      :(column.getAttribute("aria-checked")==="true"?1:0);
    const paint=fraction=>{
      const clamped=Math.max(0,Math.min(1,fraction));
      const percent=Math.round(clamped*100);
      const fill=column.querySelector(".light-column-fill");
      if(fill)fill.style.height=`${percent}%`;
      column.classList.toggle("off",percent===0);
      const text=spec.readoutAt(spec.valueAt(clamped));
      if(slider){column.setAttribute("aria-valuenow",String(percent));column.setAttribute("aria-valuetext",text)}
      const readout=$("[data-light-readout]");
      if(readout)readout.textContent=text;
    };
    const write=(fraction,immediate)=>{
      if(!spec.control)return;
      queueLightWrite(device.id,spec.control.property,spec.valueAt(Math.max(0,Math.min(1,fraction))),immediate);
    };
    const toggle=()=>{
      if(!parts.power)return;
      const next=!binaryControlActive(parts.power);
      column.setAttribute("aria-checked",String(next));
      column.classList.toggle("off",!next);
      command(device.id,parts.power.property,next);
    };
    const fractionAt=clientY=>{
      const box=column.getBoundingClientRect();
      return box.height?(box.bottom-clientY)/box.height:0;
    };
    column.onpointerdown=event=>{
      if(blocked())return;
      lightDrag.pointerId=event.pointerId;
      lightDrag.startY=event.clientY;
      lightDrag.moved=false;
      lightDrag.fraction=readFraction();
      if(column.setPointerCapture)column.setPointerCapture(event.pointerId);
    };
    column.onpointermove=event=>{
      if(lightDrag.pointerId!==event.pointerId)return;
      if(!lightDrag.moved&&Math.abs(event.clientY-lightDrag.startY)<6)return;
      lightDrag.moved=true;
      if(!slider)return;
      event.preventDefault();
      lightDrag.fraction=Math.max(0,Math.min(1,fractionAt(event.clientY)));
      paint(lightDrag.fraction);
      write(lightDrag.fraction,false);
    };
    column.onpointerup=event=>{
      if(lightDrag.pointerId!==event.pointerId)return;
      const moved=lightDrag.moved;
      const fraction=lightDrag.fraction;
      lightDrag.pointerId=null;
      // Kısa dokunuş: aç/kapa kanalı varsa değiştirir (yalnız aç/kapat olan ışıkta tek davranış bu),
      // yoksa dokunulan yüksekliğe ayarlar. Sürükleme bittiyse kesin değer yazılır.
      if(!moved){
        if(parts.power){toggle();return}
        if(!slider)return;
        const tapped=Math.max(0,Math.min(1,fractionAt(event.clientY)));
        paint(tapped);
        write(tapped,true);
        return;
      }
      if(slider){paint(fraction);write(fraction,true)}
    };
    column.onpointercancel=()=>{
      const moved=lightDrag.moved;
      const fraction=lightDrag.fraction;
      lightDrag.pointerId=null;
      if(moved&&slider)write(fraction,true);
    };
    column.onkeydown=event=>{
      if(blocked())return;
      if(event.key===" "||event.key==="Enter"){
        if(!parts.power)return;
        event.preventDefault();
        toggle();
        return;
      }
      if(!slider)return;
      const edge=event.key==="Home"?0:event.key==="End"?1:null;
      if(edge!==null){event.preventDefault();paint(edge);write(edge,true);return}
      const steps={ArrowUp:1,ArrowRight:1,ArrowDown:-1,ArrowLeft:-1,PageUp:2,PageDown:-2};
      const step=steps[event.key];
      if(step===undefined)return;
      event.preventDefault();
      const next=Math.max(0,Math.min(1,readFraction()+step*.05));
      paint(next);
      write(next,false);
    };
    /* Kolon iki yüzeyde çizilebiliyor (cihaz sayfası ve hızlı kumanda penceresi); kip değişimi
       hangisi açıksa onu tazeler, yoksa açık olmayan pencere boşuna yeniden çizilirdi. */
    $$("[data-light-mode-button]").forEach(button=>button.onclick=()=>{
      state.lightPanelMode=button.dataset.lightModeButton;
      if($("#quickControlDialog").open)renderQuickControl();
      else renderDeviceDetail();
    });
    $$("[data-light-preset]").forEach(button=>button.onclick=()=>command(button.dataset.device,button.dataset.property,button.dataset.lightPreset));
  }
  function bindCards(){
    bindDeviceImages();
    $$("[data-device-card]").forEach(card=>{
      const open=event=>{if(event.target.closest("button,input,select,a,summary"))return;openDeviceDetail(card.dataset.deviceCard)};
      card.onclick=open;
      card.onkeydown=event=>{if(event.key!=="Enter"&&event.key!==" ")return;if(event.target.closest("button,input,select,a,summary"))return;event.preventDefault();openDeviceDetail(card.dataset.deviceCard)};
    });
    $$("[data-command-value]").forEach(button=>button.onclick=()=>runDashboardCommand(button,button.dataset.device,button.dataset.property,JSON.parse(button.dataset.commandValue)));
    $$("[data-toggle-room]").forEach(button=>button.onclick=()=>toggleDeviceRoom(button.dataset.roomDevice,button.dataset.toggleRoom));
    $$("[data-level]").forEach(input=>{
      input.oninput=()=>{
        const target=input.closest(".control-row")?.querySelector(".control-value");
        if(target)target.innerHTML=levelValueHtml(input.value,input.dataset.unit);
      };
      input.onchange=()=>command(input.dataset.level,input.dataset.property,Number(input.value));
    });
    $$("[data-select]").forEach(input=>input.onchange=()=>command(input.dataset.select,input.dataset.property,input.value));
    $$("[data-device-role-select]").forEach(input=>input.onchange=()=>changeDeviceRole(input,input.dataset.deviceRoleSelect,input.dataset.deviceRoleChannel,input.value));
    $$("[data-color]").forEach(input=>input.onchange=()=>command(input.dataset.color,input.dataset.property,input.value));
    bindLightPanel();
    $$("[data-visibility-device]:not(.tile-eye)").forEach(button=>button.onclick=()=>toggleTileVisibility(button.dataset.visibilityDevice,button.dataset.visibilityControl));
    $$("[data-favorite-device]:not(.tile-star)").forEach(button=>button.onclick=()=>toggleFavorite(button.dataset.favoriteDevice,button.dataset.favoriteControl));
    $$("[data-change-image]").forEach(button=>button.onclick=()=>openImageChooser(button.dataset.changeImage));
    $$("[data-rename]").forEach(button=>button.onclick=event=>{event.preventDefault();event.stopPropagation();openRename(button.dataset.rename)});
    $$("[data-rename-channel]").forEach(button=>button.onclick=()=>openRename(button.dataset.renameChannel,button.dataset.channel));
    $$("[data-reconfigure]").forEach(button=>button.onclick=()=>reconfigureDevice(button.dataset.reconfigure));
    $$("[data-note]").forEach(button=>button.onclick=()=>openDeviceNote(button.dataset.note));
    $$("[data-finish-setup]").forEach(button=>button.onclick=event=>{event.preventDefault();event.stopPropagation();finishDeviceSetup(button.dataset.finishSetup)});
    $$("[data-ota-check]").forEach(button=>button.onclick=()=>checkOta(button.dataset.otaCheck));
    $$("[data-ota]").forEach(button=>button.onclick=()=>scheduleOta(button.dataset.ota,button.dataset.otaEnabled!=="false"));
    $$("[data-options]").forEach(button=>button.onclick=()=>openDeviceOptions(button.dataset.options));
    $$("[data-remove]").forEach(button=>button.onclick=()=>removeDevice(button.dataset.remove));
  }
  function renderPairingRouters(){
    const select=$("#pairingRouter");
    if(!select)return;
    const selected=select.value;
    const routers=state.devices.filter(device=>device.type==="Router"&&device.availability!=="offline");
    select.innerHTML=`<option value="">${t("coordinator")}</option>`+routers.map(device=>`<option value="${esc(device.id)}">${esc(device.name)}</option>`).join("");
    if([...select.options].some(option=>option.value===selected))select.value=selected;
  }
  function renderZigbeeGroups(){
    const container=$("#zigbeeGroupList");
    if(!container)return;
    container.innerHTML=state.zigbeeGroups.length?state.zigbeeGroups.map(group=>{
      const available=state.devices.filter(device=>!group.memberIds?.includes(device.id));
      const members=(group.memberIds||[]).map(id=>{
        const device=state.devices.find(item=>item.id===id);
        return`<span class="touchlink-device">${esc(device?.name||id)}<button class="danger-button" type="button" data-zgroup-remove-member="${esc(group.id)}" data-device="${esc(id)}">×</button></span>`;
      }).join("");
      const scenes=(group.scenes||[]).map(scene=>`<span class="zigbee-scene"><span>${esc(scene.name)} · ${scene.id}</span><button class="secondary" type="button" data-zgroup-existing-scene="recall" data-group="${esc(group.id)}" data-scene="${scene.id}" title="${t("recallScene")}">▶</button><button class="danger-button" type="button" data-zgroup-existing-scene="remove" data-group="${esc(group.id)}" data-scene="${scene.id}" title="${t("removeScene")}">×</button></span>`).join("");
      return`<div class="zigbee-group-row"><div class="zigbee-group-row-head"><input value="${esc(group.name)}" maxlength="64" data-zgroup-name="${esc(group.id)}"><span class="zigbee-member-count">${t("groupMembers",{count:group.members})}</span><button class="secondary" type="button" data-zgroup-rename="${esc(group.id)}" title="${t("changeName")}">✓</button></div><div class="zigbee-group-actions"><select data-zgroup-device="${esc(group.id)}"><option value="">＋ ${t("device")}</option>${available.map(device=>`<option value="${esc(device.id)}">${esc(device.name)}</option>`).join("")}</select><button class="secondary" type="button" data-zgroup-add-member="${esc(group.id)}" title="${t("add")}">＋</button><input type="number" min="1" max="255" value="1" data-zgroup-scene="${esc(group.id)}" aria-label="${t("scene")}"><input type="text" maxlength="64" data-zgroup-scene-name="${esc(group.id)}" placeholder="${t("sceneName")}"><button class="secondary" type="button" data-zgroup-scene-action="store" data-group="${esc(group.id)}" title="${t("storeScene")}">●</button><button class="danger-button" type="button" data-zgroup-delete="${esc(group.id)}" title="${t("deleteGroup")}">×</button></div>${members?`<div class="zigbee-member-list">${members}</div>`:""}${scenes?`<div class="zigbee-scene-list">${scenes}</div>`:""}</div>`;
    }).join(""):`<div class="zigbee-group-empty"><span aria-hidden="true">＋</span><div><strong>${t("noZigbeeGroups")}</strong><p>${t("noZigbeeGroupsLead")}</p></div></div>`;
    $$("[data-zgroup-rename]").forEach(button=>button.onclick=()=>renameZigbeeGroup(button.dataset.zgroupRename));
    $$("[data-zgroup-add-member]").forEach(button=>button.onclick=()=>addZigbeeGroupMember(button.dataset.zgroupAddMember));
    $$("[data-zgroup-remove-member]").forEach(button=>button.onclick=()=>setZigbeeGroupMember(button.dataset.zgroupRemoveMember,button.dataset.device,false));
    $$("[data-zgroup-scene-action]").forEach(button=>button.onclick=()=>zigbeeGroupScene(button.dataset.group,button.dataset.zgroupSceneAction));
    $$("[data-zgroup-existing-scene]").forEach(button=>button.onclick=()=>zigbeeGroupScene(button.dataset.group,button.dataset.zgroupExistingScene,Number(button.dataset.scene)));
    $$("[data-zgroup-delete]").forEach(button=>button.onclick=()=>deleteZigbeeGroup(button.dataset.zgroupDelete));
    const source=$("#bindSource"),target=$("#bindTarget");
    const sourceValue=source.value,targetValue=target.value;
    source.innerHTML=`<option value="">${t("sourceDevice")}</option>`+state.devices.map(device=>`<option value="${esc(device.id)}">${esc(device.name)}</option>`).join("");
    target.innerHTML=`<option value="">${t("targetDevice")}</option>`+state.devices.map(device=>`<option value="${esc(device.id)}">${esc(device.name)}</option>`).join("")+state.zigbeeGroups.map(group=>`<option value="${esc(group.id)}">◇ ${esc(group.name)}</option>`).join("");
    if([...source.options].some(option=>option.value===sourceValue))source.value=sourceValue;
    if([...target.options].some(option=>option.value===targetValue))target.value=targetValue;
    renderBindingEndpoints();
    renderBindingList();
  }
  function renderSystemAlertBar(){
    const serverMetric=$("#serverConnectionMetric");
    const serverConnected=state.overviewLoaded&&!state.connectionError;
    serverMetric.hidden=!state.androidMonitor;
    if(state.androidMonitor){
      const serverStatus=t(serverConnected?"serverConnected":"serverDisconnected");
      $("#serverConnectionDot").className=`server-connection-dot${serverConnected?" ok":""}`;
      serverMetric.title=serverStatus;
      serverMetric.setAttribute("aria-label",serverStatus);
    }
    const criticalMessages=[];
    if(state.connectionError)criticalMessages.push(t("serverUnreachable"));
    else if(state.health&&state.health.ok===false)criticalMessages.push(t("connectionWaiting"));
    state.devices.forEach(device=>{
      const alert=criticalAlert(device);
      if(alert)criticalMessages.push(t(criticalAlertKeys[alert.code]||"deviceNeedsAttention",{name:device.name}));
    });
    const message=criticalMessages[0]||"";
    const extra=criticalMessages.length>1?t("moreCriticalAlerts",{count:criticalMessages.length-1}):"";
    const bar=$("#systemAlertBar");
    bar.hidden=!message;
    $("#systemAlertText").textContent=message;
    const counter=$("#systemAlertCount");
    counter.textContent=extra;
    counter.hidden=!extra;
    document.body.classList.toggle("has-system-alert",Boolean(message));
  }
  function render(){
    const devices=state.devices;
    $$(".add-device").forEach(button=>button.disabled=!state.overviewLoaded);
    /* Başlıktaki "Cihaz / Uyarı / Sinyal" şeridi kalktı; yerini ev durumunun ikonlu özeti
       (`#homeSummary`, `renderHomeSummary`) aldı. Kaybolan bilgi yok: kritik uyarılar zaten üstteki
       sistem şeridinde, uyarılı ve zayıf sinyalli cihazlar Cihazlar görünümünde duruyor. */
    renderSystemAlertBar();
    const onlineDevices=devices.filter(device=>device.availability==="online").length;
    const offlineDevices=devices.filter(device=>device.availability==="offline").length;
    $("#onlineDeviceCount").textContent=String(onlineDevices);
    const offlineFact=$("#offlineDeviceCount");
    offlineFact.textContent=t("offlineDevices",{count:offlineDevices});
    offlineFact.hidden=offlineDevices===0;
    const lowBatteryDevices=devices.filter(hasLowBattery).length;
    const lowBatteryFact=$("#lowBatteryCount");
    lowBatteryFact.textContent=t("lowBatteryDevices",{count:lowBatteryDevices});
    lowBatteryFact.hidden=lowBatteryDevices===0;
    $("#chooseZigbeeRestore").hidden=state.health?.mode!=="direct";
    applyZigbeeAdapterOwnership();
    renderPairingRouters();
    renderZigbeeGroups();
    renderHomeSummary();
    renderAutomations();
    refreshAutomationHint();
    filterDevices();
    const ok=state.health?.ok;$("#sideDot").className=`status-dot ${ok?"ok":"bad"}`;$("#sideStatus").textContent=ok?t("homeControlReady"):t("connectionWaiting");
    const pairing=state.pairing?.open;$("#pairingBanner").classList.toggle("show",Boolean(pairing));
    $("#showPairing").hidden=!pairing||state.pairingSession?.hidden!==true;
    if(pairing){
      const pairingDevice=state.pairing?.device;
      const found=pairingDevice?state.devices.find(device=>device.id===pairingDevice.id):null;
      if(pairingDevice)$("#pairingText").textContent=t("pairingFoundBanner",{name:found?.name||pairingDevice.name||pairingDevice.id});
      else{const left=Math.max(0,Math.ceil((new Date(state.pairing.until)-Date.now())/1000));$("#pairingText").textContent=t("pairingCountdown",{count:left});}
    }
    applyWidgetLayout();
    renderWidgetLists();
    bindCards();
    renderPairingProgress();
    if($("#quickControlDialog").open)renderQuickControl();
    if($("#lightDialog").open)renderLightDialog();
    if($("#deviceDetailDialog").open)renderDeviceDetail();
  }
  function renderHomeSummary(){
    const container=$("#homeSummary");
    if(!container)return;
    const devices=state.devices;
    const lightsOn=devices.filter(device=>{
      const control=dashboardControlForDevice(device);
      return Boolean(control)&&["switch","fan"].includes(control.kind)&&binaryControlActive(control);
    }).length;
    const openings=devices.filter(device=>device.state?.contact===false).length;
    const motion=devices.filter(device=>device.state?.occupancy===true||device.state?.presence===true).length;
    /* Üç ayrı cümle ("Tüm ışıklar kapalı / Tüm kapılar kapalı / Hareket yok") yerine üç kompakt
       gösterge: ikon + sayı. Sakinken sönük ve sessiz dururlar, bir şey olduğunda renklenir ve
       öne çıkar. Kelime kaybolmadı, göstergenin adına (`title`/`aria-label`) taşındı. */
    const rows=[
      {icon:"light",count:lightsOn,label:t("summaryLightsOn"),tone:lightsOn?"active":"muted"},
      {icon:"door",count:openings,label:t("summaryOpenings"),tone:openings?"alert":"muted"},
      {icon:"motion",count:motion,label:t("summaryMotion"),tone:motion?"active":"muted"}
    ];
    container.innerHTML=rows.map(row=>{
      const label=`${row.count} ${row.label}`;
      return`<span class="summary-chip ${row.tone}" title="${esc(label)}" aria-label="${esc(label)}" role="img">${deviceIconSvg(row.icon)}<b>${row.count}</b></span>`;
    }).join("");
  }
  function widgetListCapacity(selector,fallback){
    const list=$(selector);
    const card=list?.closest(".dashboard-widget");
    if(!list||!card)return fallback;
    const available=card.clientHeight-list.offsetTop-10;
    if(available<70)return fallback;
    /* Bölen satırın gerçek yüksekliğinden bilerek büyük: satırlar ferahladı (ikon çipi + simetrik
       dikey boşluk), dar ekranda taşan bir satır göstermektense bir satır az göstermek yeğdir. */
    return Math.max(fallback,Math.min(14,Math.floor(available/70)));
  }
  /* Liste ile sessiz özet AYNI veriden ayrılır. Her cihaz yalnız EN SON olayıyla temsil edilir;
     o olay bir "her şey yolunda" bildirimiyse (`eventPresentation().quiet` — bkz. 30-device-view.js)
     satır açılmaz, yalnız alttaki tek satırlık özette sayılır. Ayrım olayın türü ve değerinden
     çıkar; cihaz adına ya da modeline bakan hiçbir kural yoktur (ürün çok evli). */
  function activityEventSplit(events,limit){
    const seen=new Set();
    const rows=[];
    let quiet=0;
    for(const event of events){
      if(seen.has(event.sourceName))continue;
      seen.add(event.sourceName);
      const presentation=eventPresentation(event);
      if(presentation.quiet){quiet++;continue}
      if(rows.length<limit)rows.push({event,presentation});
    }
    return{rows,quiet};
  }
  function renderWidgetLists(){
    const devices=state.devices;
    /* Taban 3 satır: olay listesi artık birleşik kartın ALT bölümü. Kart ne kadar yer bırakırsa o
       kadar satır çizilir (`widgetListCapacity` kartın kalan boyunu ölçer); ölçüm yapılamadığında
       kart iki bölümün toplamı kadar uzamasın diye taban düşük tutulur. */
    const split=activityEventSplit(state.events||[],widgetListCapacity("#activityEvents",3));
    /* Satır sadeleşti: ad normal ağırlıkta, durum kelimesi yerine renkli küçük gösterge (olayın
       kendi işareti + tonu), zaman soluk ve küçük. Kelime `title`/`aria-label`de duruyor. */
    const list=split.rows.length?split.rows.map(row=>{
      const device=devices.find(item=>item.sourceName===row.event.sourceName);
      const name=device?.name||row.event.sourceName;
      const label=`${name} · ${row.presentation.label}`;
      return`<div class="widget-list-row ${row.presentation.tone}" title="${esc(label)}"><span class="event-mark" aria-hidden="true">${row.presentation.icon}</span><strong>${esc(name)}</strong><span class="event-label">${esc(row.presentation.label)}</span><time>${ago(row.event.at)}</time></div>`;
    }).join(""):`<div class="device-meta">${t("noActivity")}</div>`;
    const quiet=split.quiet?`<div class="activity-quiet">${esc(t("activityQuietSummary",{count:split.quiet}))}</div>`:"";
    $("#activityEvents").innerHTML=list+quiet;
  }
  function saveWidgetLayout(){
    try{localStorage.setItem("villa-dashboard-widgets",JSON.stringify(state.widgets))}catch{}
  }
  function saveRemovedWidgets(){
    try{localStorage.setItem(removedWidgetsKey,JSON.stringify([...state.removedWidgets]))}catch{}
  }
  /* Yeni grup kartı, düzen kaydında kendinden önceki grubun hemen ardına girer; hiçbiri yoksa
     kendinden sonraki ilk grubun önüne. Böylece onarım mevcut sırayı bozmadan boşluğu doldurur. */
  function groupWidgetSlot(ids,index){
    for(let i=index-1;i>=0;i--){const slot=state.widgets.indexOf(ids[i]);if(slot>=0)return slot+1}
    for(let i=index+1;i<ids.length;i++){const slot=state.widgets.indexOf(ids[i]);if(slot>=0)return slot}
    return state.widgets.length;
  }
  /* Ekranda duran her kart sıralamaya dahil olmalı. Sunucudan senkronla gelen ya da düzen kaydı
     çıkmadan önce oluşmuş gruplar listede yoktu: kart görünüyor ama ok düğmeleri ölüydü ve listedeki
     ilk grup "en sol" sanılıyordu. Burada eksikler sessizce eklenir, silinen grupların kimlikleri
     düşer.

     Görünürlük artık bu listede DEĞİL: Genel görünümden kapatılan oda kartı da sırasını korur,
     yoksa geri açıldığında yeri kayardı. `removedWidgets` yalnız bilgi kartları içindir; içinde
     kalan eski `group:` girdileri göçte ve burada temizlenir. */
  function reconcileWidgetLayout(){
    const ids=dashboardGroups().map(group=>groupWidgetId(group.id));
    const known=new Set(ids);
    const stale=id=>id.startsWith(groupWidgetPrefix)&&!known.has(id);
    let changed=false;
    const kept=state.widgets.filter(id=>!stale(id));
    if(kept.length!==state.widgets.length){state.widgets=kept;changed=true}
    ids.forEach((id,index)=>{
      if(state.widgets.includes(id))return;
      state.widgets.splice(groupWidgetSlot(ids,index),0,id);
      changed=true;
    });
    let dropped=false;
    for(const id of[...state.removedWidgets]){
      if(!id.startsWith(groupWidgetPrefix))continue;
      state.removedWidgets.delete(id);
      dropped=true;
    }
    if(dropped)saveRemovedWidgets();
    if(changed)saveWidgetLayout();
    return changed;
  }
  function saveDashboardGroups(){
    try{localStorage.setItem("villa-dashboard-groups",JSON.stringify(state.groups))}catch{}
  }
  /* Hazır "Işıklar" grubu jenerik türetilir: sunucunun `light` kategorisine koyduğu her uç.
     Sabit oda/isim listesi yok — ürün çok evli. Kayıtta durmaz, silinemez, düzenlenemez.

     Sınıflandırma KANAL başınadır (sunucu her aç/kapa kanalına kendi `category` alanını koyar),
     dolayısıyla üyelik de kanal başına kurulur. Cihaz seviyesine bakmak çok kanallı duvar
     anahtarında iki yönlü yanlış veriyordu: bir kanalı lamba olan cihaz karta giriyor ama
     döşeme olarak "main" kanalı (kullanıcının anahtar dediği kanal) basılıyordu; lamba kanalları
     ise hiç görünmüyordu. Kanal taşımayan cihazlarda (tek uç, dimmer, perde vb.) eski davranış
     sürer: cihazın kendi sınıfı ve varsayılan döşemesi. */
  const lightChannelControls=device=>(device.controls||[])
    .filter(control=>isDashboardControl(control)&&control.kind==="switch"&&typeof control.category==="string");
  function lightsAutoGroup(){
    const items=[];
    for(const device of state.devices){
      const channels=lightChannelControls(device);
      if(channels.length){
        for(const control of channels){
          if(control.category==="light")items.push({deviceId:device.id,controlId:control.id});
        }
        continue;
      }
      if(device.category!=="light")continue;
      const control=dashboardControlForDevice(device);
      items.push({deviceId:device.id,controlId:control?control.id:groupDeviceControlId});
    }
    return{id:lightsGroupId,name:t("lightsGroup"),items,locked:true};
  }
  /* "Odasız": hiçbir odaya (grup) atanmamış cihazlar. Cihaz–oda ilişkisi grup üyeliğinde durur,
     yeni bir depo açılmaz. Kart yalnız içi doluyken çıkar; boşken sekmesi de basılmaz. */
  const deviceHasRoom=device=>state.groups.some(group=>group.items.some(item=>item.deviceId===device.id));
  function noRoomAutoGroup(){
    const items=state.devices.filter(device=>!deviceHasRoom(device)).map(device=>{
      const control=dashboardControlForDevice(device);
      return{deviceId:device.id,controlId:control?control.id:groupDeviceControlId};
    });
    return{id:noRoomGroupId,name:t("noRoomGroup"),items,locked:true};
  }
  const dashboardGroups=()=>{
    const noRoom=noRoomAutoGroup();
    return[lightsAutoGroup(),...state.groups,...(noRoom.items.length?[noRoom]:[])];
  };
  const dashboardGroupById=id=>dashboardGroups().find(group=>group.id===id)||null;
  /* Varsayılan GÖRÜNÜR: oda kartı grubun tüm cihazlarını gösterir. Kullanıcı tek tek gizler;
     gizlenenler kartın altında sayısıyla duyurulur, böylece kaybolmuş sayılmazlar. */
  function overviewGroupEntries(entries){
    const visible=entries.filter(entry=>!isTileHidden(entry.device.id,entry.control?entry.control.id:null));
    return{entries:visible,hidden:entries.length-visible.length};
  }
  /* Oda kartı Genel görünümde çıksın mı? Karar sunucudaki görünürlük kaydında durur — ev
     genelinde tek doğru. Kart SIRASI (`villa-dashboard-widgets`) bundan ayrı ve cihaza özgü:
     her oda kartı her zaman sıraya girer, yalnız basılıp basılmayacağı buradan belirlenir. */
  const groupInOverview=group=>!state.hiddenGroups.has(group.id);
  const groupWidgetHidden=widgetId=>widgetId.startsWith(groupWidgetPrefix)
    &&state.hiddenGroups.has(widgetId.slice(groupWidgetPrefix.length));
  function groupControlEntries(group){
    return group.items.map(item=>{
      const device=state.devices.find(candidate=>candidate.id===item.deviceId);
      if(device&&item.controlId===groupDeviceControlId)return{device,control:null};
      const control=device?.controls.find(candidate=>candidate.id===item.controlId&&isDashboardControl(candidate));
      return device&&control?{device,control}:null;
    }).filter(Boolean);
  }
  /* Genel görünümde gerçekten kart basılacak mı? Hiç cihazı olmayan grup gibi, tüm cihazları
     gizlenmiş grup da boş bir kart bırakmaz. Düzenleme kipinde ölçüt gevşer: göz düğmelerine
     ulaşılabilsin diye kart görünür kalır (`applyWidgetLayout` aynı emniyeti kuruyor). */
  function groupHasVisibleEntries(group){
    const entries=groupControlEntries(group);
    if(!entries.length)return false;
    return state.dashboardEditing===true||overviewGroupEntries(entries).entries.length>0;
  }
  function groupDeviceVisualState(device){
    if(device.availability==="offline")return"offline";
    if(isAlert(device))return"alert";
    if(device.state.presence===true||device.state.occupancy===true||device.state.contact===false||device.state.smoke===true||device.state.carbon_monoxide===true)return"active";
    return"off";
  }
  const widgetAddIcon=()=>'<svg class="widget-catalog-glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14"/><path d="M5 12h14"/></svg>';
  const widgetRemoveIcon=()=>'<svg class="widget-catalog-glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="m6 7 1 13h10l1-13"/><path d="M10 11v5"/><path d="M14 11v5"/></svg>';
  /* Grup düzenleme düğmesi kalem değil liste çizer: panelin başka yerlerinde de (uygulama menüsü,
     cihaz düzeni geçişi) liste aynı üç çubukla anlatılır — ikinci bir görsel dil açılmıyor.
     Davranış aynı: düğme grup düzenleyicisini açar, etiketi de bunu söylemeye devam eder. */
  const groupEditIcon=()=>'<svg class="group-action-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
  function groupSummaryHtml(entries){
    const onCount=entries.filter(({device,control})=>control?dashboardControlAction(control)?.active===true:["active","alert"].includes(groupDeviceVisualState(device))).length;
    const offlineCount=entries.filter(({device})=>device.availability==="offline").length;
    /* Sakin oda sessizdir: "Hepsi kapalı" yazılmaz (her kartta tekrarlanan, hiçbir şey söylemeyen
       bir cümleydi). Yalnız açık olan ya da erişilemeyen varsa satır çıkar. */
    const rows=[];
    if(onCount)rows.push({tone:"active",text:t("groupSummaryOn",{count:onCount})});
    if(offlineCount)rows.push({tone:"alert",text:t("groupSummaryOffline",{count:offlineCount})});
    return`<span class="group-summary">${rows.map(row=>`<span class="${row.tone}">${esc(row.text)}</span>`).join("")}</span>`;
  }
  /* Kademe göstergesi tek bir dil konuşur: aynı çerçeve, içinde dolan bir çubuk. Ok çiftleri
     (genişlet/daralt) kalktı — iki hâlde işe yarıyordu, üç kademede "hangisindeyim" sorusunu
     cevaplamıyordu. */
  const tileWidthGlyph=fill=>`<svg class="tile-width-glyph" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="18" height="10" rx="3"/><rect x="5.5" y="9.5" width="${fill}" height="5" rx="2" fill="currentColor" stroke="none"/></svg>`;
  const tileWidthGlyphs={small:tileWidthGlyph(4),medium:tileWidthGlyph(8.5),full:tileWidthGlyph(13)};
  const tileWidthActionLabels={small:"tileWidthToSmall",medium:"tileWidthToMedium",full:"tileWidthToFull"};
  /* Önce kartın kendi anahtarı, sonra eski (kartsız) kayıt: göç yedeği. Hiçbiri yoksa varsayılan. */
  const tileWidthPreference=(key,legacyKey)=>normalizeTileWidthMode(state.tileWidths[key]||(legacyKey?state.tileWidths[legacyKey]:null)||defaultTileWidthMode);
  function saveTileWidths(){
    try{localStorage.setItem(tileWidthStorageKey,JSON.stringify(state.tileWidths))}catch{}
  }
  /* Düğme kademeler arasında döner; etiketi HER ZAMAN bir sonraki kademeyi söyler ("küçült",
     "orta yap", "tam genişlik yap") — basmadan ne olacağı okunur. */
  function tileWidthToggleHtml(key,mode){
    const label=t(tileWidthActionLabels[nextTileWidthMode(mode)]);
    return`<button class="tile-width-toggle" type="button" data-tile-width-toggle="${esc(key)}" data-tile-width-mode="${esc(mode)}" aria-label="${esc(label)}" title="${esc(label)}">${tileWidthGlyphs[mode]}</button>`;
  }
  function refreshTileWidthToggle(slot,mode){
    const button=slot.querySelector("[data-tile-width-toggle]");
    if(!button)return;
    const label=t(tileWidthActionLabels[nextTileWidthMode(mode)]);
    button.dataset.tileWidthMode=mode;
    button.setAttribute("aria-label",label);
    button.title=label;
    button.innerHTML=tileWidthGlyphs[mode];
  }
  /* Izgaranın GERÇEK sütun sayısı, hesaplanmış `grid-template-columns` üzerinden. "orta" kademe
     iki sütun kaplar; kap tek sütunluksa (ana ekranda oda kartları öyle) span 2 örtük bir sütun
     yaratır, o sütun içerikle boyutlanır ve YAN DÖŞEMELER de oraya akar — bir döşemeyi
     genişletince başkalarının daralmasının sebebi buydu. Span burada gerçek sütun sayısına
     kırpılır, örtük sütun hiç doğmaz. "tam" kademesi `1/-1` olduğu için zaten güvenli. */
  const tileGridColumnCount=grid=>{
    const parts=(getComputedStyle(grid).gridTemplateColumns||"").split(" ").filter(part=>part.endsWith("px"));
    return parts.length||1;
  };
  function applyTileWidths(grid){
    if(!grid)return;
    const slots=[...grid.querySelectorAll(".group-control-slot")];
    if(!slots.length)return;
    grid.style.setProperty("--group-tile-span",String(Math.min(2,tileGridColumnCount(grid))));
    for(const slot of slots){
      const mode=tileWidthPreference(slot.dataset.tileKey,slot.dataset.tileLegacyKey);
      slot.dataset.tileWidth=mode;
      slot.classList.toggle("is-medium",mode==="medium");
      slot.classList.toggle("is-full",mode==="full");
      refreshTileWidthToggle(slot,mode);
    }
  }
  function applyAllTileWidths(){$$(".group-control-grid").forEach(applyTileWidths)}
  let tileWidthObserver=null;
  const tileGridWidths=new WeakMap();
  function observeTileWidths(){
    if(typeof ResizeObserver!=="function")return;
    if(!tileWidthObserver){
      tileWidthObserver=new ResizeObserver(entries=>{
        for(const entry of entries){
          const width=Math.round(entry.contentRect.width);
          if(tileGridWidths.get(entry.target)===width)continue;
          tileGridWidths.set(entry.target,width);
          applyTileWidths(entry.target);
        }
      });
    }
    tileWidthObserver.disconnect();
    $$(".group-control-grid").forEach(grid=>tileWidthObserver.observe(grid));
  }
  function toggleTileWidth(button){
    const slot=button.closest(".group-control-slot");
    if(!slot)return;
    const key=button.dataset.tileWidthToggle;
    if(!key)return;
    state.tileWidths[key]=nextTileWidthMode(slot.dataset.tileWidth);
    saveTileWidths();
    applyTileWidths(slot.closest(".group-control-grid"));
  }
  /* Göz döşemenin kardeşi: döşemenin İÇİ zaten iki düğme, iç içe buton olamaz. Tıklama cihazı açıp
     kapatmaz — düzenleme kipinde döşeme `pointer-events:none`, olay da ayrıca durdurulur.
     Kontrolü olmayan cihaz (sensör) da gizlenebilir: anahtarı `@device`. */
  function tileVisibilityHtml(device,control,name){
    const hidden=isTileHidden(device.id,control?control.id:null);
    const label=`${visibilityLabel(hidden)}: ${name}`;
    return`<button class="tile-eye" type="button" role="switch" aria-checked="${hidden?"false":"true"}" data-visibility-device="${esc(device.id)}" data-visibility-control="${esc(control?control.id:groupDeviceControlId)}" aria-label="${esc(label)}" title="${esc(label)}">${visibilityIcon(hidden)}</button>`;
  }
  /* Yıldız gözün kardeşi ve aynı kipte (düzenleme) görünür: ikisi de "bu döşemeyi nereye
     koyayım" sorusunun cevabı, günlük kumanda değil. Kumandası olmayan cihazda (sensör) yıldız
     HİÇ basılmaz — favori bir eylem öğesidir, sunucu da `@device` kaydını kabul etmez. */
  function tileFavoriteHtml(device,control,name){
    if(!control)return"";
    const on=isFavorite(device.id,control.id);
    const label=`${favoriteLabel(on)}: ${name}`;
    return`<button class="tile-star" type="button" aria-pressed="${on?"true":"false"}" data-favorite-device="${esc(device.id)}" data-favorite-control="${esc(control.id)}" aria-label="${esc(label)}" title="${esc(label)}">${favoriteIcon()}</button>`;
  }
  /* Grup seviyesi filtre: kart Genel görünümde çıksın mı? Kayıt sunucuda `hiddenGroups` içinde
     grup kimliğiyle durur, dostane ad değil. Cihazsız grupta anahtar pasif ve sebebi yazılı. */
  function overviewSwitchHtml(group,entries){
    const active=groupInOverview(group);
    const empty=entries.length===0;
    const label=`${group.name} · ${t("showInOverview")}`;
    return`<span class="ov-switch-wrap"><button class="ov-switch" type="button" role="switch" aria-checked="${active?"true":"false"}"${empty?" disabled aria-disabled=\"true\"":""} data-overview-toggle="${esc(group.id)}" aria-label="${esc(empty?`${label} — ${t("showInOverviewEmpty")}`:label)}"><span class="ov-switch-track" aria-hidden="true"><span class="ov-switch-knob"></span></span><span class="ov-switch-text">${esc(t("showInOverview"))}</span></button>${empty?`<small class="ov-switch-note">${esc(t("showInOverviewEmpty"))}</small>`:""}</span>`;
  }
  /* Tek döşemenin HTML'i. Oda kartı, grup sekmesi ve Favoriler kartı aynı çağrıyı kullanır:
     ikinci bir döşeme dili açılmasın, hızlı kumanda/genişlik/göz/yıldız her yerde aynı davransın.
     `scope` = döşemeyi basan KARTIN kimliği; yalnız genişlik tercihini kapsar (bkz. `tileWidthKey`).
     Oda kartı ile o odanın sekmesi bilerek aynı kapsamı paylaşır: ikisi aynı kartın iki boyu. */
  function groupTileSlotHtml(device,control,scope){
      const name=control?channelDisplayName(device,control):device.name;
      const controlAction=dashboardControlAction(control);
      const preparing=device.preparing===true;
      const pending=Boolean(controlAction&&commandPending(device.id,control.property));
      const failed=commandFailed(device.id);
      const shown=pending?!controlAction.active:controlAction?.active===true;
      const visualState=preparing?"preparing":control?(device.availability==="offline"?"offline":shown?"on":"off"):groupDeviceVisualState(device);
      const action=controlAction?`data-group-device="${esc(device.id)}" data-group-property="${esc(control.property)}" data-group-command-value="${commandValue(controlAction.value)}"${confirmCommandAttribute(control,controlAction)}`:"";
      const primaryStatus=primaryStatusForDevice(device,preparing);
      const statusLabel=preparing?t("preparing"):device.availability==="offline"?primaryStatus.label:pending?t("sendingCommand"):controlAction?(shown?t("on"):t("off")):primaryStatus.label;
      const statusTone=preparing?"muted":device.availability==="offline"?"danger":controlAction?(shown?"active":"muted"):primaryStatus.tone;
      const controlId=control?control.id:groupDeviceControlId;
      const widthKey=tileWidthKey(scope,device.id,controlId);
      const widthLegacyKey=legacyTileWidthKey(device.id,controlId);
      const widthMode=tileWidthPreference(widthKey,widthLegacyKey);
      const widthClass=widthMode==="full"?" is-full":widthMode==="medium"?" is-medium":"";
      /* Döşemede İKİ dokunma hedefi var: yuvarlak ikon cihazı açıp kapar, gövde (isim + durum)
         hızlı kumanda penceresini açar. Kap bu yüzden <button> değil <div>: iç içe <button>
         geçersizdir (aynı gerekçe gözde de yazılı). Görsel sınıflar kapta kaldığı için düzenleme
         kipinin `pointer-events:none` emniyeti, göz/genişlik düğmeleri ve zemin kuralları
         değişmeden çalışır. Kumandası olmayan cihazda ikon düğme değil, düz bir işarettir. */
      const iconHtml=deviceStatusIcon(device,{label:statusLabel,tone:statusTone});
      const knobLabel=preparing
        ?`${name} · ${t("preparing")}`
        :`${name} · ${statusLabel} · ${pending?t("sendingCommand"):controlAction?.active?t("off"):t("on")}`;
      const knobHtml=controlAction
        ?`<button class="group-control-visual tile-knob" type="button" ${action} aria-pressed="${shown?"true":"false"}" aria-label="${esc(knobLabel)}"${preparing||device.availability==="offline"||pending?" disabled":""}>${iconHtml}</button>`
        :`<span class="group-control-visual tile-knob is-static" aria-hidden="true">${iconHtml}</span>`;
      const openLabel=`${t(quickControlMode(device,control)==="none"?"showDetails":"openQuickControls")}: ${name} · ${statusLabel}`;
      const bodyHtml=`<button class="tile-body" type="button" data-tile-open="${esc(device.id)}" data-tile-control="${esc(controlId)}" aria-label="${esc(preparing?`${name} · ${t("preparing")}`:openLabel)}"${preparing?" disabled":""}><span class="group-control-copy"><strong title="${esc(name)}">${esc(name)}</strong><small>${esc(statusLabel)}</small></span></button>`;
      const tile=`<div class="group-control-tile ${visualState}${pending?" pending":""}${failed?" command-failed":""}">${knobHtml}${bodyHtml}${preparing||pending?'<span class="command-spinner" aria-hidden="true"></span>':""}</div>`;
      const hiddenTile=isTileHidden(device.id,control?control.id:null);
      return`<div class="group-control-slot has-eye${widthClass}${hiddenTile?" is-hidden-tile":""}" data-tile-key="${esc(widthKey)}" data-tile-legacy-key="${esc(widthLegacyKey)}" data-tile-width="${esc(widthMode)}">${tile}${tileWidthToggleHtml(widthKey,widthMode)}${tileVisibilityHtml(device,control,name)}${tileFavoriteHtml(device,control,name)}</div>`;
  }
  function groupWidgetHtml(group,options={}){
    const overview=options.variant!=="panel";
    const entries=groupControlEntries(group);
    const picked=overview?overviewGroupEntries(entries):{entries,hidden:0};
    const shown=state.dashboardEditing?entries:picked.entries;
    /* Genişlik kapsamı KART kimliğidir ve o da grubun kalıcı kimliğinden gelir (`group:<id>`) —
       sıra/indeks değil: kart taşınsa, silinip geri eklense de tercih yerinde kalır. Oda kartı ile
       o odanın sekmesi bilerek aynı kapsamı paylaşır (aynı kartın iki boyu). */
    const scope=groupWidgetId(group.id);
    const controls=shown.map(({device,control})=>groupTileSlotHtml(device,control,scope)).join("");
    /* Gizlenen cihaz sessizce kaybolmaz: kartın altında sayısıyla duyurulur ve satır Cihazlar
       görünümüne (mümkünse o odayı süzerek) götürür. Gizli yoksa satır hiç basılmaz. */
    const hiddenNote=overview&&!state.dashboardEditing&&picked.hidden
      ?`<button class="ov-hidden-note" type="button" data-hidden-room="${esc(group.id)}" aria-label="${esc(t("hiddenDevicesNoteLabel",{count:picked.hidden}))}" title="${esc(t("hiddenDevicesNoteLabel",{count:picked.hidden}))}">${esc(t("hiddenDevicesNote",{count:picked.hidden}))}</button>`
      :"";
    const roomNote=overview&&!state.dashboardEditing&&group.id===noRoomGroupId
      ?`<button class="ov-hidden-note" type="button" data-hidden-room="">${esc(t("noRoomCardHint"))}</button>`
      :"";
    const note=`${hiddenNote}${roomNote}`;
    const widgetId=groupWidgetId(group.id);
    const editButton=group.locked?"":`<button type="button" data-edit-group="${esc(group.id)}" aria-label="${t("editGroup")}">${groupEditIcon()}</button>`;
    const body=`${controls?`<div class="group-control-grid">${controls}</div>`:note?"":`<div class="group-empty">${t("groupNoControls")}</div>`}${note}`;
    if(!overview){
      return`<div class="group-widget-head"><div><h2>${esc(group.name)}</h2>${groupSummaryHtml(entries)}</div><div class="group-widget-actions">${state.dashboardEditing?overviewSwitchHtml(group,entries):""}${editButton}</div></div>${body}`;
    }
    const title=`<button class="ov-title" type="button" data-home-tab="${esc(group.id)}" aria-label="${esc(t("openGroupTab",{name:group.name}))}"><span class="ov-title-name">${esc(group.name)}<span class="ov-go" aria-hidden="true">›</span></span>${groupSummaryHtml(entries)}</button>`;
    return`<article class="dashboard-widget widget-card group-widget${groupInOverview(group)?"":" is-off"}" data-widget="${esc(widgetId)}" data-group-widget="${esc(group.id)}" hidden>
      <div class="widget-edit-controls"><button data-widget-move="left">←</button><button data-widget-move="right">→</button><button data-widget-remove>×</button></div>
      <div class="group-widget-head">${title}<div class="group-widget-actions">${state.dashboardEditing?overviewSwitchHtml(group,entries):""}${editButton}</div></div>
      ${body}
    </article>`;
  }
  /* Cihazı olmayan ya da tüm cihazları gizlenmiş grup Genel görünümde hiç kart basmaz (anahtarı
     açık olsa bile); sekmesi alt şeritte durur. */
  function renderGroupWidgets(){
    $$("[data-group-widget]").forEach(widget=>widget.remove());
    const empty=$("#widgetEmpty");
    for(const group of dashboardGroups()){
      if(!groupHasVisibleEntries(group))continue;
      empty.insertAdjacentHTML("beforebegin",groupWidgetHtml(group));
    }
  }
