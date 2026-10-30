const $=s=>document.querySelector(s);
let activeTab=null,lastPredictions=[];
function send(path,body,method="POST"){return new Promise(resolve=>chrome.runtime.sendMessage({type:"ZS_API",path,body,method},resolve))}
function message(t){$("#message").textContent=t;setTimeout(()=>{$("#message").textContent=""},2600)}
function domain(url){try{return new URL(url).hostname}catch(e){return "Unavailable"}}
async function init(){
 const settings=await chrome.storage.local.get(["zsPaused","zsDraftOptIn"]);$("#pause").checked=!!settings.zsPaused;$("#draft").checked=!!settings.zsDraftOptIn;
 const tabs=await chrome.tabs.query({active:true,currentWindow:true});activeTab=tabs[0];
 if(!activeTab||!activeTab.url||!/^https?:/.test(activeTab.url)){ $("#site").textContent="Restricted browser page";$("#pageTitle").textContent="Open a regular website to use predictions.";$("#predictions").innerHTML='<p class="empty">Chrome internal pages do not allow content scripts.</p>';return}
 $("#site").textContent=domain(activeTab.url);$("#pageTitle").textContent=activeTab.title||activeTab.url;
 try{const r=await fetch("http://127.0.0.1:5000/api/predict?url="+encodeURIComponent(activeTab.url));const d=await r.json();lastPredictions=d.predictions||[];renderPredictions()}catch(e){$("#predictions").innerHTML='<p class="empty">Start the local Flask backend to enable predictions. Browsing tracking may be queued only after it is running.</p>'}
}
function renderPredictions(){const el=$("#predictions");if(!lastPredictions.length){el.innerHTML='<p class="empty">Not enough history yet. Browse normally and predictions will improve over time.</p>';return}el.innerHTML=lastPredictions.map((p,i)=>`<div class="prediction"><strong>${esc(p.title||p.url)}</strong><p>${esc(p.reason||"Suggested from browsing patterns")}</p><div class="meta">${Math.round((p.confidence||0)*100)}% ranking confidence · learned from local history</div><button data-open="${i}">Open destination ↗</button></div>`).join("");el.querySelectorAll("[data-open]").forEach(b=>b.onclick=()=>{const p=lastPredictions[Number(b.dataset.open)];chrome.runtime.sendMessage({type:"ZS_OPEN",url:p.url});$("#feedback").classList.remove("hidden")})}
function esc(s){return String(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
$("#pause").addEventListener("change",e=>chrome.storage.local.set({zsPaused:e.target.checked},()=>message(e.target.checked?"Tracking paused":"Tracking resumed")));
$("#draft").addEventListener("change",e=>chrome.storage.local.set({zsDraftOptIn:e.target.checked},()=>message(e.target.checked?"Local draft recovery enabled":"Local draft recovery disabled")));
$("#back").onclick=()=>{if(activeTab?.id)chrome.tabs.goBack(activeTab.id)};
$("#dashboard").onclick=()=>chrome.tabs.create({url:"http://127.0.0.1:5000"});
$("#refresh").onclick=()=>init();
$("#feedback").querySelectorAll("button").forEach(b=>b.onclick=async()=>{const p=lastPredictions[0];if(!p)return;const r=await send("/api/feedback",{prediction:p.title||p.url,domain:domain(activeTab.url),useful:b.dataset.useful==="1"});message(r?.ok?"Thanks — feedback saved locally":"Could not save feedback");$("#feedback").classList.add("hidden")});
init();
