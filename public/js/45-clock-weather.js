  const clockLocale=()=>state.language==="tr"?"tr-TR":"en-GB";
  const dateTimeFormatters=new Map();
  function dateTimeFormatter(options){
    const key=`${state.language}|${JSON.stringify(options)}`;
    let formatter=dateTimeFormatters.get(key);
    if(!formatter){
      formatter=new Intl.DateTimeFormat(clockLocale(),options);
      dateTimeFormatters.set(key,formatter);
    }
    return formatter;
  }
  const zoneTime=(now,timeZone)=>dateTimeFormatter({hour:"2-digit",minute:"2-digit",hour12:false,...(timeZone?{timeZone}:{})}).format(now);
  const zoneDay=(now,timeZone)=>dateTimeFormatter({weekday:"short",day:"numeric",month:"short",...(timeZone?{timeZone}:{})}).format(now);
  let renderedClockMinute=null;
  function renderWorldClock(){
    const time=$("#hubTime");
    if(!time)return;
    const now=new Date();
    renderedClockMinute=`${now.getHours()}:${now.getMinutes()}`;
    time.firstChild.nodeValue=zoneTime(now);
    $("#hubSeconds").textContent=String(now.getSeconds()).padStart(2,"0");
    $("#hubDate").textContent=dateTimeFormatter({weekday:"long",day:"numeric",month:"long"}).format(now);
    // Kullanıcının kendi kaydı IANA kimliğini yener: varsayılan "clockLocal" satırı listede her zaman
    // önce geldiği için `find` onu buluyordu ve hub'da ham kimlik ("Istanbul") yazıyordu.
    const namedZone=worldClockZones.find(zone=>zone.timeZone===localTimeZone&&zone.label!=="clockLocal");
    const localName=namedZone?locationName(namedZone):localTimeZone.split("/").pop().replace(/_/g," ");
    $("#hubZoneName").textContent=`${localName} · ${t("clockLocal")}`;
    renderHubCities(now);
  }
  // Hub'daki iki şehir: dünya saati penceresindeki listenin ilk iki kaydı, yerelle aynı saat
  // dilimi atlanır (o zaten büyük saatte yazıyor). Şehir seçilmemişse düğüm boş kalır ve
  // `.hub-cities:empty` onu tümüyle gizler — davet satırı ya da boşluk çıkmaz.
  const hubClockCities=()=>worldClockZones.filter(zone=>zone.timeZone&&zone.timeZone!==localTimeZone).slice(0,2);
  function renderHubCities(now){
    const container=$("#hubCities");
    if(!container)return;
    container.innerHTML=hubClockCities().map(zone=>`<span class="hub-city"><em>${esc(locationName(zone))}</em><b>${esc(zoneTime(now,zone.timeZone))}</b></span>`).join("");
  }
  function tickWorldClock(){
    const now=new Date();
    const seconds=$("#hubSeconds");
    if(!seconds)return;
    if(renderedClockMinute!==`${now.getHours()}:${now.getMinutes()}`)renderWorldClock();
    else seconds.textContent=String(now.getSeconds()).padStart(2,"0");
    if($("#clockDialog").open)renderClockDialogRows();
  }
  function scheduleWorldClockTick(){
    setTimeout(()=>{tickWorldClock();scheduleWorldClockTick()},1000-new Date().getMilliseconds()+20);
  }
  const locationKey=location=>String(location?.id||`${location?.latitude},${location?.longitude},${location?.timeZone||""}`);
  const locationName=location=>location?.label?t(location.label):location?.name||t("unknownLocation");
  const locationDetails=location=>{
    const values=[location?.admin1,location?.country].filter((value,index,array)=>value&&array.indexOf(value)===index);
    return values.join(", ")||location?.timeZone||"";
  };
  // Kabaca 11 metrelik yuvarlama: aynı yer iki kaynaktan gelse de tek satır "seçili" görünür.
  const locationCoordKey=location=>`${Number(location?.latitude).toFixed(4)},${Number(location?.longitude).toFixed(4)}`;
  const locationSelectionKey=(kind,location)=>kind==="home"?locationCoordKey(location):locationKey(location);
  function normalizeLocationResult(result){
    const latitude=Number(result?.latitude);
    const longitude=Number(result?.longitude);
    if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||typeof result?.name!=="string")return null;
    return{
      id:String(result.id||`${latitude},${longitude}`),
      name:result.name.slice(0,80),
      country:typeof result.country==="string"?result.country.slice(0,80):"",
      admin1:typeof result.admin1==="string"?result.admin1.slice(0,80):"",
      timeZone:typeof result.timezone==="string"?result.timezone.slice(0,80):"",
      latitude,
      longitude
    };
  }
  function saveWorldClockZones(){
    try{localStorage.setItem("villa-world-clock-zones",JSON.stringify(worldClockZones))}catch{}
  }
  function renderClockDialogRows(){
    const container=$("#clockDialogRows");
    if(!container)return;
    const now=new Date();
    container.innerHTML=worldClockZones.length?worldClockZones.map(city=>`<div class="hub-row"><div><strong>${esc(locationName(city))}</strong><small>${esc(zoneDay(now,city.timeZone))} · ${esc(locationDetails(city)||city.timeZone)}</small></div><span class="hub-row-value">${esc(zoneTime(now,city.timeZone))}</span><button type="button" data-remove-clock-city="${esc(locationKey(city))}" aria-label="${esc(t("removeCity",{name:locationName(city)}))}"><svg class="location-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5"/></svg></button></div>`).join(""):`<div class="location-empty">${t("noClockCities")}</div>`;
    $$("[data-remove-clock-city]").forEach(button=>button.onclick=()=>{
      worldClockZones=worldClockZones.filter(city=>locationKey(city)!==button.dataset.removeClockCity);
      saveWorldClockZones();
      renderClockDialogRows();
      renderLocationSearchResults("clock");
      renderWorldClock();
    });
  }
  function renderLocationSearchResults(kind){
    const search=locationSearchState[kind];
    const status=$(`#${kind}SearchStatus`);
    const results=$(`#${kind}SearchResults`);
    if(!status||!results)return;
    status.className=`location-search-status${search.error?" error":""}`;
    status.textContent=search.loading?t("locationSearching"):search.error||(!search.loading&&search.query.length>=2&&!search.results.length?t("locationNoResults"):"");
    // Hata: hava listesinde eylem ikonu bir onay işaretiydi, her satırda basıldığı için beş sonuç da
    // "seçili" görünüyordu. Onay işareti artık yalnız gerçekten seçili konumda; diğerleri harita iğnesi.
    // Evin konumu sunucuda yalnız koordinat olarak durur; kimliği olmadığı için karşılaştırma koordinattan.
    const chosen=kind==="weather"?weatherState.location:kind==="home"?state.homeLocation:null;
    const chosenKey=chosen?locationSelectionKey(kind,chosen):null;
    results.innerHTML=search.results.map((location,index)=>{
      const key=locationKey(location);
      const alreadyAdded=kind==="clock"&&worldClockZones.some(city=>locationKey(city)===key);
      const selected=chosenKey!==null&&locationSelectionKey(kind,location)===chosenKey;
      const glyph=kind==="clock"?'<path d="M12 5v14M5 12h14"/>':selected?'<path d="m5 12 4 4L19 6"/>':'<path d="M12 21s6.5-5.4 6.5-10.5a6.5 6.5 0 1 0-13 0C5.5 15.6 12 21 12 21Z"/><circle cx="12" cy="10.5" r="2.4"/>';
      return`<div class="location-result${selected?" is-selected":""}"${selected?' aria-current="true"':""}><div><strong>${esc(location.name)}</strong><small>${esc(locationDetails(location))}</small>${selected?`<em class="location-selected-tag">${esc(t("locationSelected"))}</em>`:""}</div><button type="button" data-location-result="${index}" aria-label="${esc(t(kind==="clock"?"addCity":selected?"locationSelected":"chooseLocation",{name:location.name}))}"${alreadyAdded?" disabled":""}><svg class="location-action-icon" viewBox="0 0 24 24" aria-hidden="true">${glyph}</svg></button></div>`;
    }).join("");
    $$(`#${kind}SearchResults [data-location-result]`).forEach(button=>button.onclick=()=>{
      const location=search.results[Number(button.dataset.locationResult)];
      if(!location)return;
      if(kind==="clock")addWorldClockCity(location);
      else if(kind==="home")chooseHomeLocation(location);
      else chooseWeatherLocation(location);
    });
  }
  async function searchLocations(kind,query){
    const search=locationSearchState[kind];
    const requestId=++search.requestId;
    search.loading=true;
    search.error=null;
    renderLocationSearchResults(kind);
    try{
      const params=new URLSearchParams({name:query,count:"5",language:state.language,format:"json"});
      const response=await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`,{cache:"no-store"});
      if(!response.ok)throw new Error(t("locationSearchUnavailable"));
      const data=await response.json();
      if(requestId!==search.requestId)return;
      search.results=(Array.isArray(data?.results)?data.results:[]).map(normalizeLocationResult).filter(Boolean);
    }catch(error){
      if(requestId!==search.requestId)return;
      search.results=[];
      search.error=error?.message||t("locationSearchUnavailable");
    }finally{
      if(requestId===search.requestId){
        search.loading=false;
        renderLocationSearchResults(kind);
      }
    }
  }
  function scheduleLocationSearch(kind){
    const input=$(locationSearchInputs[kind]);
    const search=locationSearchState[kind];
    const query=input.value.trim();
    clearTimeout(search.timer);
    search.query=query;
    search.error=null;
    search.results=[];
    search.requestId++;
    if(query.length<2){
      search.loading=false;
      renderLocationSearchResults(kind);
      return;
    }
    search.loading=true;
    renderLocationSearchResults(kind);
    search.timer=setTimeout(()=>searchLocations(kind,query),320);
  }
  function resetLocationSearch(kind){
    const search=locationSearchState[kind];
    clearTimeout(search.timer);
    search.query="";
    search.results=[];
    search.loading=false;
    search.error=null;
    search.requestId++;
    const input=$(locationSearchInputs[kind]);
    if(input)input.value="";
    renderLocationSearchResults(kind);
  }
  function openClockManager(){
    resetLocationSearch("clock");
    renderClockDialogRows();
    if(!$("#clockDialog").open)$("#clockDialog").showModal();
  }
  function addWorldClockCity(location){
    if(!location.timeZone)return showToast(t("locationTimezoneUnavailable"),true);
    if(worldClockZones.some(city=>locationKey(city)===locationKey(location)))return;
    if(worldClockZones.length>=8)return showToast(t("clockCityLimit"),true);
    worldClockZones=[...worldClockZones,location];
    saveWorldClockZones();
    renderClockDialogRows();
    renderLocationSearchResults("clock");
    renderWorldClock();
  }
  function openWeatherLocationManager(){
    resetLocationSearch("weather");
    $("#weatherLocationDialog").showModal();
    setTimeout(()=>$("#weatherLocationSearch").focus(),50);
  }
  function saveWeatherLocation(){
    try{localStorage.setItem("villa-weather-location",JSON.stringify(weatherState.location))}catch{}
  }
  function chooseWeatherLocation(location){
    weatherState.location=location;
    weatherState.data=null;
    weatherState.error=null;
    weatherState.updatedAt=0;
    saveWeatherLocation();
    saveWeatherSnapshot();
    $("#weatherLocationDialog").close();
    loadWeather();
  }
  function weatherPresentation(code,isDay){
    if(code===0)return{icon:isDay?"☀":"☾",label:"weatherClear"};
    if(code<=3)return{icon:code===1?"⛅":"☁",label:"weatherCloudy"};
    if(code<=48)return{icon:"≋",label:"weatherFog"};
    if(code<=67||code>=80&&code<=82)return{icon:"☂",label:"weatherRain"};
    if(code<=77||code>=85&&code<=86)return{icon:"❄",label:"weatherSnow"};
    if(code>=95)return{icon:"ϟ",label:"weatherStorm"};
    return{icon:"◌",label:"weatherUnknown"};
  }
  const weatherLocationText=()=>weatherState.location?`${locationName(weatherState.location)}${locationDetails(weatherState.location)?`, ${locationDetails(weatherState.location)}`:""}`:t("weatherNoLocation");
  const weatherNumber=value=>Number.isFinite(Number(value))?Math.round(Number(value)):null;
  const weatherValue=(value,unit)=>weatherNumber(value)===null?"—":`${weatherNumber(value)}${unit||""}`;
  function weatherDailyEntries(limit){
    const daily=weatherState.data?.daily;
    if(!Array.isArray(daily?.time))return[];
    return daily.time.slice(0,limit).map((day,index)=>({
      day,
      index,
      code:Number(daily.weather_code?.[index]),
      max:daily.temperature_2m_max?.[index],
      min:daily.temperature_2m_min?.[index]
    }));
  }
  function weatherDayLabel(day,index){
    if(index===0)return t("hubToday");
    if(index===1)return t("hubTomorrow");
    const parsed=new Date(`${day}T12:00:00`);
    return Number.isNaN(parsed.getTime())?day:dateTimeFormatter({weekday:"long"}).format(parsed);
  }
  function weatherHourlyEntries(limit){
    const hourly=weatherState.data?.hourly;
    if(!Array.isArray(hourly?.time))return[];
    const from=String(weatherState.data?.current?.time||"").slice(0,13);
    const start=Math.max(0,hourly.time.findIndex(time=>String(time).slice(0,13)>=from));
    return hourly.time.slice(start,start+limit).map((time,offset)=>{
      const index=start+offset;
      return{
        time,
        code:Number(hourly.weather_code?.[index]),
        isDay:Number(hourly.is_day?.[index])!==0,
        temperature:hourly.temperature_2m?.[index]
      };
    });
  }
  function weatherAgeText(){
    if(!weatherState.updatedAt)return"";
    const at=new Date(weatherState.updatedAt);
    const sameDay=at.toDateString()===new Date().toDateString();
    return dateTimeFormatter(sameDay?{hour:"2-digit",minute:"2-digit",hour12:false}:{weekday:"short",hour:"2-digit",minute:"2-digit",hour12:false}).format(at);
  }
  // Hub'ın hava detayı: bugünün en yüksek/en düşük değeri (`daily`) ve nem (`current`).
  // Eksik alan satırı düşürür, hepsi eksikse hiç düğüm üretilmez — konum seçilmemişken zaten
  // `weatherState.data` boş olduğu için buraya hiç girilmez, davet satırı olduğu gibi kalır.
  function hubWeatherStats(current,units){
    const today=weatherDailyEntries(1)[0];
    const hasRange=weatherNumber(today?.max)!==null&&weatherNumber(today?.min)!==null;
    const hasHumidity=weatherNumber(current?.relative_humidity_2m)!==null;
    const range=hasRange?`<span class="hub-w-stat">${esc(t("hubWeatherRange",{high:weatherValue(today.max,"°"),low:weatherValue(today.min,"°")}))}</span>`:"";
    const humidity=hasHumidity?`<span class="hub-w-stat hub-w-stat-extra">${esc(t("hubWeatherHumidity",{humidity:weatherValue(current.relative_humidity_2m,units?.relative_humidity_2m||"%")}))}</span>`:"";
    return range||humidity?`<span class="hub-w-stats">${range}${humidity}</span>`:"";
  }
  function renderWeather(){
    const body=$("#hubWeatherBody");
    if(!body)return;
    $("#hubWeatherLocation").textContent=weatherState.location?weatherLocationText():t("weather");
    if(!weatherState.data){
      const message=weatherState.loading?t("weatherLoading"):weatherState.error||(weatherState.location?t("weatherUnavailable"):t("weatherNoLocationHint"));
      body.innerHTML=`<span class="hub-w-cond">${esc(message)}</span>`;
    }else{
      const current=weatherState.data.current||{};
      const units=weatherState.data.current_units||{};
      const presentation=weatherPresentation(Number(current.weather_code),Number(current.is_day)!==0);
      const degree=esc(units.temperature_2m||"°C");
      // Hub "şu an"ın yanına bugünün uçlarını ve nemi yazar; saatlik/günlük tahmin
      // `#weatherDialog`da duruyor. Üçü de zaten çekilen alanlar — ek istek yok.
      const note=weatherState.error?t("weatherOfflineNote",{time:weatherAgeText()}):weatherIsStale()?t("weatherStaleNote",{time:weatherAgeText()}):"";
      body.innerHTML=`<span class="hub-now"><span class="hub-w-icon" aria-hidden="true">${presentation.icon}</span><span><b class="hub-w-temp">${esc(weatherValue(current.temperature_2m,"°"))}</b><span class="hub-w-cond">${esc(t(presentation.label))} · ${esc(t("weatherFeelsLike"))} ${esc(weatherValue(current.apparent_temperature,degree))}</span>${hubWeatherStats(current,units)}</span></span>${note?`<span class="hub-note">${esc(note)}</span>`:""}`;
    }
    if($("#weatherDialog").open)renderWeatherDialog();
  }
  function renderWeatherDialog(){
    const meta=$("#weatherDialogMeta");
    const body=$("#weatherDialogBody");
    if(!meta||!body)return;
    meta.textContent=weatherState.location?`${weatherLocationText()}${weatherState.updatedAt?` · ${t("weatherUpdated")} ${weatherAgeText()}`:""}`:t("weatherNoLocationHint");
    if(!weatherState.data){
      body.innerHTML=`<p class="location-empty">${esc(weatherState.loading?t("weatherLoading"):weatherState.error||(weatherState.location?t("weatherUnavailable"):t("weatherNoLocationHint")))}</p>`;
      return;
    }
    const current=weatherState.data.current||{};
    const units=weatherState.data.current_units||{};
    const dailyUnits=weatherState.data.daily_units||{};
    const presentation=weatherPresentation(Number(current.weather_code),Number(current.is_day)!==0);
    const degree=esc(units.temperature_2m||"°C");
    const daily=weatherState.data.daily||{};
    const sunrise=String(daily.sunrise?.[0]||"").slice(11,16);
    const sunset=String(daily.sunset?.[0]||"").slice(11,16);
    const chips=[
      `${t("weatherFeelsLike")} ${weatherValue(current.apparent_temperature,degree)}`,
      `${t("weatherHumidity")} ${weatherValue(current.relative_humidity_2m,units.relative_humidity_2m||"%")}`,
      `${t("weatherWind")} ${weatherValue(current.wind_speed_10m,"")} ${units.wind_speed_10m||"km/h"}`,
      sunrise?`${t("weatherSunrise")} ${sunrise}`:"",
      sunset?`${t("weatherSunset")} ${sunset}`:""
    ].filter(Boolean).map(text=>`<span>${esc(text)}</span>`).join("");
    const hours=weatherHourlyEntries(12).map(entry=>{
      const shape=weatherPresentation(entry.code,entry.isDay);
      return`<span>${esc(String(entry.time).slice(11,16))}<i aria-hidden="true">${shape.icon}</i><b>${esc(weatherValue(entry.temperature,"°"))}</b></span>`;
    }).join("");
    const days=weatherDailyEntries(4).map(entry=>{
      const shape=weatherPresentation(entry.code,true);
      return`<div class="hub-row"><div><strong>${esc(weatherDayLabel(entry.day,entry.index))}</strong><small>${esc(t(shape.label))}</small></div><span class="hub-row-value" aria-hidden="true">${shape.icon}</span><span class="hub-row-value">${esc(weatherValue(entry.max,dailyUnits.temperature_2m_max||"°"))} / ${esc(weatherValue(entry.min,dailyUnits.temperature_2m_min||"°"))}</span></div>`;
    }).join("");
    const note=weatherState.error?t("weatherOfflineNote",{time:weatherAgeText()}):weatherIsStale()?t("weatherStaleNote",{time:weatherAgeText()}):"";
    body.innerHTML=`${note?`<p class="hub-note">${esc(note)}</p>`:""}<div class="hub-now-big"><span class="hub-now-icon" aria-hidden="true">${presentation.icon}</span><div><div class="hub-now-temp">${esc(weatherValue(current.temperature_2m,degree))}</div><div class="hub-w-cond">${esc(t(presentation.label))}</div></div></div><div class="hub-chips">${chips}</div>${hours?`<section class="hub-section" style="margin-top:16px"><h3>${esc(t("weatherHourly"))}</h3><div class="hub-hours" tabindex="0" role="group" aria-label="${esc(t("weatherHourly"))}">${hours}</div></section>`:""}${days?`<section class="hub-section" style="margin-top:16px"><h3>${esc(t("weatherDaily"))}</h3><div class="hub-rows">${days}</div></section>`:""}`;
  }
  function openWeatherDialog(){
    if(!weatherState.location){
      openWeatherLocationManager();
      return;
    }
    renderWeatherDialog();
    if(!$("#weatherDialog").open)$("#weatherDialog").showModal();
    refreshWeatherIfNeeded();
  }
  function saveWeatherSnapshot(){
    try{localStorage.setItem("villa-weather-cache",JSON.stringify({updatedAt:weatherState.updatedAt,data:weatherState.data}))}catch{}
  }
  async function loadWeather(){
    if(!weatherState.location||weatherState.loading)return;
    weatherState.loading=true;
    renderWeather();
    const params=new URLSearchParams({
      latitude:String(weatherState.location.latitude),
      longitude:String(weatherState.location.longitude),
      current:"temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day,wind_speed_10m",
      hourly:"temperature_2m,weather_code,is_day",
      daily:"weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset",
      timezone:"auto",
      forecast_days:"4"
    });
    try{
      const response=await fetch(`https://api.open-meteo.com/v1/forecast?${params}`,{cache:"no-store"});
      if(!response.ok)throw new Error(t("weatherUnavailable"));
      const data=await response.json();
      if(!data?.current)throw new Error(t("weatherUnavailable"));
      weatherState.data=data;
      weatherState.error=null;
      weatherState.updatedAt=Date.now();
      saveWeatherSnapshot();
    }catch(error){
      weatherState.error=error?.message||t("weatherUnavailable");
      console.warn("weather",error);
    }finally{
      weatherState.loading=false;
      renderWeather();
    }
  }
  // "Mevcut konumu kullan" kaldırıldı: panel düz HTTP ile servis edildiği için tarayıcının konum
  // servisi güvenli köken şartını karşılamıyor, düğme her zaman sessizce "izin verilmedi"ye düşüyordu.
  function refreshWeatherIfNeeded(){
    if(!weatherState.location||weatherState.loading)return;
    if(!weatherState.data||Date.now()-weatherState.updatedAt>1800000)loadWeather();
  }
