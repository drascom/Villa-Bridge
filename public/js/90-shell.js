  function openAppMenu(button){
    const dialog=$("#appMenuDialog");
    if(!dialog||dialog.open)return;
    state.appMenuOpener=button||null;
    $$("[data-app-menu]").forEach(item=>item.setAttribute("aria-expanded","true"));
    dialog.showModal();
    const active=dialog.querySelector(".nav-button.active:not([hidden])")||dialog.querySelector(".nav-button");
    if(active)active.focus();
  }
  function closeAppMenu(){
    const dialog=$("#appMenuDialog");
    if(dialog&&dialog.open)dialog.close();
  }
  function toggleAppMenu(button){
    const dialog=$("#appMenuDialog");
    if(dialog&&dialog.open)closeAppMenu();
    else openAppMenu(button);
  }
  function activateView(viewName){
    closeAppMenu();
    if(viewName!=="home"&&state.dashboardEditing)setDashboardEditing(false);
    if(viewName!=="devices"&&!pullRefreshState.refreshing)resetPullRefresh();
    $$(".nav-button").forEach(item=>item.classList.toggle("active",item.dataset.view===viewName));
    $$(".view").forEach(view=>view.classList.toggle("active",view.id===viewName));
    document.body.dataset.activeView=viewName;
    // İşaret KÖKE DE yazılır: gökyüzü katmanları `body`nin sözde öğelerinde ama güneş `html`in
    // sözde öğesinde duruyor (üç katman, iki taşıyıcı). CSS bir üst öğeyi seçemediği için ana
    // ekran dışında güneşin de sönmesi ancak kökteki bu ikizle mümkün.
    document.documentElement.dataset.activeView=viewName;
    if(viewName==="automations"){renderAutomations();loadAutomations().then(renderAutomations).catch(error=>showToast(error.message,true))}
    // Saat önizlemesi yalnız arka plan sayfasında yaşar: sayfadan çıkan kullanıcı paneli donmuş
    // bir gökyüzüyle bırakmasın diye çıkışta kendiliğinden kapanır.
    if(viewName!=="skySettings")setSkyScrub(null);
    if(viewName!=="connections")stopMatterWatch();
    if(viewName==="connections")loadMatter();
    if(viewName==="connections")loadSettings();
    if(viewName==="settings")loadSettings();
    if(viewName==="home")requestAnimationFrame(maybeStartDashboardTour);
    if(viewName==="devices")requestAnimationFrame(maybeStartDeviceHint);
    closeScreensaver();
    scheduleScreensaver();
    scheduleIdleHomeReturn();
  }
  function showDevice(id,options={}){
    $("#search").value="";
    syncSearchClear();
    activateView("devices");
    filterDevices();
    bindCards();
    openDeviceDetail(id,options);
    requestAnimationFrame(()=>{
      const card=$$("[data-device-card]").find(item=>item.dataset.deviceCard===id);
      if(!card)return;
      card.classList.add("focused");
      card.scrollIntoView({behavior:reducedMotion()?"auto":"smooth",block:"center"});
      setTimeout(()=>card.classList.remove("focused"),1800);
    });
  }
  function applyDeviceLayout(){
    [$("#allDevices"),$("#attentionDevices")].forEach(container=>{
      container.classList.toggle("devices-grid-view",state.deviceLayout==="grid");
      container.classList.toggle("devices-list-view",state.deviceLayout==="list");
    });
    $$("[data-device-layout]").forEach(button=>{
      const active=button.dataset.deviceLayout===state.deviceLayout;
      button.classList.toggle("active",active);
      button.setAttribute("aria-pressed",String(active));
      const label=t(button.dataset.deviceLayout==="grid"?"gridView":"listView");
      button.setAttribute("aria-label",label);
      button.title=label;
    });
    $("[data-device-layout-toggle]").setAttribute("aria-label",t("deviceLayout"));
    const gridMode=state.deviceLayout==="grid";
    applyDeviceColumns(state.deviceColumns);
    $("[data-device-columns-field]").hidden=!gridMode;
    $("#deviceColumns").value=String(state.deviceColumns);
    $("#deviceColumns").disabled=!gridMode;
    $("#deviceColumns").setAttribute("aria-label",t("devicesPerRow"));
  }
  const effectiveDeviceColumns=columns=>{
    const value=Math.min(4,Math.max(1,Math.round(Number(columns))||1));
    const width=window.innerWidth||0;
    if(width<=560)return Math.min(value,2);
    if(width<=900)return Math.min(value,3);
    if(width<=1150)return Math.min(value,4);
    return value;
  };
  function applyDeviceColumns(columns){
    document.documentElement.style.setProperty("--device-columns",String(columns));
    [$("#allDevices"),$("#attentionDevices")].forEach(container=>container.dataset.deviceColumns=String(columns));
    $("#deviceColumnsValue").textContent=String(effectiveDeviceColumns(columns));
  }
  function setDeviceLayout(layout){
    state.deviceLayout=layout==="list"?"list":"grid";
    try{localStorage.setItem("villa-device-layout",state.deviceLayout)}catch{}
    applyDeviceLayout();
    /* İki kipin içeriği farklıdır (kart ↔ tablo), yalnız sınıf değiştirmek yetmez; yeniden çizilir. */
    filterDevices();
    bindCards();
  }
  function setAttentionOpen(open){
    state.attentionOpen=open===true;
    try{localStorage.setItem("villa-attention-open",String(state.attentionOpen))}catch{}
  }
  function setDeviceColumns(value){
    const columns=Math.min(4,Math.max(1,Math.round(Number(value))||1));
    state.deviceColumns=columns;
    try{localStorage.setItem("villa-device-columns",String(columns))}catch{}
    applyDeviceLayout();
  }
  /* "GÜNEŞE GÖRE" TEMA — gündüz açık, gece koyu; eşik gün doğumu/batımı. Saatler zaten hava
     servisinden geliyor (`sunGroundTimes`), panel kendi astronomi hesabını yapmaz. Veri hiç
     yoksa kip sessizce sistem tercihine düşer, yani panel her hâlükârda doğru boyanır.
     ÖNBELLEK: sayfa açılırken (`index.html` `<head>` içindeki tema betiği) hava verisi henüz
     gelmemiştir; yanlış temanın bir kare yanıp sönmemesi için son bilinen gün doğumu/batımı
     dakikaları burada `localStorage`'a yazılır ve o betik ilk kareyi bundan boyar. */
  const sunTimesCacheKey="villa-sun-times";
  function cacheSunTimes(times){
    if(!times)return;
    try{localStorage.setItem(sunTimesCacheKey,JSON.stringify({rise:times.rise,set:times.set}))}catch{}
  }
  function cachedSunTimes(){
    try{
      const saved=JSON.parse(localStorage.getItem(sunTimesCacheKey)||"null");
      const rise=Number(saved?.rise);
      const set=Number(saved?.set);
      if(!Number.isFinite(rise)||!Number.isFinite(set)||set-rise<60)return null;
      return{rise,set};
    }catch{return null}
  }
  /* GÖKYÜZÜ ÖNİZLEMESİ — `?sky=preview`. Gün–gece döngüsünü beklemeden görebilmek için bir tam
     günü ~40 saniyeye sıkıştırır. Kapsamı DAR: yalnız gökyüzünün okuduğu "şimdi" değişir, yani
     aşama tonlaması, güneş/ay yayı, yıldızlar ve (kip "güneşe göre" ise) tema. Alarm, otomasyon,
     cihaz durumu, saat bloğu ve hava tahmini kendi gerçek zamanlarını okumaya devam eder.
     Hiçbir kalıcı durum yazmaz (localStorage'a da sunucuya da); parametre kalkınca iz bırakmaz. */
  const skyPreview=(()=>{
    try{return new URLSearchParams(location.search).get("sky")==="preview"}catch{return false}
  })();
  const skyPreviewCycle=40000;
  const skyPreviewStart=Date.now();
  /* AYNI KAPSAMIN ELLE SÜRÜLENİ — arka plan sayfasındaki saat kaydırıcısı. `?sky=preview` bir
     günü 40 sn'ye sıkıştırır ama istenen anda DURMAZ; bu kaydırıcı gökyüzünün "şimdi"sini tek
     bir dakikaya DONDURUR, böylece gündüz vakti gece manzarasına bakılabilir. Kapsam yine dar:
     yalnız `skyMinutes()` değişir. Elle saat seçilir seçilmez 40 sn'lik döngü de durur (donmuş
     saat kazanır); önizleme kapanınca döngü kaldığı yerden akmaya devam eder.
     KALICI HİÇBİR ŞEY YAZMAZ ve üç yolla kapanır: "şimdiye dön", arka plan sayfasından çıkış
     (`activateView`), sayfanın yenilenmesi. `settle` yalnız kapanış karesi içindir — dönüş
     hareketi 60 sn sürmesin diye adım süresini bir kereliğine kısaltır. */
  const skyScrub={active:false,minutes:720,settle:false};
  function skyMinutes(){
    if(skyScrub.active)return skyScrub.minutes;
    if(!skyPreview){
      const now=new Date();
      return now.getHours()*60+now.getMinutes()+now.getSeconds()/60;
    }
    return ((Date.now()-skyPreviewStart)%skyPreviewCycle)/skyPreviewCycle*1440;
  }
  const skyClock=minutes=>{
    const total=((Math.round(minutes)%1440)+1440)%1440;
    return dateTimeFormatter({hour:"2-digit",minute:"2-digit",hour12:false})
      .format(new Date(2000,0,1,Math.floor(total/60),total%60));
  };
  /* Hızlı sıçramaların dakikaları GERÇEK gün doğumu/batımından türer (canlı hava verisi → son
     bilinen → yaklaşık yedek), sabit saatlerden değil. "Gece ortası" takvim gece yarısı değil
     batış–doğuş aralığının ortasıdır: ay tam o anda yayın tepesindedir. */
  function skyScrubMarks(){
    const times=sunGroundTimes()||cachedSunTimes()||fallbackSunTimes();
    return{
      dawn:times.rise,
      noon:(times.rise+times.set)/2,
      dusk:times.set,
      midnight:((times.set+times.rise+1440)/2)%1440,
    };
  }
  /* Tek giriş: dakika ver → dondur, `null` ver → gerçek saate dön. Gökyüzü ve (kip "güneşe
     göre" ise) tema aynı karede yeniden yazılır; başka hiçbir sistem haberdar edilmez. */
  function setSkyScrub(minutes){
    if(minutes===null){
      if(!skyScrub.active)return;
      skyScrub.active=false;
      skyScrub.settle=true;
    }else{
      const value=Number(minutes);
      if(!Number.isFinite(value))return;
      skyScrub.active=true;
      skyScrub.minutes=Math.max(0,Math.min(1439,Math.round(value)));
    }
    if(sunGroundState.started){syncSunTheme();applySunGround()}
    renderSkySettings();
  }
  /* Gündüz mü? Canlı veri varsa o, yoksa önbellek, ikisi de yoksa `null` (bilinmiyor). */
  function sunIsUp(){
    const times=sunGroundTimes()||cachedSunTimes();
    if(!times)return null;
    const minutes=skyMinutes();
    return minutes>=times.rise&&minutes<times.set;
  }
  function resolveThemeMode(){
    if(state.themeMode==="light"||state.themeMode==="dark")return state.themeMode;
    if(state.themeMode==="sun"){
      const daylight=sunIsUp();
      if(daylight!==null)return daylight?"light":"dark";
    }
    return themeMedia?.matches?"dark":"light";
  }
  /* Otomatik geçiş sert olmasın: eşiği geçerken kök kısa süre `data-theme-fade` taşır ve
     renkler yumuşar (kural `panel.css` içinde). Yalnız KENDİLİĞİNDEN olan geçişte kurulur —
     elle seçim anında değişir — ve `prefers-reduced-motion` açıkken hiç kurulmaz. */
  let themeFadeTimer=null;
  function startThemeFade(){
    clearTimeout(themeFadeTimer);
    document.documentElement.dataset.themeFade="on";
    themeFadeTimer=setTimeout(()=>{
      themeFadeTimer=null;
      delete document.documentElement.dataset.themeFade;
    },1100);
  }
  function applyTheme(options={}){
    // Sabit görünümde (Light · Dark · System) gökyüzü hiç çizilmiyor; saat önizlemesinin
    // gösterecek bir şeyi kalmadığı için sessizce kapanır. Yalnız bayrak düşürülür — gökyüzünü
    // aşağıdaki `syncSunGround` zaten durduruyor.
    if(skyScrub.active&&state.themeMode!=="sun"){skyScrub.active=false;skyScrub.settle=false}
    const resolved=resolveThemeMode();
    const previous=document.documentElement.dataset.theme;
    if(options.fade===true&&previous&&previous!==resolved&&!reducedMotion())startThemeFade();
    document.documentElement.dataset.theme=resolved;
    // İKİ GÖRÜNÜM SİSTEMİ. `data-sky` kökte hangi sistemin geçerli olduğunu söyler: hareketli
    // gökyüzü (aşamalar, yıldızlar, güneş/ay, kayma) YALNIZ "güneşe göre" kipinde çalışır,
    // diğer tüm kiplerde panel sabit sisteme düşer. Tema (`data-theme`) bundan bağımsızdır —
    // sabit sistemde de light ve dark ikisi de var. CSS tarafı `panel.css` içinde.
    document.documentElement.dataset.sky=state.themeMode==="sun"?"live":"fixed";
    document.documentElement.style.colorScheme=resolved;
    document.querySelector('meta[name="theme-color"]').content=resolved==="dark"?"#101514":"#edf0f2";
    const resolvedLabel=t(resolved==="dark"?"themeDark":"themeLight");
    $$("[data-theme-mode]").forEach(button=>{
      const mode=button.dataset.themeMode;
      const active=mode===state.themeMode;
      button.classList.toggle("active",active);
      button.setAttribute("aria-pressed",String(active));
      const label=t(`theme${mode[0].toUpperCase()}${mode.slice(1)}`);
      // Otomatik kiplerde (sistem · güneşe göre) SEÇİLEN kip ile o an UYGULANAN tema ayrı
      // şeylerdir; etkin düğme ikisini birden söylesin ki kullanıcı nerede olduğunu görsün.
      button.title=active&&(mode==="sun"||mode==="system")?`${label}: ${resolvedLabel}`:label;
    });
    $$(".theme-switch").forEach(group=>group.setAttribute("aria-label",t("appearance")));
    $$("[data-theme-toggle]").forEach(button=>{
      button.setAttribute("aria-label",`${t("appearance")}: ${resolvedLabel}`);
      button.title=`${t("appearance")}: ${resolvedLabel}`;
    });
    // Zemin de görünümün parçası: güneş takibi kipe göre kurulur ya da durdurulur (aşağıda),
    // zaten doğru durumdaysa hiçbir şey yapmaz.
    syncSunGround();
    // Arka plan sayfasındaki "hareketli gökyüzü kapalı" uyarısı kipe bakar, tazelensin.
    renderSkySettings();
  }
  /* ————— ARKA PLAN AYARLARI — CİHAZ BAZINDA, SUNUCUYA YAZILMAZ —————
     "Güneşe göre" görünümünün üç ayarı (Samanyolu kuşağı, yıldız parlaklığı, dağ silüeti)
     `villa-sky` altında `localStorage`'da durur — tema (`villa-theme`) hangi desendeyse aynısı.
     Bozuk ya da eksik değer sessizce varsayılana düşer; panel hiçbir koşulda ayarsız kalmaz.
     PARALEL BİR SİSTEM KURULMAZ: her ayar ya mevcut bir değişkeni sürer (`--mw-a`, `--star-a`,
     `--mountain-h`) ya da kökteki bir işareti çevirir (`data-milkyway`, `data-mountain`). Sabit
     görünüm (Light · Dark · System) hiç etkilenmez — CSS oradaki katmanları zaten kurmuyor. */
  const skySettingsKey="villa-sky";
  const skySettingsDefaults={milkyway:"b",density:.65,starGain:1,mountain:true,mountainHeight:94};
  const skyMilkywayChoices=["off","a","b","c"];
  const skySettings={...skySettingsDefaults};
  /* Yıldız alfasının GECE PAYI. `applySunGround` dakikada bir yazar; kullanıcı çarpanı
     oynatırken bütün güneş hesabını yeniden döndürmeyelim diye burada saklanır — kaydırıcı
     kımıldadığında tek bir `--star-a` yazımı yetiyor. */
  let skyStarBase=0;
  const skyNumber=(value,min,max,fallback)=>{
    const number=Number(value);
    return Number.isFinite(number)?Math.min(max,Math.max(min,number)):fallback;
  };
  function loadSkySettings(){
    let saved=null;
    try{saved=JSON.parse(localStorage.getItem(skySettingsKey)||"null")}catch{saved=null}
    const source=saved&&typeof saved==="object"?saved:{};
    skySettings.milkyway=skyMilkywayChoices.includes(source.milkyway)?source.milkyway:skySettingsDefaults.milkyway;
    skySettings.density=skyNumber(source.density,0,1,skySettingsDefaults.density);
    skySettings.starGain=skyNumber(source.starGain,0,1.5,skySettingsDefaults.starGain);
    skySettings.mountain=typeof source.mountain==="boolean"?source.mountain:skySettingsDefaults.mountain;
    skySettings.mountainHeight=Math.round(skyNumber(source.mountainHeight,40,190,skySettingsDefaults.mountainHeight));
  }
  /* Boyama ANINDA, kayıt GECİKMELİ: kaydırıcı sürüklenirken her karede diske yazmanın anlamı
     yok, ama gökyüzü aynı karede değişmeli. */
  let skySettingsSaveTimer=null;
  function saveSkySettings(){
    clearTimeout(skySettingsSaveTimer);
    skySettingsSaveTimer=setTimeout(()=>{
      skySettingsSaveTimer=null;
      try{localStorage.setItem(skySettingsKey,JSON.stringify(skySettings))}catch{}
    },300);
  }
  /* Yıldız alfası = GECENİN PAYI × kullanıcının çarpanı. Gece payı olduğu gibi durduğu için
     ayar gündüzü aydınlatmaz, yalnız gecenin tavanını oynatır. Samanyolu alfaları da aynı
     değişkenle çarpılı olduğu için kuşak yıldızlarla birlikte kısılır. */
  function applyStarGain(){
    document.documentElement.style.setProperty("--star-a",(skyStarBase*skySettings.starGain).toFixed(3));
  }
  function applySkySettings(){
    const root=document.documentElement;
    root.dataset.milkyway=skySettings.milkyway;
    root.style.setProperty("--mw-a",skySettings.density.toFixed(2));
    root.dataset.mountain=skySettings.mountain?"on":"off";
    root.style.setProperty("--mountain-h",`${skySettings.mountainHeight}px`);
    applyStarGain();
  }
  function renderSkySettings(){
    if(!$("#skyModeNotice"))return;
    const percent=value=>`${Math.round(value*100)}%`;
    $$("[data-sky-milkyway]").forEach(button=>{
      button.setAttribute("aria-pressed",String(button.dataset.skyMilkyway===skySettings.milkyway));
    });
    // Sürüklenen kaydırıcının değeri geri yazılmaz; yoksa parmağın altında zıplar.
    const density=$("#skyDensity");
    if(document.activeElement!==density)density.value=String(Math.round(skySettings.density*100));
    $("#skyDensityValue").textContent=percent(skySettings.density);
    const starGain=$("#skyStarGain");
    if(document.activeElement!==starGain)starGain.value=String(Math.round(skySettings.starGain*100));
    $("#skyStarGainValue").textContent=percent(skySettings.starGain);
    $("#skyMountainOn").checked=skySettings.mountain;
    const height=$("#skyMountainHeight");
    if(document.activeElement!==height)height.value=String(skySettings.mountainHeight);
    $("#skyMountainHeightValue").textContent=t("skyPixels",{count:skySettings.mountainHeight});
    // Sabit görünümdeyken bu sayfanın hiçbir ayarı ekranda görünmez; kullanıcıya söyle ve
    // tek dokunuşluk çıkışı ver.
    $("#skyModeNotice").hidden=state.themeMode==="sun";
    renderSkyScrub();
  }
  /* Kaydırıcı, okunur saat, rozet ve "şimdiye dön"ün durumu. Önizleme kapalıyken kaydırıcı
     GERÇEK saati gösterir, yani kullanıcı nereden başladığını görür. Sabit görünümde bütün
     denetimler kapatılır. */
  function renderSkyScrub(){
    const slider=$("#skyPreviewHour");
    if(!slider)return;
    const minutes=skyMinutes();
    if(document.activeElement!==slider)slider.value=String(Math.round(minutes));
    $("#skyPreviewValue").textContent=skyClock(minutes);
    const off=state.themeMode!=="sun";
    slider.disabled=off;
    $$("[data-sky-jump]").forEach(button=>{button.disabled=off});
    $("#skyPreviewNow").disabled=off||!skyScrub.active;
    $("#skyPreviewCard").classList.toggle("is-off",off);
    const badge=$("#skyPreviewBadge");
    badge.hidden=!skyScrub.active;
    $("#skyPreviewBadgeTime").textContent=skyClock(minutes);
  }
  /* Tek giriş: değeri yaz → hemen boya → gecikmeli kaydet → arayüzü tazele. */
  function updateSkySettings(patch){
    Object.assign(skySettings,patch);
    applySkySettings();
    saveSkySettings();
    renderSkySettings();
  }
  function resetSkySettings(){
    updateSkySettings({...skySettingsDefaults});
  }
  /* GÜNEŞİ İZLEYEN ZEMİN. Panel kendi güneş hesabını YAPMAZ: gün doğumu/batımı zaten hava
     servisinden geliyor (`weatherState.data.daily.sunrise/sunset`, sunucu `timezone=auto` ile
     çekiyor) ve saatler konumun yerel saatinde, ofsetsiz ISO metni olarak duruyor — tabletin
     kendi saatiyle doğrudan karşılaştırılır. Veri yoksa `fallbackSunTimes()` devreye girer —
     zemin, güneş ve ay yine çizilir, yalnız saatler yaklaşıktır.
     Yeniden hesap DAKİKADA BİR: güneş bir dakikada ekranın ~%0,8'i kadar ilerler, yani bakarken
     hareket görünmez ama gün içinde zeminin değiştiği fark edilir. Veri henüz gelmediyse daha
     sık yoklanır ki açılıştan sonra zemin geç kalmasın. */
  const sunGroundState={timer:null,started:false,live:false};
  const sunGroundMinutes=text=>{
    const match=/T(\d{2}):(\d{2})/.exec(String(text||""));
    return match?Number(match[1])*60+Number(match[2]):null;
  };
  function sunGroundTimes(){
    const daily=weatherState.data?.daily;
    const rises=Array.isArray(daily?.sunrise)?daily.sunrise:null;
    const sets=Array.isArray(daily?.sunset)?daily.sunset:null;
    if(!rises||!sets)return null;
    // Günlük dizi dört gün taşır; bugünün satırı tarihe göre bulunur, bulunamazsa ilk satır.
    const now=new Date();
    const stamp=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
    const found=rises.findIndex(item=>String(item||"").slice(0,10)===stamp);
    const index=found<0?0:found;
    const rise=sunGroundMinutes(rises[index]);
    const set=sunGroundMinutes(sets[index]);
    if(rise===null||set===null||set-rise<60)return null;
    return{rise,set};
  }
  /* YEDEK GÜN DOĞUMU/BATIMI — ASTRONOMİK İDDİA YOK. Hava servisi henüz cevap vermediyse ya da
     hiç konum seçilmediyse eskiden `data-sun-ground` HİÇ konmuyordu: gökyüzü tek renk kalıyor,
     güneş ve ay hiç çizilmiyordu. Kullanıcının "güneş-ay animasyonu olmamış" şikâyetinin sebebi
     buydu. Artık makul bir yedeğe düşülür: konumun enlemi biliniyorsa yılın gününden basit bir
     eğim (deklinasyon) yaklaşımıyla gün uzunluğu bulunur — zaman denklemi, boylam kayması ve
     kırılma HESABA KATILMAZ, hata onlarca dakika olabilir, sorun değil: bu bir dekor.
     Enlem de yoksa 06:30 / 20:30 kullanılır. Gerçek veri gelir gelmez devralır. */
  const fallbackSunTimes=()=>{
    const latitude=Number(state.homeLocation?.latitude??weatherState.location?.latitude);
    if(Number.isFinite(latitude)&&Math.abs(latitude)<=65){
      const now=new Date();
      const dayOfYear=Math.floor((now-new Date(now.getFullYear(),0,0))/86400000);
      const declination=.4093*Math.sin(2*Math.PI*(dayOfYear-81)/365);
      const cosHourAngle=-Math.tan(latitude*Math.PI/180)*Math.tan(declination);
      if(Math.abs(cosHourAngle)<1){
        // Yerel güneş öğlesi 12:00 sayılır; yarım gün uzunluğu dakikaya çevrilir.
        const halfDay=Math.acos(cosHourAngle)*720/Math.PI;
        if(halfDay>=30)return{rise:720-halfDay,set:720+halfDay};
      }
    }
    return{rise:390,set:1230};
  };
  /* GECE AYI — BİLEREK DEKORATİF, ASTRONOMİ DEĞİL.
     Gerçek ay güneş battığında doğmaz: her gün ~50 dakika geç doğar, gecelerin çoğunu ancak
     bir bölümünü gökyüzünde geçirerek tamamlar ve sık sık GÜNDÜZ de gökyüzündedir. Kullandığımız
     hava servisi ay doğuşu/batışı vermiyor, panelin kendi astronomi hesabı da yok. Bu yüzden
     ayın KONUMU kurgudur: güneşin yayının gece yarısını taklit eder (batışta bir kenardan doğar,
     gece ortasında tepeye çıkar, gün doğumunda öbür kenardan batar). Doğruluk iddiası yoktur.
     EVRE ise gerçek veriye dayanır ve takvimle uyumludur: bilinen bir yeni ay anından sinodik
     ay boyunca (29,53 gün) sayılır. Terminatör (aydınlık/karanlık sınırı) yarım ELİPSTİR — bu
     yüzden CSS'te iki katman var: yalnız AYDINLIK yarıya serilen ve terminatör elipsini OYAN
     taban + şişkin evrede o oyuğu kapatan elips. Karanlık yarım hiç boyanmaz (ne katışım ne
     maske; ayrıntısı panel.css'te). Ayın kendi ışığı yalnız YEREL bir hale (`--moon-glow`, CSS'te `box-shadow`);
     zeminin genel parlaklık bandına dokunmaz, yani durum döşemelerinin merdiveni bozulmaz. */
  const synodicMonth=29.530588853*86400000;
  const knownNewMoon=Date.UTC(2000,0,6,18,14);
  const moonPhase=at=>{
    const turns=(at-knownNewMoon)/synodicMonth;
    // 0 yeni ay · .25 ilk dördün · .5 dolunay · .75 son dördün
    return turns-Math.floor(turns);
  };
  function applyMoon(root,options){
    const{visible,track,phase}=options;
    if(!visible){
      // Gündüz ay yok. (`prefers-reduced-motion` artık diski SİLMEZ; nabız ve kayma CSS'te durur.)
      root.style.setProperty("--moon-disc","0");
      root.style.setProperty("--moon-glow","0");
      return;
    }
    const altitude=Math.sin(Math.PI*track);
    // YÖN GÜNEŞLE AYNI: ay da güneşin doğduğu kenardan (sol) doğar, battığı kenardan (sağ)
    // batar. Açı bu yüzden güneşinkiyle bire bir aynı formülden gelir — güneşte ilerleme
    // doğuş→batış, ayda batış→doğuş; ikisi de -90° (sol ufuk) → 0° (tepe) → +90° (sağ ufuk).
    // ESKİDEN TERSTİ ((.5-track)); kullanıcı ayın ters yönde süzülmesini istemedi.
    root.style.setProperty("--moon-angle",`${((track-.5)*180).toFixed(2)}deg`);
    root.style.setProperty("--moon-disc",Math.min(1,altitude*4).toFixed(3));
    const illumination=(1-Math.cos(2*Math.PI*phase))/2;
    root.style.setProperty("--moon-glow",illumination.toFixed(3));
    // Elipsin yarıçapı dördünlerde sıfıra iner (düz kenar), yeni ay/dolunayda diske eşitlenir.
    // Taban sıfır DEĞİL: sıfır yarıçaplı radyal gradyan tarayıcıya göre belirsiz çiziliyor,
    // %0,01 hem düz kenarı verir hem de o belirsizliğe hiç girmez.
    root.style.setProperty("--moon-term",`${Math.max(.01,Math.abs(Math.cos(2*Math.PI*phase))*50).toFixed(2)}%`);
    // Büyürken (yeni ay → dolunay) aydınlık taraf sağdadır, küçülürken solda. KARANLIK YARIM
    // BOYANMAZ (CSS'te uzun not): yalnız aydınlık yarım serilir, bu iki değişken onun HANGİ yarı
    // olduğunu söyler — `--moon-side` katmanın yeri, `--moon-hinge` terminatör elipsinin o
    // yarıdaki menteşesi, yani diskin merkezine denk gelen kenar.
    const waxing=phase<.5;
    root.style.setProperty("--moon-side",waxing?"100%":"0%");
    root.style.setProperty("--moon-hinge",waxing?"0%":"100%");
    // Şişkin evrede (dördünler arası) elips aydınlığı taşır ve oyuğun üstünü kapatır; hilalde
    // saydam kalır, yani elips aydınlık yarımdan hilali oyar.
    root.style.setProperty("--moon-mid",phase>.25&&phase<.75?"var(--moon-lit)":"transparent");
  }
  /* GÖKYÜZÜNÜN AŞAMA AĞIRLIKLARI — şafak · gündüz · batım (gece = kalan pay).
     KIZILLIK İKİ SAAT SÜRER VE DORUĞU TAM GÜN DOĞUMUDUR: şafak doğuştan `skyRedSpan` dakika
     önce açılır, doğuş anında 1'e çıkar, aynı süre sonra tam gündüze döner. Batımda simetrik.
     (Eskiden pencere 72 dk önce / 66 dk sonraydı ve doruk doğuştan 12 dk ÖNCEYE düşüyordu;
     kullanıcı kızıllığın hem daha uzun sürmesini hem de gerçekten doğuş anına oturmasını
     istedi.) Aradaki her an İKİ komşu aşamanın karışımıdır — üç aşama aynı anda hiç açık olmaz.
     GEÇİŞ DOĞRUSAL DEĞİL YUMUŞATILMIŞ: ham oran smoothstep'ten geçer, yani pencerenin iki
     ucunda türev sıfırdır. Basamak hissi asıl buradan gider; renkler zaten temadan koptu. */
  const skyRedSpan=60;
  function skyPhases(minutes,rise,set){
    const w={dawn:0,day:0,dusk:0};
    const ease=t=>t*t*(3-2*t);
    const blend=(from,to,low,high)=>{
      const t=ease(Math.max(0,Math.min(1,(minutes-from)/(to-from))));
      if(low)w[low]+=1-t;
      if(high)w[high]+=t;
    };
    const span=skyRedSpan;
    if(minutes<=rise-span||minutes>=set+span){/* tam gece: üç ağırlık da sıfır kalır */}
    else if(minutes<rise)blend(rise-span,rise,null,"dawn");
    else if(minutes<rise+span)blend(rise,rise+span,"dawn","day");
    else if(minutes<set-span)w.day=1;
    else if(minutes<set)blend(set-span,set,"day","dusk");
    else blend(set,set+span,"dusk",null);
    return w;
  }
  /* GÜN IŞIĞI EKSENİ — TEK VE SÜREKLİ, tema başına tablo YOK. Aşama ağırlıkları bu tabloyla
     çarpılır, 0..1 arası tek sayı çıkar: 0 = derin gece, 1 = öğle. Sayı YALNIZ zamana bağlıdır,
     `data-theme`e değil; yani gün doğumu/batımı eşiğinde tema dönerken bile akış kesilmez.
     .409 rastgele değil: kızıl gökyüzünün gerçek parlaklığına yakın ölçülmüş bir paydır, yani
     şafak/batım bandında eksen ne gündüzün ne gecenin ucuna yapışır. Kızıllık penceresi iki
     saate çıkınca (doruk = gün doğumu) eksen o anda .409'dan geçer ve oradan gündüze .409→1,
     geceye .409→0 olarak YUMUŞATILMIŞ (smoothstep) biçimde iner: eşikte basamak yoktur, tek
     fark en kritik anın artık tam doğuş anına oturmasıdır.
     TARİHÇE: burada eskiden gradyanlardan ölçülmüş tema başına parlaklık tablosu vardı
     (light .653/.703/.578/.438 · dark .141/.061/.070/.005). Gökyüzü eşikte GERÇEKTEN basamak
     yapıyor (tema gradyanları değişiyor); mürekkebi o ölçüme bağlamak basamağı mürekkebe de
     taşıyordu. Kullanıcının kararı: panele ara ara bakılıyor, AA tabanı yerine tam süreklilik. */
  const skyPhaseLight={dawn:.409,day:1,dusk:.409,night:0};
  /* KARTIN MÜREKKEBİ SAATE GÖRE TÜRER — sabit ton listesi yok, tema ailesi de yok. Girdi tek
     sayı: gün ışığı ekseni (`--sky-lum`, yukarıdaki tablo). Çıktı, kartın üstündeki SERBEST
     metnin (başlık, "Evin durumu" sayıları/etiketleri, hub saat/hava, ayraçlar) tüm nötr
     tonları + kart dolgusu ve harf konturu. Döşeme/buton mürekkebi buraya DAHİL DEĞİL:
     onların kendi koyu dolgusu var, yazıları her koşulda beyaz kalır.
     EŞLEME TEK PARÇA VE OMUZLUDUR, doğrusal değil: eksen `gain` kadar gerilip smootherstep'ten
     geçer, yani uçlarda DÜZ (mürekkep doyar: gece gri 250, gündüz gri 15), ortada DİK. Eşikte
     basamak YOKTUR — hiçbir değer `night`/tema koluna bakmaz.
     ORTA BANTTA KONTRAST DÜŞER, BU KABUL EDİLDİ: açıktan koyuya sürekli geçen bir mürekkep
     zorunlu olarak zeminle eşitlendiği bir andan geçer. Amaç AA garantisi değil o anı KISA
     tutmak; iki ucuz sigorta kaldı: (1) omuz — mürekkep ekseni ortada hızlı geçer (~57 dk),
     dolgu ve kontur tarafını daha da hızlı seçer (~22 dk); (2) `--sky-plate-shadow` ters yönde
     ince kontur (1px ofset, 2px bulanıklık), ağır siyah gölge YOK.
     KART DOLGUSUNUN TERS NEFESİ KORUNDU: örtü uçlarda incedir (.12 — öğle ve derin gece,
     gökyüzü mürekkebin lehine) ve eşiğe yaklaştıkça kalınlaşır (.42), yani gökyüzü mürekkebin
     aleyhine kaydıkça kart payı büyür. Eskiden bu iki ayrı aile kuralıydı (gündüz beyaz
     .12→.26, gece siyah .16→.42); artık tek çan eğrisi ikisini de kapsıyor. */
  function applyPlateInk(root,lum,warm){
    const cl=(v,a,b)=>Math.max(a,Math.min(b,v));
    const paint=(r,g,b,a)=>`rgba(${Math.round(cl(r,0,255))},${Math.round(cl(g,0,255))},${Math.round(cl(b,0,255))},${a})`;
    // OMUZ: ekseni ortadan gerip smootherstep'e sokar. gain ne kadar büyükse orta bant o kadar
    // dar. Mürekkep geniş süpürür (göze basamak gibi görünmesin), dolgu/kontur dar süpürür
    // (mürekkeple aynı anda orta gride takılıp birbirini yemesinler).
    const shape=(v,gain)=>{const u=cl((v-.5)*gain+.5,0,1);return u*u*u*(u*(u*6-15)+10);};
    const ink=shape(lum,2.6);
    const side=shape(lum,6);
    // Sıcaklık payı: şafak/batım ağırlığı. Mürekkep o anda kırmızıya doğru bir tık kayar —
    // parlaklığı neredeyse hiç değiştirmez, ama ton gökyüzüyle uyar.
    const g=250-235*ink;
    const r=g+warm*12,gg=g+warm*3,b=g-warm*8;
    // İkincil tonlar (soft · sub) her zaman ZEMİNE doğru kaçar: gündüzün koyu mürekkebinde
    // açılır, gecenin açık mürekkebinde koyulaşır. Yön tek sayıdan gelir (-1..+1), eşikte
    // sıfırdan geçer — hiyerarşi orada birkaç dakika siliktir, bilerek.
    const away=2*side-1;
    root.style.setProperty("--sky-plate-ink",paint(r,gg,b,1));
    root.style.setProperty("--sky-plate-ink-soft",paint(r+17*away,gg+17*away,b+17*away,1));
    root.style.setProperty("--sky-plate-sub",paint(r+34*away,gg+34*away,b+34*away,1));
    root.style.setProperty("--sky-plate-line",paint(r,gg,b,.16));
    root.style.setProperty("--sky-plate-inset",paint(r,gg,b,.07));
    // Dolgu ve kontur mürekkebin KARŞI tarafındadır: gece koyu (8,12,18 — hafif soğuk),
    // gündüz beyaz. Alfa çanı ham eksenden gelir, yani gün boyu yavaşça nefes alır.
    const fill=8+247*side,cool=1-side;
    root.style.setProperty("--sky-plate-fill",paint(fill,fill+4*cool,fill+10*cool,(.12+.3*(1-Math.abs(2*lum-1))).toFixed(3)));
    root.style.setProperty("--sky-plate-shadow",`0 1px 2px ${paint(fill,fill,fill,.52)}`);
  }
  function applySunGround(){
    const root=document.documentElement;
    // Sıra: canlı hava verisi → son bilinen (önbellek) → yedek yaklaşım. Önbelleğe YALNIZ canlı
    // veri yazılır, yedek oraya sızmaz. Hangisi kullanılırsa kullanılsın gökyüzü çizilir.
    const live=sunGroundTimes();
    if(live)cacheSunTimes(live);
    sunGroundState.live=Boolean(live);
    const times=live||cachedSunTimes()||fallbackSunTimes();
    const now=new Date();
    const minutes=skyMinutes();
    const progress=(minutes-times.rise)/(times.set-times.rise);
    // Yükseklik: gündüz yarım sinüs (doğuşta 0, öğlen 1, batışta 0), gece 0.
    const altitude=progress>0&&progress<1?Math.sin(Math.PI*progress):0;
    // Alacakaranlık: ufkun altındaki ilk 70 dakikada gökyüzü hâlâ renkli, sonra tam gece.
    const edge=progress<0?times.rise-minutes:progress>1?minutes-times.set:0;
    const twilight=Math.max(0,Math.min(1,1-edge/70));
    // AŞAMALAR. CSS'e giden alfa ham ağırlık DEĞİL zincir alfasıdır: katmanlar üst üste biniyor,
    // üstteki altındakinin payını yiyor. Kalan pay her adımda bir sonrakine bölünür; böylece
    // ekranda görünen karışım tam olarak yukarıdaki ağırlıklar olur.
    const phases=skyPhases(minutes,times.rise,times.set);
    const nightWeight=Math.max(0,1-phases.dawn-phases.day-phases.dusk);
    let rest=1-phases.dawn;
    const dayAlpha=rest>.0005?Math.min(1,phases.day/rest):0;
    rest-=phases.day;
    const duskAlpha=rest>.0005?Math.min(1,phases.dusk/rest):0;
    root.style.setProperty("--sky-a-dawn",phases.dawn.toFixed(3));
    root.style.setProperty("--sky-a-day",dayAlpha.toFixed(3));
    root.style.setProperty("--sky-a-dusk",duskAlpha.toFixed(3));
    // ÖĞLE ALTINI — aşama DEĞİL, gündüzün üstüne binen ince sıcak yıkama (yığında gündüzün
    // hemen üstünde, şafak/batımın altında). Ağırlık gündüz payı × yüksekliğin KARESİ: kare
    // olduğu için ton yayın tepesinde toplanır, sabah/akşam kenarlarına sürünmez. Tavan .28,
    // "hafif sarı" istendi. Zincire girmez, `--sky-lum`'a dokunmaz — mürekkep etkilenmez.
    root.style.setProperty("--sky-a-noon",(phases.day*altitude*altitude*.28).toFixed(3));
    // Yıldızlar gecenin payıyla belirir, şafak/batım açılırken söner. Tek bir opaklık; desen
    // CSS'te tekrarlı gradyan katmanları, DOM düğümü yok. Kullanıcının parlaklık çarpanı
    // (arka plan ayarları) bunun ÜSTÜNE binsin diye gece payı ayrıca saklanır.
    skyStarBase=nightWeight*.9;
    applyStarGain();
    // GÜN IŞIĞI EKSENİ — aşama ağırlıkları × tek tablo. Temaya BAKMAZ (eskiden bakıyordu);
    // yalnız zamanın fonksiyonu olduğu için eşikte kesilmez. Sayı köke yazılır (`--sky-lum`)
    // ve kartın bütün nötr tonları, dolgusu ve konturu ondan türer.
    const skyLum=phases.dawn*skyPhaseLight.dawn+phases.day*skyPhaseLight.day
      +phases.dusk*skyPhaseLight.dusk+nightWeight*skyPhaseLight.night;
    root.style.setProperty("--sky-lum",skyLum.toFixed(3));
    applyPlateInk(root,skyLum,Math.min(1,phases.dawn+phases.dusk));
    // GÜNEŞ KOLU: doğuşta -90°, tepede 0°, batışta +90°. Ufkun biraz altına da inebilsin diye
    // ilerleme dar bir payla dışarı taşar; disk zaten orada sönmüş olur.
    const arc=Math.max(-.12,Math.min(1.12,progress));
    root.style.setProperty("--sun-angle",`${((arc-.5)*180).toFixed(2)}deg`);
    // Disk `prefers-reduced-motion` açıkken de ÇİZİLİR (eskiden siliniyordu): hareketi CSS
    // durduruyor, gök cismini yok etmeye gerek yok.
    root.style.setProperty("--sun-disc",Math.min(1,altitude*4).toFixed(3));
    root.style.setProperty("--sun-glow",(twilight*(0.35+0.65*altitude)).toFixed(3));
    // Konum değişimlerinin geçiş süresi = yazma aralığı: açı dakikada bir yazılır ama gözle
    // sürekli kayar. Önizlemede aralık da süre de kısalır; saat kaydırıcısı sürüklenirken
    // gökyüzü parmağı takip etmeli, önizleme kapanırken de gerçek saate 60 sn'de değil hızla
    // dönmeli (`settle`, yalnız o tek kare için).
    const step=skyPreview||skyScrub.active?".14s":skyScrub.settle?".6s":"60s";
    skyScrub.settle=false;
    root.style.setProperty("--sky-step",step);
    // Gece: batıştan doğuşa uzanan aralık. Gece yarısı bu aralığın ORTASI sayılır (takvim
    // gece yarısı değil), böylece ay yayın tepesine gecenin ortasında çıkar.
    const night=minutes>=times.set||minutes<times.rise;
    const nightSpan=1440-times.set+times.rise;
    const elapsed=minutes>=times.set?minutes-times.set:minutes+1440-times.set;
    applyMoon(root,{
      visible:night,
      track:Math.max(0,Math.min(1,elapsed/nightSpan)),
      phase:moonPhase(now.getTime()),
    });
    root.dataset.sunGround="on";
  }
  /* Kip "güneşe göre" iken tema da dakikada bir yoklanır: eşiği geçtiğimizde zemin tonlaması
     ve tema BİRLİKTE kayar, arada tutarsız bir kare olmaz. */
  function syncSunTheme(){
    if(state.themeMode!=="sun")return;
    if(document.documentElement.dataset.theme===resolveThemeMode())return;
    applyTheme({fade:true});
  }
  function scheduleSunGround(){
    clearTimeout(sunGroundState.timer);
    // SIRA: önce tema yoklanır, sonra gökyüzü. Mürekkebin buna artık İHTİYACI YOK (tek sürekli
    // eşleme temaya bakmıyor), ama eşikte hâlâ dönen şeyler var — döşeme/çip renkleri, kart
    // kenarı, alt sayfalar — ve `syncSunTheme` onlar için köke `data-theme-fade` koyuyor.
    // Sıra korunsun ki o kare içinde tema ile gökyüzü aynı dakikayı anlatsın.
    syncSunTheme();
    applySunGround();
    // Arka plan sayfasındaki saat okunuru gerçek zamanla akmayı sürdürsün (önizleme kapalıyken).
    renderSkyScrub();
    // "Hazır" artık işarete değil CANLI veriye bakar: işaret yedekle de konuyor, ama hava
    // servisi henüz cevap vermediyse yine sık yoklanmalı.
    const ready=sunGroundState.live===true;
    // Önizlemede sanal gün 40 sn'de dönüyor: 140 ms'lik adım yaklaşık 5 sanal dakika, yani
    // gökyüzü basamaklanmadan akar. Normalde dakikada bir yeter.
    // Saat elle dondurulmuşsa 40 sn'lik döngünün hızlı adımına gerek yok: gökyüzü zaten sabit.
    const fast=skyPreview&&!skyScrub.active;
    sunGroundState.timer=setTimeout(scheduleSunGround,ready?(fast?140:60000):15000);
  }
  function startSunGround(){
    if(sunGroundState.started)return;
    sunGroundState.started=true;
    scheduleSunGround();
  }
  /* SABİT SİSTEMDE HİÇBİR ŞEY DÖNMEZ. Gökyüzü, güneş ve ay yalnız "güneşe göre" kipinin
     öğeleri; başka kipte CSS onları zaten çizmiyor, burada da dakikalık hesabı durduruyoruz —
     boşuna iş dönmesin. Kip geri döndüğünde takip aynı yerden kurulur, ilk çağrı değerleri
     hemen yeniden yazar. */
  function stopSunGround(){
    if(!sunGroundState.started)return;
    clearTimeout(sunGroundState.timer);
    sunGroundState.timer=null;
    sunGroundState.started=false;
    delete document.documentElement.dataset.sunGround;
  }
  function syncSunGround(){
    if(state.themeMode==="sun")startSunGround();
    else stopSunGround();
  }
  function setThemeMode(mode){
    if(!["light","dark","sun","system"].includes(mode))return;
    state.themeMode=mode;
    try{localStorage.setItem("villa-theme",state.themeMode)}catch{}
    applyTheme();
    // Kip seçildi, menünün işi bitti: sonuç zaten menünün ARKASINDA görünüyor, açık kalan
    // pencere kullanıcının seçtiği görünümü kendi kapatıyordu. Dil değişiminde bilerek
    // kapanmıyoruz — orada peş peşe deneme yapılıyor.
    closeAppMenu();
  }
  function applyLanguage(){
    document.documentElement.lang=state.language;
    $$("[data-i18n]").forEach(element=>element.textContent=t(element.dataset.i18n));
    $("#addWidget").setAttribute("aria-label",t("addWidget"));
    $("#addWidget").title=t("addWidget");
    $("#devicesAddDevice").setAttribute("aria-label",t("addDevice"));
    $("#devicesAddDevice").title=t("addDevice");
    $("#refreshButton").setAttribute("aria-label",t("refresh"));
    $("#refreshButton").title=t("refresh");
    $("#homeHub").setAttribute("aria-label",t("hubLabel"));
    $("#hubClockZone").setAttribute("aria-label",t("hubClockZoneLabel"));
    $("#hubClockZone").title=t("hubClockTitle");
    $("#hubWeatherZone").setAttribute("aria-label",t("hubWeatherZoneLabel"));
    $("#hubWeatherZone").title=t("weather");
    $("#widgetScrollLeft").setAttribute("aria-label",t("moreWidgetsLeft"));
    $("#widgetScrollLeft").title=t("moreWidgetsLeft");
    $("#widgetScrollHint").setAttribute("aria-label",t("moreWidgetsRight"));
    $("#widgetScrollHint").title=t("moreWidgetsRight");
    $("#quickScrollLeft").setAttribute("aria-label",t("moreQuickControlsLeft"));
    $("#quickScrollLeft").title=t("moreQuickControlsLeft");
    $("#quickScrollRight").setAttribute("aria-label",t("moreQuickControlsRight"));
    $("#quickScrollRight").title=t("moreQuickControlsRight");
    $("#screensaver").setAttribute("aria-label",t("screensaverTitle"));
    setLoginMode(state.loginMode);
    applyAuthUi();
    $$("[data-i18n-placeholder]").forEach(element=>element.placeholder=t(element.dataset.i18nPlaceholder));
    $$("[data-i18n-aria]").forEach(element=>element.setAttribute("aria-label",t(element.dataset.i18nAria)));
    $("#clearSearch").setAttribute("aria-label",t("clearSearch"));
    $("#clearSearch").title=t("clearSearch");
    $$("[data-language]").forEach(button=>button.classList.toggle("active",button.dataset.language===state.language));
    $$(".language-switch").forEach(group=>group.setAttribute("aria-label",t("language")));
    const languageLabel=`${t("language")}: ${languageMetadata[state.language]?.name||state.language.toUpperCase()}`;
    $$("[data-language-cycle]").forEach(button=>{
      button.setAttribute("aria-label",languageLabel);
      button.title=languageLabel;
    });
    $("#closeLight").setAttribute("aria-label",t("close"));
    if($("#nameDialog").open)configureNameDialog(state.editing?.afterPairing===true,state.editing?.reconnected===true);
    if($("#imageDialog").open)renderImageChooser();
    if($("#deviceRoleDialog").open)renderDeviceRoleDialog();
    if($("#deviceRoomDialog").open)renderDeviceRoomDialog();
    if($("#widgetDialog").open){updateAddDialogTitle();renderRoomSuggestions();updateGroupOrderControls();renderGroupDeviceChoices();renderWidgetCatalog()}
    if($("#clockDialog").open){renderClockDialogRows();renderLocationSearchResults("clock");renderAlarmSettings()}
    if($("#alarmDialog").open)renderAlarmRing();
    renderHubAlarm();
    if($("#weatherDialog").open)renderWeatherDialog();
    if($("#weatherLocationDialog").open)renderLocationSearchResults("weather");
    if($("#homeLocationDialog").open){renderHomeLocationDialog();renderLocationSearchResults("home")}
    if($("#simpleLinkDialog").open)renderSimpleLink();
    if($("#automationDialog").open)renderAutomationWizard();
    renderHomeLocation();
    render();
    renderFabrics();
    renderHomeAssistant();
    renderConnectedServerAddress();
    renderDebugSettings();
    renderDebugErrors();
    renderDebugNetworkEvents();
    applyWidgetLayout();
    applyDeviceLayout();
    applyTheme();
    if($("#onboardingDialog").open)renderOnboarding();
    if(state.coach)renderCoach();
  }
  const screensaverDelay=120000;
  let screensaverTimer=null;
  let screensaverClockTimer=null;
  function clearScreensaverTimer(){if(screensaverTimer!==null){clearTimeout(screensaverTimer);screensaverTimer=null}}
  function clearScreensaverClock(){if(screensaverClockTimer!==null){clearTimeout(screensaverClockTimer);screensaverClockTimer=null}}
  function screensaverAllowed(){
    return document.body.dataset.activeView==="home"
      &&!document.querySelector("dialog[open]");
  }
  function scheduleScreensaver(){
    clearScreensaverTimer();
    if(document.body.dataset.activeView!=="home")return;
    screensaverTimer=setTimeout(()=>{
      screensaverTimer=null;
      if(screensaverAllowed())openScreensaver();
      else scheduleScreensaver();
    },screensaverDelay);
  }
  const idleHomeReturnDelay=300000;
  let idleHomeReturnTimer=null;
  function clearIdleHomeReturn(){if(idleHomeReturnTimer!==null){clearTimeout(idleHomeReturnTimer);idleHomeReturnTimer=null}}
  function typingInField(){
    const element=document.activeElement;
    return element?.tagName==="INPUT"||element?.tagName==="TEXTAREA";
  }
  function idleHomeReturnAllowed(){
    return document.body.dataset.activeView!=="home"
      &&!document.querySelector("dialog[open]")
      &&!state.pairingSession
      &&!$("#onboardingDialog").open
      &&!typingInField();
  }
  function scheduleIdleHomeReturn(){
    clearIdleHomeReturn();
    if(document.body.dataset.activeView==="home")return;
    idleHomeReturnTimer=setTimeout(()=>{
      idleHomeReturnTimer=null;
      if(idleHomeReturnAllowed())activateView("home");
      else scheduleIdleHomeReturn();
    },idleHomeReturnDelay);
  }
  function scheduleScreensaverClock(){
    clearScreensaverClock();
    const now=new Date();
    screensaverClockTimer=setTimeout(()=>{
      screensaverClockTimer=null;
      if(!state.screensaverOpen)return;
      renderScreensaver();
      scheduleScreensaverClock();
    },(60-now.getSeconds())*1000-now.getMilliseconds()+40);
  }
  function renderScreensaver(){
    const locale=state.language==="tr"?"tr-TR":"en-GB";
    const now=new Date();
    $("#screensaverClock").textContent=new Intl.DateTimeFormat(locale,{hour:"2-digit",minute:"2-digit",hour12:false}).format(now);
    $("#screensaverDate").textContent=new Intl.DateTimeFormat(locale,{weekday:"long",day:"numeric",month:"long"}).format(now);
    const weather=$("#screensaverWeather");
    const current=weatherState.data?.current;
    const temperature=Number(current?.temperature_2m);
    if(Number.isFinite(temperature)){
      const presentation=weatherPresentation(Number(current.weather_code),Number(current.is_day)!==0);
      const units=weatherState.data.current_units||{};
      weather.innerHTML=`<span class="screensaver-weather-icon" aria-hidden="true">${presentation.icon}</span><span>${Math.round(temperature)}${esc(units.temperature_2m||"°C")} · ${t(presentation.label)}</span>`;
      weather.hidden=false;
    }else{
      weather.innerHTML="";
      weather.hidden=true;
    }
    const alertBox=$("#screensaverAlert");
    const critical=state.devices.filter(device=>criticalAlert(device));
    if(critical.length){
      const device=critical[0];
      const alert=criticalAlert(device);
      const message=t(criticalAlertKeys[alert.code]||"deviceNeedsAttention",{name:device.name});
      alertBox.textContent=critical.length>1?`${message} ${t("moreCriticalAlerts",{count:critical.length-1})}`:message;
      alertBox.hidden=false;
    }else{
      alertBox.textContent="";
      alertBox.hidden=true;
    }
  }
  function openScreensaver(){
    if(state.screensaverOpen)return;
    state.screensaverOpen=true;
    document.body.classList.add("screensaver-open");
    const overlay=$("#screensaver");
    overlay.hidden=false;
    renderScreensaver();
    scheduleScreensaverClock();
    overlay.focus();
  }
  function closeScreensaver(){
    clearScreensaverClock();
    if(!state.screensaverOpen)return;
    state.screensaverOpen=false;
    document.body.classList.remove("screensaver-open");
    $("#screensaver").hidden=true;
  }
  function dismissScreensaver(event){
    if(event){event.preventDefault();event.stopPropagation()}
    closeScreensaver();
    scheduleScreensaver();
  }
  function bindScreensaver(){
    const overlay=$("#screensaver");
    overlay.addEventListener("pointerdown",event=>{event.preventDefault();event.stopPropagation()});
    ["pointerup","click","keydown","wheel"].forEach(type=>overlay.addEventListener(type,dismissScreensaver));
    ["pointerdown","keydown","wheel"].forEach(type=>document.addEventListener(type,()=>{if(!state.screensaverOpen){scheduleScreensaver();scheduleIdleHomeReturn()}},{capture:true,passive:true}));
    scheduleScreensaver();
    scheduleIdleHomeReturn();
  }
  function bindLanguageButtons(){
    $$("[data-language]").forEach(button=>button.onclick=()=>setLanguage(button.dataset.language));
  }
  async function loadLanguages(){
    const data=await api("/api/locales");
    for(const locale of data.locales||[]){
      if(!locale?.code||!locale?.translations)continue;
      translations[locale.code]=locale.translations;
      languageMetadata[locale.code]={name:locale.name||locale.code};
    }
    const available=Object.keys(translations);
    if(!available.length)throw new Error("No language packs found.");
    state.language=translations[state.language]?state.language:(translations[data.defaultLanguage]?data.defaultLanguage:available[0]);
    const languageButtons=available.map(code=>`<button type="button" data-language="${esc(code)}" title="${esc(languageMetadata[code]?.name||code)}">${esc(code.toUpperCase())}</button>`).join("");
    $$(".language-switch").forEach(group=>{group.innerHTML=languageButtons});
    bindLanguageButtons();
  }
  function setLanguage(language){
    if(!translations[language])return;
    state.language=language;
    try{localStorage.setItem("villa-language",state.language)}catch{}
    applyLanguage();
  }
  function cycleLanguage(){
    const available=Object.keys(translations);
    if(available.length<2)return;
    const index=Math.max(0,available.indexOf(state.language));
    setLanguage(available[(index+1)%available.length]);
  }
