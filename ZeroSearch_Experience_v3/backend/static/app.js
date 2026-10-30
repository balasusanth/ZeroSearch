const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const names={overview:["Overview","Make the next step effortless.","A clearer view of your browsing patterns, friction signals, and useful shortcuts."],predictions:["Smart predictions","Turn patterns into useful next steps.","Explainable recommendations stay under your control."],shortcuts:["Quick workflows","Get to the places you use most.","Save trusted destinations and open them in one click."],radar:["Usability Radar","Spot possible friction before it becomes a pattern.","Signals from consenting local browsing activity — not definitive judgments."],scorecard:["Personal scorecard","A lightweight reflection on your browsing experience.","A transparent experimental indicator, not a scientific website rating."],accessibility:["Accessibility companion","Make ZeroSearch work better for you.","Adjust the dashboard to your reading and motion preferences."],privacy:["Privacy & controls","Your data, your controls.","A local-first prototype with visible tracking controls."]};
function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2500)}
function showView(view){$$(".view").forEach(v=>v.classList.add("hidden"));$("#"+view+"View").classList.remove("hidden");$$(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.view===view));$("#crumbTitle").textContent=names[view][0];$("#pageTitle").textContent=names[view][1];$("#pageSubtitle").textContent=names[view][2];if(view==="shortcuts")loadShortcuts();if(view==="scorecard")loadScore();if(view==="radar")loadAnalytics();if(view==="overview")loadAnalytics();window.scrollTo({top:0,behavior:"smooth"})}
$$(".nav-item").forEach(b=>b.addEventListener("click",()=>showView(b.dataset.view)));
$$("[data-goto]").forEach(b=>b.addEventListener("click",()=>showView(b.dataset.goto)));
$("#refreshBtn").addEventListener("click",()=>{loadAnalytics();toast("Local insights refreshed")});
$("#openExtensionHelp").addEventListener("click",()=>{showView("privacy");toast("Follow the README to load the extension")});
async function api(url,opts={}){const r=await fetch(url,{headers:{"Content-Type":"application/json"},...opts});if(!r.ok)throw new Error((await r.json()).error||"Request failed");return r.json()}
function safeText(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
async function loadAnalytics(){try{const d=await api("/api/analytics");$("#mEvents").textContent=d.metrics.events;$("#mPredictions").textContent=d.metrics.predictions;$("#mUseful").textContent=d.metrics.feedback_total?Math.round(100*d.metrics.useful_feedback/d.metrics.feedback_total)+"%":"—";$("#feedbackLabel").textContent=d.metrics.feedback_total?`${d.metrics.useful_feedback} marked useful`:"Waiting for feedback";$("#mFriction").textContent=d.friction.backtrack_signals+d.friction.repeat_page_signals;$("#backtrackCount").textContent=d.friction.backtrack_signals;$("#repeatCount").textContent=d.friction.repeat_page_signals;$("#activityList").innerHTML=d.recent.length?d.recent.map(e=>`<div class="activity"><span class="activity-mark">${e.event_type==="click"?"↗":"◉"}</span><div class="activity-copy"><strong>${safeText(e.label||e.page||"Page visit")}</strong><small>${safeText(e.domain||"Unknown domain")} · ${safeText(e.event_type)}</small></div><time>${safeText((e.created_at||"").replace("T"," ").slice(0,16))}</time></div>`).join(""):`<div class="empty">No events yet. Load the extension and browse a few pages.</div>`;$("#domainList").innerHTML=d.domains.length?d.domains.map(x=>`<div class="domain-row"><span class="domain-icon">◎</span><span class="domain-name">${safeText(x.domain||"Unknown domain")}</span><span class="domain-count">${x.n} events</span></div>`).join(""):`<div class="empty">Domain insights will appear after browsing.</div>`}catch(e){$("#activityList").innerHTML='<div class="empty">Backend not connected. Start the Flask server using the README instructions.</div>'}}
async function loadShortcuts(){try{const d=await api("/api/shortcuts");$("#shortcutsList").innerHTML=d.shortcuts.length?d.shortcuts.map(s=>`<div class="shortcut"><span class="shortcut-icon">↗</span><div><strong>${safeText(s.title)}</strong><a href="${safeText(s.url)}" target="_blank" rel="noopener">${safeText(s.url)}</a></div><button title="Remove shortcut" data-delete="${s.id}">×</button></div>`).join(""):'<div class="empty">No shortcuts saved yet. Add a trusted destination above.</div>';$$("[data-delete]").forEach(b=>b.onclick=async()=>{await api("/api/shortcuts/"+b.dataset.delete,{method:"DELETE"});loadShortcuts();toast("Shortcut removed")})}catch(e){toast("Start the backend first")}}
$("#shortcutForm").addEventListener("submit",async e=>{e.preventDefault();try{await api("/api/shortcuts",{method:"POST",body:JSON.stringify({title:$("#shortcutTitle").value,url:$("#shortcutUrl").value})});e.target.reset();loadShortcuts();toast("Shortcut saved")}catch(err){toast(err.message)}});
async function loadScore(){try{const d=await api("/api/scorecard");$("#scoreValue").textContent=d.score;$("#scoreRing").style.setProperty("--score-angle",(d.score*3.6)+"deg");$("#scoreLabel").textContent=d.score>=80?"Helpful patterns emerging":d.score>=55?"Building your baseline":"More activity needed";$("#scoreText").textContent=d.label+". This score uses simple rules and should not be interpreted as an objective measure.";$("#scoreDetails").innerHTML=`<span>${d.details.useful_recommendations} useful recommendations</span><span>${d.details.feedback_count} feedback responses</span><span>${d.details.repeated_page_groups} repeated-page groups</span><span>${d.details.events_in_window} recent events</span>`}catch(e){toast("Start the backend first")}}
$("#shortcutTitle").setAttribute("maxlength","100");
$$("[data-scale]").forEach(b=>b.addEventListener("click",()=>{document.documentElement.style.setProperty("--scale",b.dataset.scale);$$("[data-scale]").forEach(x=>x.classList.toggle("active",x===b));localStorage.setItem("zs-scale",b.dataset.scale)}));
$("#contrastToggle").addEventListener("change",e=>{document.body.classList.toggle("high-contrast",e.target.checked);localStorage.setItem("zs-contrast",e.target.checked)});
$("#motionToggle").addEventListener("change",e=>{document.body.classList.toggle("reduce-motion",e.target.checked);localStorage.setItem("zs-motion",e.target.checked)});
(function restore(){const s=localStorage.getItem("zs-scale")||"1";document.documentElement.style.setProperty("--scale",s);$$("[data-scale]").forEach(b=>b.classList.toggle("active",b.dataset.scale===s));$("#contrastToggle").checked=localStorage.getItem("zs-contrast")==="true";document.body.classList.toggle("high-contrast",$("#contrastToggle").checked);$("#motionToggle").checked=localStorage.getItem("zs-motion")==="true";document.body.classList.toggle("reduce-motion",$("#motionToggle").checked)})();
loadAnalytics();

// Functional profile and workspace menus (including the previously inert sidebar controls).
function toggleMenu(menu, button) {
  const willOpen = menu.classList.contains("hidden");
  $$(".dropdown-menu").forEach(m => m.classList.add("hidden"));
  [$("#workspaceBtn"), $("#profileBtn")].filter(Boolean).forEach(b => b.setAttribute("aria-expanded","false"));
  menu.classList.toggle("hidden", !willOpen);
  button.setAttribute("aria-expanded", String(willOpen));
}
$("#workspaceBtn")?.addEventListener("click", e => {
  e.stopPropagation(); toggleMenu($("#workspaceMenu"), $("#workspaceBtn"));
});
$("#profileBtn")?.addEventListener("click", e => {
  if (e.target.closest("form")) return;
  e.stopPropagation(); toggleMenu($("#profileMenu"), $("#profileBtn"));
});
$("#topProfileBtn")?.addEventListener("click", e => {
  e.stopPropagation(); toggleMenu($("#profileMenu"), $("#topProfileBtn"));
  $("#profileMenu").classList.add("top-open");
});
$("#profileBtn")?.addEventListener("click", () => $("#profileMenu").classList.remove("top-open"));
document.addEventListener("click", e => {
  if (!e.target.closest(".workspace-wrap,.profile-wrap,.top-profile")) {
    $$(".dropdown-menu").forEach(m => m.classList.add("hidden"));
    $("#profileMenu")?.classList.remove("top-open");
    [$("#workspaceBtn"),$("#profileBtn"),$("#topProfileBtn")].filter(Boolean).forEach(b=>b.setAttribute("aria-expanded","false"));
  }
});
$$("[data-workspace]").forEach(button => button.addEventListener("click", () => {
  const name=button.dataset.workspace;
  $("#workspaceName").textContent=name;
  localStorage.setItem("zs-workspace-name",name);
  $("#workspaceMenu").classList.add("hidden");
  $("#workspaceBtn").setAttribute("aria-expanded","false");
  toast(name+" selected");
}));
$("#profileSettingsBtn")?.addEventListener("click", () => {
  $("#profileMenu").classList.add("hidden");
  toast("Account is managed through your signed-in profile.");
});
const savedWorkspace=localStorage.getItem("zs-workspace-name");
if(savedWorkspace) $("#workspaceName").textContent=savedWorkspace;

// Train the actual scikit-learn model from locally recorded navigation sequences.
function percent(value){return value===null||value===undefined?"—":`${(value*100).toFixed(1)}%`}
function renderEvaluation(data){
  const e=data.evaluation||{};
  $("#evalState").textContent=data.trained?(e.top1_accuracy==null?"TRAINED · LIMITED DATA":"HOLDOUT EVALUATED"):"NOT TRAINED";
  $("#evalTop1").textContent=percent(e.top1_accuracy);
  $("#evalTop3").textContent=percent(e.top3_accuracy);
  $("#evalBase1").textContent=percent(e.baseline_top1_accuracy);
  $("#evalBase3").textContent=percent(e.baseline_top3_accuracy);
  $("#evalCounts").textContent=data.trained?`${e.train_transitions??"—"} train · ${e.holdout_transitions??"—"} holdout transitions · ${data.classes??"—"} destination classes`:"No trained model available.";
  if(e.top1_accuracy!=null&&e.baseline_top1_accuracy!=null){
    const delta=(e.top1_accuracy-e.baseline_top1_accuracy)*100;
    $("#evalComparison").textContent=delta>0.05?`ML is ${delta.toFixed(1)} percentage points above baseline on this holdout.`:delta< -0.05?`ML is ${Math.abs(delta).toFixed(1)} percentage points below baseline on this holdout.`:"ML and baseline are tied on this holdout.";
  }else $("#evalComparison").textContent="Collect more diverse transitions for a reliable comparison.";
  $("#evalNote").textContent=e.evaluation_note||"Results are an estimate from a chronological holdout, not a guarantee of real-world usefulness.";
}
async function loadModelStatus(){
  try{const data=await api("/api/model/status");if(data.trained){$("#modelStatus").textContent=`Saved ${data.algorithm} · ${data.examples} transitions · ${data.classes} destination classes`;renderEvaluation(data)}else{$("#modelStatus").textContent=data.message;renderEvaluation(data)}}catch(err){$("#modelStatus").textContent=err.message}
}
$("#trainModelBtn")?.addEventListener("click", async () => {
  const btn=$("#trainModelBtn"), status=$("#modelStatus");
  btn.disabled=true; btn.textContent="Training & evaluating…"; status.textContent="Building a chronological holdout and comparing the baseline…";
  try {
    const result=await api("/api/model/train",{method:"POST",body:JSON.stringify({})});
    status.textContent=result.trained
      ? `Trained ${result.algorithm} on ${result.examples} transitions across ${result.classes} destination classes. Evaluation saved with the local model.`
      : `${result.message} Current examples: ${result.examples||0}.`;
    renderEvaluation(result);
    toast(result.trained ? "Model trained and evaluated" : "More browsing examples needed");
  } catch(err) {
    status.textContent=err.message;
    toast("Model training unavailable");
  } finally {btn.disabled=false;btn.textContent="Train & evaluate";}
});
loadModelStatus();
