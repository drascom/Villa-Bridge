  const celestialTheme={context:null,timer:null,previewAt:null};
  const clamp01=value=>Math.max(0,Math.min(1,value));
  const parseThemeColor=value=>{
    const text=String(value||"").trim();
    if(text.startsWith("#")){
      const body=text.slice(1);const expanded=body.length===6?`${body}ff`:body;
      if(expanded.length===8)return[0,2,4,6].map(index=>parseInt(expanded.slice(index,index+2),16)/255);
    }
    const match=text.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
    return match?[Number(match[1])/255,Number(match[2])/255,Number(match[3])/255,match[4]===undefined?1:Number(match[4])]:[0,0,0,1];
  };
  const mixedThemeColor=(entries,token)=>{
    const rgba=[0,0,0,0];
    entries.forEach(([palette,weight])=>parseThemeColor(palette.colors[token]).forEach((channel,index)=>{rgba[index]+=channel*weight}));
    return `rgba(${Math.round(rgba[0]*255)},${Math.round(rgba[1]*255)},${Math.round(rgba[2]*255)},${Math.max(0,Math.min(1,rgba[3])).toFixed(3)})`;
  };
  const solarThemeWeights=position=>{
    const altitude=Number(position?.altitudeDegrees??-18);
    const east=Number(position?.azimuthDegrees??90)<180;
    const twilight=east?"dawn":"dusk";
    const result={night:0,dawn:0,day:0,dusk:0};
    if(altitude<=-12)result.night=1;
    else if(altitude<=-.833){const amount=clamp01((altitude+12)/11.167);result.night=1-amount;result[twilight]=amount}
    else if(altitude<=8){const amount=clamp01((altitude+.833)/8.833);result[twilight]=1-amount;result.day=amount}
    else result.day=1;
    return result;
  };
  const resolvedSolarPalette=(theme,context)=>{
    const weights=solarThemeWeights(context?.sun?.position);
    const anchors=theme.palettes.solar.anchors;
    const overrides=themeRuntime.appearance?.overrides?.[theme.id]?.solar||{};
    const entries=Object.entries(weights).filter(([,weight])=>weight>0).map(([name,weight])=>[
      mergeThemePalette(anchors[name],overrides[name]||{}),weight
    ]);
    const colors={};
    Object.keys(themeTokenCss).forEach(token=>{colors[token]=mixedThemeColor(entries,token)});
    const materials={blur:0,saturation:0,brightness:0,shadow:"soft"};
    entries.forEach(([palette,weight])=>{
      materials.blur+=palette.materials.blur*weight;
      materials.saturation+=palette.materials.saturation*weight;
      materials.brightness+=palette.materials.brightness*weight;
      if(weight>.5)materials.shadow=palette.materials.shadow;
    });
    return{palette:{colors,materials},weights};
  };
  function applyCurrentCelestialTheme(){
    const theme=activeThemePackage();
    const context=celestialTheme.context;
    if(!theme||!context)return;
    const resolved=resolvedSolarPalette(theme,context);
    const dominant=Object.entries(resolved.weights).sort((left,right)=>right[1]-left[1])[0]?.[0]||"night";
    const resolvedTheme=Number(context.sun?.position?.altitudeDegrees??-18)>-.833?"light":"dark";
    applyResolvedThemePalette(resolved.palette,{tone:dominant,resolvedTheme});
    const root=document.documentElement;
    root.style.setProperty("--sky",`var(--star-field),linear-gradient(180deg,${resolved.palette.colors.skyTop},${resolved.palette.colors.skyBottom})`);
    root.style.setProperty("--sun-core",resolved.palette.colors.sun);
    root.style.setProperty("--sun-mid",resolved.palette.colors.sun);
    root.style.setProperty("--moon-color",resolved.palette.colors.moon);
    const sun=context.sun?.position;
    const moon=context.moon?.position;
    if(sun){root.style.setProperty("--solar-altitude",`${sun.altitudeDegrees.toFixed(3)}deg`);root.style.setProperty("--solar-azimuth",`${sun.azimuthDegrees.toFixed(3)}deg`)}
    if(moon){root.style.setProperty("--lunar-altitude",`${moon.altitudeDegrees.toFixed(3)}deg`);root.style.setProperty("--lunar-azimuth",`${moon.azimuthDegrees.toFixed(3)}deg`)}
    root.dataset.moonVisible=context.moon?.aboveHorizon?"on":"off";
  }
  async function refreshCelestialTheme(){
    if(!state.auth.authenticated||state.themeMode!=="sun")return;
    const query=celestialTheme.previewAt?`?at=${encodeURIComponent(celestialTheme.previewAt.toISOString())}`:"";
    try{
      const response=await api(`/api/celestial${query}`);
      celestialTheme.context=response.celestial;
      applyCurrentCelestialTheme();
    }catch(error){console.warn("Yerel astronomi bağlamı alınamadı.",error)}
  }
  function startCelestialTheme(){
    clearInterval(celestialTheme.timer);
    void refreshCelestialTheme();
    celestialTheme.timer=setInterval(refreshCelestialTheme,60000);
  }
  function stopCelestialTheme(){clearInterval(celestialTheme.timer);celestialTheme.timer=null}
  function setCelestialPreview(at){celestialTheme.previewAt=at instanceof Date?at:null;void refreshCelestialTheme()}
