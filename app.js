(() => {
"use strict";
const DB_NAME="Peugeot206DB", STORE="state", KEY="main";
const DEFAULT_SERVICES=[
 ["روغن موتور",5000,6],["فیلتر روغن",5000,6],["فیلتر هوا",10000,12],["فیلتر کابین",10000,12],
 ["فیلتر بنزین",20000,12],["تسمه تایم",60000,48],["تسمه دینام",50000,12],["شمع موتور",30000,24],
 ["لنت ترمز جلو",30000,24],["لنت ترمز عقب",40000,36],["روغن گیربکس",40000,36],["ضد یخ / مایع خنک‌کننده",40000,24],
 ["مایع ترمز",40000,24],["باتری",0,36],["لاستیک‌ها",0,48],["کمک‌فنر و جلوبندی",0,12]
];
const $=id=>document.getElementById(id);
const fa=n=>Number(n||0).toLocaleString("fa-IR");
const num=s=>Number(String(s||"").replace(/[۰-۹٠-٩٬,]/g,c=>"۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩".indexOf(c)>=0?String("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩".indexOf(c)%10):"").replace(/[^\d.-]/g,""))||0;
const today=()=>new Date().toISOString().slice(0,10);
const dateFa=d=>d?new Date(d+"T12:00:00").toLocaleDateString("fa-IR"):"—";
let db, state, deferredInstall=null, tokenClient=null, driveToken=null, syncTimer=null, syncBusy=false;

function openDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,1);req.onupgradeneeded=()=>req.result.createObjectStore(STORE);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
function readState(){return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,"readonly"),r=tx.objectStore(STORE).get(KEY);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function writeState(){return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,"readwrite");tx.objectStore(STORE).put(state,KEY);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
function seed(){return {version:1,car:{name:"پژو ۲۰۶ تیپ ۲",note:"مدل قبل از ۱۳۹۰",mileage:0},services:DEFAULT_SERVICES.map((x,i)=>({id:id(),name:x[0],intervalKm:x[1],intervalMonths:x[2],lastDate:"",lastKm:0,note:"",createdAt:Date.now()+i})),records:[],fuel:[],updatedAt:Date.now()};}
function id(){return crypto.randomUUID?crypto.randomUUID():String(Date.now())+Math.random().toString(16).slice(2);}
async function persist(cloud=true){state.updatedAt=Date.now();await writeState();render();if(cloud)scheduleCloudSync();}
function toast(msg){const t=$("toast");t.textContent=msg;t.className="toast-show";clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.className="",2800);}
function status(s){
 let kmDue=s.intervalKm>0&&s.lastDate?Number(s.lastKm||0)+Number(s.intervalKm):null;
 let dateDue=s.intervalMonths>0&&s.lastDate?addMonths(s.lastDate,Number(s.intervalMonths)):null;
 let kmLeft=kmDue===null?Infinity:kmDue-Number(state.car.mileage||0);
 let daysLeft=dateDue===null?Infinity:Math.ceil((new Date(dateDue+"T23:59:59")-new Date())/86400000);
 let overdue=kmLeft<0||daysLeft<0;
 let soon=!overdue&&(kmLeft<=5000||daysLeft<=15);
 return {kind:overdue?"late":soon?"soon":"ok",kmLeft,daysLeft,kmDue,dateDue};
}
function addMonths(date,months){let d=new Date(date+"T12:00:00");let day=d.getDate();d.setMonth(d.getMonth()+months);if(d.getDate()<day)d.setDate(0);return d.toISOString().slice(0,10);}
function statusText(s){let st=status(s);if(!s.lastDate)return "هنوز سابقه تعویض ثبت نشده";if(st.kind==="late")return "سررسید گذشته";if(st.kind==="soon")return "نزدیک به موعد";return "به‌روز";}
function serviceDetail(s){let st=status(s),parts=[];if(s.intervalKm)parts.push(st.kmLeft<0?`${fa(Math.abs(st.kmLeft))} کیلومتر عقب‌افتاده`:`${fa(Math.max(0,st.kmLeft))} کیلومتر تا موعد`);if(s.intervalMonths)parts.push(st.daysLeft<0?`${fa(Math.abs(st.daysLeft))} روز عقب‌افتاده`:`${fa(Math.max(0,st.daysLeft))} روز تا موعد`);return s.lastDate?parts.join(" • "):`فاصله: ${s.intervalKm?fa(s.intervalKm)+" کیلومتر":"—"} / ${s.intervalMonths?fa(s.intervalMonths)+" ماه":"—"}`;}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function empty(msg){return `<div class="empty">${msg}</div>`;}
function serviceCard(s){const st=status(s);return `<article class="service-card ${st.kind}"><div class="service-info"><strong>${esc(s.name)}</strong><small>${esc(statusText(s))} • ${esc(serviceDetail(s))}</small>${s.note?`<small>${esc(s.note)}</small>`:""}</div><div class="service-actions"><span class="status-pill ${st.kind}">${st.kind==="ok"?"به‌روز":st.kind==="soon"?"نزدیک":"گذشته"}</span><button class="mini-btn" data-action="record" data-id="${s.id}">ثبت</button><button class="mini-btn" data-action="edit-service" data-id="${s.id}">⋯</button></div></article>`;}
function recordCard(r){return `<article class="history-card"><div><strong>${esc(r.serviceName)}</strong><small>${dateFa(r.date)} • ${fa(r.km)} کیلومتر${r.note?" • "+esc(r.note):""}</small></div><div class="history-side">${fa(r.cost)} تومان<button class="mini-btn" data-action="delete-record" data-id="${r.id}">حذف</button></div></article>`;}
function fuelCard(r){return `<article class="history-card"><div><strong>سوخت‌گیری</strong><small>${dateFa(r.date)} • ${fa(r.km)} کیلومتر • ${fa(r.liters)} لیتر</small></div><div class="history-side">${fa(r.cost)} تومان<button class="mini-btn" data-action="delete-fuel" data-id="${r.id}">حذف</button></div></article>`;}
function render(){
 $("mileageView").textContent=fa(state.car.mileage);$("carName").value=state.car.name;$("carNote").value=state.car.note;
 const counts={ok:0,soon:0,late:0};state.services.forEach(s=>counts[status(s).kind]++);
 $("okCount").textContent=fa(counts.ok);$("soonCount").textContent=fa(counts.soon);$("lateCount").textContent=fa(counts.late);
 const sorted=[...state.services].sort((a,b)=>({late:0,soon:1,ok:2}[status(a).kind]-({late:0,soon:1,ok:2}[status(b).kind])));
 $("dashboardServices").innerHTML=sorted.length?sorted.slice(0,5).map(serviceCard).join(""):empty("هنوز سرویسی ثبت نشده است.");
 $("allServices").innerHTML=sorted.length?sorted.map(serviceCard).join(""):empty("سرویسی وجود ندارد.");
 const records=[...state.records].sort((a,b)=>(b.date||"").localeCompare(a.date||""));
 $("recentHistory").innerHTML=records.length?records.slice(0,3).map(recordCard).join(""):empty("هنوز سابقه‌ای ثبت نشده است.");
 $("historyList").innerHTML=records.length?records.map(recordCard).join(""):empty("هنوز سابقه‌ای ثبت نشده است.");
 $("fuelList").innerHTML=state.fuel.length?[...state.fuel].sort((a,b)=>b.date.localeCompare(a.date)).map(fuelCard).join(""):empty("هنوز سوخت‌گیری ثبت نشده است.");
 $("fuelTotal").textContent=fa(state.fuel.reduce((a,b)=>a+Number(b.cost||0),0))+" تومان";
 $("backupTime").textContent=localStorage.getItem("lastExport")?"آخرین خروجی فایل: "+new Date(Number(localStorage.getItem("lastExport"))).toLocaleString("fa-IR"):"هنوز نسخه پشتیبان فایل نگرفته‌ای.";
 $("clientId").value=localStorage.getItem("googleClientId")||window.APP_CONFIG?.GOOGLE_CLIENT_ID||"";
 renderDriveStatus();
}
function go(page){document.querySelectorAll(".page").forEach(p=>p.classList.toggle("active",p.id==="page-"+page));document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("selected",b.dataset.page===page));}
function openModal(title,html,onSave){$("modalTitle").textContent=title;$("modalContent").innerHTML=html;$("modal").showModal();$("modalSave").onclick=async e=>{e.preventDefault();try{await onSave();$("modal").close();}catch(err){toast(err.message||"خطا در ذخیره اطلاعات");}};}
function field(label,name,value="",type="text",placeholder=""){return `<label class="form-field">${label}<input class="field" name="${name}" type="${type}" value="${esc(value)}" placeholder="${placeholder}" ${type==="number"?'inputmode="numeric"':''}></label>`;}
function area(label,name,value=""){return `<label class="form-field">${label}<textarea class="field" name="${name}">${esc(value)}</textarea></label>`;}
function formVal(name){return $("modalContent").querySelector(`[name="${name}"]`)?.value??"";}
function addService(existing=null){openModal(existing?"ویرایش سرویس":"افزودن سرویس",field("نام سرویس یا قطعه","name",existing?.name||"")+field("فاصله تعویض (کیلومتر)؛ صفر یعنی غیرفعال","km",existing?.intervalKm||0,"number")+field("فاصله تعویض (ماه)؛ صفر یعنی غیرفعال","months",existing?.intervalMonths||0,"number")+area("توضیحات","note",existing?.note||""),async()=>{const name=formVal("name").trim();if(!name)throw Error("نام سرویس را وارد کن.");const item={...(existing||{id:id(),lastDate:"",lastKm:0,createdAt:Date.now()}),name,intervalKm:num(formVal("km")),intervalMonths:num(formVal("months")),note:formVal("note")};if(item.intervalKm<0||item.intervalMonths<0)throw Error("فاصله تعویض نمی‌تواند منفی باشد.");if(existing)state.services=state.services.map(x=>x.id===existing.id?item:x);else state.services.push(item);await persist();toast("سرویس ذخیره شد.");});}
function addRecord(serviceId=null){const opts=state.services.map(s=>`<option value="${s.id}" ${s.id===serviceId?"selected":""}>${esc(s.name)}</option>`).join("");openModal("ثبت سرویس انجام‌شده",`<label class="form-field">نوع سرویس<select class="field" name="service">${opts}</select></label>${field("تاریخ انجام","date",today(),"date")}${field("کیلومتر هنگام سرویس","km",state.car.mileage,"number")}${field("هزینه (تومان)","cost","0","number")}${area("یادداشت","note","")}`,async()=>{const s=state.services.find(x=>x.id===formVal("service"));if(!s)throw Error("نوع سرویس را انتخاب کن.");const date=formVal("date"),km=num(formVal("km"));if(!date)throw Error("تاریخ را وارد کن.");const rec={id:id(),serviceId:s.id,serviceName:s.name,date,km,cost:num(formVal("cost")),note:formVal("note"),createdAt:Date.now()};state.records.push(rec);s.lastDate=date;s.lastKm=km;if(km>state.car.mileage)state.car.mileage=km;await persist();toast("سابقه سرویس ثبت شد.");});}
function addFuel(){openModal("ثبت سوخت‌گیری",`${field("تاریخ","date",today(),"date")}${field("کیلومتر خودرو","km",state.car.mileage,"number")}${field("مقدار سوخت (لیتر)","liters","","number")}${field("هزینه (تومان)","cost","","number")}${area("یادداشت","note","")}`,async()=>{const r={id:id(),date:formVal("date"),km:num(formVal("km")),liters:num(formVal("liters")),cost:num(formVal("cost")),note:formVal("note")};if(!r.date)throw Error("تاریخ را وارد کن.");state.fuel.push(r);if(r.km>state.car.mileage)state.car.mileage=r.km;await persist();toast("سوخت‌گیری ثبت شد.");});}
function exportBackup(){const blob=new Blob([JSON.stringify({...state,backupCreatedAt:new Date().toISOString()},null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`Peugeot206-Backup-${today()}.json`;a.click();URL.revokeObjectURL(a.href);localStorage.setItem("lastExport",Date.now());render();toast("فایل پشتیبان آماده شد.");}
async function importBackup(file){const parsed=JSON.parse(await file.text());if(!parsed||!parsed.car||!Array.isArray(parsed.services)||!Array.isArray(parsed.records)||!Array.isArray(parsed.fuel))throw Error("ساختار فایل پشتیبان معتبر نیست.");if(!confirm("اطلاعات فعلی با اطلاعات فایل پشتیبان جایگزین شود؟"))return;state={version:1,car:parsed.car,services:parsed.services,records:parsed.records,fuel:parsed.fuel,updatedAt:Date.now()};await persist();toast("اطلاعات بازیابی شد.");}
function driveConfigured(){return (localStorage.getItem("googleClientId")||window.APP_CONFIG?.GOOGLE_CLIENT_ID||"").trim();}
function renderDriveStatus(){const el=$("driveStatus");const connected=!!driveToken;el.innerHTML=`<span class="status-dot ${connected?"":"muted-dot"}"></span><span>${connected?"اتصال فعال است؛ پشتیبان‌گیری خودکار روشن است.":localStorage.getItem("driveWasConnected")?"برای ادامه همگام‌سازی، دوباره Google Drive را متصل کن.":"Google Drive هنوز متصل نشده است."}</span>`;}
function connectDrive(){const clientId=driveConfigured();if(!clientId){toast("ابتدا شناسه OAuth را وارد و ذخیره کن.");return;}if(!window.google?.accounts?.oauth2){toast("سرویس ورود گوگل بارگذاری نشده؛ اینترنت را بررسی کن.");return;}tokenClient=google.accounts.oauth2.initTokenClient({client_id:clientId,scope:"https://www.googleapis.com/auth/drive.file",callback:async resp=>{if(resp.error){toast("اتصال به Google Drive ناموفق بود.");return;}driveToken=resp.access_token;localStorage.setItem("driveWasConnected","1");renderDriveStatus();await syncDrive();toast("Google Drive متصل شد.");}});tokenClient.requestAccessToken({prompt:"consent"});}
async function driveRequest(url,options={}){const r=await fetch(url,{...options,headers:{...(options.headers||{}),Authorization:`Bearer ${driveToken}`}});if(!r.ok){const t=await r.text();if(r.status===401){driveToken=null;renderDriveStatus();}throw Error(`Google Drive: ${r.status} ${t.slice(0,160)}`);}return r.status===204?null:r.json();}
async function syncDrive(){if(!driveToken){toast("ابتدا Google Drive را متصل کن.");return;}if(syncBusy)return;syncBusy=true;try{const fileName="Peugeot206-Backup.json";const list=await driveRequest("https://www.googleapis.com/drive/v3/files?spaces=drive&pageSize=100&fields=files(id,name,mimeType)&q="+encodeURIComponent(`name='${fileName}' and trashed=false`));const payload=JSON.stringify({...state,backupCreatedAt:new Date().toISOString()});const boundary="-------peugeot206boundary"+id().replace(/-/g,"");const metadata={name:fileName,mimeType:"application/json"};const body=`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${payload}\r\n--${boundary}--`;const existing=list.files?.[0];const url=existing?`https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=multipart`:"https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";const result=await driveRequest(url,{method:existing?"PATCH":"POST",headers:{"Content-Type":`multipart/related; boundary=${boundary}`},body});localStorage.setItem("lastDriveSync",Date.now());renderDriveStatus();return result;}catch(e){console.error(e);toast("پشتیبان‌گیری ابری انجام نشد؛ اتصال را بررسی و دوباره تلاش کن.");}finally{syncBusy=false;}}
function scheduleCloudSync(){if(!driveToken)return;clearTimeout(syncTimer);syncTimer=setTimeout(()=>syncDrive(),1800);}
function disconnectDrive(){driveToken=null;localStorage.removeItem("driveWasConnected");renderDriveStatus();toast("اتصال ابری در این برنامه غیرفعال شد.");}
function bind(){
 document.querySelectorAll("[data-page]").forEach(b=>b.addEventListener("click",()=>go(b.dataset.page)));
 document.querySelectorAll("[data-go]").forEach(b=>b.addEventListener("click",()=>go(b.dataset.go)));
 $("editMileageBtn").onclick=()=>openModal("ویرایش کیلومتر خودرو",field("کیلومتر فعلی","km",state.car.mileage,"number"),async()=>{const km=num(formVal("km"));if(km<0)throw Error("کیلومتر نامعتبر است.");state.car.mileage=km;await persist();toast("کیلومتر به‌روزرسانی شد.");});
 $("addServiceBtn").onclick=()=>addService();$("addRecordBtn").onclick=()=>addRecord();$("addFuelBtn").onclick=addFuel;
 $("serviceSearch").oninput=e=>{const q=e.target.value.trim().toLowerCase();$("allServices").innerHTML=state.services.filter(s=>s.name.toLowerCase().includes(q)).map(serviceCard).join("")||empty("موردی پیدا نشد.");};
 $("historySearch").oninput=e=>{const q=e.target.value.trim().toLowerCase();$("historyList").innerHTML=state.records.filter(r=>(r.serviceName+" "+r.note).toLowerCase().includes(q)).sort((a,b)=>b.date.localeCompare(a.date)).map(recordCard).join("")||empty("موردی پیدا نشد.");};
 document.body.addEventListener("click",e=>{const b=e.target.closest("[data-action]");if(!b)return;const itemId=b.dataset.id,action=b.dataset.action;if(action==="record")addRecord(itemId);if(action==="edit-service")addService(state.services.find(s=>s.id===itemId));if(action==="delete-record"&&confirm("این سابقه حذف شود؟")){const r=state.records.find(x=>x.id===itemId);state.records=state.records.filter(x=>x.id!==itemId);const s=state.services.find(x=>x.id===r?.serviceId);if(s){const last=state.records.filter(x=>x.serviceId===s.id).sort((a,b)=>b.date.localeCompare(a.date))[0];s.lastDate=last?.date||"";s.lastKm=last?.km||0;}persist();toast("سابقه حذف شد.");}if(action==="delete-fuel"&&confirm("این سوخت‌گیری حذف شود؟")){state.fuel=state.fuel.filter(x=>x.id!==itemId);persist();}});
 $("exportBtn").onclick=exportBackup;$("importBtn").onclick=()=>$("importFile").click();$("importFile").onchange=async e=>{try{if(e.target.files[0])await importBackup(e.target.files[0]);}catch(err){toast("فایل پشتیبان معتبر نیست.");}e.target.value="";};
 $("saveClientBtn").onclick=()=>{const v=$("clientId").value.trim();if(v&&!v.endsWith(".apps.googleusercontent.com")){toast("شناسه OAuth معتبر به نظر نمی‌رسد.");return;}localStorage.setItem("googleClientId",v);toast("شناسه ذخیره شد.");};
 $("connectDriveBtn").onclick=connectDrive;$("syncNowBtn").onclick=syncDrive;$("disconnectDriveBtn").onclick=disconnectDrive;
 $("saveCarBtn").onclick=async()=>{state.car.name=$("carName").value.trim()||"پژو ۲۰۶ تیپ ۲";state.car.note=$("carNote").value.trim();await persist();toast("اطلاعات خودرو ذخیره شد.");};
 $("clearDataBtn").onclick=async()=>{if(!confirm("تمام اطلاعات محلی برنامه برای همیشه پاک شود؟ قبل از ادامه نسخه پشتیبان بگیر."))return;state=seed();await persist(false);toast("اطلاعات برنامه پاک شد.");};
}
async function init(){try{db=await openDB();state=await readState();if(!state){state=seed();await writeState();}}catch(e){document.body.innerHTML="<p style='padding:24px'>ذخیره‌سازی مرورگر در دسترس نیست. لطفاً برنامه را با مرورگر به‌روز و از نشانی HTTPS باز کن.</p>";return;}bind();render();if("serviceWorker"in navigator&&location.protocol.startsWith("http"))navigator.serviceWorker.register("./sw.js").catch(console.warn);}
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredInstall=e;$("installBtn").hidden=false;});$("installBtn").addEventListener("click",async()=>{if(!deferredInstall)return;deferredInstall.prompt();await deferredInstall.userChoice;deferredInstall=null;$("installBtn").hidden=true;});
init();
})();