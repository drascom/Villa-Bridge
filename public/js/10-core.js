  const translations={};
  const languageMetadata={};
  const savedLanguage=(()=>{try{return localStorage.getItem("villa-language")}catch{return null}})();
  const savedUsage=(()=>{try{const value=JSON.parse(localStorage.getItem("villa-device-usage")||"{}");return value&&typeof value==="object"?value:{}}catch{return {}}})();
  const savedDeviceLayout=(()=>{try{return localStorage.getItem("villa-device-layout")||localStorage.getItem("villa-quick-layout")}catch{return null}})();
  const savedAttentionOpen=(()=>{try{return localStorage.getItem("villa-attention-open")==="true"}catch{return false}})();
  const savedDeviceColumns=(()=>{try{const value=Number(localStorage.getItem("villa-device-columns"));return Number.isFinite(value)&&value>=1?Math.min(4,Math.round(value)):null}catch{return null}})();
  const savedDeviceSort=(()=>{try{
    const[key,direction]=String(localStorage.getItem("villa-device-sort")||"").split(":");
    return["name","lqi","status","lastSeen"].includes(key)?{key,direction:direction==="desc"?"desc":"asc"}:null;
  }catch{return null}})();
  /* Tema kipleri: sabit iki tema, işletim sisteminin tercihi ve "güneşe göre" (gündüz açık,
     gece koyu — eşik gün doğumu/batımı). Liste `<head>` içindeki ilk-kare tema betiğiyle ve
     `setThemeMode` ile birebir aynı kalmalı. */
  const savedThemeMode=(()=>{try{const value=localStorage.getItem("villa-theme");return["light","dark","sun","system"].includes(value)?value:"system"}catch{return"system"}})();
  /* Hava durumu artık cihazda DEĞİL sunucuda durur (`/api/weather`): aynı evdeki tablet ve
     tarayıcı tek şehri, tek ölçümü gösterir. Buradaki eski kayıt yalnız bir kerelik göç
     kaynağıdır — sunucuda konum tanımlı değilse cihazdaki seçim bir kez yukarı taşınır ve yerel
     kayıt silinir (bkz. `migrateWeatherLocation`). Eski veri önbelleği (`villa-weather-cache`)
     tümüyle kalktı; önbellek artık sunucunun işi. */
  const savedWeatherLocation=(()=>{try{const value=JSON.parse(localStorage.getItem("villa-weather-location")||"null");return Number.isFinite(value?.latitude)&&Number.isFinite(value?.longitude)?{...value,name:typeof value.name==="string"?value.name.slice(0,80):"",country:typeof value.country==="string"?value.country.slice(0,80):"",admin1:typeof value.admin1==="string"?value.admin1.slice(0,80):""}:null}catch{return null}})();
  const onboardingStorageKey="villa-onboarding-complete-v1";
  const dashboardTourStorageKey="villa-dashboard-tour-complete-v1";
  const deviceHintStorageKey="villa-device-hint-complete-v1";
  const locallyCompletedOnboarding=()=>{try{return localStorage.getItem(onboardingStorageKey)==="true"}catch{return true}};
  let installationOnboardingComplete=null;
  const onboardingComplete=()=>installationOnboardingComplete===null?locallyCompletedOnboarding():installationOnboardingComplete;
  const dashboardTourComplete=()=>{try{return localStorage.getItem(dashboardTourStorageKey)==="true"}catch{return true}};
  const deviceHintComplete=()=>{try{return localStorage.getItem(deviceHintStorageKey)==="true"}catch{return true}};
  const groupsMigrationKey="villa-dashboard-groups-migrated";
  const groupsMigrated=()=>{try{return localStorage.getItem(groupsMigrationKey)==="true"}catch{return true}};
  const markGroupsMigrated=()=>{try{localStorage.setItem(groupsMigrationKey,"true")}catch{}};
  const groupWidgetPrefix="group:";
  const groupDeviceControlId="@device";
  const groupWidgetId=id=>`${groupWidgetPrefix}${id}`;
  /* Hazır "Işıklar" grubu: kayıtta durmaz, her turda cihazların ışık kategorisinden türetilir.
     Böylece kural tek eve değil, sunucunun jenerik kategori çıkarımına dayanır; silinemez. */
  const lightsGroupId="auto:lights";
  const lightsGroupWidgetId=groupWidgetId(lightsGroupId);
  /* Hiçbir odaya atanmamış cihazlar için türetilen kart. Kayıtta durmaz; boşsa hiç çıkmaz. */
  const noRoomGroupId="auto:noroom";
  const noRoomGroupWidgetId=groupWidgetId(noRoomGroupId);
  const overviewTabId="overview";
  /* Sekme seçimi widget düzeninden ayrı bir kayıt: `villa-dashboard-widgets` ile karışmaz. */
  const homeTabStorageKey="villa-home-tab";
  const savedHomeTab=(()=>{try{const value=localStorage.getItem(homeTabStorageKey);return typeof value==="string"&&value?value:overviewTabId}catch{return overviewTabId}})();
  /* Kart içi cihaz butonunun genişlik kademesi. Kanonik anahtar: cihaz kimliği (IEEE) + kontrol
     kimliği — dostane ad değişse de tercih kaybolmaz. "auto" = ölçüme bırakılmış, elle seçim yok. */
  const tileWidthStorageKey="villa-tile-widths";
  const tileWidthModes=new Set(["auto","narrow","wide"]);
  const normalizeTileWidthMode=value=>tileWidthModes.has(value)?value:"narrow";
  const tileWidthKey=(deviceId,controlId)=>`${deviceId}::${controlId||groupDeviceControlId}`;
  const savedTileWidths=(()=>{try{
    const value=JSON.parse(localStorage.getItem(tileWidthStorageKey)||"{}");
    if(!value||typeof value!=="object"||Array.isArray(value))return{};
    const result={};
    for(const[key,mode]of Object.entries(value)){
      if(typeof key!=="string"||!key)continue;
      result[key]=normalizeTileWidthMode(mode);
    }
    return result;
  }catch{return{}}})();
  /* Görünürlük: varsayılan GÖRÜNÜR. Kayıt yalnız GİZLENENLERİ tutar ve boş başlar — yeni eklenen
     bir cihaz hiçbir şey yapılmadan odasının kartında çıkar; kullanıcı istemediğini gizler.
     Kanonik anahtar cihaz kimliği (IEEE) + kontrol kimliği; dostane ad kullanılmaz. Eski favori
     kaydı (`home-favorites.json`) ayrı yerinde durur, bu anahtar ona dokunmaz.

     Karar SUNUCUDA durur (`/api/home-visibility`): kullanıcı bazlı hesap yok, aynı lambayı her
     tablette ayrı ayrı gizlemek anlamsız. Buradaki yerel anahtarlar iki iş görür: bir kerelik
     göç kaynağı (eski `villa-hidden-tiles`) ve çevrimdışı açılışta son bilinen değer. Yerleşim
     tercihleri (döşeme genişliği, kart sırası, seçili sekme) cihazda kalmaya devam eder. */
  const hiddenTilesStorageKey="villa-hidden-tiles";
  const visibilityCacheKey="villa-home-visibility-cache";
  const tileVisibilityKey=(deviceId,controlId)=>`${deviceId}::${controlId||groupDeviceControlId}`;
  const savedVisibilityCache=(()=>{try{
    const value=JSON.parse(localStorage.getItem(visibilityCacheKey)||"null");
    if(!value||typeof value!=="object"||Array.isArray(value))return null;
    const list=entry=>Array.isArray(entry)?entry.filter(item=>typeof item==="string"&&item):[];
    return{hiddenDevices:list(value.hiddenDevices),hiddenGroups:list(value.hiddenGroups)};
  }catch{return null}})();
  const savedHiddenTiles=new Set(savedVisibilityCache?savedVisibilityCache.hiddenDevices:[]);
  const savedHiddenGroups=new Set(savedVisibilityCache?savedVisibilityCache.hiddenGroups:[]);
  const dashboardWidgetTypes={
    quick:{title:"homeTabsWidget",lead:"homeTabsWidgetLead"},
    summary:{title:"summaryWidget",lead:"summaryWidgetLead"},
    activity:{title:"activityWidget",lead:"activityWidgetLead"}
  };
  const defaultDashboardWidgets=["quick","summary","activity"];
  const fixedDashboardWidgets=new Set(["quick"]);
  /* "Ev durumu" ile "Cihaz erişilebilirliği" tek kartta birleşti: katalogda tek giriş, tek ekle/kaldır.
     Kayıtlı düzenlerde iki eski kimlik de bulunabilir; `availability` artık `summary`ye eşlenir.
     Kural — eski kimliklerden en az biri düzende açıksa birleşik kart açık gelir, ikisi de
     kaldırılmışsa kaldırılmış kalır. Konum: eskiden hangisi öndeyse o. Ölü kimlik ne düzende ne de
     kaldırılmışlar listesinde bırakılır. */
  const legacyDashboardWidgetIds={availability:"summary"};
  function mergeLegacyDashboardWidgets(widgets,removed){
    const target=id=>Object.hasOwn(legacyDashboardWidgetIds,id)?legacyDashboardWidgetIds[id]:id;
    const merged=[];
    for(const id of widgets){const next=target(id);if(!merged.includes(next))merged.push(next)}
    const dropped=new Set();
    for(const id of removed){const next=target(id);if(!merged.includes(next))dropped.add(next)}
    return{widgets:merged,removed:dropped};
  }
  const savedGroups=(()=>{try{
    const value=JSON.parse(localStorage.getItem("villa-dashboard-groups")||"[]");
    if(!Array.isArray(value))return[];
    return value.filter(group=>group&&typeof group.id==="string"&&typeof group.name==="string").map(group=>({
      id:group.id,
      name:group.name.trim().slice(0,32),
      items:Array.isArray(group.items)?group.items.filter(item=>item&&typeof item.deviceId==="string"&&typeof item.controlId==="string").map(item=>({deviceId:item.deviceId,controlId:item.controlId})):[]
    }));
  }catch{return[]}})();
  const savedWidgets=(()=>{try{
    const value=JSON.parse(localStorage.getItem("villa-dashboard-widgets")||"null");
    if(!Array.isArray(value))return[...defaultDashboardWidgets];
    const known=mergeLegacyDashboardWidgets(value,[]).widgets.filter(id=>Object.hasOwn(dashboardWidgetTypes,id)||id===lightsGroupWidgetId||id===noRoomGroupWidgetId||savedGroups.some(group=>groupWidgetId(group.id)===id));
    return known.some(id=>!fixedDashboardWidgets.has(id))?known:[...defaultDashboardWidgets];
  }catch{return[...defaultDashboardWidgets]}})();
  /* Kullanıcının panodan kaldırdığı kartlar. Sıralama onarımı (`reconcileWidgetLayout`) eksik grup
     kartlarını listeye geri koyduğu için, "kaldırıldı" bilgisi ayrı tutulmalı; yoksa kaldırılan
     grup kartı bir sonraki açılışta geri gelirdi. */
  const removedWidgetsKey="villa-dashboard-removed-widgets";
  const savedRemovedWidgets=(()=>{try{
    const value=JSON.parse(localStorage.getItem(removedWidgetsKey)||"[]");
    return mergeLegacyDashboardWidgets(savedWidgets,Array.isArray(value)?value.filter(id=>typeof id==="string"):[]).removed;
  }catch{return new Set()}})();
  // Göç bir kez diske de yazılır; ölü kimlik kayıtta kalmasın. Eski kimlik yoksa kayda dokunulmaz.
  try{
    const stored=`${localStorage.getItem("villa-dashboard-widgets")||""}${localStorage.getItem(removedWidgetsKey)||""}`;
    if(Object.keys(legacyDashboardWidgetIds).some(id=>stored.includes(`"${id}"`))){
      localStorage.setItem("villa-dashboard-widgets",JSON.stringify(savedWidgets));
      localStorage.setItem(removedWidgetsKey,JSON.stringify([...savedRemovedWidgets]));
    }
  }catch{}
  const themeMedia=typeof window.matchMedia==="function"?window.matchMedia("(prefers-color-scheme: dark)"):null;
  const state={devices:[],zigbeeGroups:[],events:[],health:null,connectionError:null,pairing:null,pairingSession:null,pairingNetworkClose:null,overviewLoaded:false,overviewSignature:null,matter:null,settings:null,network:null,mqttAccess:null,mqttPasswordVisible:false,debugErrors:[],debugNetworkEvents:[],agentTokens:[],hiddenTiles:savedHiddenTiles,hiddenGroups:savedHiddenGroups,editing:null,imageEditing:null,noteEditing:null,optionsDevice:null,roleEditing:null,roomEditing:null,removing:null,departures:[],deviceLost:null,deviceReturnWait:null,lightDevice:null,groupEditing:null,groupDeleting:null,pendingGroupMigration:false,roomFilter:null,simpleLink:null,automations:[],automationWizard:null,automationContext:null,automationSun:null,homeLocation:null,homeLocationSource:null,automationRuns:{},automationRunsOpen:null,automationAgentBackups:0,onboardingStep:0,onboardingDraft:null,remoteOnboarding:false,coach:null,detailDevice:null,detailFromPairing:false,detailTechnicalOpen:false,lightPanelMode:null,detailPointerDown:false,lightPointerDown:false,quickControl:null,quickPointerDown:false,screensaverOpen:false,pendingConfirm:null,pendingCommands:new Set(),commandErrors:new Map(),usage:savedUsage,homeTab:savedHomeTab,deviceLayout:savedDeviceLayout==="list"?"list":"grid",deviceColumns:savedDeviceColumns??3,deviceSort:savedDeviceSort??{key:"name",direction:"asc"},attentionOpen:savedAttentionOpen,widgets:savedWidgets,removedWidgets:savedRemovedWidgets,groups:savedGroups,tileWidths:savedTileWidths,dashboardEditing:false,appMenuOpener:null,androidMonitor:false,language:savedLanguage||"en",themeMode:savedThemeMode,auth:{configured:false,authenticated:false,user:null,csrfToken:null,expiresAt:null},loginMode:"resident"};
  let applicationStarted=false;
  /* `updatedAt` sunucunun veriyi çektiği an, `checkedAt` bu cihazın sunucuya en son sorduğu an.
     İkisi ayrıdır: veri on dakika önce çekilmiş olabilir ama biz onu saniyeler önce okumuş
     olabiliriz — "eski mi" sorusu veriye, "yeniden sorayım mı" sorusu okumaya bakar. */
  const weatherState={location:null,data:null,error:null,loading:false,updatedAt:0,checkedAt:0,request:null};
  const weatherStaleAfter=7200000;
  const weatherIsStale=()=>Boolean(weatherState.data)&&Date.now()-weatherState.updatedAt>weatherStaleAfter;
  const localTimeZone=(()=>{try{return Intl.DateTimeFormat().resolvedOptions().timeZone||"UTC"}catch{return "UTC"}})();
  const defaultWorldClockZones=[
    {id:"default-local",label:"clockLocal",name:"Local time",country:"",timeZone:localTimeZone},
    {id:"default-london",label:"clockLondon",name:"London",country:"United Kingdom",timeZone:"Europe/London"},
    {id:"default-istanbul",label:"clockIstanbul",name:"Istanbul",country:"Türkiye",timeZone:"Europe/Istanbul"},
    {id:"default-new-york",label:"clockNewYork",name:"New York",country:"United States",timeZone:"America/New_York"}
  ];
  /* Şehir listesi artık cihazda DEĞİL sunucuda durur (`/api/world-clock`): duvara asılan tablette
     her ekranın ayrı şehir listesi tutması anlamsız. Buradaki eski kayıt yalnız bir kerelik göç
     kaynağıdır — sunucuda liste tanımlı değilse cihazdaki liste bir kez yukarı taşınır ve yerel
     kayıt silinir (bkz. `migrateWorldClockZones`). Sunucu cevap verene kadar ekranda ne varsa o
     kalsın diye başlangıç değeri hâlâ buradan gelir. */
  const savedWorldClockZones=(()=>{try{
    const raw=localStorage.getItem("villa-world-clock-zones");
    if(raw===null)return null;
    const value=JSON.parse(raw);
    if(!Array.isArray(value))return null;
    return value.filter(item=>{
      if(!item||typeof item.id!=="string"||typeof item.name!=="string"||typeof item.timeZone!=="string")return false;
      try{new Intl.DateTimeFormat("en",{timeZone:item.timeZone}).format(new Date());return true}catch{return false}
    }).slice(0,8).map(item=>({id:item.id.slice(0,80),name:item.name.slice(0,80),country:typeof item.country==="string"?item.country.slice(0,80):"",admin1:typeof item.admin1==="string"?item.admin1.slice(0,80):"",timeZone:item.timeZone.slice(0,80),label:typeof item.label==="string"?item.label.slice(0,80):""}));
  }catch{return null}})();
  let worldClockZones=savedWorldClockZones??defaultWorldClockZones;
  /* Sunucuda liste TANIMLI mı? Boş liste ("hepsini sildim") ile tanımsızlık ayrı durumlardır:
     göç yalnız tanımsızken çalışır, yoksa silinen şehirler her açılışta geri gelirdi. */
  let worldClockZonesConfigured=false;
  const locationSearchState={
    clock:{query:"",results:[],loading:false,error:null,requestId:0,timer:null},
    weather:{query:"",results:[],loading:false,error:null,requestId:0,timer:null},
    home:{query:"",results:[],loading:false,error:null,requestId:0,timer:null}
  };
  const locationSearchInputs={clock:"#clockCitySearch",weather:"#weatherLocationSearch",home:"#homeLocationSearch"};
  const $=selector=>document.querySelector(selector);
  const $$=selector=>[...document.querySelectorAll(selector)];
  const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]));
  const t=(key,values={})=>(translations[state.language]?.[key]||translations.en?.[key]||key).replace(/\{(\w+)\}/g,(_,name)=>values[name]??"");
  const commandKey=(id,property)=>JSON.stringify([id,property]);
  const commandPending=(id,property)=>state.pendingCommands.has(commandKey(id,property));
  const commandErrorMs=3000;
  const commandFailed=id=>state.commandErrors.has(id);
  const flagCommandError=id=>{
    const running=state.commandErrors.get(id);
    if(running)clearTimeout(running);
    state.commandErrors.set(id,setTimeout(()=>{state.commandErrors.delete(id);render()},commandErrorMs));
  };
  /* Silme onayı: "evet" ya da "yes" (büyük/küçük harf fark etmez, iki dil de kabul), ya da
     cihazın adı — eski alışkanlık da çalışsın. Koruma yanlışlıkla basmaya karşıdır; hangi cihazın
     silindiğini diyalog zaten adıyla söylüyor. */
  const removalConfirmationWords=["evet","yes"];
  /* Harf büyüklüğü iki yönden de denenir: Türkçe "ı" küçültmede aynı kalır ama büyütmede "I"
     olur, tek yönlü karşılaştırma "SALON LAMBASI" gibi bir yazımı boşuna reddederdi. */
  const sameConfirmationText=(left,right)=>{const typed=String(left??"").trim();const expected=String(right??"").trim();return typed.length>0&&expected.length>0&&(typed.toLowerCase()===expected.toLowerCase()||typed.toUpperCase()===expected.toUpperCase());};
  const validRemovalConfirmation=(value,name=null)=>removalConfirmationWords.some(word=>sameConfirmationText(value,word))||sameConfirmationText(value,name);
  const reducedMotion=()=>window.matchMedia?.("(prefers-reduced-motion: reduce)").matches===true;
  /* Pencere açılırken odak HİÇBİR metin alanına gitmez: tablette ekran klavyesi kendiliğinden
     açılıp ekranın yarısını kapatıyordu. Odak yine de pencerenin İÇİNDE kalır — başlığa, başlık
     yoksa kutunun kendisine verilir — böylece odak tuzağı ve ekran okuyucu akışı bozulmaz.
     Kullanıcı alana kendisi dokununca klavye normal açılır; hiçbir alan devre dışı değil. */
  const focusModalHeading=root=>{
    if(!root)return;
    const target=root.querySelector("h2")||root;
    if(!target.hasAttribute("tabindex"))target.setAttribute("tabindex","-1");
    target.focus({preventScroll:true});
  };
  const ago=iso=>{if(!iso)return t("noData");const seconds=Math.max(0,Math.floor((Date.now()-new Date(iso))/1000));return seconds<8?t("justNow"):seconds<60?t("secondsAgo",{count:seconds}):seconds<3600?t("minutesAgo",{count:Math.floor(seconds/60)}):t("hoursAgo",{count:Math.floor(seconds/3600)})};
  const showToast=(message,error=false)=>{const toast=$("#toast");toast.textContent=message;toast.className=`toast show${error?" error":""}`;clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>toast.className="toast",error?6000:3200)};
  const api=async(url,options={})=>{const method=String(options.method||"GET").toUpperCase();const csrf=state.auth.csrfToken&&["POST","PUT","PATCH","DELETE"].includes(method)?{"x-villa-csrf":state.auth.csrfToken}:{};const response=await fetch(url,{cache:"no-store",...options,headers:{...(options.body===undefined?{}:{"content-type":"application/json"}),...csrf,...(options.headers||{})}});const data=await response.json().catch(()=>({}));if(response.status===401&&!url.startsWith("/api/auth/")){state.auth={configured:true,authenticated:false,user:null,csrfToken:null,expiresAt:null};applyAuthUi();openAuthGate()}if(!response.ok){const failure=new Error(data.error||t("operationFailed"));failure.status=response.status;if(data.code)failure.code=data.code;throw failure}return data};
