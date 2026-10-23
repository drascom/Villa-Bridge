(()=>{
  "use strict";

  const root=document.documentElement;
  const motionKey="villa-ambient-motion";
  const runtimeSource="/vendor/rive/rive.js";
  const wasmSource="/vendor/rive/rive.wasm";
  const wasmFallbackSource="/vendor/rive/rive_fallback.wasm";
  const sceneSource="/assets/villa-ambient.riv";
  const reducedMotionQuery=window.matchMedia?.("(prefers-reduced-motion: reduce)");
  let runtimePromise=null;
  let scene=null;
  let resizeObserver=null;
  let resizeFrame=0;

  function ambientSelected(){return root.dataset.backgroundEngine==="rive"}
  function motionEnabled(){
    try{return localStorage.getItem(motionKey)!=="off"}
    catch{return true}
  }
  function shouldAnimate(){return ambientSelected()&&motionEnabled()&&!document.hidden&&!reducedMotionQuery?.matches}

  function setStatus(){
    const toggle=document.querySelector("#ambientMotionToggle");
    const status=document.querySelector("#ambientMotionStatus");
    const enabled=motionEnabled();
    if(toggle){
      toggle.classList.toggle("on",enabled);
      toggle.setAttribute("aria-pressed",String(enabled));
    }
    if(status){
      const key=enabled?"ambientMotionOn":"ambientMotionOff";
      status.dataset.i18n=key;
      status.textContent=typeof t==="function"?t(key):(enabled?"On":"Off");
    }
  }

  function loadRuntime(){
    if(window.rive)return Promise.resolve(window.rive);
    if(runtimePromise)return runtimePromise;
    runtimePromise=new Promise((resolve,reject)=>{
      const existing=document.querySelector(`script[src="${runtimeSource}"]`);
      const script=existing||document.createElement("script");
      const ready=()=>window.rive?resolve(window.rive):reject(new Error("Rive runtime did not initialise"));
      script.addEventListener("load",ready,{once:true});
      script.addEventListener("error",()=>reject(new Error("Rive runtime could not be loaded")),{once:true});
      if(!existing){
        script.src=runtimeSource;
        script.async=true;
        document.head.append(script);
      }
    }).catch(error=>{
      runtimePromise=null;
      throw error;
    });
    return runtimePromise;
  }

  function resizeScene(){
    cancelAnimationFrame(resizeFrame);
    resizeFrame=requestAnimationFrame(()=>{
      resizeFrame=0;
      if(!scene)return;
      // A 1.5 DPR ceiling keeps the background crisp without spending tablet GPU time on
      // invisible pixels behind translucent cards.
      scene.resizeDrawingSurfaceToCanvas(Math.min(window.devicePixelRatio||1,1.5));
    });
  }

  function updatePlayback(){
    if(!scene)return;
    if(shouldAnimate())scene.play();
    else scene.pause();
  }

  async function ensureScene(){
    if(scene||!ambientSelected())return;
    const canvas=document.querySelector("#ambientBackground");
    if(!canvas)return;
    try{
      const rive=await loadRuntime();
      if(scene||!ambientSelected())return;
      rive.RuntimeLoader.setWasmUrl(wasmSource);
      rive.RuntimeLoader.setWasmFallbackUrl(wasmFallbackSource);
      scene=new rive.Rive({
        src:sceneSource,
        canvas,
        artboard:"Villa Ambient",
        stateMachine:"Ambient Motion",
        autoplay:true,
        layout:new rive.Layout({fit:rive.Fit.Cover,alignment:rive.Alignment.Center}),
        onLoad:()=>{
          root.dataset.ambientReady="true";
          resizeScene();
          updatePlayback();
        },
        onLoadError:error=>{
          console.warn("Ambient background could not be loaded; CSS fallback remains active.",error);
          root.dataset.ambientReady="fallback";
        }
      });
      if(typeof ResizeObserver==="function"){
        resizeObserver=new ResizeObserver(resizeScene);
        resizeObserver.observe(canvas);
      }
    }catch(error){
      console.warn("Ambient background runtime is unavailable; CSS fallback remains active.",error);
      root.dataset.ambientReady="fallback";
    }
  }

  function syncAmbientBackground(){
    setStatus();
    if(ambientSelected())ensureScene();
    updatePlayback();
  }

  function initializeAmbientBackground(){
    const toggle=document.querySelector("#ambientMotionToggle");
    toggle?.addEventListener("click",()=>{
      const enabled=!motionEnabled();
      try{localStorage.setItem(motionKey,enabled?"on":"off")}catch{}
      syncAmbientBackground();
    });
    document.addEventListener("visibilitychange",updatePlayback);
    window.addEventListener("resize",resizeScene,{passive:true});
    reducedMotionQuery?.addEventListener?.("change",updatePlayback);
    syncAmbientBackground();
  }

  window.syncAmbientBackground=syncAmbientBackground;
  window.initializeAmbientBackground=initializeAmbientBackground;
})();
