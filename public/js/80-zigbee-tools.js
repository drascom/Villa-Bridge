  function openRepairProgress(name){
    $("#repairDeviceName").textContent=name;
    const dialog=$("#repairDialog");
    if(!dialog.open)dialog.showModal();
    clearTimeout(openRepairProgress.timer);
    openRepairProgress.timer=setTimeout(closeRepairProgress,20000);
  }
  function closeRepairProgress(){
    clearTimeout(openRepairProgress.timer);
    const dialog=$("#repairDialog");
    if(dialog.open)dialog.close();
  }
  async function reconfigureDevice(id){
    const button=$$("[data-reconfigure]").find(item=>item.dataset.reconfigure===id);
    if(button)button.disabled=true;
    const device=state.devices.find(item=>item.id===id);
    closeDeviceDetail();
    openRepairProgress(device?.name||id);
    try{
      await api(`/api/devices/${encodeURIComponent(id)}/reconfigure`,{method:"POST"});
      await refresh();
      closeRepairProgress();
      showToast(t("repairComplete"));
    }catch(error){
      closeRepairProgress();
      showToast(error.message,true);
    }
    finally{closeRepairProgress();if(button)button.disabled=false}
  }
  async function openDeviceNote(id){
    const device=state.devices.find(item=>item.id===id);
    if(!device)return;
    state.noteEditing=id;
    $("#noteDeviceName").textContent=device.name;
    $("#noteInput").value="";
    $("#noteDialog").showModal();
    try{
      const data=await api(`/api/devices/${encodeURIComponent(id)}/note`);
      if(state.noteEditing===id)$("#noteInput").value=data.note||"";
    }catch(error){showToast(error.message,true)}
  }
  async function scheduleOta(id,enabled=true){
    const button=$$("[data-ota]").find(item=>item.dataset.ota===id);
    if(button)button.disabled=true;
    try{
      await api(`/api/devices/${encodeURIComponent(id)}/ota-schedule`,{method:"PUT",body:JSON.stringify({enabled})});
      showToast(t(enabled?"updateScheduled":"updateUnscheduled"));
    }catch(error){showToast(error.message,true)}
    finally{if(button)button.disabled=false}
  }
  async function checkOta(id){
    const button=$$("[data-ota-check]").find(item=>item.dataset.otaCheck===id);
    if(button)button.disabled=true;
    try{
      const data=await api(`/api/devices/${encodeURIComponent(id)}/ota-check`,{method:"POST"});
      showToast(t(data.ota?.available?"updateAvailable":"noUpdateAvailable"));
      await refresh();
    }catch(error){showToast(error.message,true)}
    finally{if(button)button.disabled=false}
  }
  // Rol yalnız lamba↔anahtar karışıklığını çözer. Perde, kilit, sensör gibi tipler otomatik
  // tanımadan gelmeye devam eder; onlarda seçenek hiç gösterilmez.
  const deviceRoleOptions=["auto","light","switch"];
  const deviceRoleLabels={auto:"deviceRoleAuto",light:"deviceRoleLight",switch:"deviceRoleSwitch"};
  const deviceRoleIcons={auto:"sensor",light:"light",switch:"switch"};
  const deviceRoleAskable=device=>Boolean(device)&&(device.category==="light"||device.category==="switch"
    ||(device.category==="unknown"&&(device.controls||[]).some(control=>control.kind==="switch")));
  // UID kuralı: yazma ucu IEEE adresine, kanal verilirse IEEE + kanal kimliğine gider — dost isme asla.
  async function saveDeviceRole(id,role,channel=null){
    const payload=channel?{role,channel}:{role};
    const data=await api(`/api/devices/${encodeURIComponent(id)}/role`,{method:"PUT",body:JSON.stringify(payload)});
    const device=state.devices.find(item=>item.id===id);
    if(device){
      device.detectedCategory=data.detectedCategory;
      device.category=data.deviceCategory??data.category;
      if(channel){
        const control=(device.controls||[]).find(item=>item.kind==="switch"&&item.id===channel);
        if(control){control.role=data.role;control.category=data.category}
      }else device.role=data.role;
    }
    return data;
  }
  function renderDeviceRoleDialog(){
    const editing=state.roleEditing;
    const device=editing?state.devices.find(item=>item.id===editing.id):null;
    if(!device)return;
    $("#deviceRoleLead").textContent=t("deviceRoleLead",{name:device.name});
    const guess=deviceCategoryLabels[device.detectedCategory];
    $("#deviceRoleChoices").innerHTML=deviceRoleOptions.map(role=>{
      const selected=(device.role||"auto")===role;
      const note=role==="auto"
        ?`<small>${esc(guess?t("deviceRoleAutoGuess",{kind:t(guess)}):t("deviceRoleAutoUnknown"))}</small>`
        :"";
      return`<button class="device-role-choice" type="button" data-device-role="${role}" aria-pressed="${selected}">${deviceIconSvg(deviceRoleIcons[role])}<span>${esc(t(deviceRoleLabels[role]))}</span>${note}</button>`;
    }).join("");
    $$("[data-device-role]").forEach(button=>button.onclick=()=>chooseDeviceRole(button.dataset.deviceRole));
  }
  // Kart içindeki rol satırı: seçim anında kaydedilir, ayrı "Kaydet" adımı yok.
  async function changeDeviceRole(select,id,channel,role){
    if(select)select.disabled=true;
    try{
      await saveDeviceRole(id,role,channel||null);
      showToast(t("deviceRoleSaved"));
    }catch(error){showToast(error.message,true)}
    finally{
      if(select){select.disabled=false;if(document.activeElement===select)select.blur()}
      render();
    }
  }
  async function chooseDeviceRole(role){
    const editing=state.roleEditing;
    if(!editing)return;
    try{
      await saveDeviceRole(editing.id,role);
      showToast(t("deviceRoleSaved"));
      $("#deviceRoleDialog").close();
    }catch(error){
      const gone=deviceGoneCode(error);
      if(gone)reportDeviceGone(editing.id,gone);else showToast(error.message,true);
    }
  }
  function askDeviceRole(id,afterPairing=false){
    const device=state.devices.find(item=>item.id===id);
    if(!deviceRoleAskable(device)){if(afterPairing)askDeviceRoom(id,true);return}
    state.roleEditing={id,afterPairing};
    renderDeviceRoleDialog();
    $("#deviceRoleDialog").showModal();
  }
  /* Eşleştirmenin son adımı: cihaz hangi odada? Oda = mevcut grup üyeliği, yeni bir depo açılmaz.
     "Sonra" denirse cihaz Genel görünümdeki "Odasız" kartında bekler. */
  function renderDeviceRoomDialog(){
    const editing=state.roomEditing;
    const device=editing?state.devices.find(item=>item.id===editing.id):null;
    if(!device)return;
    $("#deviceRoomLead").textContent=t("deviceRoomLead",{name:device.name});
    $("#deviceRoomChoices").innerHTML=state.groups.length
      ?state.groups.map(group=>{
        const member=deviceInRoom(device,group.id);
        return`<button class="device-role-choice" type="button" data-device-room="${esc(group.id)}" aria-pressed="${member}">${deviceIconSvg("group")}<span>${esc(group.name)}</span></button>`;
      }).join("")
      :`<p class="device-room-empty">${esc(t("deviceRoomNone"))}</p>`;
    $$("[data-device-room]").forEach(button=>button.onclick=()=>chooseDeviceRoom(button.dataset.deviceRoom));
  }
  async function chooseDeviceRoom(groupId){
    const editing=state.roomEditing;
    if(!editing)return;
    if(!deviceInRoom({id:editing.id},groupId))await toggleDeviceRoom(editing.id,groupId);
    if($("#deviceRoomDialog").open)$("#deviceRoomDialog").close();
  }
  async function createDeviceRoom(event){
    event.preventDefault();
    const editing=state.roomEditing;
    const name=$("#deviceRoomName").value.trim();
    const device=editing?state.devices.find(item=>item.id===editing.id):null;
    if(!device||name.length<2)return;
    const control=dashboardControlForDevice(device);
    const id=`${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`;
    $("#deviceRoomName").value="";
    state.widgets.push(groupWidgetId(id));
    saveWidgetLayout();
    await persistHomeGroups([...state.groups,{id,name:name.slice(0,32),items:[{deviceId:device.id,controlId:control?control.id:groupDeviceControlId}]}],"groupCreated");
    if($("#deviceRoomDialog").open)$("#deviceRoomDialog").close();
  }
  function askDeviceRoom(id,afterPairing=false){
    const device=state.devices.find(item=>item.id===id);
    if(!device){if(afterPairing)finishPairingFlow(id);return}
    state.roomEditing={id,afterPairing};
    $("#deviceRoomName").value="";
    renderDeviceRoomDialog();
    $("#deviceRoomDialog").showModal();
  }
  function openDeviceOptions(id){
    const device=state.devices.find(item=>item.id===id);
    if(!device)return;
    state.optionsDevice=id;
    $("#deviceOptionsName").textContent=device.name;
    $("#deviceTransition").value=String(device.options?.transition??0);
    $("#deviceDebounce").value=String(device.options?.debounce??0);
    $("#deviceRetain").checked=device.options?.retain===true;
    $("#deviceOptionsDialog").showModal();
  }
  async function saveDeviceOptions(event){
    event.preventDefault();
    const id=state.optionsDevice;
    if(!id)return;
    const device=state.devices.find(item=>item.id===id);
    try{
      const data=await api(`/api/devices/${encodeURIComponent(id)}/options`,{method:"PUT",body:JSON.stringify({
        transition:Number($("#deviceTransition").value),
        debounce:Number($("#deviceDebounce").value),
        retain:$("#deviceRetain").checked
      })});
      if(device)device.options={...device.options,...data.options};
      $("#deviceOptionsDialog").close();
      showToast(t("optionsSaved"));
      render();
    }catch(error){showToast(error.message,true)}
  }
  async function saveDeviceNote(event){
    event.preventDefault();
    const id=state.noteEditing;
    if(!id)return;
    try{
      await api(`/api/devices/${encodeURIComponent(id)}/note`,{method:"PUT",body:JSON.stringify({note:$("#noteInput").value})});
      $("#noteDialog").close();
      showToast(t("noteSaved"));
    }catch(error){showToast(error.message,true)}
  }
  async function addInstallCode(){
    const input=$("#installCode");
    const value=input.value.trim();
    if(!value)return;
    const button=$("#addInstallCode");
    button.disabled=true;
    try{
      await api("/api/zigbee/install-code",{method:"POST",body:JSON.stringify({value})});
      input.value="";
      showToast(t("installCodeAdded"));
    }catch(error){showToast(error.message,true)}
    finally{button.disabled=false}
  }
  async function scanTouchlink(){
    const button=$("#scanTouchlink");
    const results=$("#touchlinkResults");
    button.disabled=true;
    results.innerHTML=`<span class="device-meta">${t("searching")}</span>`;
    try{
      const data=await api("/api/zigbee/touchlink/scan",{method:"POST"});
      results.innerHTML=data.devices?.length
        ?data.devices.map(device=>`<span class="touchlink-device">⌁ ${esc(device.ieeeAddress)} · ${esc(device.channel)}<button class="danger-button" type="button" data-touchlink-reset="${esc(device.ieeeAddress)}" data-channel="${esc(device.channel)}">${t("reset")}</button></span>`).join("")
        :`<span class="device-meta">${t("noNearbyDevices")}</span>`;
      $$("[data-touchlink-reset]").forEach(reset=>reset.onclick=()=>resetTouchlink(reset.dataset.touchlinkReset,Number(reset.dataset.channel)));
    }catch(error){results.innerHTML="";showToast(error.message,true)}
    finally{button.disabled=false}
  }
  const networkQualityPercent=value=>Math.round(Math.max(0,Math.min(255,Number(value)||0))/255*100);
  const networkQualityTone=quality=>quality>=55?"strong":quality>=25?"good":"weak";
  function networkGraphLabel(value){
    const label=String(value||"—");
    return label.length>19?`${label.slice(0,17)}…`:label;
  }
  function renderNetworkGraph(map){
    const nodes=Array.isArray(map.nodes)?map.nodes:[];
    const links=Array.isArray(map.links)?map.links:[];
    if(!nodes.length)return`<div class="network-map-empty">${t("noNetworkMap")}</div>`;
    const nodeById=new Map(nodes.map(node=>[String(node.id).toLowerCase(),node]));
    const columns=[[],[],[]];
    nodes.forEach(node=>{
      const type=String(node.type||"").toLowerCase();
      columns[type==="coordinator"?0:type==="router"?1:2].push(node);
    });
    columns.forEach(column=>column.sort((left,right)=>String(left.name||left.id).localeCompare(String(right.name||right.id),state.language)));
    const height=Math.max(360,Math.max(...columns.map(column=>column.length))*72+96);
    const xPositions=[110,500,890];
    const positions=new Map();
    columns.forEach((column,columnIndex)=>column.forEach((node,index)=>{
      const y=column.length===1?height/2:64+index*(height-128)/(column.length-1);
      positions.set(String(node.id).toLowerCase(),{x:xPositions[columnIndex],y});
    }));
    const edgeMarkup=links.map(link=>{
      const fromId=String(link.from).toLowerCase(),toId=String(link.to).toLowerCase();
      const fromPosition=positions.get(fromId),toPosition=positions.get(toId);
      if(!fromPosition||!toPosition)return"";
      const quality=networkQualityPercent(link.quality);
      const tone=networkQualityTone(quality);
      const controlX=fromPosition.x===toPosition.x?fromPosition.x+46:(fromPosition.x+toPosition.x)/2;
      const path=`M ${fromPosition.x} ${fromPosition.y} C ${controlX} ${fromPosition.y}, ${controlX} ${toPosition.y}, ${toPosition.x} ${toPosition.y}`;
      const from=nodeById.get(fromId),to=nodeById.get(toId);
      return`<path class="network-edge ${tone}" d="${path}" stroke-width="${(1.4+quality/28).toFixed(1)}"><title>${esc(from?.name||link.from)} → ${esc(to?.name||link.to)} · ${quality}%</title></path>`;
    }).join("");
    const nodeMarkup=nodes.map(node=>{
      const nodeId=String(node.id).toLowerCase();
      const position=positions.get(nodeId);
      if(!position)return"";
      const attached=links.filter(link=>String(link.from).toLowerCase()===nodeId||String(link.to).toLowerCase()===nodeId);
      const quality=attached.length?Math.round(attached.reduce((sum,link)=>sum+networkQualityPercent(link.quality),0)/attached.length):null;
      const type=String(node.type||"").toLowerCase();
      const typeClass=type==="coordinator"?"coordinator":type==="router"?"router":"end-device";
      const symbol=typeClass==="coordinator"?"◆":typeClass==="router"?"◇":"•";
      return`<g class="network-node ${typeClass}" transform="translate(${position.x} ${position.y})"><title>${esc(node.name||node.id)}${quality===null?"":` · ${quality}%`}</title><circle class="node-halo" r="21"></circle><text class="node-symbol" x="0" y="0">${symbol}</text><text class="node-name" x="0" y="36">${esc(networkGraphLabel(node.name||node.id))}</text><text class="node-quality" x="0" y="51">${quality===null?"—":`${quality}%`}</text></g>`;
    }).join("");
    return`<section class="network-graph"><div class="network-graph-head"><div class="network-graph-copy"><strong>${t("networkMap")}</strong><span>${t("networkGraphLead")}</span></div><div class="network-legend"><span class="coordinator"><i></i>${t("coordinator")}</span><span class="router"><i></i>${t("networkRouter")}</span><span class="end-device"><i></i>${t("networkEndDevice")}</span><span class="link strong"><i></i>${t("networkStrongLink")}</span><span class="link weak"><i></i>${t("networkWeakLink")}</span></div></div><div class="network-graph-scroll"><svg class="network-graph-svg" viewBox="0 0 1000 ${height}" role="img" aria-label="${esc(t("networkMap"))}" preserveAspectRatio="xMidYMid meet">${edgeMarkup}${nodeMarkup}</svg></div></section>`;
  }
  async function scanNetworkMap(){
    const button=$("#scanNetworkMap");
    const results=$("#networkMapResults");
    button.disabled=true;
    results.innerHTML=`<div class="network-map-loading">${t("mappingNetwork")}</div>`;
    try{
      const data=await api("/api/zigbee/network-map");
      const map=data.map||{nodes:[],links:[]};
      results.innerHTML=renderNetworkGraph(map);
    }catch(error){results.innerHTML="";showToast(error.message,true)}
    finally{button.disabled=false}
  }
  async function createZigbeeGroup(){
    const input=$("#zigbeeGroupName");
    const name=input.value.trim();
    if(name.length<2)return;
    try{
      const data=await api("/api/groups",{method:"POST",body:JSON.stringify({name})});
      state.zigbeeGroups=data.groups||[];
      input.value="";
      renderZigbeeGroups();
    }catch(error){showToast(error.message,true)}
  }
  async function renameZigbeeGroup(id){
    const input=$$("[data-zgroup-name]").find(item=>item.dataset.zgroupName===id);
    const name=input?.value.trim();
    if(!name||name.length<2)return;
    try{
      const data=await api(`/api/groups/${encodeURIComponent(id)}`,{method:"PUT",body:JSON.stringify({name})});
      state.zigbeeGroups=data.groups||[];
      renderZigbeeGroups();
    }catch(error){showToast(error.message,true)}
  }
  function addZigbeeGroupMember(id){
    const select=$$("[data-zgroup-device]").find(item=>item.dataset.zgroupDevice===id);
    if(select?.value)setZigbeeGroupMember(id,select.value,true);
  }
  async function setZigbeeGroupMember(id,deviceId,add){
    try{
      const data=await api(`/api/groups/${encodeURIComponent(id)}/member`,{method:"PUT",body:JSON.stringify({deviceId,add})});
      state.zigbeeGroups=data.groups||[];
      renderZigbeeGroups();
    }catch(error){showToast(error.message,true)}
  }
  async function zigbeeGroupScene(id,action,sceneId=null){
    const input=$$("[data-zgroup-scene]").find(item=>item.dataset.zgroupScene===id);
    const nameInput=$$("[data-zgroup-scene-name]").find(item=>item.dataset.zgroupSceneName===id);
    const selectedScene=sceneId??Number(input?.value||1);
    const name=action==="store"?(nameInput?.value.trim()||`Scene ${selectedScene}`):undefined;
    try{
      const data=await api(`/api/groups/${encodeURIComponent(id)}/scene`,{method:"POST",body:JSON.stringify({sceneId:selectedScene,action,name})});
      state.zigbeeGroups=data.groups||state.zigbeeGroups;
      const group=state.zigbeeGroups.find(candidate=>candidate.id===id);
      if(group&&action==="store"&&!group.scenes?.some(scene=>scene.id===selectedScene)){
        group.scenes=[...(group.scenes||[]),{id:selectedScene,name}].sort((left,right)=>left.id-right.id);
      }
      if(group&&action==="remove")group.scenes=(group.scenes||[]).filter(scene=>scene.id!==selectedScene);
      renderZigbeeGroups();
      showToast(t(action==="store"?"sceneStored":action==="remove"?"sceneRemoved":"sceneRecalled"));
    }catch(error){showToast(error.message,true)}
  }
  async function deleteZigbeeGroup(id){
    if(!confirm(t("deleteZigbeeGroupConfirm")))return;
    try{
      const data=await api(`/api/groups/${encodeURIComponent(id)}`,{method:"DELETE"});
      state.zigbeeGroups=data.groups||[];
      renderZigbeeGroups();
    }catch(error){showToast(error.message,true)}
  }
  function renderBindingEndpoints(){
    const source=state.devices.find(device=>device.id===$("#bindSource").value);
    const target=state.devices.find(device=>device.id===$("#bindTarget").value);
    const sourceEndpoint=$("#bindSourceEndpoint"),targetEndpoint=$("#bindTargetEndpoint");
    const previousSource=sourceEndpoint.value,previousTarget=targetEndpoint.value;
    const sourceEndpoints=(source?.endpoints||[]).filter(endpoint=>endpoint.outputClusters.length);
    const targetEndpoints=(target?.endpoints||[]).filter(endpoint=>endpoint.inputClusters.length);
    sourceEndpoint.innerHTML=`<option value="">${t("automaticEndpoint")}</option>`+sourceEndpoints.map(endpoint=>`<option value="${endpoint.id}">${esc(endpoint.name)}</option>`).join("");
    targetEndpoint.innerHTML=`<option value="">${target?t("automaticEndpoint"):t("groupTarget")}</option>`+targetEndpoints.map(endpoint=>`<option value="${endpoint.id}">${esc(endpoint.name)}</option>`).join("");
    targetEndpoint.disabled=!target;
    if([...sourceEndpoint.options].some(option=>option.value===previousSource))sourceEndpoint.value=previousSource;
    if([...targetEndpoint.options].some(option=>option.value===previousTarget))targetEndpoint.value=previousTarget;
  }
  function renderBindingList(){
    const bindingTarget=binding=>binding.targetType==="group"
      ?state.zigbeeGroups.find(group=>group.id===binding.targetId)
      :state.devices.find(device=>device.id===binding.targetId);
    const rows=state.devices
      .flatMap(device=>(device.endpoints||[]).flatMap(endpoint=>(endpoint.bindings||[]).map(binding=>({device,endpoint,binding}))))
      .filter(({binding})=>Boolean(bindingTarget(binding)));
    $("#zigbeeBindingList").innerHTML=rows.length?rows.map(({device,endpoint,binding})=>{
      const target=bindingTarget(binding);
      const targetEndpoint=binding.targetEndpoint?` · EP ${binding.targetEndpoint}`:"";
      return`<div class="zigbee-binding-row"><span><strong>${esc(device.name)} · ${esc(endpoint.name)}</strong><br>${esc(binding.cluster)} → ${esc(target?.name||binding.targetId)}${targetEndpoint}</span><button class="danger-button" type="button" data-remove-binding="${esc(device.id)}" data-from-endpoint="${endpoint.id}" data-binding-target="${esc(binding.targetId)}" data-to-endpoint="${binding.targetEndpoint??""}" data-binding-cluster="${esc(binding.cluster)}" title="${t("removeBinding")}">×</button></div>`;
    }).join(""):`<div class="zigbee-group-empty"><span aria-hidden="true">⌁</span><div><strong>${t("noBindings")}</strong><p>${t("noBindingsLead")}</p></div></div>`;
    $$("[data-remove-binding]").forEach(button=>button.onclick=()=>removeExistingBinding(button));
  }
  async function removeExistingBinding(button){
    const fromEndpoint=Number(button.dataset.fromEndpoint);
    const toEndpoint=button.dataset.toEndpoint?Number(button.dataset.toEndpoint):undefined;
    try{
      const data=await api("/api/zigbee/bind",{method:"POST",body:JSON.stringify({
        fromId:button.dataset.removeBinding,
        toId:button.dataset.bindingTarget,
        bind:false,
        clusters:[button.dataset.bindingCluster],
        fromEndpoint,
        toEndpoint
      })});
      state.devices=data.devices||state.devices;
      renderZigbeeGroups();
      showToast(t("bindingRemoved"));
    }catch(error){showToast(error.message,true)}
  }
  async function bindZigbeeDevices(bind){
    const fromId=$("#bindSource").value,toId=$("#bindTarget").value;
    if(!fromId||!toId||fromId===toId)return;
    const fromEndpoint=$("#bindSourceEndpoint").value?Number($("#bindSourceEndpoint").value):undefined;
    const toEndpoint=$("#bindTargetEndpoint").value?Number($("#bindTargetEndpoint").value):undefined;
    try{
      const data=await api("/api/zigbee/bind",{method:"POST",body:JSON.stringify({fromId,toId,bind,fromEndpoint,toEndpoint})});
      state.devices=data.devices||state.devices;
      renderZigbeeGroups();
      showToast(t(bind?"bindingSaved":"bindingRemoved"));
    }catch(error){showToast(error.message,true)}
  }
  async function resetTouchlink(ieeeAddress,channel){
    if(!confirm(t("touchlinkResetConfirm")))return;
    try{
      await api("/api/zigbee/touchlink/reset",{method:"POST",body:JSON.stringify({ieeeAddress,channel,confirmation:"RESET"})});
      showToast(t("touchlinkResetComplete"));
      await scanTouchlink();
    }catch(error){showToast(error.message,true)}
  }
  async function downloadZigbeeBackup(){
    const button=$("#downloadZigbeeBackup");
    button.disabled=true;
    try{
      const response=await fetch("/api/zigbee/backup",{cache:"no-store"});
      if(!response.ok){
        const data=await response.json().catch(()=>({}));
        throw new Error(data.error||t("operationFailed"));
      }
      const blob=await response.blob();
      const disposition=response.headers.get("content-disposition")||"";
      const filename=/filename="([^"]+)"/.exec(disposition)?.[1]||"villa-bridge-zigbee-backup.json";
      const url=URL.createObjectURL(blob);
      const link=document.createElement("a");
      link.href=url;
      link.download=filename;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1_000);
      showToast(t("backupReady"));
    }catch(error){showToast(error.message,true)}
    finally{button.disabled=false}
  }
  async function restoreZigbeeBackup(event){
    const input=event.currentTarget;
    const file=input.files?.[0];
    input.value="";
    if(!file)return;
    try{
      if(file.size>30*1024*1024)throw new Error(t("invalidBackupFile"));
      const backup=JSON.parse(await file.text());
      if(!confirm(t("restoreConfirm")))return;
      $("#chooseZigbeeRestore").disabled=true;
      await api("/api/zigbee/restore",{method:"POST",body:JSON.stringify({confirmation:"RESTORE",backup})});
      showToast(t("restoreStarting"));
      waitForRestart();
    }catch(error){
      $("#chooseZigbeeRestore").disabled=false;
      showToast(error instanceof SyntaxError?t("invalidBackupFile"):error.message,true);
    }
  }
  let pendingHomeBackup=null;
  async function downloadHomeBackup(){
    const button=$("#downloadHomeBackup");
    button.disabled=true;
    try{
      const data=await api("/api/backup");
      const stamp=new Date().toISOString().slice(0,10);
      const blob=new Blob([JSON.stringify(data.backup,null,2)+"\n"],{type:"application/json"});
      const url=URL.createObjectURL(blob);
      const link=document.createElement("a");
      link.href=url;
      link.download=`villa-yedek-${stamp}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1_000);
      showToast(t("homeBackupSaved"));
    }catch(error){showToast(error.message,true)}
    finally{button.disabled=false}
  }
  function selectedHomeBackupMode(){
    return $$("input[name=homeBackupMode]").find(radio=>radio.checked)?.value||"merge";
  }
  function renderHomeBackupSummary(summary){
    const host=$("#homeBackupSummary");
    host.textContent="";
    const sections=(summary?.sections||[]).filter(section=>section.incoming>0||section.removed>0);
    sections.forEach(section=>{
      const row=document.createElement("div");
      row.className="home-backup-row";
      const name=document.createElement("strong");
      name.textContent=t(`homeBackupSection${section.section.charAt(0).toUpperCase()}${section.section.slice(1)}`);
      const detail=document.createElement("span");
      detail.textContent=summary.mode==="replace"
        ?t("homeBackupCountsReplace",{added:section.added,overwritten:section.overwritten,removed:section.removed})
        :t("homeBackupCountsMerge",{added:section.added,overwritten:section.overwritten});
      row.append(name,detail);
      host.append(row);
    });
    if(!sections.length){
      const empty=document.createElement("p");
      empty.textContent=t("homeBackupNothing");
      host.append(empty);
    }
    const note=document.createElement("p");
    note.className="home-backup-note";
    note.textContent=summary?.totalSkippedMissingDevices>0
      ?t("homeBackupSkipped",{count:summary.totalSkippedMissingDevices})
      :t("homeBackupNoSkips");
    host.append(note);
  }
  async function previewHomeBackup(){
    if(!pendingHomeBackup)return;
    const button=$("#confirmHomeRestore");
    button.disabled=true;
    $("#homeBackupSummary").textContent=t("homeBackupChecking");
    try{
      const data=await api("/api/backup/preview",{method:"POST",body:JSON.stringify({backup:pendingHomeBackup,mode:selectedHomeBackupMode()})});
      renderHomeBackupSummary(data.summary);
      button.disabled=false;
    }catch(error){$("#homeBackupSummary").textContent=error.message}
  }
  async function chooseHomeRestore(event){
    const input=event.currentTarget;
    const file=input.files?.[0];
    input.value="";
    if(!file)return;
    try{
      if(file.size>30*1024*1024)throw new Error(t("homeBackupInvalidFile"));
      pendingHomeBackup=JSON.parse(await file.text());
    }catch(error){
      pendingHomeBackup=null;
      showToast(error instanceof SyntaxError?t("homeBackupInvalidFile"):error.message,true);
      return;
    }
    $$("input[name=homeBackupMode]").forEach(radio=>{radio.checked=radio.value==="merge"});
    $("#homeBackupFileMeta").textContent=file.name;
    $("#confirmHomeRestore").disabled=true;
    $("#homeBackupDialog").showModal();
    await previewHomeBackup();
  }
  function closeHomeRestore(){
    pendingHomeBackup=null;
    $("#homeBackupDialog").close();
  }
  async function applyHomeRestore(){
    if(!pendingHomeBackup)return;
    const button=$("#confirmHomeRestore");
    button.disabled=true;
    try{
      await api("/api/backup/restore",{method:"POST",body:JSON.stringify({backup:pendingHomeBackup,mode:selectedHomeBackupMode()})});
      pendingHomeBackup=null;
      $("#homeBackupDialog").close();
      showToast(t("homeBackupRestored"));
      await Promise.allSettled([refresh(),loadHomeGroups(),loadHomeVisibility(),loadHomeFavorites(),loadAutomations()]);
      render();
    }catch(error){
      button.disabled=false;
      showToast(error.message,true);
    }
  }
  function waitForRestart(){
    let observedOffline=false;
    let attempts=0;
    const poll=async()=>{
      attempts+=1;
      try{
        const response=await fetch("/api/health",{cache:"no-store"});
        if(observedOffline&&response.ok){location.reload();return;}
      }catch{observedOffline=true}
      if(attempts<45)setTimeout(poll,1500);
      else location.reload();
    };
    setTimeout(poll,5000);
  }
  async function saveSettings(event){
    event.preventDefault();
    const settings={
        zigbee:{adapterUrl:$("#zigbeeAdapterUrl").value.trim(),channel:Number($("#zigbeeChannel").value)},
        mqtt:{url:$("#mqttUrl").value.trim(),baseTopic:$("#mqttBaseTopic").value.trim()},
        matter:{wsUrl:$("#matterWsUrl").value.trim()},
        homeAssistant:{discoveryEnabled:state.settings?.homeAssistant?.discoveryEnabled===true},
        alerts:{lowBatteryThreshold:Number($("#lowBatteryThreshold").value)},
        selfHealing:{enabled:$("#selfHealingEnabled").value!=="false",probeOffline:state.settings?.selfHealing?.probeOffline===true},
        debug:{enabled:state.settings?.debug?.enabled!==false}
      };
    const withChannel=settingsWithChannelConfirmation(settings);
    if(!withChannel)return;
    const payload=settingsWithAdapterConfirmation(withChannel);
    if(!payload||!confirm(t("restartConfirm")))return;
    const button=$("#saveSettings");
    button.disabled=true;
    try{
      await api("/api/settings",{method:"PUT",body:JSON.stringify(payload)});
      showToast(t("settingsSaved"));
      await api("/api/settings/apply",{method:"POST",body:JSON.stringify({confirmation:"APPLY"})});
      waitForRestart();
    }catch(error){button.disabled=false;showToast(error.message,true)}
  }
