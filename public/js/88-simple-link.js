  const linkClusterNames=["genOnOff","genLevelCtrl"];
  const endpointClusterNames=(endpoint,direction)=>((direction==="out"?endpoint.outputClusters:endpoint.inputClusters)||[]).map(String);
  const linkSourceEndpoint=device=>(device.endpoints||[]).find(endpoint=>endpointClusterNames(endpoint,"out").includes("genOnOff"));
  const linkTargetEndpoint=device=>(device.endpoints||[]).find(endpoint=>endpointClusterNames(endpoint,"in").includes("genOnOff"));
  const isLinkStarter=device=>(device.actionTypes||[]).length>0||Boolean(linkSourceEndpoint(device));
  const isProtectedDevice=device=>(device.controls||[]).some(control=>control.kind==="lock"||control.kind==="siren");
  const isLinkTarget=device=>!isProtectedDevice(device)&&(device.controls||[]).some(control=>control.kind==="switch"||control.kind==="level");
  function linkClustersFor(source,target){
    const outputs=new Set((source.endpoints||[]).flatMap(endpoint=>endpointClusterNames(endpoint,"out")));
    const inputs=target?new Set((target.endpoints||[]).flatMap(endpoint=>endpointClusterNames(endpoint,"in"))):null;
    return linkClusterNames.filter(cluster=>outputs.has(cluster)&&(!inputs||inputs.has(cluster)));
  }
  function simpleLinks(){
    const rows=new Map();
    state.devices.filter(isLinkStarter).forEach(device=>{
      (device.endpoints||[]).forEach(endpoint=>{
        (endpoint.bindings||[]).forEach(binding=>{
          if(!linkClusterNames.includes(binding.cluster))return;
          const target=binding.targetType==="group"
            ?state.zigbeeGroups.find(group=>group.id===binding.targetId)
            :state.devices.find(item=>item.id===binding.targetId);
          if(!target)return;
          const key=JSON.stringify([device.id,endpoint.id,binding.targetId,binding.targetEndpoint??""]);
          const known=rows.get(key);
          if(known){if(!known.clusters.includes(binding.cluster))known.clusters.push(binding.cluster);return}
          rows.set(key,{key,sourceId:device.id,sourceName:device.name,fromEndpoint:endpoint.id,targetId:binding.targetId,targetName:target.name,toEndpoint:binding.targetEndpoint,clusters:[binding.cluster]});
        });
      });
    });
    return [...rows.values()].sort((left,right)=>String(left.sourceName).localeCompare(String(right.sourceName),state.language));
  }
  async function removeSimpleLink(key){
    const link=simpleLinks().find(item=>item.key===key);
    if(!link||!confirm(t("simpleLinkRemoveConfirm")))return;
    try{
      const data=await api("/api/zigbee/bind",{method:"POST",body:JSON.stringify({
        fromId:link.sourceId,
        toId:link.targetId,
        bind:false,
        clusters:link.clusters,
        fromEndpoint:link.fromEndpoint,
        toEndpoint:link.toEndpoint??undefined
      })});
      state.devices=data.devices||state.devices;
      renderAutomations();
      renderZigbeeGroups();
      showToast(t("simpleLinkRemoved"));
    }catch(error){showToast(error.message,true)}
  }
  function openSimpleLink(){
    // Sihirbaz kapanır, bağlantı penceresi açılır: iki diyalog üst üste binmez.
    const wizardDialog=$("#automationDialog");
    if(wizardDialog.open)wizardDialog.close();
    state.simpleLink={step:1,sourceId:null,targetId:null,targetType:"device",room:null};
    const dialog=$("#simpleLinkDialog");
    if(!dialog.open)dialog.showModal();
    renderSimpleLink();
  }
  const simpleLinkChoiceHtml=(id,type,name,meta,active)=>`<button class="simple-link-choice${active?" active":""}" type="button" data-link-choice="${esc(id)}" data-link-type="${type}" aria-pressed="${active}"><strong>${esc(name)}</strong><small>${esc(meta)}</small></button>`;
  function renderSimpleLink(){
    const link=state.simpleLink;
    if(!link)return;
    const firstStep=link.step===1;
    $("#simpleLinkStep").textContent=t("simpleLinkStepCount",{step:link.step,total:2});
    $("#simpleLinkTitle").textContent=t(firstStep?"simpleLinkStepOneTitle":"simpleLinkStepTwoTitle");
    $("#simpleLinkLead").textContent=t(firstStep?"simpleLinkStepOneLead":"simpleLinkStepTwoLead");
    const rooms=$("#simpleLinkRooms");
    rooms.hidden=firstStep||state.groups.length===0;
    rooms.innerHTML=rooms.hidden?"":[{id:"",name:t("roomFilterAll")},...state.groups].map(group=>{
      const active=(group.id||null)===link.room;
      return`<button class="room-chip${active?" active":""}" type="button" data-link-room="${esc(group.id)}" aria-pressed="${active}">${esc(group.name)}</button>`;
    }).join("");
    const byName=(left,right)=>String(left.name).localeCompare(String(right.name),state.language);
    let choices="";
    if(firstStep){
      const starters=state.devices.filter(isLinkStarter).sort(byName);
      choices=starters.length
        ?starters.map(device=>simpleLinkChoiceHtml(device.id,"device",device.name,deviceKind(device),device.id===link.sourceId)).join("")
        :`<div class="empty">${t("simpleLinkNoStarters")}</div>`;
    }else{
      const targets=state.devices
        .filter(device=>isLinkTarget(device)&&device.id!==link.sourceId&&(!link.room||deviceInRoom(device,link.room)))
        .sort(byName);
      const groups=link.room?[]:[...state.zigbeeGroups].sort(byName);
      choices=[
        ...targets.map(device=>simpleLinkChoiceHtml(device.id,"device",device.name,deviceKind(device),link.targetType==="device"&&device.id===link.targetId)),
        ...groups.map(group=>simpleLinkChoiceHtml(group.id,"group",group.name,t("groupMembers",{count:group.members}),link.targetType==="group"&&group.id===link.targetId))
      ].join("")||`<div class="empty">${t("simpleLinkNoTargets")}</div>`;
    }
    $("#simpleLinkChoices").innerHTML=choices;
    $$("[data-link-choice]").forEach(button=>button.onclick=()=>chooseSimpleLink(button.dataset.linkChoice,button.dataset.linkType));
    $$("[data-link-room]").forEach(button=>button.onclick=()=>{link.room=button.dataset.linkRoom||null;link.targetId=null;renderSimpleLink()});
    const source=state.devices.find(device=>device.id===link.sourceId);
    const target=link.targetType==="group"
      ?state.zigbeeGroups.find(group=>group.id===link.targetId)
      :state.devices.find(device=>device.id===link.targetId);
    const ready=!firstStep&&Boolean(source&&target);
    const summary=$("#simpleLinkSummary");
    summary.hidden=!ready;
    summary.innerHTML=ready?`<strong>${t("simpleLinkSummary",{source:esc(source.name),target:esc(target.name)})}</strong><p>${t("simpleLinkDirectNote")}</p>`:"";
    $("#simpleLinkBack").textContent=t(firstStep?"cancel":"back");
    const save=$("#simpleLinkSave");
    save.textContent=t("save");
    save.hidden=firstStep;
    save.disabled=!ready;
  }
  function chooseSimpleLink(id,type){
    const link=state.simpleLink;
    if(!link)return;
    if(link.step===1){link.sourceId=id;link.targetId=null;link.step=2}
    else{link.targetId=id;link.targetType=type}
    renderSimpleLink();
  }
  function stepBackSimpleLink(){
    const link=state.simpleLink;
    if(!link||link.step===1){$("#simpleLinkDialog").close();return}
    link.step=1;
    link.targetId=null;
    renderSimpleLink();
  }
  async function saveSimpleLink(){
    const link=state.simpleLink;
    if(!link)return;
    const source=state.devices.find(device=>device.id===link.sourceId);
    const targetDevice=link.targetType==="device"?state.devices.find(device=>device.id===link.targetId):null;
    const targetGroup=link.targetType==="group"?state.zigbeeGroups.find(group=>group.id===link.targetId):null;
    const targetId=targetDevice?.id||targetGroup?.id;
    if(!source||!targetId)return;
    const clusters=linkClustersFor(source,targetDevice);
    const button=$("#simpleLinkSave");
    button.disabled=true;
    try{
      const data=await api("/api/zigbee/bind",{method:"POST",body:JSON.stringify({
        fromId:source.id,
        toId:targetId,
        bind:true,
        clusters:clusters.length?clusters:undefined,
        fromEndpoint:linkSourceEndpoint(source)?.id,
        toEndpoint:targetDevice?linkTargetEndpoint(targetDevice)?.id:undefined
      })});
      state.devices=data.devices||state.devices;
      $("#simpleLinkDialog").close();
      renderAutomations();
      renderZigbeeGroups();
      showToast(t("simpleLinkSaved"));
    }catch(error){button.disabled=false;showToast(error.message,true)}
  }
