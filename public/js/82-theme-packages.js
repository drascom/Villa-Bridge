  const themeTokenCss={
    page:"--theme-page",ink:"--theme-ink",inkSoft:"--theme-ink-soft",glassCard:"--theme-glass-card",
    glassTile:"--theme-glass-tile",glassNav:"--theme-glass-nav",glassEdge:"--theme-glass-edge",
    glassSheen:"--theme-glass-sheen",accent:"--theme-accent",accentSoft:"--theme-accent-soft",
    stateOn:"--theme-state-on",stateActive:"--theme-state-active",stateAlert:"--theme-state-alert",
    stateOffline:"--theme-state-offline",skyTop:"--theme-sky-top",skyBottom:"--theme-sky-bottom",
    sun:"--theme-sun",moon:"--theme-moon",stars:"--theme-stars",mountainFar:"--theme-mountain-far",
    mountainNear:"--theme-mountain-near"
  };
  const themeRuntime={packages:[],appearance:null,ready:false,selectedPackageId:null};
  const selectedThemePackageId=()=>{
    try{return localStorage.getItem("villa-theme-package")||themeRuntime.appearance?.defaultPackageId||"villa-liquid-glass"}
    catch{return themeRuntime.appearance?.defaultPackageId||"villa-liquid-glass"}
  };
  const activeThemePackage=()=>{
    const selected=selectedThemePackageId();
    return themeRuntime.packages.find(item=>item.id===selected)
      ||themeRuntime.packages.find(item=>item.id===themeRuntime.appearance?.defaultPackageId)
      ||themeRuntime.packages[0]
      ||null;
  };
  const themeOverride=(packageId,tone)=>{
    const item=themeRuntime.appearance?.overrides?.[packageId]||{};
    return tone==="light"||tone==="dark"?item[tone]||{}:{};
  };
  const mergeThemePalette=(base,override={})=>({
    colors:{...base.colors,...override},
    materials:{...base.materials}
  });
  const themeShadowValue=profile=>profile==="floating"
    ?"0 18px 40px rgba(8,18,28,.26)"
    :profile==="soft"?"0 10px 28px rgba(18,42,58,.16)":"none";
  function applyResolvedThemePalette(palette,meta={}){
    if(!palette?.colors)return;
    const root=document.documentElement;
    Object.entries(themeTokenCss).forEach(([token,css])=>{
      if(typeof palette.colors[token]==="string")root.style.setProperty(css,palette.colors[token]);
    });
    const material=palette.materials||{};
    root.style.setProperty("--theme-glass-blur",`${Number(material.blur)||0}px`);
    root.style.setProperty("--theme-glass-saturation",String(Number(material.saturation)||1));
    root.style.setProperty("--theme-glass-brightness",String(Number(material.brightness)||1));
    root.style.setProperty("--theme-glass-shadow",themeShadowValue(material.shadow));
    root.dataset.themePackage=activeThemePackage()?.id||"";
    if(meta.tone)root.dataset.themeTone=meta.tone;
    if(meta.resolvedTheme==="light"||meta.resolvedTheme==="dark"){
      root.dataset.theme=meta.resolvedTheme;
      root.style.colorScheme=meta.resolvedTheme;
      const themeMeta=document.querySelector('meta[name="theme-color"]');
      if(themeMeta)themeMeta.content=meta.resolvedTheme==="dark"?"#101514":"#edf0f2";
    }
    try{
      localStorage.setItem("villa-appearance-cache-v2",JSON.stringify({
        schemaVersion:2,packageId:root.dataset.themePackage,tone:meta.tone||"light",
        resolvedTheme:meta.resolvedTheme||root.dataset.theme||"light",
        sky:state.themeMode==="sun"?"live":"fixed",colors:palette.colors,materials:palette.materials
      }));
    }catch{}
  }
  function applyThemePackage(mode=state.themeMode){
    const theme=activeThemePackage();
    if(!theme)return;
    if(mode==="sun"){
      if(typeof applyCurrentCelestialTheme==="function")applyCurrentCelestialTheme();
      return;
    }
    const tone=mode==="dark"||(mode==="system"&&themeMedia?.matches)?"dark":"light";
    applyResolvedThemePalette(
      mergeThemePalette(theme.palettes[tone],themeOverride(theme.id,tone)),
      {tone,resolvedTheme:tone}
    );
  }
  async function initializeThemeRuntime(){
    try{
      const[packagesResponse,appearanceResponse]=await Promise.all([api("/api/theme-packages"),api("/api/appearance")]);
      themeRuntime.packages=Array.isArray(packagesResponse.packages)?packagesResponse.packages:[];
      themeRuntime.appearance=appearanceResponse.appearance||null;
      themeRuntime.ready=true;
      applyThemePackage();
      if(typeof renderAppearanceSettings==="function")renderAppearanceSettings();
      if(state.themeMode==="sun"&&typeof startCelestialTheme==="function")startCelestialTheme();
    }catch(error){
      console.warn("Tema paketleri yüklenemedi; güvenli CSS varsayılanı kullanılıyor.",error);
    }
  }
  async function selectThemePackage(packageId){
    if(!themeRuntime.packages.some(item=>item.id===packageId))return;
    try{localStorage.setItem("villa-theme-package",packageId)}catch{}
    themeRuntime.selectedPackageId=packageId;
    applyThemePackage();
  }
  async function saveThemeOverrides(overrides){
    if(!themeRuntime.appearance)return;
    const appearance={...themeRuntime.appearance,overrides:{...themeRuntime.appearance.overrides,...overrides}};
    const response=await api("/api/appearance",{method:"PUT",body:JSON.stringify(appearance)});
    themeRuntime.appearance=response.appearance;
    applyThemePackage();
  }
