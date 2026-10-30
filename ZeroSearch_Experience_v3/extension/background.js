const API="http://127.0.0.1:5000";
chrome.runtime.onMessage.addListener((msg,sender,sendResponse)=>{
  if(msg.type==="ZS_API"){
    fetch(API+msg.path,{method:msg.method||"GET",credentials:"include",headers:{"Content-Type":"application/json"},body:msg.body?JSON.stringify(msg.body):undefined})
      .then(async r=>{let data={};try{data=await r.json()}catch(e){};if(!r.ok){sendResponse({ok:false,status:r.status,error:data.error||(r.status===401?"Please sign in to the ZeroSearch dashboard first.":"Request failed") ,data});return;}sendResponse({ok:true,data});})
      .catch(err=>sendResponse({ok:false,error:"Cannot reach ZeroSearch backend. Start Flask at http://127.0.0.1:5000 and check extension host permissions."}));
    return true;
  }
  if(msg.type==="ZS_OPEN"&&msg.url){
    try{const u=new URL(msg.url);if(["http:","https:"].includes(u.protocol))chrome.tabs.create({url:u.href});}catch(e){}
  }
});


chrome.commands.onCommand.addListener(async command => {
  if (command !== "toggle-zerosearch") return;
  try {
    const [tab] = await chrome.tabs.query({active:true, lastFocusedWindow:true});
    if (tab && tab.id && /^https?:/.test(tab.url || "")) {
      chrome.tabs.sendMessage(tab.id, {type:"ZS_TOGGLE"}, () => { void chrome.runtime.lastError; });
    }
  } catch (e) { /* The shortcut is unavailable on browser-internal pages. */ }
});


// Capture SPA navigation transitions reliably from the extension service worker.
// The content script records normal page loads; these listeners add history API
// and fragment navigations without treating clicks on the same page as visits.
async function recordClientRoute(details) {
  if (details.frameId !== 0 || !/^https?:/.test(details.url || "")) return;
  try {
    const u = new URL(details.url);
    await fetch(API + "/api/events", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        event_type: "visit",
        label: u.pathname || u.hostname,
        page: u.href,
        domain: u.hostname,
        source: "extension-spa"
      })
    });
  } catch (e) { /* Backend may be offline; normal tracking can resume later. */ }
}
chrome.webNavigation.onHistoryStateUpdated.addListener(recordClientRoute, {
  url: [{schemes: ["http", "https"]}]
});
chrome.webNavigation.onReferenceFragmentUpdated.addListener(recordClientRoute, {
  url: [{schemes: ["http", "https"]}]
});
