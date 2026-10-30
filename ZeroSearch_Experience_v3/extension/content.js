(() => {
  if (window.top !== window) return;
  const API = "http://127.0.0.1:5000";
  const sensitive = /password|passwd|passcode|otp|cvv|cvc|card|credit|debit|bank|ssn|social.?security|secret|token|auth|pin/i;
  const skipInput = el => !el || el.type === "password" || ["cc-number","cc-csc","current-password","new-password"].includes(el.autocomplete) ||
    sensitive.test([el.name,el.id,el.autocomplete,el.getAttribute("aria-label")].join(" "));
  let paused=false, draftOptIn=false, focusOn=false, linksOn=false, readingOn=false;
  chrome.storage.local.get(["zsPaused","zsDraftOptIn"],v=>{paused=!!v.zsPaused;draftOptIn=!!v.zsDraftOptIn;});
  function send(path,body){try{chrome.runtime.sendMessage({type:"ZS_API",path,method:"POST",body},()=>{});}catch(e){}}
  function track(type,label,href="",element=""){
    if(paused)return;
    send("/api/events",{event_type:type,label:label||document.title,page:location.href,domain:location.hostname,href,element,source:"extension"});
  }
  track("visit",document.title);

  function analyzePage(){
    const fields=[...document.querySelectorAll("input:not([type=hidden]):not([type=submit]),textarea,select")].filter(el=>el.getClientRects().length);
    const unlabeled=fields.filter(el=>{
      if(el.type==="button"||el.type==="submit"||el.type==="reset"||el.type==="checkbox"||el.type==="radio")return false;
      const id=el.id;
      return !(el.labels&&el.labels.length) && !(id&&document.querySelector(`label[for="${CSS.escape(id)}"]`)) &&
        !el.getAttribute("aria-label")&&!el.getAttribute("aria-labelledby")&&!el.placeholder;
    }).length;
    const headings=[...document.querySelectorAll("h1,h2,h3")].filter(el=>el.getClientRects().length);
    const h1=document.querySelectorAll("h1").length;
    const links=[...document.querySelectorAll("a[href]")].filter(el=>el.getClientRects().length);
    const emptyLinks=links.filter(a=>!(a.innerText||a.getAttribute("aria-label")||a.querySelector("img[alt]")?.alt||"").trim()).length;
    const buttons=[...document.querySelectorAll("button,[role=button],input[type=submit]")].filter(el=>el.getClientRects().length);
    const vague=buttons.filter(b=>/^(click here|here|submit|more|read more|learn more)$/i.test((b.innerText||b.value||b.getAttribute("aria-label")||"").trim())).length;
    const words=(document.body.innerText||"").trim().split(/\s+/).filter(Boolean).length;
    const issues=[];
    if(fields.length>=6)issues.push({level:"warn",title:"Form feels heavy",detail:`${fields.length} visible fields may create friction. Group related questions and show only what is needed.`});
    if(unlabeled)issues.push({level:"risk",title:"Inputs need clearer labels",detail:`${unlabeled} visible field(s) lack a persistent label or accessible name. Add explicit labels for clarity and assistive technology.`});
    if(h1!==1)issues.push({level:"warn",title:"Page hierarchy could be clearer",detail:`Found ${h1} H1 headings. Aim for one descriptive main heading, followed by logical H2/H3 sections.`});
    if(emptyLinks)issues.push({level:"risk",title:"Some links have no clear name",detail:`${emptyLinks} visible link(s) have no readable text or accessible name.`});
    if(vague)issues.push({level:"warn",title:"Make actions more specific",detail:`${vague} button(s) use generic wording. Describe the outcome, such as “Download report” instead of “Click here”.`});
    if(words>1800)issues.push({level:"info",title:"Long page detected",detail:`About ${words.toLocaleString()} words are visible in the page text. Add a contents list, summaries, or clearer section breaks.`});
    if(!issues.length)issues.push({level:"good",title:"No obvious friction signals",detail:"The quick scan found no major issues in its basic checks. This is a heuristic, not a full accessibility audit."});
    const score=Math.max(35,Math.min(100,100-unlabeled*9-emptyLinks*7-vague*4-Math.max(0,fields.length-4)*2-(h1!==1?8:0)-(words>1800?5:0)));
    return {score,fields:fields.length,links:links.length,headings:headings.length,issues,words};
  }
  function mountFloatingAssistant(){
    if(!document.documentElement||document.getElementById("zs-floating-root"))return;
    const root=document.createElement("div");root.id="zs-floating-root";root.setAttribute("data-zerosearch-widget","true");
    Object.assign(root.style,{all:"initial",position:"fixed",right:"22px",bottom:"22px",zIndex:"2147483647",display:"block",visibility:"visible",opacity:"1",pointerEvents:"auto",width:"auto",height:"auto",overflow:"visible",transform:"none"});
    for(const [k,v] of Object.entries({all:"initial",position:"fixed",right:"22px",bottom:"22px",zIndex:"2147483647",display:"block",visibility:"visible",opacity:"1",pointerEvents:"auto",width:"auto",height:"auto",overflow:"visible",transform:"none"}))root.style.setProperty(k,v,"important");
    const shadow=root.attachShadow({mode:"open"});
    shadow.innerHTML=`
      <style>
      :host{all:initial!important;position:fixed!important;right:22px!important;bottom:22px!important;z-index:2147483647!important;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important;color:#172033!important}
      *{box-sizing:border-box}button{font:inherit}
      .launcher{position:relative;width:60px;height:60px;border:1px solid #ffffffd9;border-radius:21px;background:linear-gradient(145deg,#7c5cff 0%,#6157f5 52%,#278bff 100%);color:white;display:grid;place-items:center;cursor:pointer;box-shadow:0 12px 34px #4e46e866,0 0 0 6px #8377ff1b;transition:transform .24s cubic-bezier(.2,.8,.2,1),box-shadow .24s;outline:none}
      .launcher:hover{transform:translateY(-4px) scale(1.035);box-shadow:0 18px 42px #4e46e877,0 0 0 8px #8377ff2a}.launcher:active{transform:scale(.96)}
      .launcher .spark{font-size:27px;filter:drop-shadow(0 2px 5px #312e8166)}.launcher .halo{position:absolute;inset:-5px;border:1px solid #8b80ff5c;border-radius:25px;animation:pulse 3.4s ease-out infinite;pointer-events:none}
      @keyframes pulse{0%{transform:scale(.93);opacity:.7}80%,100%{transform:scale(1.22);opacity:0}}
      .tip{position:absolute;right:70px;bottom:13px;white-space:nowrap;padding:8px 11px;border-radius:10px;background:#17182c;color:#fff;border:1px solid #ffffff20;font-size:11px;font-weight:700;box-shadow:0 8px 24px #02061730;pointer-events:none;opacity:0;transform:translateX(5px);transition:.18s}.launcher:hover .tip{opacity:1;transform:translateX(0)}
      .panel{display:none;width:368px;max-width:calc(100vw - 28px);margin-bottom:13px;border:1px solid #e6e9f5;border-radius:25px;overflow:hidden;background:#f8f9ff;color:#172033;box-shadow:0 28px 90px #1c245044,0 3px 12px #24264b12;transform-origin:bottom right}
      .panel.open{display:block;animation:rise .26s cubic-bezier(.2,.8,.2,1)}@keyframes rise{from{opacity:0;transform:translateY(13px) scale(.965)}to{opacity:1;transform:translateY(0) scale(1)}}
      .top{position:relative;padding:18px 18px 16px;background:radial-gradient(ellipse at 0% 0%,#8f78ff66,transparent 55%),linear-gradient(120deg,#202342,#292a55 68%,#294d7e);color:white}
      .topline{display:flex;align-items:center;justify-content:space-between}.brandrow{display:flex;align-items:center;gap:11px}.logo{width:39px;height:39px;border-radius:14px;background:linear-gradient(145deg,#b5a4ff,#7866ff 58%,#4b9cff);display:grid;place-items:center;font-size:21px;border:1px solid #ffffff66;box-shadow:0 7px 18px #0b0d3b40}
      .brand{font-size:16px;font-weight:850;letter-spacing:-.45px}.sub{font-size:10px;color:#d2d8f7;margin-top:4px}.close{border:1px solid #ffffff35;background:#ffffff12;color:#fff;border-radius:11px;width:31px;height:31px;font-size:20px;cursor:pointer;transition:background .15s}.close:hover{background:#ffffff2b}
      .topnote{margin-top:15px;display:flex;align-items:center;gap:8px;font-size:11px;color:#e6e8ff}.live{width:7px;height:7px;border-radius:50%;background:#77f0c2;box-shadow:0 0 0 4px #77f0c21c}
      .body{padding:14px 15px 13px;max-height:min(72vh,620px);overflow:auto}.welcome{display:flex;align-items:flex-start;gap:10px;padding:12px;border-radius:16px;background:linear-gradient(120deg,#eeebff,#eaf4ff);border:1px solid #e0e3ff;margin-bottom:13px}.welcomeicon{width:29px;height:29px;flex:0 0 29px;border-radius:10px;display:grid;place-items:center;background:white;color:#6c58ed;box-shadow:0 2px 7px #5a55a31a;font-size:15px}.welcometitle{font-size:12px;font-weight:800;color:#252747;margin-bottom:4px}.welcome p{font-size:10px;line-height:1.5;color:#69708c;margin:0}
      .scoreline{display:flex;align-items:center;gap:12px;padding:12px;border:1px solid #e8eaf5;background:white;border-radius:16px;margin-bottom:13px}.scorecircle{width:49px;height:49px;flex:0 0 49px;border-radius:16px;background:conic-gradient(#7a66f6 0 78%,#eeedfb 78% 100%);display:grid;place-items:center;position:relative}.scorecircle:before{content:"";position:absolute;inset:4px;border-radius:12px;background:white}.scorecircle strong{z-index:1;font-size:13px;color:#4e46a6}.scoretitle{font-size:11px;font-weight:800;color:#252747}.scoretext{font-size:10px;color:#8a90a7;margin-top:4px;line-height:1.45}.tag{margin-left:auto;align-self:flex-start;background:#f0edff;color:#6554d7;border-radius:8px;padding:5px 7px;font-size:9px;font-weight:800;white-space:nowrap}
      .section{display:flex;align-items:center;justify-content:space-between;margin:16px 2px 8px}.sectionlabel{font-size:9px;letter-spacing:1.1px;text-transform:uppercase;font-weight:850;color:#8a90a8}.sectionhint{font-size:9px;color:#9ba1b5}
      .tiles{display:grid;grid-template-columns:1fr 1fr;gap:8px}.tile{min-width:0;text-align:left;padding:11px;border:1px solid #e8eaf5;border-radius:15px;background:#fff;color:#252747;cursor:pointer;transition:transform .18s,border-color .18s,box-shadow .18s}.tile:hover{transform:translateY(-2px);border-color:#c9c2ff;box-shadow:0 7px 16px #4641a10d}.tile:active{transform:scale(.98)}.tileicon{width:29px;height:29px;border-radius:10px;background:#f0edff;color:#6b58e9;display:grid;place-items:center;font-size:15px;margin-bottom:9px}.tile strong{display:block;font-size:10px;font-weight:800}.tile small{display:block;font-size:9px;line-height:1.4;color:#8b91a7;margin-top:4px}
      .scanresult{display:none;margin-top:9px;padding:10px;border-radius:14px;border:1px solid #e3e4f4;background:white}.scanresult.show{display:block;animation:rise .18s ease}.scanhead{font-size:11px;font-weight:850;margin-bottom:8px;color:#35345f}.issue{padding:8px 0;border-top:1px solid #f0f0f8}.issue:first-of-type{border-top:0}.issuetop{display:flex;align-items:center;gap:7px;font-size:10px;font-weight:800}.flag{width:7px;height:7px;border-radius:50%;background:#e8a23c;flex:0 0 7px}.flag.risk{background:#f16d87}.flag.good{background:#2bbf94}.issue p{margin:4px 0 0 14px;font-size:9px;line-height:1.5;color:#7f859b}
      .suggestions{display:none;margin:0 0 13px;padding:12px;border:1px solid #dfe5f6;border-radius:17px;background:linear-gradient(145deg,#fff,#f4f7ff)}.suggestions.show{display:block;animation:rise .22s ease-out}.suggesttitle{font-size:11px;font-weight:850;color:#35345f;margin-bottom:4px}.suggestsub{font-size:9px;color:#858ba2;line-height:1.5;margin-bottom:7px}.suggestitem{padding:9px 0;border-top:1px solid #e9ecf7}.suggestlink{display:flex;justify-content:space-between;align-items:center;gap:8px;text-decoration:none;color:#5546c6;font-size:10px;font-weight:750;overflow-wrap:anywhere}.suggestlink:hover{text-decoration:underline}.confidence{background:#f0edff;border-radius:7px;padding:4px 6px;font-size:9px;font-weight:800;white-space:nowrap}.suggestreason{font-size:9px;color:#7e879f;line-height:1.4;margin:5px 0 7px}.feedbackrow{display:flex;align-items:center;gap:6px}.feedbacklabel{font-size:9px;color:#8991a7;margin-right:auto}.feedbackbtn{border:1px solid #e2e6f2;background:#fff;color:#626b83;border-radius:8px;padding:5px 8px;font-size:10px;cursor:pointer;transition:all .15s}.feedbackbtn:hover{border-color:#9387ff;color:#5c4bd1;transform:translateY(-1px)}.feedbackbtn:disabled{opacity:.65;cursor:default}.prediction-empty{font-size:10px;color:#7f879f;line-height:1.5;margin:6px 0 2px}.predict-retry{border:0;background:#edeaff;color:#5c4bd1;border-radius:9px;padding:7px 10px;font-size:10px;font-weight:800;cursor:pointer;margin-top:8px}
      .controls{display:flex;gap:7px;margin-top:9px}.control{flex:1;border:1px solid #e5e7f3;border-radius:11px;padding:9px 7px;background:#fff;color:#666d87;font-size:9px;font-weight:750;cursor:pointer;transition:.15s}.control:hover{border-color:#c9c2ff;color:#5c4ad0}.control.active{background:#ece9ff;border-color:#cfc7ff;color:#5b49cf}
      .status{font-size:10px;color:#7e84a0;padding:10px 2px 2px;line-height:1.45;min-height:23px}.foot{border-top:1px solid #eceef6;padding:11px 15px;display:flex;justify-content:space-between;align-items:center;font-size:9px;color:#9298ad;background:#ffffffb8}.privacy{display:flex;align-items:center;gap:5px}.privacydot{width:6px;height:6px;border-radius:50%;background:#31bd94}.kbd{border:1px solid #e2e4f1;background:#fff;border-radius:5px;padding:3px 5px;color:#7c8299;font-size:8px}
      button:focus-visible,a:focus-visible{outline:3px solid #8b7bff;outline-offset:2px}
      @media(max-width:480px){:host{right:14px!important;bottom:14px!important}.panel{width:calc(100vw - 28px);max-width:calc(100vw - 28px)}.launcher{width:56px;height:56px;border-radius:19px}.tip{display:none}}
      @media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}
      
      /* ZeroSearch 3.0 Aurora skin */
      .panel{width:390px;max-width:calc(100vw - 28px);border:1px solid #3b4566;border-radius:27px;background:linear-gradient(155deg,#11182a 0%,#10192b 55%,#132a32 100%);color:#edf3ff;box-shadow:0 32px 100px #020617aa,0 0 0 1px #ffffff08;backdrop-filter:blur(22px)}
      .top{padding:20px 19px 17px;background:radial-gradient(ellipse at 88% 0%,#3a8f8b65,transparent 45%),radial-gradient(ellipse at 0% 0%,#8d76ff60,transparent 48%),linear-gradient(120deg,#171d39,#172d42 100%);border-bottom:1px solid #ffffff12}
      .logo{background:linear-gradient(145deg,#b7a5ff,#7b83ff 55%,#5ce2c1);border-color:#ffffff50;box-shadow:0 8px 22px #07101f66}
      .brand{color:#f5f7ff;font-size:16px}.sub{color:#aab8d7}.close{background:#ffffff0c;border-color:#ffffff25;color:#dce7ff}
      .topnote{color:#c3cee5}.live{background:#62e6bd;box-shadow:0 0 0 4px #62e6bd1b}
      .body{padding:15px 16px 14px;max-height:min(74vh,650px);scrollbar-color:#465275 transparent}
      .welcome{background:linear-gradient(120deg,#222548,#17353b);border-color:#34395d}.welcomeicon{background:#34315f;color:#c1b5ff;box-shadow:none}.welcometitle{color:#f1f3ff}.welcome p{color:#9eafd0}
      .scoreline{background:linear-gradient(120deg,#151f33,#16212f);border-color:#2b3854}.scorecircle{background:conic-gradient(#68e2c0 0 78%,#29344e 78% 100%)}.scorecircle:before{background:#172133}.scorecircle strong{color:#eafff9}.scoretitle{color:#eaf0ff}.scoretext{color:#8fa0c0}.tag{background:#27254c;color:#c0b2ff}
      .sectionlabel{color:#8f9fbe}.sectionhint{color:#6f809f}
      .tile{background:linear-gradient(145deg,#172238,#141e30);border-color:#2a3752;color:#eef3ff}.tile:hover{background:linear-gradient(145deg,#20294a,#17353c);border-color:#6a6ba5;box-shadow:0 10px 25px #02061766}.tileicon{background:#28254e;color:#bfb2ff}.tile strong{color:#eff3ff}.tile small{color:#8799b8}
      .scanresult,.suggestions{background:linear-gradient(145deg,#121d2e,#14243a);border-color:#2b3853}.scanhead,.suggesttitle{color:#e7edff}.issue{border-color:#27334a}.issue p{color:#91a2bf}.suggestlink{color:#c4bbff}.suggestsub,.suggestreason,.feedbacklabel,.prediction-empty{color:#9aabc6}.suggestitem{border-color:#2a3851}.confidence{background:#28264d;color:#c3b7ff}.feedbackbtn{background:#1b2940;color:#d8e2f7;border-color:#35435d}.feedbackbtn:hover{border-color:#8b80ff;color:#d6ccff}.predict-retry{background:#292a50;color:#d6ccff}
      .control{background:#172238;border-color:#2c3853;color:#9aa9c6}.control:hover{background:#222b49;border-color:#7773bd;color:#d2c9ff}.control.active{background:#173d3b;border-color:#32776b;color:#85f0d2}
      .status{color:#91a3c2}.foot{background:#0f1828;border-color:#27334b;color:#8393b0}.privacydot{background:#61e5bc}.kbd{background:#121d2f;border-color:#35415d;color:#aab8d1}
      .launcher{width:62px;height:62px;border-radius:22px;background:linear-gradient(145deg,#b09aff 0%,#767dff 48%,#46d8bb 100%);box-shadow:0 14px 38px #6e75ff48,0 0 0 6px #66dfc019}
      .launcher:hover{box-shadow:0 18px 48px #6e75ff60,0 0 0 8px #66dfc02b}
      .launcher .halo{border-color:#72e7d46b}
      .tip{background:#e9fff9;color:#15323a;border-color:#b7f3e6;box-shadow:0 10px 25px #02061766}
      .tile:focus-visible,.control:focus-visible,.close:focus-visible,.launcher:focus-visible{outline:3px solid #77e7d1;outline-offset:3px}
      @media(max-width:480px){.panel{width:calc(100vw - 28px)}}

      /* v4.1: robust destination-label alignment + smoother glass motion */
      .suggestions{overflow:hidden;min-width:0}
      .suggestitem{min-width:0;padding:10px;border-radius:14px;margin:8px 0;animation:zsSuggestionIn .34s cubic-bezier(.2,.75,.2,1) both}
      .suggestitem:nth-of-type(1){animation-delay:35ms}.suggestitem:nth-of-type(2){animation-delay:80ms}.suggestitem:nth-of-type(3){animation-delay:125ms}
      .suggestlink{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:8px;width:100%;min-width:0;line-height:1.4;overflow:hidden}
      .suggestlink>span:first-child{display:block;min-width:0;max-width:100%;overflow-wrap:anywhere;word-break:break-word;white-space:normal;line-height:1.4}
      .suggestlink .confidence{justify-self:end;align-self:start;flex:0 0 auto;max-width:100%;white-space:nowrap}
      .suggestreason{overflow-wrap:anywhere;word-break:break-word}
      .feedbackrow{min-width:0;flex-wrap:wrap}.feedbacklabel{min-width:0;flex:1 1 auto}
      @keyframes zsSuggestionIn{from{opacity:0;transform:translateY(8px) scale(.99)}to{opacity:1;transform:translateY(0) scale(1)}}
      .close,.feedbackbtn,.predict-retry,.launcher{transition:transform .22s cubic-bezier(.2,.8,.2,1),background .22s,border-color .22s,box-shadow .22s}
      .close:hover,.feedbackbtn:hover,.predict-retry:hover{transform:translateY(-1px)}
      @media(prefers-reduced-motion:reduce){.suggestitem{animation:none!important}}

      /* v4 glass motion polish: subtle, non-blocking and reduced-motion aware */
      .panel{background:linear-gradient(145deg,rgba(17,25,43,.94),rgba(14,27,43,.9) 65%,rgba(15,47,52,.88));border-color:#9bace52b;box-shadow:0 35px 110px #020617b8,inset 0 1px #ffffff08;backdrop-filter:blur(28px) saturate(135%);animation:zsGlassIn .36s cubic-bezier(.2,.75,.2,1) both}
      .top{background:radial-gradient(ellipse at 88% 0%,#3a9e9560,transparent 45%),radial-gradient(ellipse at 0% 0%,#8d76ff62,transparent 48%),linear-gradient(120deg,#171d39ed,#172d42e8)}
      .tile,.control,.suggestitem{transition:transform .2s ease,border-color .2s ease,box-shadow .2s ease,background .2s ease}
      .tile:hover{transform:translateY(-2px);box-shadow:0 12px 28px #02061766}.suggestitem{background:linear-gradient(125deg,#1a2740cc,#16343acc);border-color:#a0b2e51c;border-radius:14px}
      .launcher{animation:zsBreathe 4.2s ease-in-out infinite;backdrop-filter:blur(14px)}.launcher .halo{animation:zsHalo 3s ease-out infinite}
      @keyframes zsGlassIn{from{opacity:0;transform:translateY(9px) scale(.985)}to{opacity:1;transform:translateY(0) scale(1)}}
      @keyframes zsBreathe{0%,100%{box-shadow:0 14px 38px #6e75ff48,0 0 0 6px #66dfc019}50%{box-shadow:0 18px 46px #6e75ff5c,0 0 0 9px #66dfc01e}}
      @keyframes zsHalo{0%{transform:scale(.88);opacity:.65}100%{transform:scale(1.5);opacity:0}}
      @media(prefers-reduced-motion:reduce){.panel,.launcher,.launcher .halo{animation:none!important}}
      </style>
      <section class="panel" id="panel" role="dialog" aria-label="ZeroSearch usability copilot" aria-modal="false">
       <header class="top"><div class="topline"><div class="brandrow"><div class="logo">✦</div><div><div class="brand">ZeroSearch</div><div class="sub">Predictive usability copilot</div></div></div><button class="close" id="close" aria-label="Close assistant">×</button></div><div class="topnote"><span class="live"></span><span>Ready to reduce your next search</span><span class="kbd" style="margin-left:auto">ALT + SHIFT + Z</span></div></header>
       <div class="body">
        <div class="suggestions show" id="suggestions" aria-live="polite"><div class="suggesttitle">Your next likely steps</div><div class="suggestsub">Suggestions appear automatically when you open ZeroSearch. You decide what to open.</div><p class="prediction-empty">Checking your local navigation patterns…</p></div>
        <div class="welcome"><div class="welcomeicon">✧</div><div><div class="welcometitle">A smoother way through the web</div><p>Spot friction, find the next step, and stay focused — without taking control away from you.</p></div></div>
        <div class="scoreline"><div class="scorecircle" id="scorecircle"><strong id="score">--</strong></div><div><div class="scoretitle">Page clarity snapshot</div><div class="scoretext" id="scoretext">Run a quick local scan to estimate usability signals.</div></div><span class="tag">HEURISTIC</span></div>
        <div class="section"><span class="sectionlabel">Smart tools</span><span class="sectionhint">One tap · reversible</span></div>
        <div class="tiles">
         <button class="tile" id="scan"><span class="tileicon">⌕</span><strong>Scan this page</strong><small>Find labels, hierarchy and friction</small></button>
         <button class="tile" id="predict"><span class="tileicon">✧</span><strong>Refresh suggestions</strong><small>Update predicted next steps</small></button>
         <button class="tile" id="focus"><span class="tileicon">◉</span><strong id="focusTitle">Focus mode</strong><small>Quiet visual distractions</small></button>
         <button class="tile" id="highlight"><span class="tileicon">↗</span><strong id="highlightTitle">Show all links</strong><small>Reveal clickable destinations</small></button>
         <button class="tile" id="reading"><span class="tileicon">Aa</span><strong id="readingTitle">Reading mode</strong><small>Calmer text, better line length</small></button>
         <button class="tile" id="navigator"><span class="tileicon">☷</span><strong>Page navigator</strong><small>Reading time, page outline and quick jumps</small></button>
        </div>
        <div class="scanresult" id="scanresult" aria-live="polite"></div>
        <div class="scanresult" id="navigatorresult" aria-live="polite"></div>
        <div class="section"><span class="sectionlabel">Quick controls</span><span class="sectionhint">You stay in charge</span></div>
        <div class="controls"><button class="control" id="back">↶ &nbsp; Go back</button><button class="control" id="dashboard">▦ &nbsp; Insights</button><button class="control" id="pause">Ⅱ &nbsp; Pause tracking</button></div>
        <div class="controls"><button class="control" id="draft">▤ &nbsp; Form recovery off</button><button class="control" id="refresh">↻ &nbsp; Refresh scan</button></div>
        <div class="status" id="status" aria-live="polite">Everything stays under your control. Scan results are generated on this page.</div>
       </div>
       <footer class="foot"><span class="privacy"><span class="privacydot"></span> Privacy-first controls</span><span>Local page analysis · No auto-navigation</span></footer>
      </section>
      <button class="launcher" id="toggle" aria-label="Open ZeroSearch" title="Open ZeroSearch"><span class="halo"></span><span class="spark">✦</span><span class="tip">Open ZeroSearch</span></button>`;
    document.documentElement.appendChild(root);
    const q=id=>shadow.getElementById(id),panel=q("panel"),toggle=q("toggle");
    function status(msg){q("status").textContent=msg;}
    function sync(){
      q("pause").textContent=paused?"▶  Resume tracking":"Ⅱ  Pause tracking";
      q("draft").textContent=draftOptIn?"▤  Form recovery on":"▤  Form recovery off";
      q("focusTitle").textContent=focusOn?"Exit focus mode":"Focus mode";
      q("highlightTitle").textContent=linksOn?"Hide link outlines":"Show all links";
      q("readingTitle").textContent=readingOn?"Exit reading mode":"Reading mode";
      q("focus").classList.toggle("active",focusOn);q("highlight").classList.toggle("active",linksOn);q("reading").classList.toggle("active",readingOn);
    }
    let lastPredictionItems=[];
    function open(){panel.classList.add("open");toggle.style.display="none";sync();loadPredictions();}
    function close(){panel.classList.remove("open");toggle.style.display="grid";}
    toggle.addEventListener("click",open);q("close").addEventListener("click",close);
    q("scan").addEventListener("click",()=>{
      const r=analyzePage(),area=q("scanresult");q("score").textContent=r.score;
      q("scorecircle").style.background=`conic-gradient(${r.score>=85?"#2bbf94":r.score>=65?"#8b7af6":"#f16d87"} 0 ${r.score}%,#eeedfb ${r.score}% 100%)`;
      q("scoretext").textContent=`${r.fields} fields · ${r.links} links · ${r.headings} headings. A quick heuristic, not a formal audit.`;
      area.replaceChildren();const h=document.createElement("div");h.className="scanhead";h.textContent=`${r.issues.length} observations on this page`;area.appendChild(h);
      r.issues.forEach(issue=>{const row=document.createElement("div");row.className="issue";const top=document.createElement("div");top.className="issuetop";const dot=document.createElement("span");dot.className="flag "+(issue.level==="risk"?"risk":issue.level==="good"?"good":"");const title=document.createElement("span");title.textContent=issue.title;top.append(dot,title);const p=document.createElement("p");p.textContent=issue.detail;row.append(top,p);area.appendChild(row);});
      area.classList.add("show");status("Page scan complete. Recommendations are based on visible page structure only.");track("usability_scan",`Score ${r.score}; ${r.issues.length} observations`);
    });
    function loadPredictions(){
      const area=q("suggestions");area.classList.add("show");area.replaceChildren();
      const title=document.createElement("div");title.className="suggesttitle";title.textContent="Your next likely steps";area.appendChild(title);
      const sub=document.createElement("div");sub.className="suggestsub";sub.textContent="Predictions from your local navigation patterns. Nothing opens automatically.";area.appendChild(sub);
      const loading=document.createElement("p");loading.className="prediction-empty";loading.textContent="Finding useful next steps…";area.appendChild(loading);
      chrome.runtime.sendMessage({type:"ZS_API",path:"/api/predict?url="+encodeURIComponent(location.href),method:"GET"},reply=>{
        area.replaceChildren();area.append(title,sub);
        const items=reply&&reply.ok&&reply.data&&Array.isArray(reply.data.predictions)?reply.data.predictions:[];lastPredictionItems=items.slice(0,3);
        if(!reply||!reply.ok){const p=document.createElement("p");p.className="prediction-empty";p.textContent="Can't reach the local engine. Make sure the Flask backend is running and you're signed in to the dashboard.";area.appendChild(p);status("Prediction service is unavailable. Check the local backend and sign-in.");return;}
        if(!lastPredictionItems.length){const p=document.createElement("p");p.className="prediction-empty";p.textContent="Not enough same-site navigation history yet. Browse a few pages on this website, then refresh.";area.appendChild(p);const retry=document.createElement("button");retry.className="predict-retry";retry.textContent="Try again";retry.addEventListener("click",loadPredictions);area.appendChild(retry);status("More same-site browsing history is needed.");return;}
        lastPredictionItems.forEach((item,index)=>{
          const row=document.createElement("div");row.className="suggestitem";
          const a=document.createElement("a");a.className="suggestlink";a.href=item.url;a.target="_blank";a.rel="noopener noreferrer";
          let host=item.url;try{host=new URL(item.url).hostname;}catch(e){}
          const label=document.createElement("span");label.textContent=item.title||host;
          const confidence=document.createElement("span");confidence.className="confidence";confidence.textContent=Math.round((Number(item.confidence)||0)*100)+"% match";a.append(label,confidence);a.title=item.reason||"Based on observed navigation patterns";
          const reason=document.createElement("div");reason.className="suggestreason";reason.textContent=item.reason||"Suggested from browsing patterns";
          const feedback=document.createElement("div");feedback.className="feedbackrow";
          const prompt=document.createElement("span");prompt.className="feedbacklabel";prompt.textContent="Helpful?";feedback.appendChild(prompt);
          [[1,"👍 Yes"],[0,"👎 No"]].forEach(([useful,text])=>{const b=document.createElement("button");b.className="feedbackbtn";b.type="button";b.textContent=text;b.addEventListener("click",()=>{b.disabled=true;chrome.runtime.sendMessage({type:"ZS_API",path:"/api/feedback",method:"POST",body:{prediction:item.title||item.url,domain:location.hostname,useful:!!useful}},result=>{if(result&&result.ok){feedback.replaceChildren();const thanks=document.createElement("span");thanks.className="feedbacklabel";thanks.textContent="Thanks — feedback recorded";feedback.appendChild(thanks);status("Thanks! Your recommendation feedback was recorded.");track("recommendation_feedback",useful?"Helpful recommendation":"Unhelpful recommendation",item.url,"feedback");}else{b.disabled=false;status("Feedback could not be saved. Check the backend and sign-in state.");}});});feedback.appendChild(b);});
          row.append(a,reason,feedback);area.appendChild(row);
        });
        status("Predictions are ready. Choose a destination or rate a suggestion.");track("prediction_requested","Next steps loaded automatically");
      });
    }
    q("navigator").addEventListener("click",()=>{
      const area=q("navigatorresult");area.replaceChildren();area.classList.add("show");
      const heading=document.createElement("div");heading.className="scanhead";heading.textContent="Page navigator";area.appendChild(heading);
      const source=document.querySelector("article, main, [role='main'], .mw-parser-output, .article, .post")||document.body;
      const paragraphs=Array.from(source.querySelectorAll("p,li"))
        .filter(el=>!el.closest("#zs-floating-root,nav,header,footer,aside,[aria-hidden='true']")&&el.getClientRects().length)
        .map(el=>(el.innerText||"").replace(/\s+/g," ").trim()).filter(t=>t.length>0);
      const words=paragraphs.join(" ").split(/\s+/).filter(Boolean).length;
      const stats=document.createElement("div");stats.className="issue";
      const top=document.createElement("div");top.className="issuetop";
      const dot=document.createElement("span");dot.className="flag good";
      const statTitle=document.createElement("span");statTitle.textContent="Reading estimate";top.append(dot,statTitle);
      const statText=document.createElement("p");statText.textContent=`About ${Math.max(1,Math.ceil(words/220))} min read · ${words.toLocaleString()} words detected · based on visible page text.`;
      stats.append(top,statText);area.appendChild(stats);
      const heads=Array.from(source.querySelectorAll("h1,h2,h3,h4"))
        .filter(el=>!el.closest("#zs-floating-root,nav,header,footer,aside,[aria-hidden='true']")&&el.getClientRects().length&&el.innerText.trim())
        .slice(0,15);
      const outlineTitle=document.createElement("div");outlineTitle.className="issuetop";outlineTitle.style.margin="10px 0 6px";
      const outlineDot=document.createElement("span");outlineDot.className="flag good";
      const outlineLabel=document.createElement("span");outlineLabel.textContent=`Page outline${heads.length?` · ${heads.length}${heads.length===15?"+":""} sections`:""}`;outlineTitle.append(outlineDot,outlineLabel);area.appendChild(outlineTitle);
      if(heads.length){
        const list=document.createElement("div");list.style.cssText="display:grid;gap:6px;margin-bottom:10px";
        heads.forEach((h,i)=>{
          if(!h.id)h.id=`zs-outline-${Date.now().toString(36)}-${i}`;
          const jump=document.createElement("button");jump.className="predict-retry";jump.style.cssText=`text-align:left;white-space:normal;line-height:1.4;padding:9px 10px;margin:0 0 0 ${Math.max(0,Number(h.tagName.slice(1))-1)*8}px`;
          jump.textContent=h.innerText.trim().replace(/\s+/g," ");jump.title="Jump to section";
          jump.addEventListener("click",()=>{h.scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"start"});h.setAttribute("tabindex","-1");h.focus({preventScroll:true});status(`Jumped to: ${h.innerText.trim().slice(0,100)}`);});list.appendChild(jump);
        });area.appendChild(list);
      }else{const empty=document.createElement("p");empty.className="issue";empty.textContent="No visible section headings were found on this page.";area.appendChild(empty);}
      const actions=document.createElement("div");actions.style.cssText="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px";
      const copyLink=document.createElement("button");copyLink.className="predict-retry";copyLink.textContent="Copy page link";
      copyLink.addEventListener("click",async()=>{try{await navigator.clipboard.writeText(location.href);status("Page link copied.");}catch(e){status("Clipboard unavailable on this page.");}});
      const topButton=document.createElement("button");topButton.className="predict-retry";topButton.textContent="Back to top";topButton.addEventListener("click",()=>window.scrollTo({top:0,behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"}));
      actions.append(copyLink,topButton);area.appendChild(actions);
      status("Page navigator ready. Reading estimates are approximate and all analysis stays in this tab.");track("page_navigator","Page outline and reading estimate shown",location.href,"navigator");
    });
    q("predict").addEventListener("click",loadPredictions);
    q("focus").addEventListener("click",()=>{
      focusOn=!focusOn;let s=document.getElementById("zs-focus-style");
      if(focusOn){if(!s){s=document.createElement("style");s.id="zs-focus-style";s.textContent=`body :is(header,nav,aside,[role="banner"],[role="navigation"],[role="complementary"],.ads,.advertisement,[aria-label*="advert" i]){transition:opacity .2s ease!important}body :is(.ads,.advertisement,[aria-label*="advert" i]){opacity:.12!important}body :is(header,nav,aside,[role="banner"],[role="navigation"],[role="complementary"]){opacity:.42!important}body main,body article,[role="main"]{filter:drop-shadow(0 0 0 transparent)}html{scroll-behavior:smooth!important}`;document.documentElement.appendChild(s);}status("Focus mode on: navigation and common ad regions are softened. Select again to restore.");}
      else{if(s)s.remove();status("Focus mode off. Original page appearance restored.");}sync();
    });
    q("highlight").addEventListener("click",()=>{
      linksOn=!linksOn;let s=document.getElementById("zs-link-style");
      if(linksOn){if(!s){s=document.createElement("style");s.id="zs-link-style";s.textContent=`a[href]{outline:2px solid #7c5cff!important;outline-offset:2px!important;border-radius:3px!important;background-color:#8b7aff14!important}button,[role="button"],input[type="submit"]{outline:2px dashed #0ea5e9!important;outline-offset:2px!important}`;document.documentElement.appendChild(s);}status("Interactive elements are outlined. Select again to clear the outlines.");}
      else{if(s)s.remove();status("Link highlighting cleared.");}sync();
    });
    q("reading").addEventListener("click",()=>{
      readingOn=!readingOn;let s=document.getElementById("zs-reading-style");
      if(readingOn){
        if(!s){s=document.createElement("style");s.id="zs-reading-style";s.textContent=`html{scroll-behavior:smooth!important}body :is(main,article,[role="main"],.article,.content,.post){max-width:860px!important;margin-left:auto!important;margin-right:auto!important}body :is(p,li,dd,blockquote){line-height:1.85!important;letter-spacing:.01em!important}body :is(article,main,[role="main"]){font-size:1.04em!important}body :is(.ads,.advertisement,[aria-label*="advert" i]){opacity:.18!important}`;document.documentElement.appendChild(s);}
        status("Reading mode on: calmer line spacing and a more comfortable reading width where supported.");
      }else{if(s)s.remove();status("Reading mode off. Original page styling restored.");}
      sync();
    });
    q("back").addEventListener("click",()=>{history.back();close();});
    q("dashboard").addEventListener("click",()=>{window.open(API,"_blank","noopener");status("Opening your insights dashboard.");});
    q("pause").addEventListener("click",()=>{paused=!paused;chrome.storage.local.set({zsPaused:paused},()=>{sync();status(paused?"Activity tracking paused.":"Activity tracking resumed.");});});
    q("draft").addEventListener("click",()=>{draftOptIn=!draftOptIn;chrome.storage.local.set({zsDraftOptIn:draftOptIn},()=>{sync();status(draftOptIn?"Form recovery enabled for eligible fields on this device.":"Form recovery disabled.");});});
    q("refresh").addEventListener("click",()=>q("scan").click());
    document.addEventListener("keydown",e=>{if(e.key==="Escape"&&panel.classList.contains("open"))close();});
    chrome.runtime.onMessage.addListener(msg=>{if(msg&&msg.type==="ZS_TOGGLE"){panel.classList.contains("open")?close():open();}});
    document.addEventListener("click",e=>{if(panel.classList.contains("open")&&!e.composedPath().includes(root))close();},true);
    sync();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",mountFloatingAssistant,{once:true});else mountFloatingAssistant();
  const widgetObserver=new MutationObserver(()=>{if(document.documentElement&&!document.getElementById("zs-floating-root"))mountFloatingAssistant();});
  if(document.documentElement)widgetObserver.observe(document.documentElement,{childList:true});
  document.addEventListener("click",e=>{
    const el=e.target.closest("a,button,[role=button],input[type=submit]");if(!el||el.closest("#zs-floating-root"))return;
    const label=(el.innerText||el.getAttribute("aria-label")||el.title||el.value||"Interactive element").trim().slice(0,180);
    track("click",label,el.href||"",el.tagName.toLowerCase());
  },true);
  // Optional local-only drafts; never send form field values to the backend.
  function draftKey(){return "zs-draft:"+location.origin+location.pathname;}
  function saveDraft(){
    if(!draftOptIn||paused)return;
    const draft={url:location.href,title:document.title,at:Date.now(),fields:{}};
    document.querySelectorAll("input,textarea,select").forEach((el,i)=>{
      if(skipInput(el)||(!el.name&&!el.id)||el.type==="file"||el.type==="hidden")return;
      const key=(el.name||el.id||"field"+i).slice(0,100);
      if(el.type==="checkbox"||el.type==="radio")draft.fields[key]={type:el.type,value:el.checked};
      else if(el.tagName==="SELECT")draft.fields[key]={type:"select",value:el.value};
      else draft.fields[key]={type:"text",value:String(el.value||"").slice(0,5000)};
    });
    chrome.storage.local.set({[draftKey()]:draft});
  }
  let saveTimer;
  document.addEventListener("input",()=>{clearTimeout(saveTimer);saveTimer=setTimeout(saveDraft,800)},true);
  document.addEventListener("change",saveDraft,true);
  function offerRestore(){
    if(!draftOptIn)return;
    chrome.storage.local.get(draftKey(),result=>{
      const d=result[draftKey()];if(!d||!d.fields||Date.now()-d.at>7*24*60*60*1000||document.getElementById("zs-restore-draft"))return;
      const btn=document.createElement("button");btn.id="zs-restore-draft";btn.textContent="Restore saved draft";btn.setAttribute("aria-label","Restore saved form draft");
      Object.assign(btn.style,{position:"fixed",bottom:"18px",right:"94px",zIndex:"2147483646",padding:"11px 14px",border:"1px solid #ffffff",borderRadius:"12px",background:"linear-gradient(135deg,#7c5cff,#3988ff)",color:"#fff",font:"700 12px system-ui",boxShadow:"0 8px 22px #4e46e844",cursor:"pointer"});
      btn.addEventListener("click",()=>{
        document.querySelectorAll("input,textarea,select").forEach((el,i)=>{
          if(skipInput(el)||(!el.name&&!el.id)||el.type==="file")return;
          const key=(el.name||el.id||"field"+i).slice(0,100),item=d.fields[key];if(!item)return;
          if(item.type==="checkbox"||item.type==="radio")el.checked=!!item.value;else el.value=item.value;
          el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));
        });btn.remove();
      });document.documentElement.appendChild(btn);
    });
  }
  setTimeout(offerRestore,900);
  chrome.storage.onChanged.addListener(changes=>{if(changes.zsPaused)paused=!!changes.zsPaused.newValue;if(changes.zsDraftOptIn){draftOptIn=!!changes.zsDraftOptIn.newValue;offerRestore();}});
})();