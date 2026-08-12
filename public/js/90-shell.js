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
  function navigateHomeMetric(metric){
    if(metric==="alerts"){
      const alertDevice=state.devices.find(isAlert);
      if(alertDevice){showDevice(alertDevice.id);return}
      if(state.settings?.debug?.enabled===true&&state.debugErrors.length){
        activateView("settings");
        requestAnimationFrame(()=>$("#debugCard").scrollIntoView({behavior:"smooth",block:"start"}));
        return;
      }
    }
    if(metric==="signal"){
      const weakest=[...state.devices]
        .filter(device=>rawLinkQuality(device)!==null)
        .sort((a,b)=>rawLinkQuality(a)-rawLinkQuality(b))[0];
      if(weakest){showDevice(weakest.id);return}
    }
    activateView("devices");
    $("#search").value="";
    filterDevices();
    bindCards();
    requestAnimationFrame(()=>$("#allDevices").scrollIntoView({behavior:"smooth",block:"start"}));
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
  function skyMinutes(){
    if(!skyPreview){
      const now=new Date();
      return now.getHours()*60+now.getMinutes()+now.getSeconds()/60;
    }
    return ((Date.now()-skyPreviewStart)%skyPreviewCycle)/skyPreviewCycle*1440;
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
     yüzden CSS'te iki katman var: yarım-yarım aydınlık/karanlık taban + genişliği evreyle
     daralan elips. Ayın kendi ışığı yalnız YEREL bir hale (`--moon-glow`, CSS'te `box-shadow`);
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
    // Güneş soldan doğup sağdan batıyor; ay bilerek TERS yönde ilerler — kol açısı da ters.
    root.style.setProperty("--moon-angle",`${((.5-track)*180).toFixed(2)}deg`);
    root.style.setProperty("--moon-disc",Math.min(1,altitude*4).toFixed(3));
    const illumination=(1-Math.cos(2*Math.PI*phase))/2;
    root.style.setProperty("--moon-glow",illumination.toFixed(3));
    // Elipsin yarıçapı dördünlerde sıfıra iner (düz kenar), yeni ay/dolunayda diske eşitlenir.
    root.style.setProperty("--moon-term",`${(Math.abs(Math.cos(2*Math.PI*phase))*50).toFixed(2)}%`);
    // Büyürken (yeni ay → dolunay) aydınlık taraf sağdadır, küçülürken solda.
    const waxing=phase<.5;
    root.style.setProperty("--moon-left",waxing?"var(--moon-dark)":"var(--moon-lit)");
    root.style.setProperty("--moon-right",waxing?"var(--moon-lit)":"var(--moon-dark)");
    // Şişkin evrede (dördünler arası) elips aydınlığı taşır, hilalde karanlığı.
    root.style.setProperty("--moon-mid",phase>.25&&phase<.75?"var(--moon-lit)":"var(--moon-dark)");
  }
  /* GÖKYÜZÜNÜN AŞAMA AĞIRLIKLARI — şafak · gündüz · batım (gece = kalan pay). Kırılma noktaları
     gün doğumu/batımına GÖRE tanımlıdır: şafak doğuştan 72 dk önce açılır, 12 dk önce doruğa
     çıkar, 66 dk sonra tam gündüze döner; batımda aynı şey simetrik olarak tersine işler.
     Aradaki her an İKİ komşu aşamanın doğrusal karışımıdır — üç aşama aynı anda hiç açık olmaz,
     bu yüzden geçiş çamurlaşmadan yumuşak kalır. */
  function skyPhases(minutes,rise,set){
    const w={dawn:0,day:0,dusk:0};
    const blend=(from,to,low,high)=>{
      const t=Math.max(0,Math.min(1,(minutes-from)/(to-from)));
      if(low)w[low]+=1-t;
      if(high)w[high]+=t;
    };
    if(minutes<=rise-72||minutes>=set+72){/* tam gece: üç ağırlık da sıfır kalır */}
    else if(minutes<rise-12)blend(rise-72,rise-12,null,"dawn");
    else if(minutes<rise+66)blend(rise-12,rise+66,"dawn","day");
    else if(minutes<set-66)w.day=1;
    else if(minutes<set+12)blend(set-66,set+12,"day","dusk");
    else blend(set+12,set+72,"dusk",null);
    return w;
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
    // Yıldızlar gecenin payıyla belirir, şafak/batım açılırken söner. Tek bir opaklık; desen
    // CSS'te üç tekrarlı gradyan katmanı, DOM düğümü yok.
    root.style.setProperty("--star-a",(nightWeight*.9).toFixed(3));
    // GÜNEŞ KOLU: doğuşta -90°, tepede 0°, batışta +90°. Ufkun biraz altına da inebilsin diye
    // ilerleme dar bir payla dışarı taşar; disk zaten orada sönmüş olur.
    const arc=Math.max(-.12,Math.min(1.12,progress));
    root.style.setProperty("--sun-angle",`${((arc-.5)*180).toFixed(2)}deg`);
    // Disk `prefers-reduced-motion` açıkken de ÇİZİLİR (eskiden siliniyordu): hareketi CSS
    // durduruyor, gök cismini yok etmeye gerek yok.
    root.style.setProperty("--sun-disc",Math.min(1,altitude*4).toFixed(3));
    root.style.setProperty("--sun-glow",(twilight*(0.35+0.65*altitude)).toFixed(3));
    // Konum değişimlerinin geçiş süresi = yazma aralığı: açı dakikada bir yazılır ama gözle
    // sürekli kayar. Önizlemede aralık da süre de kısalır.
    root.style.setProperty("--sky-step",skyPreview?".14s":"60s");
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
    applySunGround();
    syncSunTheme();
    // "Hazır" artık işarete değil CANLI veriye bakar: işaret yedekle de konuyor, ama hava
    // servisi henüz cevap vermediyse yine sık yoklanmalı.
    const ready=sunGroundState.live===true;
    // Önizlemede sanal gün 40 sn'de dönüyor: 140 ms'lik adım yaklaşık 5 sanal dakika, yani
    // gökyüzü basamaklanmadan akar. Normalde dakikada bir yeter.
    sunGroundState.timer=setTimeout(scheduleSunGround,ready?(skyPreview?140:60000):15000);
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
