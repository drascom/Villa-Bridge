  function widgetCatalogItemHtml(entry){
      const {id,title,lead,groupId}=entry;
      // Oda kartı için "açık mı" sorusunun cevabı görünürlük kaydında; sıra listesinde değil.
      const active=id.startsWith(groupWidgetPrefix)?!groupWidgetHidden(id):state.widgets.includes(id);
      const fixed=fixedDashboardWidgets.has(id);
      const action=fixed
        ?`<button class="quiet" type="button" disabled>${t("widgetAlwaysOn")}</button>`
        :active
          ?`<button class="danger-soft" type="button" data-remove-widget="${esc(id)}">${widgetRemoveIcon()}${t("removeWidgetAction")}</button>`
          :`<button class="secondary" type="button" data-add-widget="${esc(id)}">${widgetAddIcon()}${t("addWidgetAction")}</button>`;
      return`<div class="widget-catalog-item"><div><strong>${esc(title)}</strong><span>${esc(lead)}</span></div><div class="widget-catalog-actions">${groupId?`<button class="icon-button" data-edit-group="${esc(groupId)}" aria-label="${t("editGroup")}">${groupEditIcon()}</button>`:""}${action}</div></div>`;
  }
  function widgetCatalogSectionHtml(headingId,labelKey,entries){
    if(!entries.length)return"";
    return`<div class="widget-catalog-section" role="group" aria-labelledby="${headingId}"><h3 id="${headingId}" class="widget-catalog-heading">${esc(t(labelKey))}</h3>${entries.map(widgetCatalogItemHtml).join("")}</div>`;
  }
  function renderWidgetCatalog(){
    const infoBoxes=Object.entries(dashboardWidgetTypes).map(([id,definition])=>({id,title:t(definition.title),lead:t(definition.lead),groupId:null}));
    const groupBoxes=dashboardGroups().map(group=>({id:groupWidgetId(group.id),title:group.name,lead:t("groupWidgetLead",{count:group.items.length}),groupId:group.locked?null:group.id}));
    $("#widgetCatalog").innerHTML=widgetCatalogSectionHtml("widgetCatalogInfoHeading","widgetCatalogInfoBoxes",infoBoxes)+widgetCatalogSectionHtml("widgetCatalogGroupsHeading","widgetCatalogYourGroups",groupBoxes);
    $$("[data-add-widget]").forEach(button=>button.onclick=()=>addDashboardWidget(button.dataset.addWidget));
    $$("#widgetCatalog [data-remove-widget]").forEach(button=>button.onclick=()=>removeDashboardWidget(button.dataset.removeWidget));
    $$("[data-edit-group]").forEach(button=>button.onclick=()=>openGroupEditor(button.dataset.editGroup));
  }
  function updateWidgetScrollHint(){
    const rail=$("#widgetRail");
    const quick=$("#homeTabs");
    if(!rail||!quick)return;
    const landscape=window.matchMedia("(orientation: landscape) and (max-height: 900px)").matches;
    const update=(scroller,left,right,enabled)=>{
      const hasBefore=scroller.scrollLeft>8;
      const hasAfter=scroller.scrollWidth-scroller.clientWidth-scroller.scrollLeft>8;
      left.hidden=!enabled||!hasBefore;
      right.hidden=!enabled||!hasAfter;
    };
    const enabled=landscape&&!state.dashboardEditing;
    update(rail,$("#widgetScrollLeft"),$("#widgetScrollHint"),enabled);
    update(quick,$("#quickScrollLeft"),$("#quickScrollRight"),enabled&&!$('[data-widget="quick"]').hidden);
    updateHubVisibility(landscape,rail);
  }
  // Kartlar saydam: rail sola kaydırıldığında altta kalan saat/hava bloğu görüntüyü bozuyordu.
  // Birkaç piksellik kayma hub'ı kapatmasın diye eşik toleranslı; gizliyken tıklama ve odak da kapanır.
  function updateHubVisibility(landscape,rail){
    const hub=$("#homeHub");
    if(!hub)return;
    const hidden=Boolean(landscape&&rail&&rail.scrollLeft>24);
    hub.classList.toggle("hub-hidden",hidden);
    hub.toggleAttribute("inert",hidden);
    if(hidden)hub.setAttribute("aria-hidden","true");
    else hub.removeAttribute("aria-hidden");
  }
  function scrollDashboardRow(scroller,direction,minimum,ratio){
    if(!scroller)return;
    scroller.scrollBy({left:direction*Math.max(minimum,Math.round(scroller.clientWidth*ratio)),behavior:"smooth"});
    setTimeout(updateWidgetScrollHint,420);
  }
  function scrollWidgetRail(direction){scrollDashboardRow($("#widgetRail"),direction,220,.72)}
  function scrollWidgetRailForward(){scrollWidgetRail(1)}
  function scrollHomeTabs(direction){scrollDashboardRow($("#homeTabs"),direction,120,.55)}
  const editDashboardGlyphs={
    edit:'<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>',
    done:'<path d="m4 12.5 5.5 5.5L20 7"/>'
  };
  /* Kaydırma konumu DOM taşımasında kayboluyordu: bir kap belgeden çıkarılıp geri eklenince
     tarayıcı `scrollLeft`ini sıfırlar — cihaza dokununca `render()` çalıştığı için sekme şeridi
     her seferinde başa dönüyordu. İki savunma var: (1) düğüm zaten doğru yerdeyse taşınmaz,
     (2) düzen turu boyunca kaydırma konumları yedeklenip sonunda geri verilir. */
  function placeNode(parent,node,reference){
    if(node.parentElement===parent&&node.nextElementSibling===reference)return;
    parent.insertBefore(node,reference);
  }
  const scrollKeepers=()=>[$("#homeTabs"),$("#widgetRail")].filter(Boolean);
  /* Döşeme ızgaraları her turda yeniden yazıldığı için düğüm kimliği kaybolur: dikey konum
     grubun kendi kimliğiyle (panelde "panel") saklanır ve yeniden sorgulanarak geri verilir. */
  const gridScrollKey=grid=>grid.closest("[data-group-widget]")?.dataset.groupWidget||(grid.closest("#groupPanel")?"panel":null);
  function captureScrollPositions(){
    const grids=new Map();
    for(const grid of $$(".group-control-grid")){
      const key=gridScrollKey(grid);
      if(key&&grid.scrollTop)grids.set(key,grid.scrollTop);
    }
    return{rows:scrollKeepers().map(node=>({node,left:node.scrollLeft})),grids};
  }
  function restoreScrollPositions(positions){
    for(const {node,left} of positions.rows){
      if(!left||node.scrollLeft===left)continue;
      node.scrollLeft=left;
    }
    for(const grid of $$(".group-control-grid")){
      const top=positions.grids.get(gridScrollKey(grid));
      if(top&&grid.scrollTop!==top)grid.scrollTop=top;
    }
  }
  function applyWidgetLayout(){
    const board=$("#widgetBoard");
    const rail=$("#widgetRail");
    const scrollPositions=captureScrollPositions();
    reconcileWidgetLayout();
    renderGroupWidgets();
    const widgets=Object.fromEntries($$("[data-widget]").map(widget=>[widget.dataset.widget,widget]));
    Object.values(widgets).forEach(widget=>widget.hidden=true);
    for(const id of ["quick"]){
      if(!state.widgets.includes(id))continue;
      const widget=widgets[id];
      if(!widget)continue;
      widget.hidden=false;
      placeNode(board,widget,rail);
    }
    /* Sıra `state.widgets`ten, oda kartının görünürlüğü sunucudaki kayıttan gelir: kapatılmış
       kart sırasını korur ama basılmaz. */
    for(const id of state.widgets.filter(id=>!fixedDashboardWidgets.has(id))){
      const widget=widgets[id];
      if(!widget)continue;
      if(!state.dashboardEditing&&groupWidgetHidden(id))continue;
      widget.hidden=false;
      placeNode(rail,widget,$("#widgetEmpty"));
    }
    /* Emniyet ağı: düzenleme kipinde, düzen kaydında hiç yeri olmayan bir grup kartı da
       görünür kalsın — anahtarı kapatan kullanıcı onu geri açacak yeri bulabilmeli. */
    if(state.dashboardEditing)for(const widget of $$("#widgetRail [data-group-widget]")){
      if(state.widgets.includes(widget.dataset.widget))continue;
      widget.hidden=false;
      placeNode(rail,widget,$("#widgetEmpty"));
    }
    board.classList.toggle("editing",state.dashboardEditing);
    // "Pano boş" satırı ekranda gerçekten kart olup olmamasına bakar; sıradaki kayda değil.
    $("#widgetEmpty").hidden=railWidgets().length>0;
    applyHomeTab();
    const editDashboard=$("#editDashboard");
    const editDashboardText=t(state.dashboardEditing?"finishEditing":"editDashboard");
    $("#editDashboardGlyph").innerHTML=state.dashboardEditing?editDashboardGlyphs.done:editDashboardGlyphs.edit;
    $("#editDashboardLabel").textContent=editDashboardText;
    editDashboard.setAttribute("aria-label",editDashboardText);
    editDashboard.title=editDashboardText;
    editDashboard.classList.toggle("secondary",state.dashboardEditing);
    editDashboard.classList.toggle("quiet",!state.dashboardEditing);
    editDashboard.classList.toggle("editing-active",state.dashboardEditing);
    /* Ok düğmeleri ekrandaki gerçek sırayı yansıtır: kaynak liste değil, ray üzerinde görünen
       kartların sırası. Listede kaydı olmayan bir kart bile böylece "ilk/son" doğru hesaplanır. */
    const railOrder=railWidgets().map(widget=>widget.dataset.widget);
    $$("[data-widget-move]").forEach(button=>{
      const widgetId=button.closest("[data-widget]")?.dataset.widget;
      const index=railOrder.indexOf(widgetId);
      button.disabled=fixedDashboardWidgets.has(widgetId)||index<0||(button.dataset.widgetMove==="left"?index===0:index>=railOrder.length-1);
      const key=button.dataset.widgetMove==="left"?"moveWidgetLeft":"moveWidgetRight";
      button.setAttribute("aria-label",t(key));
      button.title=t(key);
    });
    $$("[data-widget-remove]").forEach(button=>{
      button.setAttribute("aria-label",t("removeWidget"));
      button.title=t("removeWidget");
    });
    bindWidgetControls();
    bindGroupControls();
    renderWidgetCatalog();
    renderWorldClock();
    renderWeather();
    refreshWeatherIfNeeded();
    restoreScrollPositions(scrollPositions);
    requestAnimationFrame(updateWidgetScrollHint);
  }
  /* Seçili sekme neyi gösteriyor: "Genel görünüm" yatay kart rayını, grup sekmesi tek kartı.
     Yükseklik mekanizması (`#home.active` kalan alan) ikisinde de aynı — kartlar alt şeridin
     üstünde biter, altına girmez. */
  function applyHomeTab(){
    const panel=$("#groupPanel");
    const rail=$("#widgetRail");
    if(state.homeTab!==overviewTabId&&!dashboardGroupById(state.homeTab)){state.homeTab=overviewTabId;saveHomeTab()}
    renderHomeTabs();
    const group=state.homeTab===overviewTabId?null:dashboardGroupById(state.homeTab);
    rail.hidden=Boolean(group);
    panel.hidden=!group;
    if(!group){panel.innerHTML="";return}
    const entries=groupControlEntries(group);
    panel.innerHTML=groupWidgetHtml(group,{variant:"panel"});
    panel.setAttribute("aria-labelledby",`hometab-${group.id}`);
  }
  function addDashboardWidget(id){
    const known=Object.hasOwn(dashboardWidgetTypes,id)||dashboardGroups().some(group=>groupWidgetId(group.id)===id);
    if(!known)return;
    // Oda kartı sırada zaten var: "ekle" onu görünürlük kaydından çıkarmak demek.
    if(id.startsWith(groupWidgetPrefix))return setGroupOverview(id.slice(groupWidgetPrefix.length),true);
    if(state.widgets.includes(id))return;
    state.widgets.push(id);
    state.removedWidgets.delete(id);
    saveRemovedWidgets();
    saveWidgetLayout();
    applyWidgetLayout();
    render();
  }
  /* Grup seviyesi filtre: kart Genel görünümde dursun mu? Kayıt SUNUCUDA (`hiddenGroups`), grup
     kimliğiyle — kart sırasından bağımsız. Oda silinince sunucu kaydı kendisi düşürür. */
  function setGroupOverview(groupId,visible){
    if(!groupId)return;
    if(state.hiddenGroups.has(groupId)===!visible){applyWidgetLayout();return}
    if(visible)state.hiddenGroups.delete(groupId);
    else state.hiddenGroups.add(groupId);
    void saveHomeVisibility();
    applyWidgetLayout();
    render();
  }
  function toggleGroupOverview(groupId){
    setGroupOverview(groupId,state.hiddenGroups.has(groupId));
    touchDashboardEditing();
  }
  function removeDashboardWidget(id){
    // Oda kartında "kaldır" bir görünürlük kararıdır (ev geneli), sıra kararı değil.
    if(id.startsWith(groupWidgetPrefix)){
      setGroupOverview(id.slice(groupWidgetPrefix.length),false);
      touchDashboardEditing();
      return;
    }
    state.widgets=state.widgets.filter(widget=>widget!==id);
    state.removedWidgets.add(id);
    saveRemovedWidgets();
    saveWidgetLayout();
    applyWidgetLayout();
    touchDashboardEditing();
  }
  const widgetSlideDuration=220;
  const railWidgets=()=>$$("#widgetRail [data-widget]").filter(widget=>!widget.hidden);
  let widgetSlideEnd=null;
  let widgetScrollHintTimer=null;
  function endWidgetSlide(){
    if(!widgetSlideEnd)return;
    const finish=widgetSlideEnd;
    widgetSlideEnd=null;
    finish();
  }
  function scrollMovedWidgetIntoView(id){
    const widget=railWidgets().find(candidate=>candidate.dataset.widget===id);
    if(!widget)return;
    widget.scrollIntoView({behavior:reducedMotion()?"auto":"smooth",block:"nearest",inline:"center"});
    if(widgetScrollHintTimer!==null)clearTimeout(widgetScrollHintTimer);
    widgetScrollHintTimer=setTimeout(()=>{widgetScrollHintTimer=null;updateWidgetScrollHint()},420);
  }
  function captureWidgetPositions(){
    const positions=new Map();
    for(const widget of railWidgets())positions.set(widget.dataset.widget,widget.getBoundingClientRect());
    return positions;
  }
  function playWidgetSlide(positions){
    if(reducedMotion())return;
    const moved=[];
    for(const widget of railWidgets()){
      const before=positions.get(widget.dataset.widget);
      if(!before)continue;
      const after=widget.getBoundingClientRect();
      const offsetX=before.left-after.left;
      const offsetY=before.top-after.top;
      if(Math.abs(offsetX)<1&&Math.abs(offsetY)<1)continue;
      widget.style.transition="none";
      widget.style.setProperty("--widget-slide-x",`${offsetX}px`);
      widget.style.setProperty("--widget-slide-y",`${offsetY}px`);
      moved.push(widget);
    }
    if(!moved.length)return;
    const finish=()=>{
      for(const widget of moved){
        widget.style.transition="";
        widget.style.removeProperty("--widget-slide-x");
        widget.style.removeProperty("--widget-slide-y");
      }
    };
    widgetSlideEnd=finish;
    requestAnimationFrame(()=>{
      if(widgetSlideEnd!==finish)return;
      for(const widget of moved){
        widget.style.transition=`transform ${widgetSlideDuration}ms ease`;
        widget.style.setProperty("--widget-slide-x","0px");
        widget.style.setProperty("--widget-slide-y","0px");
      }
      setTimeout(()=>{if(widgetSlideEnd===finish)endWidgetSlide()},widgetSlideDuration+60);
    });
  }
  function moveDashboardWidget(id,direction){
    if(fixedDashboardWidgets.has(id))return;
    endWidgetSlide();
    const railOrder=railWidgets().map(widget=>widget.dataset.widget);
    const index=railOrder.indexOf(id);
    const target=index+(direction==="left"?-1:1);
    if(index<0||target<0||target>=railOrder.length)return;
    const sourceIndex=state.widgets.indexOf(railOrder[index]);
    const targetIndex=state.widgets.indexOf(railOrder[target]);
    if(sourceIndex<0||targetIndex<0)return;
    [state.widgets[sourceIndex],state.widgets[targetIndex]]=[state.widgets[targetIndex],state.widgets[sourceIndex]];
    const positions=captureWidgetPositions();
    saveWidgetLayout();
    applyWidgetLayout();
    touchDashboardEditing();
    scrollMovedWidgetIntoView(id);
    playWidgetSlide(positions);
    requestAnimationFrame(()=>{
      const widget=railWidgets().find(candidate=>candidate.dataset.widget===id);
      widget?.classList.add("widget-moved");
      setTimeout(()=>widget?.classList.remove("widget-moved"),500);
    });
  }
  const dashboardEditingIdleDelay=60000;
  let dashboardEditingTimer=null;
  function clearDashboardEditingTimer(){
    if(dashboardEditingTimer===null)return;
    clearTimeout(dashboardEditingTimer);
    dashboardEditingTimer=null;
  }
  function touchDashboardEditing(){
    clearDashboardEditingTimer();
    if(!state.dashboardEditing)return;
    dashboardEditingTimer=setTimeout(()=>{
      dashboardEditingTimer=null;
      if(state.dashboardEditing)setDashboardEditing(false);
    },dashboardEditingIdleDelay);
  }
  function setDashboardEditing(enabled){
    state.dashboardEditing=Boolean(enabled);
    applyWidgetLayout();
    touchDashboardEditing();
  }
  const longPressIgnore=target=>Boolean(target.closest("button,input,select,textarea,a,[data-group-device],[data-group-show-device]"));
  function bindWidgetControls(){
    $$("#widgetRail [data-widget]").filter(widget=>!widget.hidden).forEach(widget=>{
      bindLongPress(widget,()=>{
        if(!state.dashboardEditing)setDashboardEditing(true);
      },{ignore:longPressIgnore});
    });
    /* Grup sekmesindeki kart da düzenlenebilir bir yüzey: asıl detay ekranı orası olduğu için
       uzun basış orada da düzenleme kipini açar, döşeme genişliği oradan da ayarlanabilir. */
    const panel=$("#groupPanel");
    if(panel)bindLongPress(panel,()=>{
      if(!panel.hidden&&!state.dashboardEditing)setDashboardEditing(true);
    },{ignore:longPressIgnore});
    $$("[data-widget-move]").forEach(button=>button.onclick=()=>{
      const id=button.closest("[data-widget]")?.dataset.widget;
      if(id)moveDashboardWidget(id,button.dataset.widgetMove);
    });
    $$("[data-widget-remove]").forEach(button=>button.onclick=()=>{
      const id=button.closest("[data-widget]")?.dataset.widget;
      if(id)removeDashboardWidget(id);
    });
  }
  function bindGroupControls(){
    bindDeviceImages();
    $$("[data-group-device]").forEach(button=>button.onclick=()=>runDashboardCommand(button,button.dataset.groupDevice,button.dataset.groupProperty,JSON.parse(button.dataset.groupCommandValue)));
    $$("[data-group-show-device]").forEach(button=>button.onclick=()=>showDevice(button.dataset.groupShowDevice));
    $$("[data-edit-group]").forEach(button=>button.onclick=()=>openGroupEditor(button.dataset.editGroup));
    /* Boyut simgesi cihaza dokunmamalı: olayı burada durduruyoruz, ayrıca simge butonun kardeşi
       (iç içe <button> olamaz) ve düzenleme kipinde döşemenin kendisi pointer-events:none. */
    $$("[data-tile-width-toggle]").forEach(button=>button.onclick=event=>{
      event.preventDefault();
      event.stopPropagation();
      toggleTileWidth(button);
    });
    /* Göz yalnız görünürlüğü değiştirir — cihazı açıp kapatmaz. */
    $$(".tile-eye").forEach(button=>button.onclick=event=>{
      event.preventDefault();
      event.stopPropagation();
      toggleTileVisibility(button.dataset.visibilityDevice,button.dataset.visibilityControl);
    });
    /* "n cihaz gizli" satırı Cihazlar görünümüne götürür; oda gerçek bir grupsa oraya süzer. */
    $$("[data-hidden-room]").forEach(button=>button.onclick=event=>{
      event.preventDefault();
      event.stopPropagation();
      openHiddenDevices(button.dataset.hiddenRoom);
    });
    $$("[data-overview-toggle]").forEach(button=>button.onclick=event=>{
      event.preventDefault();
      event.stopPropagation();
      toggleGroupOverview(button.dataset.overviewToggle);
    });
    observeTileWidths();
    applyAllTileWidths();
    bindDashboardDeviceActions();
  }
  const groupItemKey=(deviceId,controlId)=>JSON.stringify([deviceId,controlId]);
  function renderGroupDeviceChoices(){
    const editing=state.groupEditing;
    if(!editing)return;
    const choices=state.devices.flatMap(device=>{
      const controls=device.controls.filter(isDashboardControl);
      return controls.length?controls.map(control=>({device,control})):[{device,control:null}];
    });
    $("#groupDeviceChoices").innerHTML=choices.length?choices.map(({device,control})=>{
      const key=groupItemKey(device.id,control?.id||groupDeviceControlId);
      const checked=editing.selected.has(key);
      const name=control?channelDisplayName(device,control):device.name;
      const detail=control&&name!==device.name?device.name:deviceKind(device);
      const visualState=control?(device.availability==="offline"?"offline":dashboardControlAction(control)?.active?"on":"off"):groupDeviceVisualState(device);
      return`<label class="group-device-choice"><input type="checkbox" data-group-choice="${esc(key)}"${checked?" checked":""}><span class="group-choice-state ${visualState}" aria-hidden="true"></span><span><strong>${esc(name)}</strong><small>${esc(detail)}</small></span></label>`;
    }).join(""):`<div class="group-empty">${t("groupNoAvailableControls")}</div>`;
    $$("[data-group-choice]").forEach(input=>input.onchange=()=>{
      if(input.checked)editing.selected.add(input.dataset.groupChoice);
      else editing.selected.delete(input.dataset.groupChoice);
      updateGroupSelection();
    });
    updateGroupSelection();
  }
  const roomSuggestionKeys=["roomLivingRoom","roomKitchen","roomBedroom","roomBathroom","roomHallway","roomBalcony","roomKidsRoom","roomGarden","roomAllLights","roomAllSecurity"];
  function renderRoomSuggestions(){
    const container=$("#roomSuggestions");
    if(!container)return;
    const editingId=state.groupEditing?.id||null;
    const taken=new Set(state.groups.filter(group=>group.id!==editingId).map(group=>group.name.trim().toLowerCase()));
    container.innerHTML=roomSuggestionKeys.map(key=>{
      const name=t(key);
      const used=taken.has(name.trim().toLowerCase());
      return`<button class="room-suggestion${used?" used":""}" type="button" data-room-suggestion="${esc(name)}"${used?` disabled aria-label="${esc(t("roomSuggestionUsed",{name}))}"`:""}>${esc(name)}</button>`;
    }).join("");
    $$("[data-room-suggestion]").forEach(button=>button.onclick=()=>{
      $("#groupName").value=button.dataset.roomSuggestion;
      $("#groupName").focus();
      updateGroupSelection();
    });
  }
  function updateGroupSelection(){
    const count=state.groupEditing?.selected.size||0;
    $("#groupSelectionCount").textContent=t("groupSelected",{count});
    $("#saveGroup").disabled=count===0||$("#groupName").value.trim().length<2;
  }
  function prepareGroupEditor(groupId=null){
    const group=state.groups.find(candidate=>candidate.id===groupId);
    state.groupEditing={
      id:group?.id||null,
      selected:new Set((group?.items||[]).map(item=>groupItemKey(item.deviceId,item.controlId)))
    };
    updateAddDialogTitle();
    $("#groupName").value=group?.name||"";
    $("#deleteGroup").hidden=!group;
    updateGroupOrderControls();
    renderRoomSuggestions();
    renderGroupDeviceChoices();
  }
  function openGroupEditor(groupId=null){
    prepareGroupEditor(groupId);
    renderWidgetCatalog();
    setAddDialogTab("groups");
    if(!$("#widgetDialog").open)$("#widgetDialog").showModal();
    $("#groupName").focus();
  }
  async function saveDashboardGroup(){
    const editing=state.groupEditing;
    const name=$("#groupName").value.trim();
    if(!editing||name.length<2||editing.selected.size===0)return;
    const items=[...editing.selected].map(key=>{
      const [deviceId,controlId]=JSON.parse(key);
      return{deviceId,controlId};
    });
    let groups;
    let createdId=null;
    if(editing.id){
      groups=state.groups.map(group=>group.id===editing.id?{id:group.id,name,items}:group);
    }else{
      const id=`${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`;
      createdId=id;
      groups=[...state.groups,{id,name,items}];
      state.widgets.push(groupWidgetId(id));
      saveWidgetLayout();
    }
    closeAddDialog();
    await persistHomeGroups(groups,editing.id?"groupUpdated":"groupCreated");
    if(createdId)requestAnimationFrame(()=>scrollMovedWidgetIntoView(groupWidgetId(createdId)));
  }
  function syncGroupWidgetOrder(groups){
    const order=groups.map(group=>groupWidgetId(group.id)).filter(widget=>state.widgets.includes(widget));
    const slots=state.widgets.map((widget,index)=>order.includes(widget)?index:-1).filter(index=>index>=0);
    slots.forEach((slot,index)=>{state.widgets[slot]=order[index]});
    saveWidgetLayout();
  }
  async function moveDashboardGroup(direction){
    const id=state.groupEditing?.id;
    const index=state.groups.findIndex(group=>group.id===id);
    const target=index+direction;
    if(index<0||target<0||target>=state.groups.length)return;
    const groups=[...state.groups];
    const [moved]=groups.splice(index,1);
    groups.splice(target,0,moved);
    syncGroupWidgetOrder(groups);
    updateGroupOrderControls(groups,target);
    await persistHomeGroups(groups);
  }
  function updateGroupOrderControls(groups=state.groups,position=null){
    const id=state.groupEditing?.id;
    const row=$("#groupOrderRow");
    const index=position===null?groups.findIndex(group=>group.id===id):position;
    row.hidden=!id||groups.length<2||index<0;
    if(row.hidden)return;
    $("#groupOrderPosition").textContent=t("groupOrderPosition",{current:index+1,total:groups.length});
    $("#groupMoveLeft").disabled=index===0;
    $("#groupMoveRight").disabled=index===groups.length-1;
  }
  function requestGroupDelete(){
    const group=state.groups.find(candidate=>candidate.id===state.groupEditing?.id);
    if(!group)return;
    state.groupDeleting={id:group.id,name:group.name};
    closeAddDialog();
    $("#groupDeleteLead").textContent=t("deleteGroupWarning",{name:group.name});
    $("#groupDeleteDialog").showModal();
  }
  async function confirmGroupDelete(){
    const pending=state.groupDeleting;
    $("#groupDeleteDialog").close();
    if(!pending)return;
    state.widgets=state.widgets.filter(widget=>widget!==groupWidgetId(pending.id));
    saveWidgetLayout();
    // Görünürlük kaydı da düşer; sunucu tarafı da aynı temizliği oda listesi yazılırken yapar.
    if(state.hiddenGroups.delete(pending.id))cacheVisibility();
    await persistHomeGroups(state.groups.filter(group=>group.id!==pending.id),"groupDeleted");
  }
  function closeAddDialog(){
    const dialog=$("#widgetDialog");
    if(dialog.open)dialog.close();
  }
  // Modalın TEK başlığı var; hangi sekme seçiliyse onun adını taşır. Grup formunun içindeki
  // ikinci başlık kaldırıldı, bu yüzden başlığı yazan her akış buradan geçer.
  function updateAddDialogTitle(){
    const heading=$("#addDialogTitle");
    if(!heading)return;
    const groups=$("#addTabGroups")?.getAttribute("aria-selected")==="true";
    heading.textContent=t(groups?(state.groupEditing?.id?"editGroup":"createDeviceGroup"):"addToDashboard");
  }
  function setAddDialogTab(tab){
    $$("[data-add-tab]").forEach(button=>{
      const active=button.dataset.addTab===tab;
      button.setAttribute("aria-selected",active?"true":"false");
      button.tabIndex=active?0:-1;
      $(`#${button.getAttribute("aria-controls")}`).hidden=!active;
    });
    if(tab==="groups"&&!state.groupEditing)prepareGroupEditor(null);
    updateAddDialogTitle();
  }
  function focusAddDialogTab(step){
    const tabs=$$("[data-add-tab]");
    const current=tabs.findIndex(button=>button.getAttribute("aria-selected")==="true");
    const next=tabs[(current+step+tabs.length)%tabs.length];
    if(!next)return;
    setAddDialogTab(next.dataset.addTab);
    next.focus();
  }
  function resetAddDialog(){
    state.groupEditing=null;
    $("#groupForm").reset();
    $("#groupName").value="";
    $("#deleteGroup").hidden=true;
    $("#groupOrderRow").hidden=true;
    $("#roomSuggestions").innerHTML="";
    $("#groupDeviceChoices").innerHTML="";
    $("#groupSelectionCount").textContent="";
    $("#saveGroup").disabled=true;
    setAddDialogTab("widgets");
  }
  function openWidgetCatalog(){
    resetAddDialog();
    renderWidgetCatalog();
    if(!$("#widgetDialog").open)$("#widgetDialog").showModal();
  }
  const deviceGridSelector="#attentionDevices,#allDevices";
  function captureDeviceFocus(){
    const active=document.activeElement;
    if(!active||!active.closest||!active.closest(deviceGridSelector))return null;
    const card=active.getAttribute("data-device-card");
    if(card)return{card};
    const device=active.getAttribute("data-device");
    if(!device)return null;
    return{device,property:active.getAttribute("data-property")||""};
  }
  function restoreDeviceFocus(token){
    if(!token)return;
    const active=document.activeElement;
    if(active&&active!==document.body&&active!==document.documentElement)return;
    const nodes=$$("#attentionDevices [data-device-card],#attentionDevices [data-device],#allDevices [data-device-card],#allDevices [data-device]");
    const match=nodes.find(node=>token.card
      ?node.getAttribute("data-device-card")===token.card
      :node.getAttribute("data-device")===token.device&&(node.getAttribute("data-property")||"")===token.property);
    if(match)match.focus();
  }
  const deviceInRoom=(device,groupId)=>{
    const group=state.groups.find(item=>item.id===groupId);
    return Boolean(group)&&group.items.some(item=>item.deviceId===device.id);
  };
  const roomFilterMatches=device=>!state.roomFilter||deviceInRoom(device,state.roomFilter);
  function setRoomFilter(groupId){
    state.roomFilter=groupId||null;
    renderRoomFilter();
    filterDevices();
    bindCards();
  }
  /* Gizli cihaz duyurusunun hedefi: Cihazlar görünümü. Kart gerçek bir odaya aitse o oda süzülür;
     "Odasız" gibi türetilmiş kartlarda süzgeç açılır kalır. */
  function openHiddenDevices(groupId){
    const room=groupId&&state.groups.some(group=>group.id===groupId)?groupId:null;
    $("#search").value="";
    syncSearchClear();
    activateView("devices");
    setRoomFilter(room);
  }
  function renderRoomFilter(){
    const container=$("#roomFilter");
    if(!container)return;
    if(state.roomFilter&&!state.groups.some(group=>group.id===state.roomFilter))state.roomFilter=null;
    container.hidden=state.groups.length===0;
    if(container.hidden){container.innerHTML="";container.dataset.signature="";return}
    const signature=JSON.stringify([state.roomFilter,state.groups.map(group=>[group.id,group.name])]);
    if(container.dataset.signature===signature)return;
    container.dataset.signature=signature;
    container.innerHTML=[{id:"",name:t("roomFilterAll")},...state.groups].map(group=>{
      const active=(group.id||null)===state.roomFilter;
      return`<button class="room-chip${active?" active":""}" type="button" data-room-filter="${esc(group.id)}" aria-pressed="${active}">${esc(group.name)}</button>`;
    }).join("");
    $$("[data-room-filter]").forEach(button=>button.onclick=()=>setRoomFilter(button.dataset.roomFilter));
  }
  function filterDevices(){
    const focusToken=captureDeviceFocus();
    const query=$("#search").value.trim().toLowerCase();
    renderRoomFilter();
    const devices=state.devices
      .filter(device=>device.name.toLowerCase().includes(query)&&roomFilterMatches(device))
      .sort((left,right)=>String(left.name).localeCompare(String(right.name),state.language));
    /* Liste kipinde Z2M gibi tek düz tablo çizilir: "dikkat isteyen" ayrımı ızgaraya özgüdür,
       çevrimdışı cihaz tabloda kendi Durum hücresiyle zaten görünür. Izgara kipi aynen korunur. */
    const tableMode=state.deviceLayout==="list";
    const attentionDevices=tableMode?[]:devices.filter(deviceNeedsAttention);
    const regularDevices=tableMode?devices:devices.filter(device=>!deviceNeedsAttention(device));
    const emptyHome=state.overviewLoaded&&state.devices.length===0&&!query&&!state.roomFilter;
    const attention=$("#deviceAttention");
    attention.hidden=attentionDevices.length===0;
    attention.open=state.attentionOpen;
    $("#attentionDeviceCount").textContent=String(attentionDevices.length);
    $("#attentionDevices").innerHTML=attentionDevices.map(deviceCardHtml).join("");
    const allDevices=$("#allDevices");
    allDevices.hidden=regularDevices.length===0&&attentionDevices.length>0;
    allDevices.innerHTML=regularDevices.length
      ?tableMode?deviceTableHtml(regularDevices):regularDevices.map(deviceCardHtml).join("")
      :emptyHome
      ?`<div class="empty device-empty-guide"><div class="device-empty-icon" aria-hidden="true">＋</div><h2>${t("emptyDevicesTitle")}</h2><p>${t("emptyDevicesLead")}</p><button class="primary" type="button" data-admin-only data-empty-add-device>${t("addFirstDevice")}</button></div>`
      :state.roomFilter&&!attentionDevices.length
      ?`<div class="empty room-filter-empty"><strong>${t("roomFilterEmpty")}</strong><button class="secondary" type="button" data-clear-room-filter>${t("roomFilterShowAll")}</button></div>`
      :`<div class="empty">${t("noSearchResults")}</div>`;
    const addButton=$("[data-empty-add-device]");
    if(addButton)addButton.onclick=()=>startPairing(true);
    $$("[data-clear-room-filter]").forEach(button=>button.onclick=()=>setRoomFilter(""));
    $$("[data-device-sort]").forEach(button=>button.onclick=event=>{
      event.preventDefault();
      event.stopPropagation();
      setDeviceSort(button.dataset.deviceSort);
    });
    restoreDeviceFocus(focusToken);
  }
  async function refresh(){
    try{const data=await api("/api/overview");const signature=JSON.stringify([data.devices,data.health,data.pairing,data.events,data.groups,data.departures]);state.connectionError=null;state.devices=data.devices;state.zigbeeGroups=data.groups||[];state.events=data.events||[];state.health=data.health;state.pairing=data.pairing;state.departures=data.departures||[];state.overviewLoaded=true;trackPairingProgress();watchSetupFlowDevice();void closePairingNetworkIfIdle();if(signature!==state.overviewSignature){state.overviewSignature=signature;render()}else renderSystemAlertBar();return true;}
    catch(error){state.connectionError=error.message;$("#sideDot").className="status-dot bad";$("#sideStatus").textContent=t("serverUnreachable");renderSystemAlertBar();showToast(error.message,true);return false}
  }
  const pullRefreshState={tracking:false,refreshing:false,startX:0,startY:0,distance:0};
  const pullRefreshThreshold=58;
  function setPullRefreshDistance(distance){
    const indicator=$("#pullRefresh");
    const bounded=Math.max(0,Math.min(82,distance));
    pullRefreshState.distance=bounded;
    indicator.style.height=`${bounded}px`;
    indicator.style.setProperty("--pull-rotation",`${Math.round(bounded/pullRefreshThreshold*220)}deg`);
    indicator.classList.toggle("visible",bounded>1);
    $("#pullRefreshText").textContent=t(bounded>=pullRefreshThreshold?"releaseToRefresh":"pullToRefresh");
  }
  function resetPullRefresh(){
    pullRefreshState.tracking=false;
    pullRefreshState.distance=0;
    const indicator=$("#pullRefresh");
    indicator.classList.remove("refreshing");
    indicator.style.height="0px";
    indicator.style.removeProperty("--pull-rotation");
    $("#pullRefreshText").textContent=t("pullToRefresh");
    setTimeout(()=>{if(!pullRefreshState.refreshing)indicator.classList.remove("visible")},180);
  }
  async function runPullRefresh(){
    if(pullRefreshState.refreshing)return;
    pullRefreshState.tracking=false;
    pullRefreshState.refreshing=true;
    const indicator=$("#pullRefresh");
    indicator.classList.add("visible","refreshing");
    indicator.style.height="54px";
    $("#pullRefreshText").textContent=t("refreshingDevices");
    const success=await refresh();
    if(success){
      indicator.classList.remove("refreshing");
      $("#pullRefreshText").textContent=t("devicesRefreshed");
      await new Promise(resolve=>setTimeout(resolve,420));
    }
    pullRefreshState.refreshing=false;
    resetPullRefresh();
  }
  function setupPullToRefresh(){
    const devicesView=$("#devices");
    devicesView.addEventListener("touchstart",event=>{
      if(
        pullRefreshState.refreshing
        ||!devicesView.classList.contains("active")
        ||window.scrollY>0
        ||event.touches.length!==1
        ||event.target.closest("input,button,select,textarea")
        ||document.querySelector("dialog[open]")
      )return;
      pullRefreshState.tracking=true;
      pullRefreshState.startX=event.touches[0].clientX;
      pullRefreshState.startY=event.touches[0].clientY;
      pullRefreshState.distance=0;
    },{passive:true});
    devicesView.addEventListener("touchmove",event=>{
      if(!pullRefreshState.tracking||event.touches.length!==1)return;
      const horizontal=Math.abs(event.touches[0].clientX-pullRefreshState.startX);
      const vertical=event.touches[0].clientY-pullRefreshState.startY;
      if(horizontal>Math.max(12,vertical)){
        resetPullRefresh();
        return;
      }
      if(vertical<=0){
        setPullRefreshDistance(0);
        return;
      }
      if(event.cancelable)event.preventDefault();
      setPullRefreshDistance(vertical*.55);
    },{passive:false});
    devicesView.addEventListener("touchend",()=>{
      if(!pullRefreshState.tracking)return;
      if(pullRefreshState.distance>=pullRefreshThreshold)void runPullRefresh();
      else resetPullRefresh();
    },{passive:true});
    devicesView.addEventListener("touchcancel",resetPullRefresh,{passive:true});
  }
  async function command(id,property,value){
    const key=commandKey(id,property);
    if(state.pendingCommands.has(key))return;
    state.pendingCommands.add(key);
    render();
    try{await api(`/api/devices/${encodeURIComponent(id)}/command`,{method:"POST",body:JSON.stringify({property,value})});const device=state.devices.find(item=>item.id===id);const control=device?.controls.find(item=>item.property===property);if(control)control.value=value;state.usage[id]=(state.usage[id]||0)+1;try{localStorage.setItem("villa-device-usage",JSON.stringify(state.usage))}catch{}}
    catch(error){flagCommandError(id);showToast(error.message,true);await refresh()}
    finally{state.pendingCommands.delete(key);render()}
  }
