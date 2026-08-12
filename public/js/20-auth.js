  function setAuthState(data){
    state.auth={
      configured:data.configured===true,
      authenticated:data.authenticated===true,
      user:data.user&&typeof data.user.username==="string"?data.user:null,
      csrfToken:typeof data.csrfToken==="string"?data.csrfToken:null,
      expiresAt:typeof data.expiresAt==="string"?data.expiresAt:null
    };
    applyAuthUi();
  }
  function setAuthFormError(id,message=""){
    const error=$("#"+id);
    error.textContent=message;
    error.hidden=!message;
  }
  function applyAuthUi(){
    const resident=state.auth.user?.role==="resident";
    document.body.classList.toggle("resident-session",resident);
    document.body.classList.toggle("auth-locked",!state.auth.authenticated);
    $(".shell").inert=!state.auth.authenticated;
    // Oturum bittiyse (düğmeyle çıkış ya da süre dolması) menü açık kalmasın: giriş kutusunun
    // önünde duran, artık hiçbir şey yapmayan bir pencere olurdu. Kapalıysa bu çağrı boştur.
    if(!state.auth.authenticated)closeAppMenu();
    $("#authAccountName").textContent=state.auth.user?.username||"—";
    $("#authRoleBadge").textContent=t(resident?"homeUser":"administrator");
    // Menü levhasının kimlik satırı: kim girmiş, hangi rolle. Oturum yoksa satır boşalır ve
    // kendi kuralıyla (`.app-menu-role:empty`) gizlenir.
    $("#appMenuRole").textContent=state.auth.user?t("signedInAs",{role:t(resident?"homeUser":"administrator")}):"";
    $$("[data-auth-logout]").forEach(button=>{button.setAttribute("aria-label",t("signOut"));button.title=t("signOut")});
    if(resident&&["automations","connections","settings"].includes(document.body.dataset.activeView))activateView("home");
  }
  function openAuthGate(){
    const setup=$("#authSetupDialog");
    const login=$("#authLoginDialog");
    renderAuthRuntimeContext();
    if(!state.auth.configured){
      login.hidden=true;
      setAuthFormError("authSetupError");
      setup.hidden=false;
      // Metin alanına odaklanmıyoruz (klavye ekranın yarısını kapatıyordu); odak kutunun
      // başlığında kalır, kullanıcı alana kendisi dokununca klavye açılır.
      requestAnimationFrame(()=>focusModalHeading(setup));
      return;
    }
    setup.hidden=true;
    setLoginMode(state.loginMode);
    setAuthFormError("authLoginError");
    login.hidden=false;
    requestAnimationFrame(()=>focusModalHeading(login));
  }
  async function loadAuthSession(){setAuthState(await api("/api/auth/session"))}
  function setLoginMode(mode){
    state.loginMode=mode==="admin"?"admin":"resident";
    $$("[data-login-mode]").forEach(button=>button.classList.toggle("active",button.dataset.loginMode===state.loginMode));
    const admin=state.loginMode==="admin";
    $("#loginUsernameField").hidden=!admin;
    $("#authLoginSecretLabel").textContent=t(admin?"adminPassword":"residentPin");
    const secret=$("#authLoginSecret");
    secret.inputMode=admin?"text":"numeric";
    if(admin)secret.removeAttribute("pattern");
    else secret.setAttribute("pattern","[0-9]{6}");
    secret.maxLength=admin?128:6;
    secret.value="";
    setAuthFormError("authLoginError");
  }
  async function submitAuthSetup(event){
    event.preventDefault();
    const button=$("#authSetupSubmit");
    setAuthFormError("authSetupError");
    button.disabled=true;
    try{
      const data=await api("/api/auth/setup",{method:"POST",body:JSON.stringify({username:$("#authSetupUsername").value,password:$("#authSetupPassword").value,residentPin:$("#authSetupPin").value})});
      setAuthState(data);
      $("#authSetupPassword").value="";
      $("#authSetupPin").value="";
      $("#authSetupDialog").hidden=true;
      await startAuthenticatedApplication();
    }catch(error){setAuthFormError("authSetupError",error.message)}
    finally{button.disabled=false}
  }
  async function submitAuthLogin(event){
    event.preventDefault();
    const button=$("#authLoginSubmit");
    setAuthFormError("authLoginError");
    button.disabled=true;
    try{
      const data=await api("/api/auth/login",{method:"POST",body:JSON.stringify({mode:state.loginMode,username:state.loginMode==="admin"?$("#authLoginUsername").value:"",secret:$("#authLoginSecret").value})});
      setAuthState(data);
      $("#authLoginSecret").value="";
      $("#authLoginDialog").hidden=true;
      await startAuthenticatedApplication();
    }catch(error){setAuthFormError("authLoginError",error.message)}
    finally{button.disabled=false}
  }
  async function signOut(){
    try{await api("/api/auth/logout",{method:"POST",body:"{}"})}catch{}
    setAuthState({configured:true,authenticated:false,user:null,csrfToken:null,expiresAt:null});
    openAuthGate();
  }
  async function updateResidentPin(event){
    event.preventDefault();
    const input=$("#residentPinInput");
    const button=event.currentTarget.querySelector('button[type="submit"]');
    button.disabled=true;
    try{
      await api("/api/auth/resident-pin",{method:"PUT",body:JSON.stringify({pin:input.value})});
      input.value="";
      showToast(t("pinChanged"));
    }catch(error){showToast(error.message,true)}
    finally{button.disabled=false}
  }
  async function updateAdminPassword(event){
    event.preventDefault();
    const next=$("#newAdminPassword");
    const confirmation=$("#confirmAdminPassword");
    const button=event.currentTarget.querySelector('button[type="submit"]');
    setAuthFormError("adminPasswordError");
    if(next.value!==confirmation.value){
      setAuthFormError("adminPasswordError",t("adminPasswordMismatch"));
      confirmation.focus();
      return;
    }
    button.disabled=true;
    try{
      await api("/api/auth/admin-password",{method:"PUT",body:JSON.stringify({newPassword:next.value})});
      next.value="";confirmation.value="";
      showToast(t("adminPasswordChanged"));
      setAuthState({configured:true,authenticated:false,user:null,csrfToken:null,expiresAt:null});
      setLoginMode("admin");
      openAuthGate();
    }catch(error){setAuthFormError("adminPasswordError",error.message)}
    finally{button.disabled=false}
  }
  async function loadInstallationOnboarding(){
    const localComplete=locallyCompletedOnboarding();
    try{
      const data=await api("/api/onboarding");
      installationOnboardingComplete=data.installation?.onboardingComplete===true;
      if(localComplete&&!installationOnboardingComplete){
        const migrated=await api("/api/onboarding",{method:"PUT",body:JSON.stringify({completed:true})});
        installationOnboardingComplete=migrated.installation?.onboardingComplete===true;
      }
    }catch{
      installationOnboardingComplete=localComplete;
    }
  }
  async function markOnboardingComplete(){
    const data=await api("/api/onboarding",{method:"PUT",body:JSON.stringify({completed:true})});
    installationOnboardingComplete=data.installation?.onboardingComplete===true;
    if(!installationOnboardingComplete)throw new Error(t("operationFailed"));
    try{localStorage.setItem(onboardingStorageKey,"true")}catch{}
  }
