const DEFAULT_API_BASE = "https://binuyp.origami.ms/nodered-app";
const API_BASE = (new URLSearchParams(location.search).get("api") || DEFAULT_API_BASE).replace(/\/+$/, "");
const apiUrl = path => API_BASE + (path.startsWith("/") ? path : "/" + path);
const qs=new URLSearchParams(location.search);
let ASSETS={};
async function loadAssets(){
try{
const response=await fetch(apiUrl("/assets"),{cache:"force-cache"});
if(!response.ok)throw new Error("Assets HTTP "+response.status);
const data=await response.json();
ASSETS=data&&typeof data==="object"?data:{};
}catch(error){
console.warn("[ASSETS] load failed",error);
ASSETS={};
}
}
function assetUrl(type,fallback="building_generic"){
return ASSETS[type]||ASSETS[fallback]||"";
}
const state={
site:{id:qs.get("siteId")||"",name:qs.get("siteName")||"אתר"},
requestedBuildingId:qs.get("buildingId")||"",
building:null,floor:null,room:null,
inventoryType:"__all__",
inventorySubject:"__all__",
data:{buildings:null,floors:null,rooms:null,inventory:null,reviews:null},
complete:{buildings:false,floors:false,rooms:false,inventory:false,reviews:false},
progress:{buildings:null,floors:null,rooms:null,inventory:null,reviews:null},
loading:{buildings:false,floors:false,rooms:false,inventory:false,reviews:false}
};
const CFG={
buildings:{entity:"e_82",siteField:"fld_1934"},
floors:{entity:"e_83",siteField:"fld_1827"},
rooms:{entity:"e_88",siteField:"fld_1198"},
inventory:{entity:"inventory",siteField:"fld_1118.instance_id"},
reviews:{entity:"e_123",siteField:"fld_1941"}
};
const $=s=>document.querySelector(s);
const arr=v=>Array.isArray(v)?v:[];
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const STRUCTURE_CACHE_VERSION="v5.reviewsAndHierarchy";
function rowsOf(j){
if(Array.isArray(j))return j;
for(const x of [j?.payload,j?.rows,j?.data?.instance_data,j?.instance_data,j?.data,j?.results])if(Array.isArray(x))return x;
return[];
}
function totalOf(j){
for(const v of [
j?.total_count,j?.info?.total_count,j?.data?.total_count,j?.meta?.total_count,
j?.pagination?.total_count,j?.response?.info?.total_count
]){
if(v!==undefined&&v!==null&&v!==""&&Number.isFinite(Number(v)))return Number(v);
}
return null;
}
function sourceLoaded(source){return arr(state.data[source]).length}
function sourceTotal(source){
const p=state.progress[source];
return p&&Number.isFinite(Number(p.total))?Number(p.total):null;
}
function sourceProgressText(source){
const loaded=sourceLoaded(source),total=sourceTotal(source);
if(total!==null)return `${loaded} / ${total}`;
return String(loaded);
}
function saveStructureSnapshot(){
try{
const key="siteP.structureCache."+String(state.site.id);
const snapshot={
version:STRUCTURE_CACHE_VERSION,
site:{id:state.site.id,name:state.site.name||""},
savedAt:Date.now(),
buildings:arr(state.data.buildings),
floors:arr(state.data.floors),
rooms:arr(state.data.rooms),
inventory:arr(state.data.inventory),
reviews:arr(state.data.reviews),
data:{
buildings:arr(state.data.buildings),
floors:arr(state.data.floors),
rooms:arr(state.data.rooms),
inventory:arr(state.data.inventory),
reviews:arr(state.data.reviews)
},
complete:{...state.complete},
progress:{...state.progress}
};
sessionStorage.setItem(key,JSON.stringify(snapshot));
}catch(error){
console.warn("[STRUCTURE] snapshot save failed",error);
}
}
function refreshCurrentView(){
if(!Array.isArray(state.data.buildings))return;
const currentBuildingId=state.building?.id;
const currentFloorId=state.floor?.id;
const currentRoomId=state.room?.id;
if(currentRoomId){
state.building=arr(state.data.buildings).find(x=>String(x.id)===String(currentBuildingId))||state.building;
state.floor=arr(state.data.floors).find(x=>String(x.id)===String(currentFloorId))||state.floor;
state.room=arr(state.data.rooms).find(x=>String(x.id)===String(currentRoomId))||state.room;
renderRoom(); return;
}
if(currentFloorId){
state.building=arr(state.data.buildings).find(x=>String(x.id)===String(currentBuildingId))||state.building;
state.floor=arr(state.data.floors).find(x=>String(x.id)===String(currentFloorId))||state.floor;
renderFloor(); return;
}
if(currentBuildingId){
state.building=arr(state.data.buildings).find(x=>String(x.id)===String(currentBuildingId))||state.building;
renderBuilding(); return;
}
renderBuildings();
}
async function loadSource(source){
if(state.loading[source]||state.complete[source])return arr(state.data[source]);
state.loading[source]=true;
const c=CFG[source],count=500;
let all=arr(state.data[source]).slice();
let skip=all.length;
let knownTotal=sourceTotal(source);
/* Resume only from rows that are actually present in this snapshot.
If siteP tells us "19 loaded" but did not pass those 19 rows, starting at 19
would create a hole. In that case we safely restart that source at 0. */
const handedLoaded=Number(state.progress[source]?.loaded);
if(Number.isFinite(handedLoaded)&&handedLoaded!==all.length){
console.warn("[STRUCTURE] progress/rows mismatch; safe restart",source,{progressLoaded:handedLoaded,rows:all.length});
all=[];skip=0;
}
state.data[source]=all;
state.progress[source]={loaded:all.length,total:knownTotal};
try{
while(true){
const r=await fetch(apiUrl("/sites/getMore"),{
method:"POST",
headers:{"Content-Type":"application/json"},
body:JSON.stringify({
source,entity:c.entity,skip,count,
filters:[[c.siteField,"=",String(state.site.id)]]
})
});
if(!r.ok)throw new Error(source+" "+r.status);
const text=await r.text();
const j=text.trim()?JSON.parse(text):[];
const rows=rowsOf(j);
const responseTotal=totalOf(j);
if(responseTotal!==null)knownTotal=responseTotal;
all.push(...rows);
state.data[source]=all;
state.progress[source]={loaded:all.length,total:knownTotal};
state.complete[source]=knownTotal!==null ? all.length>=knownTotal : rows.length<count;
saveStructureSnapshot();
refreshCurrentView();
if(state.complete[source])break;
if(!rows.length)break;
/* skip is the number of rows we truly own, not a guessed page number. */
skip=all.length;
}
return all;
}finally{
state.loading[source]=false;
saveStructureSnapshot();
}
}
function nameBuilding(b){return b?.name||("מבנה "+(b?.number||""))}
function floorNo(f){return f?.floor??f?.floorNumber??f?.number??f?.name??""}
function nameRoom(r){return r?.name||("חדר "+(r?.number||""))}
function belongs(item,key,id){return id && String(item?.[key]??"")===String(id)}
function uniqueInventory(items){
const seen=new Set();
return arr(items).filter((item,index)=>{
const key=String(item?.id||item?.instance_id||item?.recordId||("row:"+index));
if(seen.has(key))return false;
seen.add(key);return true;
});
}
function roomInventory(r){
return uniqueInventory(arr(state.data.inventory).filter(i=>belongs(i,"roomId",r.id)));
}
function floorInventory(f){
const roomIds=new Set(roomsOfFloor(f).map(r=>String(r.id)));
return uniqueInventory(arr(state.data.inventory).filter(i=>
belongs(i,"floorId",f.id) || (i?.roomId && roomIds.has(String(i.roomId)))
));
}
function buildingInventory(b){
const floorIds=new Set(floorsOf(b).map(f=>String(f.id)));
const roomIds=new Set(roomsOfBuilding(b).map(r=>String(r.id)));
return uniqueInventory(arr(state.data.inventory).filter(i=>
belongs(i,"buildingId",b.id) ||
(i?.floorId && floorIds.has(String(i.floorId))) ||
(i?.roomId && roomIds.has(String(i.roomId)))
));
}
function inventoryTypeOf(i){return String(i?.inventoryType||i?.type||"ללא סוג").trim()||"ללא סוג"}
function inventorySubjectOf(i){return String(i?.subject||i?.subjectName||i?.category||"ללא נושא").trim()||"ללא נושא"}
function inventoryNameOf(i){return i?.name||i?.inventoryName||i?.type||"פריט אינוונטר"}
function inventoryScopeText(i){
return [i?.buildingName,i?.floorName,i?.roomName].filter(Boolean).join(" · ")||
i?.buildingDescription||i?.location||"רמת אתר";
}
function inventoryForCurrentScope(){
if(state.room)return roomInventory(state.room);
if(state.floor)return floorInventory(state.floor);
if(state.building)return buildingInventory(state.building);
return arr(state.data.inventory);
}
function inventorySubjectTabs(items,type){
const inType=type==="__all__"?items:items.filter(i=>inventoryTypeOf(i)===type);
const counts=new Map();
inType.forEach(i=>counts.set(inventorySubjectOf(i),(counts.get(inventorySubjectOf(i))||0)+1));
return [["__all__","הכל",inType.length],...[...counts.entries()].sort((a,b)=>a[0].localeCompare(b[0],"he")).map(([name,count])=>[name,name,count])];
}
function inventoryIcon(type){
const t=String(type||"").toLowerCase();
if(/חשמל|electric/.test(t))return"⚡";
if(/מים|אינסטל|water|plumb/.test(t))return"◉";
if(/מיזוג|מזג|air|hvac/.test(t))return"❄";
if(/אש|כיבוי|fire/.test(t))return"♨";
if(/דלת|שער|door|gate/.test(t))return"▯";
if(/ריהוט|furn/.test(t))return"▤";
if(/תקשורת|מחש|network|computer/.test(t))return"⌘";
return type==="__all__"?"◇":"◆";
}
function subjectSvg(subject){
const t=String(subject||"").trim().toLowerCase();
const svg=(body)=>`<svg viewBox="0 0 72 64" aria-hidden="true" fill="none" xmlns="http://www.w3.org/2000/svg"><g stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`;
if(/ביוב|שפכים|שאיב|מכוני שאיבה|משאבות|מערכות שאיבה/.test(t))return svg('<path d="M10 19h20v10h15v12h17"/><path d="M16 19v-7h8v7M46 41v10h10V41"/><circle cx="55" cy="41" r="7"/><path d="M8 52c8-6 14 6 22 0s14 6 22 0"/>');
if(/תרנים/.test(t))return svg('<path d="M36 8v48M25 56h22M29 44h14M31 32h10M33 20h6"/><path d="M25 14c-8 7-8 15 0 22M47 14c8 7 8 15 0 22"/>');
if(/תכנון|בנייה/.test(t))return svg('<path d="M10 48h52M16 48V22l20-12 20 12v26M26 48V34h20v14"/><path d="M12 16h13M48 12h12M53 7v10"/>');
if(/שער/.test(t))return svg('<path d="M12 54V15h48v39M20 54V23h32v31"/><path d="M20 31h32M36 23v31"/>');
if(/שיפוצ|אחזקה|כללי/.test(t))return svg('<path d="M14 50l16-16M27 18l9 9-8 8-9-9z"/><path d="M40 45l13 13M43 18c5-5 12-5 17-2l-8 8 4 4 8-8c3 6 2 12-3 17-5 5-12 6-18 2L25 57l-10-10 18-18c-4-6-3-13 2-18"/>');
if(/שילוט|תמרור/.test(t))return svg('<path d="M35 56V31M20 31h31l8-10-8-10H20z"/><path d="M27 21h20"/>');
if(/פסולת/.test(t))return svg('<path d="M20 20h32l-3 36H23zM16 20h40M27 20v-7h18v7"/><path d="M31 29v17M41 29v17"/>');
if(/טעינה/.test(t))return svg('<rect x="17" y="8" width="31" height="48" rx="5"/><path d="M25 18h15M27 35l7-11v9h7L31 46v-9h-4zM48 20h5l5 7v16"/>');
if(/עפר|אקרשטיין/.test(t))return svg('<path d="M8 50h56M15 44l12-20 13 20M34 44l10-15 13 15"/><path d="M11 54h12M28 54h12M45 54h12"/>');
if(/נגרות|מדפים/.test(t))return svg('<path d="M12 50h48M18 50V20h36v30M18 31h36M18 41h36"/><path d="M25 20v-7h22v7"/>');
if(/מתקני אימונים/.test(t))return svg('<path d="M12 51h48M18 51V23h36v28M24 23V14h24v9"/><path d="M27 34h18M30 42h12"/>');
if(/מפוחים|מאוורר/.test(t))return svg('<circle cx="36" cy="32" r="7"/><path d="M36 25c-2-11 4-17 12-15 5 7 1 15-7 19M42 35c10 4 13 12 8 19-9 1-14-6-13-15M31 36c-8 8-16 7-20 0 2-9 10-11 18-6"/>');
if(/אנרגיה|גנרטור/.test(t))return svg('<rect x="12" y="17" width="48" height="34" rx="5"/><path d="M20 27h13M20 35h9M44 24l-7 12h7l-5 11 13-15h-8l5-8z"/>');
if(/מיזוג|מזג|מ\.א/.test(t))return svg('<rect x="10" y="14" width="52" height="36" rx="6"/><path d="M18 24h36M18 31h36"/><path d="M27 41c3-4 6-4 9 0s6 4 9 0"/>');
if(/מעליות/.test(t))return svg('<rect x="17" y="9" width="38" height="47" rx="4"/><path d="M36 9v47M25 20l5-5 5 5M47 45l-5 5-5-5"/>');
if(/מסגרות|אלומיניום/.test(t))return svg('<path d="M13 53h46V15H13zM22 44l28-20M22 24l28 20"/><circle cx="36" cy="34" r="5"/>');
if(/מים חמים|פיצוצי מים|אינסטלציה/.test(t))return svg('<path d="M12 25h25v10h13v12M22 25V15h10v10"/><path d="M50 47c0 7 10 7 10 0 0-4-5-10-5-10s-5 6-5 10z"/>');
if(/מדחסים/.test(t))return svg('<rect x="13" y="26" width="46" height="24" rx="7"/><circle cx="27" cy="38" r="7"/><path d="M34 38h16M20 26V16h24v10M18 50v5M54 50v5"/>');
if(/חשמל|ארון חשמל/.test(t))return svg('<rect x="16" y="8" width="40" height="48" rx="4"/><path d="M39 16L28 35h9l-5 13 13-20h-9z"/>');
if(/דלת/.test(t))return svg('<path d="M18 56V10h34v46M26 56V18h20v38"/><circle cx="41" cy="37" r="1.5"/>');
if(/רכב/.test(t))return svg('<path d="M12 43l5-14h38l6 14v9H12zM22 29l5-10h19l7 10"/><circle cx="23" cy="51" r="5"/><circle cx="51" cy="51" r="5"/>');
if(/גינון|גיזום/.test(t))return svg('<path d="M36 55V31M36 37c-12 0-19-8-17-18 10-3 18 2 20 12M37 29c1-11 9-17 19-14 3 10-4 19-16 20"/><path d="M12 55h48"/>');
if(/גילוי|כיבוי/.test(t))return svg('<path d="M36 8c6 10-2 13 5 20 5 5 10 8 10 16 0 9-7 15-15 15s-15-6-15-15c0-9 8-14 11-22 2 5 4 8 4 13 5-5 6-14 0-27z"/>');
if(/גג|אסבסט|סולאר|pv/.test(t))return svg('<path d="M9 35l27-21 27 21M16 31v24h40V31"/><path d="M25 28h23l6 12H31zM34 31l-2 6M43 31l-2 6"/>');
if(/בריכות חימצון/.test(t))return svg('<path d="M9 47c8-7 14 7 22 0s14 7 22 0 10 0 10 0M9 36c8-7 14 7 22 0s14 7 22 0 10 0 10 0"/><circle cx="18" cy="18" r="5"/><circle cx="32" cy="14" r="3"/>');
if(/אוהלים/.test(t))return svg('<path d="M8 53h56L38 13h-4zM36 13v40M18 53l18-25 18 25"/>');
if(/קמפוס|הכלה/.test(t))return svg('<path d="M10 52h52M15 52V25h18v27M39 52V15h18v37"/><path d="M20 31h8M20 38h8M44 22h8M44 30h8M44 38h8"/>');
return svg('<path d="M12 20h48v34H12zM20 20v-8h32v8"/><path d="M22 31h28M22 40h20M22 49h12"/>');
}
function inventoryDrilldown(items,title="אינוונטר לפי סוג ונושא"){
const rows=arr(items);
const typeCounts=new Map();
rows.forEach(i=>typeCounts.set(inventoryTypeOf(i),(typeCounts.get(inventoryTypeOf(i))||0)+1));
const types=[["__all__","הכל",rows.length],...[...typeCounts.entries()].sort((a,b)=>a[0].localeCompare(b[0],"he")).map(([name,count])=>[name,name,count])];
if(!types.some(t=>t[0]===state.inventoryType))state.inventoryType="__all__";
const subjects=inventorySubjectTabs(rows,state.inventoryType);
if(!subjects.some(s=>s[0]===state.inventorySubject))state.inventorySubject="__all__";
const filtered=rows.filter(i=>
(state.inventoryType==="__all__"||inventoryTypeOf(i)===state.inventoryType) &&
(state.inventorySubject==="__all__"||inventorySubjectOf(i)===state.inventorySubject)
);
return `<section class="panel"><div class="panel-head"><div><div class="panel-title">${esc(title)}</div><div class="panel-sub">${sourceProgressText("inventory")} · סינון לפי סוג ואז נושא</div></div><span class="badge">${filtered.length} פריטים</span></div><div class="inventory-drill"><div class="inventory-type-grid">${types.map(t=>`<button type="button" class="inventory-type-card ${t[0]===state.inventoryType?"active":""}" data-inv-type="${esc(t[0])}"><span class="inventory-type-icon" aria-hidden="true">${inventoryIcon(t[0])}</span><span><b>${esc(t[1])}</b><span>${esc(t[2])} פריטים</span></span></button>`).join("")}</div><div class="inventory-subject-label">נושאים</div><div class="inventory-tabs">${subjects.map(s=>`<button type="button" class="${s[0]===state.inventorySubject?"active":""}" data-inv-subject="${esc(s[0])}"><span class="subject-svg">${s[0]==="__all__"?"":subjectSvg(s[1])}</span><span class="subject-name">${esc(s[1])}</span><span class="subject-count">${esc(s[2])} פריטים</span></button>`).join("")}</div><div class="inventory-table-wrap">${filtered.length?`<table class="inventory-table"><thead><tr><th>פריט</th><th>סוג</th><th>נושא</th><th>מיקום</th><th>כמות</th><th>עלות</th></tr></thead><tbody>${filtered.map(i=>`<tr><td><b>${esc(inventoryNameOf(i))}</b><small>${i.militaryNumber?`<br>${esc(i.militaryNumber)}`:""}</small></td><td>${esc(inventoryTypeOf(i))}</td><td>${esc(inventorySubjectOf(i))}</td><td>${esc(inventoryScopeText(i))}</td><td>${esc(i.quantity??"")}</td><td>${esc(i.totalCost||i.unitCost||"")}</td></tr>`).join("")}</tbody></table>`:`<div class="empty">אין אינוונטר בתצוגה הזו</div>`}</div></div></section>`;
}
function bindInventoryDrilldown(){
document.querySelectorAll("[data-inv-type]").forEach(el=>el.onclick=()=>{
state.inventoryType=el.dataset.invType||"__all__";
state.inventorySubject="__all__";
refreshCurrentView();
});
document.querySelectorAll("[data-inv-subject]").forEach(el=>el.onclick=()=>{
state.inventorySubject=el.dataset.invSubject||"__all__";
refreshCurrentView();
});
}
function floorsOf(b){return arr(state.data.floors).filter(f=>belongs(f,"buildingId",b.id))}
function roomsOfFloor(f){return arr(state.data.rooms).filter(r=>belongs(r,"floorId",f.id))}
function roomsOfBuilding(b){return arr(state.data.rooms).filter(r=>belongs(r,"buildingId",b.id))}
function invCard(i){return `<article class="inv"><b>${esc(i.name||i.subjectName||i.type||"פריט אינוונטר")}</b><small>${esc(i.subjectName||i.category||i.type||"")}${i.number?` · ${esc(i.number)}`:""}</small></article>`}
function inventoryBlock(items,title,sub){
return `<section class="panel"><div class="panel-head"><div><div class="panel-title">${title}</div><div class="panel-sub">${sub}</div></div><span class="badge">${items.length} פריטים</span></div><div class="inventory-zone">${items.length?`<div class="inventory-grid">${items.map(invCard).join("")}</div>`:`<div class="empty">אין אינוונטר ברמה הזו</div>`}</div></section>`
}
function hero(title,sub,stats){
return `<section class="hero"><div class="hero-main"><div><div class="eyebrow">מפת נכסים · ${esc(state.site.name)}</div><h1>${esc(title)}</h1><p>${esc(sub)}</p></div><div class="arch"><div class="slab"></div><div class="slab"></div><div class="slab"></div><div class="core"></div></div></div><aside class="summary">${stats.map(s=>`<div class="stat"><b>${esc(s[1])}</b><span>${esc(s[0])}</span></div>`).join("")}</aside></section>`
}
function siteCardUrl(){
const p=new URLSearchParams({siteId:String(state.site?.id||""),siteName:String(state.site?.name||""),view:"site"});
p.set("api", API_BASE);
return "index.html?"+p.toString();
}
function siteChooserUrl(){return "index.html?api="+encodeURIComponent(API_BASE)}
function scrollAfterRender(selector){requestAnimationFrame(()=>document.querySelector(selector)?.scrollIntoView({behavior:"auto",block:"start"}))}
function navButtons(){
const buttons=[
`<button type="button" class="nav-btn primary" data-nav="site"><span class="nav-ico">⌂</span><span>חזרה לכרטיס אתר</span></button>`,
`<button type="button" class="nav-btn" data-nav="sites"><span class="nav-ico">←</span><span>חזרה לבחירת אתרים</span></button>`,
`<button type="button" class="nav-btn" data-nav="refresh"><span class="nav-ico">↻</span><span>רענן נתונים</span></button>`
];
if(state.room){
buttons.push(`<button type="button" class="nav-btn hierarchy" data-nav="floor-rooms"><span class="nav-ico">▯</span><span>חזרה לחדרי הקומה</span></button>`);
buttons.push(`<button type="button" class="nav-btn hierarchy" data-nav="floor"><span class="nav-ico">▥</span><span>חזרה לקומה</span></button>`);
}else if(state.floor){
buttons.push(`<button type="button" class="nav-btn hierarchy" data-nav="building-floors"><span class="nav-ico">▥</span><span>חזרה לקומות המבנה</span></button>`);
buttons.push(`<button type="button" class="nav-btn hierarchy" data-nav="building"><span class="nav-ico">⌂</span><span>חזרה למבנה</span></button>`);
}else if(state.building){
buttons.push(`<button type="button" class="nav-btn hierarchy" data-nav="buildings"><span class="nav-ico">▦</span><span>חזרה למבני האתר</span></button>`);
}
$("#navActions").innerHTML=buttons.join("");
document.querySelectorAll("[data-nav]").forEach(el=>el.onclick=()=>{
const action=el.dataset.nav;
if(action==="refresh"){
try{Object.keys(sessionStorage).forEach(key=>{if(key.startsWith("siteP."))sessionStorage.removeItem(key);});}catch(error){console.warn("cache clear failed",error);}
location.reload();
}
else if(action==="site")location.href=siteCardUrl();
else if(action==="sites")location.href=siteChooserUrl();
else if(action==="buildings")renderBuildings();
else if(action==="building")renderBuilding();
else if(action==="building-floors"){renderBuilding();scrollAfterRender("#buildingFloors");}
else if(action==="floor")renderFloor();
else if(action==="floor-rooms"){renderFloor();scrollAfterRender(".rooms");}
});
}
function crumbs(){
const c=[`<button data-c="root">כל המבנים</button>`];
if(state.building)c.push(`<span>←</span><button data-c="building">${esc(nameBuilding(state.building))}</button>`);
if(state.floor)c.push(`<span>←</span><button data-c="floor">קומה ${esc(floorNo(state.floor))}</button>`);
if(state.room)c.push(`<span>←</span><button class="active">${esc(nameRoom(state.room))}</button>`);
$("#crumbs").innerHTML=c.join("");
navButtons();
document.querySelectorAll("[data-c]").forEach(b=>b.onclick=()=>({root:renderBuildings,building:renderBuilding,floor:renderFloor}[b.dataset.c])());
}
function normalizeBuildingType(v){return String(v||"").trim().toLowerCase()}
function assetToken(v){
return normalizeBuildingType(v)
.replace(/[\s\/\\]+/g,"_")
.replace(/[^a-z0-9_\-\u0590-\u05ff]+/g,"")
.replace(/_+/g,"_")
.replace(/^_+|_+$/g,"");
}
const DEFAULT_BUILDING_ASSETS=[
"hangar","warehouse","tower","long-building","workshop","garage",
"small-building","large-building","antenna","medical","garage_complex",
"warehouse_complex","landing","sports","gate","fuel","dining_room"
];
function stableAssetIndex(b){
const s=String(b?.id||b?.name||b?.buildingNumber||"generic");
let h=0;for(let i=0;i<s.length;i++)h=((h<<5)-h+s.charCodeAt(i))|0;
return Math.abs(h)%DEFAULT_BUILDING_ASSETS.length;
}
function mappedBuildingAsset(b){
const t=normalizeBuildingType(b?.buildingType||b?.type||b?.purpose);
if(/אנטנ|תקשורת|antenna|communication/.test(t))return"antenna";
if(/מרפא|רפוא|medical|clinic/.test(t))return"medical";
if(/מנחת|נחיתה|landing|helipad/.test(t))return"landing";
if(/ספורט|כושר|sports|gym/.test(t))return"sports";
if(/שער|ש\.ג|checkpoint|gate/.test(t))return"gate";
if(/דלק|תדלוק|fuel/.test(t))return"fuel";
if(/חדר אוכל|מטבח|dining|kitchen/.test(t))return"dining_room";
if(/האנגר|hangar/.test(t))return"hangar";
if(/מחסן.*(מתחם|קומפלקס)|warehouse complex/.test(t))return"warehouse_complex";
if(/מוסך.*(מתחם|קומפלקס)|garage complex/.test(t))return"garage_complex";
if(/מחסן|warehouse|storage/.test(t))return"warehouse";
if(/מגדל|tower/.test(t))return"tower";
if(/רכבת|ארוך|long/.test(t))return"long-building";
if(/מוסך|garage/.test(t))return"garage";
if(/סדנ|workshop/.test(t))return"workshop";
if(/גדול|large/.test(t))return"large-building";
if(/קטן|small/.test(t))return"small-building";
return"";
}
function buildingAssetCandidates(b){
const type=assetToken(b?.buildingType||b?.type);
const roof=assetToken(b?.roofType);
const mapped=mappedBuildingAsset(b);
const candidates=[];
if(type&&roof)candidates.push("building_"+type+"_"+roof);
if(type)candidates.push("building_"+type);
if(mapped)candidates.push("building_"+mapped);
if(!type)candidates.push("building_"+DEFAULT_BUILDING_ASSETS[stableAssetIndex(b)]);
candidates.push("building_generic");
return [...new Set(candidates)];
}
function buildingVisualMarkup(b){
const candidates=buildingAssetCandidates(b);
const urls=candidates.map(k=>ASSETS[k]).filter(Boolean);
const src=urls[0]||"";
const generic=ASSETS.building_generic||"";
if(!src&&!generic)return"";
return `<img loading="eager" decoding="async" src="${esc(src||generic)}" alt="" ${generic&&src!==generic?`onerror="this.onerror=null;this.src='${esc(generic)}'"`:""}>`;
}
function allBuildingInventory(b){return buildingInventory(b)}
let buildingCarouselIndex=0;
function carouselWindow(B,index){
const n=B.length;if(!n)return[];
const offsets=n<5?Array.from({length:n},(_,i)=>i-index):[-2,-1,0,1,2];
return offsets.map(off=>{
const idx=(index+off+n)%n;
return {b:B[idx],idx,off:n<5?idx-index:off};
});
}
function paintBuildingCarousel(){
const B=arr(state.data.buildings);if(!B.length)return;
buildingCarouselIndex=((buildingCarouselIndex%B.length)+B.length)%B.length;
const stage=document.querySelector("#buildingCarouselStage");
if(!stage)return;
stage.innerHTML=carouselWindow(B,buildingCarouselIndex).map(({b,idx,off})=>{
const active=idx===buildingCarouselIndex;
const near=Math.abs(off)===1;
return `<article class="building-slide ${active?"active":near?"near":""}" data-carousel-index="${idx}"><div class="building-visual">${buildingVisualMarkup(b)}</div><div class="building-info"><h3>${esc(nameBuilding(b))}</h3><div class="kind">${esc(b.buildingType||b.purpose||b.constructionMethod||"מבנה")}</div><div class="slide-kpis"><div class="slide-kpi"><b>${floorsOf(b).length}</b><span>קומות</span></div><div class="slide-kpi"><b>${roomsOfBuilding(b).length}</b><span>חדרים</span></div><div class="slide-kpi"><b>${allBuildingInventory(b).length}</b><span>אינוונטר</span></div></div></div></article>`;
}).join("");
document.querySelectorAll("[data-carousel-index]").forEach(el=>el.onclick=()=>{
const idx=Number(el.dataset.carouselIndex);
if(idx===buildingCarouselIndex){
state.building=B[idx];renderBuilding();
}else{
buildingCarouselIndex=idx;paintBuildingCarousel();
}
});
const dots=document.querySelector("#buildingCarouselDots");
if(dots)dots.innerHTML=B.map((_,i)=>`<i class="${i===buildingCarouselIndex?"active":""}"></i>`).join("");
}
function renderBuildings(){
state.building=state.floor=state.room=null; crumbs();
const B=arr(state.data.buildings);
if(buildingCarouselIndex>=B.length)buildingCarouselIndex=0;
$("#app").innerHTML=hero("מבנים",`${B.length} מבנים באתר · גלול בין המבנים ולחץ על המבנה המרכזי כדי להיכנס לקומות שלו`,[
["▦ מבנים",sourceProgressText("buildings")],["▤ קומות",sourceProgressText("floors")],["□ חדרים",sourceProgressText("rooms")],["◇ אינוונטר",sourceProgressText("inventory")]
])+`<section class="panel"><div class="panel-head"><div><div class="panel-title">מבני האתר</div><div class="panel-sub">האיור נקבע אוטומטית לפי סוג המבנה · לחיצה על המבנה המרכזי פותחת אותו${["floors","rooms","inventory"].some(s=>!state.complete[s])?` · הנתונים ממשיכים להיטען ברקע`:""}</div></div><span class="badge">${B.length} מבנים</span></div>
${B.length?`<div class="structure-sky" aria-hidden="true"><span class="sky-cloud cloud-1">☁</span><span class="sky-cloud cloud-2">☁</span><span class="sky-birds">⌁⌁</span></div><div class="carousel-shell"><div class="carousel-stage" id="buildingCarouselStage"></div><div class="carousel-nav"><button id="carouselLeft" class="carousel-arrow left" aria-label="הזזה שמאלה">←</button><div class="carousel-dots" id="buildingCarouselDots"></div><button id="carouselRight" class="carousel-arrow right" aria-label="הזזה ימינה">→</button></div><div class="carousel-hint">אפשר גם להשתמש בחצים במקלדת · Enter פותח את המבנה המרכזי</div></div><div class="structure-ground" aria-hidden="true"><span class="ground-road"></span><span class="ground-car">▰</span><span class="ground-tree t1">♧</span><span class="ground-tree t2">♧</span></div>`:`<div class="empty">לא נמצאו מבנים</div>`}
</section>${inventoryDrilldown(arr(state.data.inventory),"אינוונטר האתר")}`;
bindInventoryDrilldown();
if(!B.length)return;
paintBuildingCarousel();
document.querySelectorAll("[data-kpi-go]").forEach(el=>{
el.onclick=()=>{
const go=el.dataset.kpiGo;
if(go==="floors"){
const b=B[buildingCarouselIndex]; if(b){state.building=b;renderBuilding();}
}else if(go==="rooms"){
const b=B[buildingCarouselIndex]; if(b){state.building=b;renderBuilding();}
}else if(go==="inventory"){
const b=B[buildingCarouselIndex]; if(b){state.building=b;renderBuilding();}
}
};
});
$("#carouselLeft").onclick=()=>{buildingCarouselIndex=(buildingCarouselIndex+1)%B.length;paintBuildingCarousel()};
$("#carouselRight").onclick=()=>{buildingCarouselIndex=(buildingCarouselIndex-1+B.length)%B.length;paintBuildingCarousel()};
const carouselShell=document.querySelector(".carousel-shell");
if(carouselShell){
let wheelLocked=false;
carouselShell.addEventListener("wheel",(event)=>{
if(Math.abs(event.deltaY)<4 && Math.abs(event.deltaX)<4)return;
event.preventDefault();
if(wheelLocked)return;
wheelLocked=true;
const delta=Math.abs(event.deltaX)>Math.abs(event.deltaY)?event.deltaX:event.deltaY;
buildingCarouselIndex=(buildingCarouselIndex+(delta>0?1:-1)+B.length)%B.length;
paintBuildingCarousel();
setTimeout(()=>wheelLocked=false,220);
},{passive:false});
}
document.onkeydown=(event)=>{
if(!arr(state.data.buildings).length)return;
if(event.key==="ArrowLeft"){buildingCarouselIndex=(buildingCarouselIndex+1)%B.length;paintBuildingCarousel()}
if(event.key==="ArrowRight"){buildingCarouselIndex=(buildingCarouselIndex-1+B.length)%B.length;paintBuildingCarousel()}
if(event.key==="Enter"){
const b=B[buildingCarouselIndex];
if(b){state.building=b;renderBuilding()}
}
};
}
function reviewTypeOf(r){return String(r?.type||r?.subType||r?.reviewType||r?.name||"ביקורת").trim()||"ביקורת"}
function reviewBelongsToBuilding(r,b){
if(!r||!b)return false;
const bid=String(b.id||"");
const direct=[r.buildingId,r.building_id,r.building?.id,r.buildingInstanceId].filter(v=>v!==undefined&&v!==null&&v!=="").map(String);
if(bid&&direct.includes(bid))return true;
const bn=String(nameBuilding(b)||"").trim();
return !!bn && String(r.buildingName||r.building?.name||"").trim()===bn;
}
function buildingReviews(b){return arr(state.data.reviews).filter(r=>reviewBelongsToBuilding(r,b))}
function dateValue(v){
if(v===undefined||v===null||v==="")return null;
if(typeof v==="number"||/^\d{10,13}$/.test(String(v).trim())){
let n=Number(v);if(n<1e12)n*=1000;return Number.isFinite(n)?n:null;
}
const s=String(v).trim();
const m=s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
if(m){const d=new Date(Number(m[3]),Number(m[2])-1,Number(m[1]));return d.getTime();}
const d=new Date(s);return Number.isNaN(d.getTime())?null:d.getTime();
}
function firstDate(r,keys){for(const k of keys){const ts=dateValue(r?.[k]);if(ts!==null)return ts}return null}
function fmtDate(ts){return ts===null||ts===undefined?"—":new Intl.DateTimeFormat("he-IL",{day:"2-digit",month:"2-digit",year:"numeric"}).format(new Date(ts))}
function reviewDatesByType(items){
const groups=new Map();
arr(items).forEach(r=>{
const type=reviewTypeOf(r);
if(!groups.has(type))groups.set(type,{type,last:null,next:null});
const g=groups.get(type);
const actual=firstDate(r,["dateTs","date","reviewDateTs","reviewDate","actualDateTs","actualDate"]);
const next=firstDate(r,["nextReviewDateTs","nextReviewDate","nextDateTs","nextDate","dueTs","dueDate","targetTs","targetDate","plannedDateTs","plannedDate"]);
if(actual!==null&&(g.last===null||actual>g.last))g.last=actual;
if(next!==null&&(g.next===null||next<g.next))g.next=next;
});
return [...groups.values()].sort((a,b)=>a.type.localeCompare(b.type,"he"));
}
function nextReviewClass(ts){
if(ts===null)return"none";
const today=new Date();today.setHours(0,0,0,0);
const days=Math.ceil((ts-today.getTime())/86400000);
if(days<0)return"overdue";
if(days<=30)return"soon";
return"ok";
}
function reviewSummaryMarkup(items){
const groups=reviewDatesByType(items);
if(!groups.length)return`<div class="review-summary"><div class="review-summary-title">אין ביקורות מקושרות למבנה שהתקבלו עד כה</div></div>`;
return `<div class="review-summary"><div class="review-summary-title">ביקורת אחרונה והבאה לביצוע לפי סוג</div>${groups.map(g=>`<div class="review-date-row"><strong>${esc(g.type)}</strong><span class="review-date">אחרונה · ${esc(fmtDate(g.last))}</span><span class="review-date next ${nextReviewClass(g.next)}">הבאה · ${esc(fmtDate(g.next))}</span></div>`).join("")}</div>`;
}
function floorDisplayModel(F){
const groundAliases=new Set(["0","ק","כ","g"]);
const raw=F.map((f,index)=>({f,index,label:String(floorNo(f)??"").trim()}));
const hasGround=raw.some(x=>groundAliases.has(x.label.toLowerCase()));
const numericPositive=raw.map(x=>Number(x.label)).filter(n=>Number.isFinite(n)&&n>0);
const positiveBase=!hasGround&&numericPositive.length?Math.min(...numericPositive):0;
return raw.map(x=>{
const key=x.label.toLowerCase();
let level;
let kind="normal";
if(groundAliases.has(key)){level=0;kind="ground";}
else if(key==="גלריה"){level=hasGround?.5:(positiveBase?0.5:0.5);kind="gallery";}
else{
const n=Number(x.label);
if(Number.isFinite(n)) level=n>0&&!hasGround?n-positiveBase:n;
else level=x.index+(hasGround?1:0);
}
return {...x,level,kind};
});
}
function numericFloorNo(f,index){
const model=floorDisplayModel([f])[0];
return Number.isFinite(model?.level)?model.level:index;
}
function roomFloorId(r){return r?.floorId??r?.floor?.id??r?.floorInstanceId??r?.floor_id??""}
function roomFloorLabel(r,F){
const f=F.find(x=>String(x.id)===String(roomFloorId(r)));
return f?`קומה ${floorNo(f)}`:(r?.floorName||((r?.floorNumber??"")!==""?`קומה ${r.floorNumber}`:"—"));
}
function buildingElevationMarkup(F){
if(!F.length)return `<div class="empty">${state.complete.floors?"לא נמצאו קומות במבנה":"הקומות ממשיכות להיטען…"}</div>`;
const model=floorDisplayModel(F).sort((a,b)=>a.level-b.level||a.index-b.index);
const levels=model.map(x=>x.level);
const min=Math.min(0,...levels),max=Math.max(0,...levels);
const floorH=88,envH=112,topPad=120;
const belowDepth=Math.abs(Math.min(0,min))*floorH;
const groundBottom=envH+belowDepth;
const worldH=Math.max(500,groundBottom+(Math.max(0,max)+1)*floorH+topPad);
const buildingBottom=groundBottom;
const buildingHeight=(Math.max(0,max)+1)*floorH;
const elevator=[...model].sort((a,b)=>b.level-a.level||a.index-b.index);
return `<div class="elevation-shell" id="elevationShell"><div class="elevation-toolbar"><span class="hint">קליק בוחר ומסנן חדרים · דאבל־קליק נכנס לכרטיס הקומה</span><div class="elevation-actions"><button class="elevation-btn" id="elevationFit">FIT · הצג הכל</button><button class="elevation-btn" id="elevationReset">100%</button></div></div><div class="elevation-viewport" id="elevationViewport"><div class="elevation-world" style="--world-h:${worldH}px"><div class="elevation-scene" id="elevationScene" style="--world-h:${worldH}px"><div class="elevation-sky"></div><div class="scene-cloud"></div><div class="earth-cut" style="height:${groundBottom}px"></div><div class="ground-surface" style="bottom:${groundBottom-43}px"></div><div class="scene-tree t1" style="bottom:${groundBottom+26}px"></div><div class="scene-tree t2" style="bottom:${groundBottom+26}px"></div><div class="scene-car" style="bottom:${groundBottom+8}px"></div><div class="scene-bin" style="bottom:${groundBottom+17}px"></div><div class="floor-zero-line" style="bottom:${groundBottom}px"><span>מפלס 0</span></div><div class="elevation-building" style="bottom:${buildingBottom}px;height:${buildingHeight}px">
${model.map((x,i)=>{const duplicateOffset=model.slice(0,i).filter(y=>y.level===x.level).length*5;const bottom=x.level*floorH+duplicateOffset;const cls=x.level<0?" underground":x.kind==="gallery"?" gallery":"";return `<div class="elevation-floor${cls}" data-elevation-floor="${esc(x.f.id)}" data-floor-level="${x.level}" style="bottom:${bottom}px;right:${Math.max(0,x.level)*5}px"><div class="floor-body"></div><div class="floor-windows"></div><div class="floor-label">קומה ${esc(x.label)} · ${roomsOfFloor(x.f).length} חדרים</div><button class="floor-open-action" data-open-floor="${esc(x.f.id)}">פתח קומה</button></div>`}).join("")}
</div><div class="elevator" id="floorElevator">${elevator.map((x,i)=>`${i>0&&elevator[i-1].level>0&&x.level<0?'<div class="elevator-ground"></div>':''}<button class="elevator-floor${x.level<0?' underground':''}" data-elevator-floor="${esc(x.f.id)}" title="קומה ${esc(x.label)}">${esc(x.label)}</button>`).join("")}</div></div></div></div></div>`;
}
function buildingRoomsTable(R,F,selectedFloorId=""){
const filtered=selectedFloorId?R.filter(r=>String(roomFloorId(r))===String(selectedFloorId)):R;
const selected=F.find(f=>String(f.id)===String(selectedFloorId));
return `<div id="buildingRoomsTableArea"><div class="panel-head"><div><div class="panel-title">חדרים במבנה</div><div class="panel-sub">${selected?`מוצגים חדרי קומה ${esc(floorNo(selected))}`:"כל חדרי המבנה · בחר קומה באיור כדי לסנן"}</div></div><div class="rooms-filter">${selected?`<span class="rooms-filter-chip">קומה ${esc(floorNo(selected))} · ${filtered.length} חדרים</span><button class="rooms-filter-clear" id="clearFloorFilter">הצג הכל</button>`:`<span class="badge">${R.length} חדרים</span>`}</div></div><div class="rooms-table-wrap"><table class="rooms-table"><thead><tr><th>חדר</th><th>קומה</th><th>סוג / קטגוריה</th><th>אינוונטר</th></tr></thead><tbody>${filtered.length?filtered.map(r=>`<tr data-room-row="${esc(r.id)}"><td><b>${esc(nameRoom(r))}</b></td><td>${esc(roomFloorLabel(r,F))}</td><td>${esc(r.category||r.subCategory||r.roomType||"—")}</td><td>${roomInventory(r).length}</td></tr>`).join(""):`<tr><td colspan="4" class="empty">${state.complete.rooms?"אין חדרים להצגה":"החדרים ממשיכים להיטען…"}</td></tr>`}</tbody></table></div></div>`;
}
function renderBuilding(){
state.floor=state.room=null; crumbs();
const b=state.building,F=floorsOf(b),R=roomsOfBuilding(b);
const buildingItems=buildingInventory(b),buildingReviewItems=buildingReviews(b);
const invProgress=sourceProgressText("inventory"),floorProgress=sourceProgressText("floors"),roomProgress=sourceProgressText("rooms");
let selectedFloorId="";
$("#app").innerHTML=`
<section class="building-detail-hero"><div class="building-identity"><div class="eyebrow">${esc(state.site.name)} · מבנה</div><h1>${esc(nameBuilding(b))}</h1><div class="building-kind">${esc(b.purpose||b.buildingType||"מבנה")}</div>${b.id?`<div class="building-id">ID · ${esc(b.id)}</div>`:""}${reviewSummaryMarkup(buildingReviewItems)}<div class="building-facts">${b.buildingType?`<span class="building-fact">סוג מבנה <b>${esc(b.buildingType)}</b></span>`:""}${b.roofType?`<span class="building-fact">סוג גג <b>${esc(b.roofType)}</b></span>`:""}${b.constructionMethod?`<span class="building-fact">שיטת בנייה <b>${esc(b.constructionMethod)}</b></span>`:""}${b.purpose?`<span class="building-fact">ייעוד <b>${esc(b.purpose)}</b></span>`:""}${b.area?`<span class="building-fact">שטח <b>${esc(b.area)}</b></span>`:""}${b.complexName?`<span class="building-fact">מתחם <b>${esc(b.complexName)}</b></span>`:""}${b.number||b.buildingNumber?`<span class="building-fact">מספר מבנה <b>${esc(b.number||b.buildingNumber)}</b></span>`:""}</div></div><div class="building-illustration" aria-label="איור המבנה"><div class="building-visual">${buildingVisualMarkup(b)}</div></div><aside class="building-hero-kpis"><article class="building-kpi" data-building-go="floors"><div class="ico">▥</div><div><b>${F.length}</b><span>קומות</span><small>${esc(floorProgress)}</small></div><div class="go">←</div></article><article class="building-kpi" data-building-go="rooms"><div class="ico">▯</div><div><b>${R.length}</b><span>חדרים</span><small>${esc(roomProgress)}</small></div><div class="go">←</div></article><article class="building-kpi" data-building-go="inventory"><div class="ico">◇</div><div><b>${buildingItems.length}</b><span>אינוונטר</span><small>${esc(invProgress)}</small></div><div class="go">↓</div></article><article class="building-kpi review-kpi"><div class="ico">✓</div><div><b>${buildingReviewItems.length}</b><span>ביקורות</span><small>${esc(sourceProgressText("reviews"))}</small></div><div class="go">•</div></article></aside></section><div class="building-main-grid"><section class="panel" id="buildingFloors"><div class="panel-head"><div><div class="panel-title">קומות המבנה</div><div class="panel-sub">חתך איזומטרי לפי מספר קומה · קומות שליליות מוצגות מתחת לפני הקרקע</div></div><span class="badge">${F.length} קומות</span></div>${buildingElevationMarkup(F)}</section><section class="panel" id="buildingRooms">${buildingRoomsTable(R,F,selectedFloorId)}</section></div><div id="buildingInventory">${inventoryDrilldown(buildingItems,"אינוונטר במבנה")}</div>`;
bindInventoryDrilldown();
const bindRoomRows=()=>document.querySelectorAll("[data-room-row]").forEach(el=>el.onclick=()=>{const r=R.find(x=>String(x.id)===String(el.dataset.roomRow));if(!r)return;const f=F.find(x=>String(x.id)===String(roomFloorId(r)));if(f)state.floor=f;state.room=r;renderRoom()});
const refreshRoomTable=()=>{const area=document.getElementById("buildingRoomsTableArea");if(area)area.outerHTML=buildingRoomsTable(R,F,selectedFloorId);bindRoomRows();const clear=document.getElementById("clearFloorFilter");if(clear)clear.onclick=()=>{selectedFloorId="";document.querySelectorAll("[data-elevation-floor]").forEach(x=>x.classList.remove("selected"));document.querySelectorAll("[data-elevator-floor]").forEach(x=>x.classList.remove("active"));refreshRoomTable()};};
const selectFloor=(id,{scroll=false}={})=>{selectedFloorId=String(id||"");document.querySelectorAll("[data-elevation-floor]").forEach(x=>x.classList.toggle("selected",String(x.dataset.elevationFloor)===selectedFloorId));document.querySelectorAll("[data-elevator-floor]").forEach(x=>x.classList.toggle("active",String(x.dataset.elevatorFloor)===selectedFloorId));refreshRoomTable();if(scroll){const floorEl=document.querySelector(`[data-elevation-floor="${CSS.escape(selectedFloorId)}"]`);floorEl?.scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"center"});}};
const openFloor=id=>{state.floor=F.find(f=>String(f.id)===String(id));if(state.floor)renderFloor()};
document.querySelectorAll("[data-elevation-floor]").forEach(el=>{el.onclick=e=>{if(e.target.closest("[data-open-floor]"))return;selectFloor(el.dataset.elevationFloor)};el.ondblclick=e=>{if(e.target.closest("[data-open-floor]"))return;e.preventDefault();openFloor(el.dataset.elevationFloor)};});
document.querySelectorAll("[data-elevator-floor]").forEach(btn=>{btn.onclick=e=>{e.stopPropagation();selectFloor(btn.dataset.elevatorFloor,{scroll:true})};btn.ondblclick=e=>{e.stopPropagation();openFloor(btn.dataset.elevatorFloor)};});
document.querySelectorAll("[data-open-floor]").forEach(btn=>btn.onclick=e=>{e.stopPropagation();openFloor(btn.dataset.openFloor)});
bindRoomRows();
const shell=document.getElementById("elevationShell"),viewport=document.getElementById("elevationViewport"),scene=document.getElementById("elevationScene");
const fit=()=>{if(!shell||!viewport||!scene)return;const natural=parseFloat(getComputedStyle(scene).getPropertyValue("--world-h"))||520;const scale=Math.min(1,(viewport.clientHeight-8)/natural);scene.style.setProperty("--world-scale",scale);scene.parentElement.style.setProperty("--world-scale",scale);shell.classList.add("fit");document.getElementById("elevationFit")?.classList.add("active");viewport.scrollTop=viewport.scrollHeight;};
document.getElementById("elevationFit")?.addEventListener("click",fit);
document.getElementById("elevationReset")?.addEventListener("click",()=>{if(!scene)return;scene.style.setProperty("--world-scale",1);scene.parentElement.style.setProperty("--world-scale",1);shell?.classList.remove("fit");document.getElementById("elevationFit")?.classList.remove("active");if(viewport)viewport.scrollTop=viewport.scrollHeight;});
if(viewport)requestAnimationFrame(()=>viewport.scrollTop=viewport.scrollHeight);
document.querySelectorAll("[data-building-go]").forEach(el=>el.onclick=()=>{const go=el.dataset.buildingGo;const target=go==="inventory"?"#buildingInventory":go==="rooms"?"#buildingRooms":"#buildingFloors";document.querySelector(target)?.scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"start"})});
}
function renderFloor(){
state.room=null; crumbs();
const f=state.floor,R=roomsOfFloor(f),I=floorInventory(f);
$("#app").innerHTML=hero(`קומה ${floorNo(f)}`,`${nameBuilding(state.building)} · כאן האינוונטר הוא התוכן הראשי, והחדרים הם שכבת Drill-down נוספת.`,[
["סה״כ אינוונטר בקומה",I.length],["חדרים",R.length],["אינוונטר בחדרים",uniqueInventory(R.flatMap(r=>roomInventory(r))).length],["נטען מכלל האינוונטר",sourceProgressText("inventory")]
])+`<div class="floor-layout"><div>${inventoryBlock(I,"אינוונטר ומערכות בקומה","כולל פריטים המקושרים ישירות לקומה ופריטים בחדרים שלה")}</div><section class="panel"><div class="panel-head"><div><div class="panel-title">חדרי הקומה</div><div class="panel-sub">פתח חדר רק כאשר נדרש שיוך מדויק יותר</div></div></div><div class="rooms">${R.length?R.map(r=>`<article class="room" data-r="${esc(r.id)}"><b>${esc(nameRoom(r))}</b><small>${esc(r.category||r.subCategory||"")}</small><div class="meta"><span>${roomInventory(r).length} פריטי אינוונטר</span></div></article>`).join(""):`<div class="empty">אין חדרים בקומה</div>`}</div></section></div>${inventoryDrilldown(I,"אינוונטר בקומה")}`;
bindInventoryDrilldown();
document.querySelectorAll("[data-r]").forEach(el=>el.onclick=()=>{state.room=R.find(r=>String(r.id)===el.dataset.r);renderRoom()});
}
function renderRoom(){
crumbs();const r=state.room,I=roomInventory(r);
$("#app").innerHTML=hero(nameRoom(r),`קומה ${floorNo(state.floor)} · ${nameBuilding(state.building)} · אינוונטר חדרי מוצג רק לפריטים ששויכו במפורש לחדר.`,[
["אינוונטר בחדר",I.length],["קטגוריה",r.category||"—"],["תת קטגוריה",r.subCategory||"—"],["מספר",r.number||"—"]
])+`<div class="room-screen"><div>${inventoryBlock(I,"אינוונטר בחדר","רק ציוד ומערכות המקושרים ישירות לחדר")}</div><section class="panel room-plan"><div class="panel-title">מיקום בחדר</div><div class="panel-sub">שכבה ויזואלית מוכנה להרחבה בהמשך</div><div class="plan-box"><div class="plan-door"></div><div class="plan-label"><b>${esc(nameRoom(r))}</b><span>${esc(r.category||"")}</span></div></div></section></div>${inventoryDrilldown(I,"אינוונטר בחדר")}`;
bindInventoryDrilldown();
}
function hydrateStructureCache(){
try{
const raw=sessionStorage.getItem("siteP.structureCache."+String(state.site.id));
if(!raw)return false;
const snap=JSON.parse(raw);
const versionMatches=snap?.version===STRUCTURE_CACHE_VERSION;
const snapData=snap?.data||snap||{};
["buildings","floors","rooms","inventory","reviews"].forEach(source=>{
const rows=Array.isArray(snap?.[source])?snap[source]:
Array.isArray(snapData?.[source])?snapData[source]:null;
const validRows=Array.isArray(rows)&&(
source!=="inventory" ||
!rows.length ||
versionMatches ||
rows.some(row=>String(row?.siteId||"")===String(state.site.id))
);
if(validRows)state.data[source]=rows;
const p=snap?.progress?.[source];
if(p&&typeof p==="object"){
state.progress[source]={
loaded:Number.isFinite(Number(p.loaded))?Number(p.loaded):(validRows?rows.length:0),
total:Number.isFinite(Number(p.total))?Number(p.total):null
};
}else if(validRows){
state.progress[source]={loaded:rows.length,total:null};
}
state.complete[source]=validRows&&snap?.complete?.[source]===true;
});
console.log("[STRUCTURE] hydrated",{
complete:state.complete,
progress:state.progress,
rows:Object.fromEntries(["buildings","floors","rooms","inventory","reviews"].map(s=>[s,sourceLoaded(s)]))
});
return true;
}catch(error){
console.warn("[STRUCTURE] cache hydrate failed",error);
return false;
}
}
function renderRequestedEntry(){
const B=arr(state.data.buildings);
if(state.requestedBuildingId){
const b=B.find(x=>String(x.id)===String(state.requestedBuildingId));
if(b){state.building=b;renderBuilding();return;}
}
renderBuildings();
}
async function startStructure(){
await loadAssets();
hydrateStructureCache();
const haveBuildings=Array.isArray(state.data.buildings)&&state.data.buildings.length>0;
if(haveBuildings)renderRequestedEntry();
else $("#app").innerHTML='<div class="panel loading"><div class="loader"></div>טוען את רשימת המבנים…</div>';
if(!haveBuildings&&!state.complete.buildings){
try{
await loadSource("buildings");
if(Array.isArray(state.data.buildings))renderRequestedEntry();
}catch(err){
console.error("[STRUCTURE] source load failed","buildings",err);
$("#app").innerHTML=`<section class="panel"><div class="empty">לא הצלחנו לטעון את רשימת המבנים.<br>${esc(err.message)}</div></section>`;
return;
}
}
["floors","rooms","inventory","reviews"]
.filter(source=>!state.complete[source])
.forEach(source=>{
loadSource(source)
.then(()=>refreshCurrentView())
.catch(err=>console.error("[STRUCTURE] source load failed",source,err));
});
}
startStructure();