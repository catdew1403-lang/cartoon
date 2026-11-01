'use strict';
const app = document.querySelector('#app');
const state = {user:null, csrf:'', sessionError:'', route:0, cleanup:[], studio:null};
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const idPath = value => encodeURIComponent(String(value));
const imageURL = value => typeof value === 'string' && /^\/images\/[a-zA-Z0-9_-]+\.webp$/.test(value) ? value : '';
const donationHosts = new Set(['buymeacoffee.com','www.buymeacoffee.com','ko-fi.com','www.ko-fi.com']);
function httpsURL(value) { try { const u = new URL(value); return u.protocol === 'https:' && donationHosts.has(u.hostname) && !u.username && !u.password && (!u.port || u.port === '443') ? u.href : ''; } catch { return ''; } }
const number = value => Number(value || 0).toLocaleString('th-TH');
const genreOptions = ['แฟนตาซี','ชีวิตประจำวัน','ผจญภัย','โรแมนซ์','ลึกลับ','ตลก','อื่น ๆ'];
const options = (values, selected) => values.map(v => `<option value="${esc(v)}" ${v === selected ? 'selected' : ''}>${esc(v)}</option>`).join('');
const statusOptions = selected => `<option value="ongoing" ${selected === 'ongoing' ? 'selected' : ''}>กำลังเขียน</option><option value="completed" ${selected === 'completed' ? 'selected' : ''}>จบแล้ว</option>`;
const tagsText = value => Array.isArray(value) ? value.join(', ') : String(value || '');
const empty = (title, text='เมื่อมีข้อมูลจากระบบ จะแสดงที่นี่') => `<div class="empty"><div class="empty-symbol" aria-hidden="true">✳</div><h3>${esc(title)}</h3><p class="muted">${esc(text)}</p></div>`;
const errorBlock = message => `<div class="error-panel" role="alert"><h2>ยังเปิดหน้านี้ไม่ได้</h2><p class="error">${esc(message)}</p><p class="muted">หากระบบแจ้งว่าฐานข้อมูลหรือตารางยังไม่พร้อม ให้ผู้ดูแลตั้งค่า migration ผ่านหน้าฐานข้อมูลก่อน ไม่ใช่ข้อมูลตัวอย่าง</p><button data-action="retry">ลองอีกครั้ง</button></div>`;
function toast(message) { const el=document.querySelector('#toast'); el.textContent=message; el.hidden=false; clearTimeout(toast.timer); toast.timer=setTimeout(()=>{el.hidden=true;},4500); }
async function api(path, {method='GET',body,raw=false,keepalive=false}={}, retryCsrf=true) {
 const headers={Accept:'application/json'};
 if(method !== 'GET') { if(!state.csrf) await session(); if(!state.csrf) throw new Error('ไม่พบโทเคนความปลอดภัย กรุณาโหลดหน้าใหม่'); headers['X-CSRF-Token']=state.csrf; }
 if(body !== undefined) headers['Content-Type']=raw ? body.type : 'application/json';
 let response;
 try { response=await fetch(path,{method,credentials:'same-origin',headers,keepalive,body:body === undefined ? undefined : raw ? body : JSON.stringify(body)}); } catch { throw new Error('เชื่อมต่อระบบไม่ได้ กรุณาตรวจสอบเครือข่ายแล้วลองอีกครั้ง'); }
 let json;
 try { json=await response.json(); } catch { throw new Error('บริการ API ยังไม่พร้อม หรือไม่ได้ส่ง JSON กรุณาตรวจสอบ backend และการตั้งค่าฐานข้อมูล'); }
 // Only retry a rejection issued before the backend executes the mutation.
 if(response.status===403 && json.code==='CSRF_INVALID' && method!=='GET' && retryCsrf) {
  await session();
  return api(path,{method,body,raw,keepalive},false);
 }
 if(!response.ok || json.error) {
  const error=new Error(json.error || `ระบบตอบกลับผิดพลาด (${response.status})`);
  error.saveRejected=response.status>=400&&response.status<500&&response.status!==408;
  throw error;
 }
 if(!Object.prototype.hasOwnProperty.call(json,'data')) throw new Error('รูปแบบข้อมูล API ไม่ถูกต้อง');
 return json.data;
}
async function session() { const data=await api('/api/session'); state.user=data.user; state.csrf=data.csrfToken; state.sessionError=''; account(); }
function account() { const link=document.querySelector('#account-link'); link.textContent=state.user ? state.user.pen_name || state.user.username : 'เข้าสู่ระบบ'; link.href=state.user ? '#/profile' : '#/login'; }
function setTheme(theme) {
 theme=theme==='night'?'night':'day';
 const night=theme==='night',toggle=document.querySelector('#theme-toggle');
 document.documentElement.dataset.theme=theme;
 toggle.textContent=night?'โหมดกลางวัน':'โหมดกลางคืน';
 toggle.setAttribute('aria-label','โหมดกลางคืน');
 toggle.setAttribute('aria-pressed',String(night));
 toggle.title=night?'เปลี่ยนเป็น Soft Pastel':'เปลี่ยนเป็น Soft Dark';
 document.querySelector('meta[name="theme-color"]').content=night?'#18181B':'#FAF7F2';
 try{localStorage.setItem('kartoon-theme',theme);}catch{}
}
try { const saved=localStorage.getItem('kartoon-theme');setTheme(saved==='day'||saved==='night'?saved:(matchMedia('(prefers-color-scheme: dark)').matches?'night':'day')); } catch { setTheme('day'); }
document.querySelector('#theme-toggle').addEventListener('click',()=>setTheme(document.documentElement.dataset.theme==='night'?'day':'night'));
document.querySelector('.skip').addEventListener('click',event=>{event.preventDefault();app.focus();app.scrollIntoView();});
function cover(series) { const url=imageURL(series.cover_image_url); return `<div class="cover">${url?`<img src="${esc(url)}" alt="ปก ${esc(series.title)}" loading="lazy">`:'<span class="cover-empty" aria-label="ยังไม่มีภาพปก">✳</span>'}</div>`; }
function cards(series) { return `<div class="grid">${series.map(s=>`<article class="card"><a href="#/series/${idPath(s.id)}">${cover(s)}<div class="card-body"><div class="meta"><span>${esc(s.genre || 'ไม่ระบุแนว')}</span><span>${s.status==='completed'?'จบแล้ว':'กำลังเขียน'}</span></div><h3>${esc(s.title)}</h3><p>${esc(s.synopsis)}</p><div class="meta"><span>${esc(s.writer_name || 'ไม่ระบุนามปากกา')}</span><span>${number(s.chapter_count)} ตอน · ${number(s.views)} อ่าน</span></div></div></a></article>`).join('')}</div>`; }
function guidelines() { return `<div class="guidelines"><strong>ข้อตกลงสำหรับนักเขียน</strong><ul><li>เผยแพร่เฉพาะผลงานที่สร้างเองหรือได้รับสิทธิ์อย่างถูกต้อง ห้ามละเมิดลิขสิทธิ์</li><li>ห้ามเนื้อหาผิดกฎหมาย การแสวงหาประโยชน์จากเด็ก ความเกลียดชัง การคุกคาม และการเปิดเผยข้อมูลส่วนบุคคล</li><li>ระบุแนวเรื่องและคำเตือนเนื้อหาให้เหมาะสม ไม่แอบอ้างบุคคลอื่นหรือหลอกลวงผู้สนับสนุน</li><li>รับผิดชอบเนื้อหา ใช้บัญชีรับบริจาคของตนเองเท่านั้น ไม่แอบอ้างบัญชีผู้อื่น การบริจาคเป็นความสมัครใจ ไม่ใช่เงื่อนไขการอ่าน</li><li>อ่านฟรี ไม่มีโฆษณา แพลตฟอร์มไม่หักค่าบริจาค แต่บริการชำระเงินภายนอกอาจเรียกเก็บค่าธรรมเนียม</li><li>ผู้ดูแลอาจซ่อนผลงานหรือระงับบัญชีเมื่อฝ่าฝืน และพิจารณารายงานตามความเหมาะสม</li></ul></div>`; }
function consent() { return `${guidelines()}<label class="check"><input type="checkbox" name="acceptGuidelines" required><span>ฉันอ่านและยอมรับข้อตกลงนักเขียนทั้งหมด</span></label>`; }
function donation(data) { const url=httpsURL(data.donation_url), qr=imageURL(data.donation_qr_url); return `<section class="panel donation"><h3>ส่งกำลังใจถึงนักเขียน</h3><p>ทุกตอนอ่านฟรี หากชอบผลงาน สนับสนุนนักเขียนโดยตรงได้ตามสมัครใจ แพลตฟอร์มไม่หักค่าธรรมเนียม ผู้ให้บริการชำระเงินอาจมีค่าธรรมเนียม</p>${url?`<a class="button" href="${esc(url)}" target="_blank" rel="noopener noreferrer">สนับสนุนผ่านเว็บไซต์ภายนอก ↗</a>`:'<p class="muted">นักเขียนยังไม่ได้ระบุลิงก์รับบริจาค</p>'}${qr?`<img class="qr" src="${esc(qr)}" alt="QR สนับสนุนนักเขียน กรุณาตรวจสอบผู้รับก่อนชำระเงิน" loading="lazy">`:''}</section>`; }
function requireRole(roles) { if(!state.user) { app.innerHTML=`<div class="narrow">${empty('เข้าสู่ระบบก่อนใช้งาน','พื้นที่นี้สำหรับสมาชิก')}<p><a class="button" href="#/login">เข้าสู่ระบบ</a></p></div>`; return false; } if(roles && !roles.includes(state.user.role)) { app.innerHTML=empty('บัญชีนี้ยังไม่มีสิทธิ์ใช้งานหน้านี้','ผู้อ่านสมัครเป็นนักเขียนได้ในหน้าโปรไฟล์'); return false; } return true; }
async function discover(params, token) {
 const q=params.get('q')||'', tag=params.get('tag')||'', genre=params.get('genre')||'', status=params.get('status')||'', sort=params.get('sort')==='top'?'top':'latest';
 app.innerHTML=`<section class="hero"><div><div class="eyebrow">A quiet place for your imagination</div><h1>พักสักนิด<br>ให้<span>ลายเส้น</span> <em>เล่าเรื่อง</em></h1><p class="muted">เปิดโลกการ์ตูนของนักเขียนไทย อ่านทุกตอนได้ฟรี เก็บเรื่องที่ชอบ แล้วส่งกำลังใจให้คนวาดได้โดยตรง</p><div class="hero-note"><span class="pill">อ่านฟรีเสมอ</span><span class="pill">ไม่มีโฆษณาคั่น</span><span class="pill">สนับสนุนถึงนักเขียน</span></div></div><div class="art" role="img" aria-label="ภาพตกแต่งหนังสือและดอกไม้แบบนามธรรม"></div></section><div class="section-head"><h2>${sort==='top'?'อันดับยอดอ่าน':'เรื่องราวที่เพิ่งอัปเดต'}</h2><span class="eyebrow">Discover / ${sort==='top'?'Ranking':'Latest'}</span></div><form id="filter-form" class="filters"><label>ค้นหาการ์ตูน<input name="q" value="${esc(q)}" placeholder="ชื่อเรื่อง หรือคำที่อยากค้นหา"></label><label>แท็ก<input name="tag" value="${esc(tag)}" maxlength="100" placeholder="เช่น อบอุ่นหัวใจ"></label><label>แนวเรื่อง<select name="genre"><option value="">ทุกแนว</option>${options([...new Set([...genreOptions,...(genre?[genre]:[])])],genre)}</select></label><label>สถานะ<select name="status"><option value="">ทุกสถานะ</option>${statusOptions(status)}</select></label><label>เรียงตาม<select name="sort"><option value="latest" ${sort==='latest'?'selected':''}>อัปเดตล่าสุด</option><option value="top" ${sort==='top'?'selected':''}>ยอดอ่านสูงสุด</option></select></label><button>ค้นหา</button></form><div id="catalogue" class="loading" aria-live="polite">กำลังค้นหาเรื่องราว…</div>`;
 const search=new URLSearchParams({q,tag,genre,status,sort});
 try { const list=await api(`/api/series?${search}`); if(token!==state.route)return; document.querySelector('#catalogue').className=''; document.querySelector('#catalogue').innerHTML=list.length?cards(list):empty('ยังไม่พบการ์ตูน','ลองเปลี่ยนตัวกรอง หรือกลับมาเมื่อมีนักเขียนเผยแพร่ผลงาน'); } catch(e) { if(token===state.route)document.querySelector('#catalogue').innerHTML=errorBlock(e.message); }
}
async function seriesDetail(id,token) {
 const s=await api(`/api/series/${idPath(id)}`); if(token!==state.route)return;
 app.innerHTML=`<a href="#/">← กลับไปค้นพบ</a><section class="detail"><div>${cover(s)}</div><div><div class="eyebrow">${esc(s.genre)} / ${s.status==='completed'?'Completed':'Ongoing'}</div><h1>${esc(s.title)}</h1><p>โดย ${esc(s.writer_name)}</p><div class="meta"><span>${number(s.views)} ครั้งที่อ่าน</span><span>${number(s.chapters.length)} ตอน</span><span>${esc(tagsText(s.tags))}</span></div><p class="synopsis">${esc(s.synopsis)}</p><div class="actions">${s.chapters.length?`<a class="button" href="#/read/${idPath(s.chapters[0].id)}">เริ่มอ่านตอนแรก</a>`:''}<button class="secondary" data-action="bookmark" data-id="${esc(s.id)}" aria-pressed="${!!s.bookmarked}">${s.bookmarked?'เก็บเข้าชั้นแล้ว ✓':'เก็บเข้าชั้นหนังสือ'}</button></div></div></section><section class="panel"><h2>สารบัญ</h2>${s.chapters.length?`<ul class="list">${s.chapters.map(c=>`<li><a class="chapter-link" href="#/read/${idPath(c.id)}"><span>ตอน ${esc(c.chapter_number)} · ${esc(c.title)}</span><small>${esc(c.published_at?new Date(c.published_at).toLocaleDateString('th-TH'):'')}</small></a></li>`).join('')}</ul>`:empty('ยังไม่มีตอนที่เผยแพร่')}</section>${donation(s)}<section class="panel"><h3>พบปัญหาเกี่ยวกับผลงานนี้?</h3><form id="report-form" data-id="${esc(s.id)}" class="stack"><label>เหตุผลในการรายงาน<textarea name="reason" required minlength="10" maxlength="1000" placeholder="ระบุรายละเอียดเพื่อให้ผู้ดูแลตรวจสอบ"></textarea></label><div><button class="secondary">ส่งรายงาน</button></div><p class="form-error error" role="alert"></p></form></section>`;
}
async function reader(id,token) {
 const [c,profile]=await Promise.all([api(`/api/chapters/${idPath(id)}`),state.user?api(`/api/chapters/${idPath(id)}/history`).then(data=>{const h=data?.history;if(!data||!Object.prototype.hasOwnProperty.call(data,'history')||(h!==null&&(!h||typeof h!=='object'||Array.isArray(h)||!['number','string'].includes(typeof h.page_order)||!Number.isSafeInteger(Number(h.page_order))||Number(h.page_order)<1)))throw new Error('รูปแบบประวัติการอ่านไม่ถูกต้อง');return {data};}).catch(error=>({error})):Promise.resolve(null)]); if(token!==state.route)return;
 if(profile?.data?.history&&!c.pages.some(p=>Number(p.page_order)===Number(profile.data.history.page_order))){profile.error=new Error('ตำแหน่งในประวัติไม่ตรงกับหน้าที่มีอยู่');delete profile.data;}
 const pages=[...c.pages].sort((a,b)=>a.page_order-b.page_order), history=profile?.data?.history;
 let saveEnabled=!history&&!profile?.error, currentPage=pages[0]?.page_order, timer, observer, lastY=window.scrollY;
 app.innerHTML=`<div class="reader-heading"><a href="#/series/${idPath(c.series_id)}">← ${esc(c.series_title)}</a><h1>ตอน ${esc(c.chapter_number)} · ${esc(c.title)}</h1><p class="muted">โดย ${esc(c.writer_name)}</p>${history?`<div class="notice" id="resume-box">เคยอ่านถึงหน้า ${esc(history.page_order)} <button class="small" id="resume-reading">อ่านต่อจากจุดเดิม</button> <button class="small secondary" id="start-reading">เริ่มจากหน้าแรก</button></div>`:''}${profile?.error?`<p class="error">โหลดประวัติไม่ได้: ${esc(profile.error.message)} จึงยังไม่บันทึกทับตำแหน่งเดิม</p>`:''}</div><div class="reader-toolbar" id="reader-toolbar"><a class="button secondary small" href="#/series/${idPath(c.series_id)}">สารบัญ</a><select id="chapter-select" aria-label="เลือกตอน">${c.chapters.map(ch=>`<option value="${esc(ch.id)}" ${String(ch.id)===String(c.id)?'selected':''}>ตอน ${esc(ch.chapter_number)} · ${esc(ch.title)}</option>`).join('')}</select><button class="secondary small" data-action="bookmark" data-id="${esc(c.series_id)}">เก็บเรื่อง</button><button class="secondary small" id="like-button" data-action="like" data-id="${esc(c.id)}" aria-pressed="${!!c.liked}">${c.liked?'ถูกใจแล้ว ♥':'ถูกใจ ♡'}</button></div><div class="reader-pages">${pages.length?pages.map((p,i)=>`<figure class="reader-page" data-order="${esc(p.page_order)}" id="page-${i}">${imageURL(p.image_url)?`<img src="${esc(imageURL(p.image_url))}" alt="หน้าการ์ตูน ${esc(p.page_order)}" loading="${i?'lazy':'eager'}" decoding="async">`:'<p class="error">ไม่สามารถเปิด URL ภาพหน้านี้ได้</p>'}<figcaption>หน้า ${esc(p.page_order)}</figcaption></figure>`).join(''):empty('ตอนนี้ยังไม่มีหน้าการ์ตูน')}</div><div class="reader-end"><p id="history-status" class="muted" role="status">${state.user?'บันทึกตำแหน่งการอ่านเมื่อเลื่อนหน้า':'เข้าสู่ระบบเพื่อบันทึกตำแหน่งการอ่าน'}</p><div class="actions">${(()=>{const i=c.chapters.findIndex(ch=>String(ch.id)===String(c.id));return `${i>0?`<a class="button secondary" href="#/read/${idPath(c.chapters[i-1].id)}">← ตอนก่อนหน้า</a>`:''}${i>=0&&i<c.chapters.length-1?`<a class="button" href="#/read/${idPath(c.chapters[i+1].id)}">ตอนถัดไป →</a>`:''}`;})()}</div><br>${donation(c)}</div><button class="back-controls secondary small" id="show-controls">แสดงแถบอ่าน ↑</button>`;
 const statusEl=document.querySelector('#history-status');
 let saveChain=Promise.resolve(), lastSaved;
 const save=()=>{if(!state.user||!saveEnabled||currentPage===undefined||lastSaved===currentPage)return; const page=currentPage;lastSaved=page;saveChain=saveChain.then(()=>api('/api/history',{method:'PUT',body:{chapter_id:c.id,page_order:page},keepalive:true})).then(()=>{if(token===state.route)statusEl.textContent=`บันทึกถึงหน้า ${page} แล้ว`;}).catch(e=>{lastSaved=undefined;if(token===state.route)statusEl.textContent=`ยังไม่บันทึก: ${e.message}`;});};
 const schedule=()=>{clearTimeout(timer);timer=setTimeout(save,900);};
 const toolbar=document.querySelector('#reader-toolbar');
 const readerHash=location.hash;
 const pageElements=[...document.querySelectorAll('.reader-page')];
 let scrollFrame;
 const updatePage=()=>{
  scrollFrame=undefined;
  if(token!==state.route||location.hash!==readerHash)return;
  // Use the reading line, not a sliver of the preceding page above the toolbar.
  const anchor=innerHeight*.35;
  const visible=pageElements.map(el=>({el,rect:el.getBoundingClientRect()})).filter(({rect})=>rect.bottom>0&&rect.top<innerHeight);
  const chosen=visible.find(({rect})=>rect.top<=anchor&&rect.bottom>anchor)||visible.find(({rect})=>rect.top>anchor)||visible.at(-1);
  if(chosen){currentPage=Number(chosen.el.dataset.order);schedule();}
 };
 const scroll=()=>{const y=window.scrollY;if(Math.abs(y-lastY)>8){toolbar.classList.toggle('is-hidden',y>lastY&&y>240);lastY=y;}if(scrollFrame===undefined)scrollFrame=requestAnimationFrame(updatePage);};
 window.addEventListener('scroll',scroll,{passive:true});
 if('IntersectionObserver' in window){observer=new IntersectionObserver(updatePage,{rootMargin:'-10% 0px -45% 0px',threshold:0});pageElements.forEach(el=>observer.observe(el));}
 document.querySelector('#chapter-select').addEventListener('change',e=>{location.hash=`/read/${idPath(e.target.value)}`;});
 document.querySelector('#show-controls').addEventListener('click',()=>{toolbar.classList.remove('is-hidden');toolbar.querySelector('a').focus({preventScroll:true});});
 if(history){
  const choose=async resume=>{
   const box=document.querySelector('#resume-box');box.querySelectorAll('button').forEach(b=>b.disabled=true);
   const found=resume?pages.findIndex(p=>Number(p.page_order)===Number(history.page_order)):0;
   const i=Math.max(0,found), target=document.querySelector(`#page-${i}`);
   statusEl.textContent='กำลังเตรียมตำแหน่งอ่าน…';
   // Decode preceding pages before scrolling; lazy image heights otherwise move the target.
   const preceding=[...document.querySelectorAll('.reader-page img')].slice(0,i+1);
   preceding.forEach(img=>{img.loading='eager';});
   await Promise.all(preceding.map(img=>img.decode().catch(()=>{})));
   if(token!==state.route)return;
   box.hidden=true;currentPage=pages[i]?.page_order;
   if(target)target.scrollIntoView({behavior:'instant',block:'start'});
   saveEnabled=true;schedule();
  };
  document.querySelector('#resume-reading').addEventListener('click',()=>choose(true));document.querySelector('#start-reading').addEventListener('click',()=>choose(false));
 }
 window.addEventListener('pagehide',save);
 state.cleanup.push(()=>{window.removeEventListener('scroll',scroll);window.removeEventListener('pagehide',save);observer?.disconnect();if(scrollFrame!==undefined)cancelAnimationFrame(scrollFrame);clearTimeout(timer);save();});
}
function authPage(register) {
 app.innerHTML=`<section class="panel narrow"><div class="eyebrow">Welcome to Kartoon</div><h1>${register?'เริ่มต้นเรื่องราวของคุณ':'ยินดีต้อนรับกลับ'}</h1><p class="muted">ชั้นหนังสือส่วนตัว และกำลังใจถึงนักเขียนคนโปรด</p><form id="${register?'register':'login'}-form" class="stack">${register?'<label>ชื่อผู้ใช้<input name="username" required minlength="3" maxlength="60" autocomplete="username"></label>':''}<label>อีเมล<input name="email" type="email" required autocomplete="email" maxlength="254"></label><label>รหัสผ่าน<input name="password" type="password" required ${register?'minlength="12" maxlength="128"':''} autocomplete="${register?'new-password':'current-password'}"></label>${register?`<label>ประเภทสมาชิก<select name="role" id="register-role"><option value="reader">ผู้อ่าน</option><option value="writer">นักเขียน</option></select></label><div id="writer-fields" class="stack" hidden><label>นามปากกา<input name="pen_name" maxlength="80" disabled></label><div id="register-consent">${consent()}</div></div>`:''}<p class="form-error error" role="alert"></p><button>${register?'สมัครสมาชิก':'เข้าสู่ระบบ'}</button></form><p>${register?'มีบัญชีแล้ว? <a href="#/login">เข้าสู่ระบบ</a>':'ยังไม่มีบัญชี? <a href="#/register">สมัครสมาชิก</a>'}</p></section>`;
 if(register){document.querySelector('#register-consent input').disabled=true;document.querySelector('#register-role').addEventListener('change',e=>{const writer=e.target.value==='writer';document.querySelector('#writer-fields').hidden=!writer;document.querySelectorAll('#writer-fields input').forEach(el=>{el.disabled=!writer;el.required=writer;});});}
}
async function profilePage(token) {
 if(!requireRole())return; const data=await api('/api/profile');if(token!==state.route)return; const u=data.user; state.user=u;account();
 app.innerHTML=`<div class="section-head"><div><div class="eyebrow">Your little reading corner</div><h1>${esc(u.pen_name || u.username)}</h1><p class="muted">${esc(u.email)} · ${esc(u.role)}</p></div><button class="secondary" data-action="logout">ออกจากระบบ</button></div><div class="tabs">${['writer','admin'].includes(u.role)?'<a class="button" href="#/studio">ห้องนักเขียน</a>':''}${u.role==='admin'?'<a class="button secondary" href="#/admin">จัดการระบบ</a>':''}</div><div class="stats"><div><strong>${number(data.stats?.series)}</strong>ผลงาน</div><div><strong>${number(data.stats?.views)}</strong>ยอดอ่าน</div><div><strong>${number(data.stats?.bookmarks)}</strong>เก็บเข้าชั้น</div></div>${u.role!=='reader'?`<section class="panel"><h2>ข้อมูลส่วนตัว</h2><form id="profile-form" class="stack"><label>นามปากกา<input name="pen_name" value="${esc(u.pen_name||'')}" maxlength="80"></label><label>ลิงก์สนับสนุน (HTTPS · Buy Me a Coffee / Ko-fi)<input name="donation_url" type="url" value="${esc(u.donation_url||'')}" placeholder="https://"></label><label>QR สนับสนุน (ไม่บังคับ / สูงสุด 5 MiB)<input type="file" name="donation_qr" accept="image/png,image/jpeg,image/webp,image/gif"></label>${imageURL(u.donation_qr_url)?`<img class="qr" src="${esc(imageURL(u.donation_qr_url))}" alt="QR ปัจจุบัน">`:''}<p class="muted">ลิงก์และ QR จะแสดงให้ผู้อ่านในหน้าผลงาน กรุณาตรวจสอบผู้รับเงิน</p><p class="form-error error" role="alert"></p><div><button>บันทึกข้อมูล</button></div></form></section>`:''}${u.role==='reader'?`<section class="panel"><h2>เปลี่ยนจากผู้อ่านเป็นนักเขียน</h2><form id="upgrade-form" class="stack"><label>นามปากกา<input name="pen_name" required maxlength="80"></label>${consent()}<p class="form-error error" role="alert"></p><div><button>เปิดห้องนักเขียน</button></div></form></section>`:''}<section><div class="section-head"><h2>ชั้นหนังสือของฉัน</h2></div>${data.bookmarks.length?cards(data.bookmarks):empty('ชั้นหนังสือยังว่าง','กดเก็บเรื่องในหน้าการ์ตูนที่ชอบ')}</section><section class="panel"><h2>อ่านต่อจากคราวก่อน</h2>${data.history.length?`<ul class="list">${data.history.map(h=>`<li><a href="#/read/${idPath(h.chapter_id)}">${esc(h.series_title)} · ${esc(h.title)} <small>อ่านถึงหน้า ${esc(h.page_order)} · เปิดเพื่อเลือกอ่านต่อ</small></a></li>`).join('')}</ul>`:empty('ยังไม่มีประวัติการอ่าน')}</section><div class="notice">ข้อความและการแจ้งเตือนยังไม่เปิดใช้งานในเวอร์ชันนี้</div>`;
 replacementImageOption(document.querySelector('#profile-form'),u.donation_qr_url);
}
const allowedTypes=['image/jpeg','image/png','image/webp','image/gif'];
function validateImage(file) {if(!allowedTypes.includes(file.type))throw new Error('รองรับเฉพาะ JPG, PNG, WebP และ GIF');if(file.size>5*1024*1024)throw new Error(`ไฟล์ ${file.name} เกินขนาด 5 MiB`);if(!file.size)throw new Error('ไฟล์รูปภาพว่างเปล่า');}
async function uploadImage(file) {validateImage(file);const result=await saveWithImage('/api/images',{method:'POST',body:file,raw:true});if(!imageURL(result?.image_url))throw Object.assign(new Error('ข้อมูลผลอัปโหลดไม่ครบ กรุณาโหลดข้อมูลตรวจสอบก่อนส่งซ้ำ'),{saveUncertain:true});return result;}
function replacementImageOption(form,url) {
 if(!form)return;form.dataset.replacedImageUrl=imageURL(url);
 if(form.dataset.replacedImageUrl)form.querySelector('.form-error').insertAdjacentHTML('beforebegin','<label class="check wide"><input type="checkbox" name="remove_replaced_image"><span>เมื่อเปลี่ยนภาพและบันทึกสำเร็จ ให้ลบภาพเดิมถาวรเพื่อคืนโควตา (ระบบจะไม่ลบภาพที่ยังถูกใช้งาน)</span></label>');
}
async function discardUnusedImage(url, failureMessage='ยังล้างภาพที่ไม่ได้ใช้งานไม่ได้ กรุณาแจ้งผู้ดูแล') {
 const safe=imageURL(url);if(!safe)return;
 const uuid=safe.slice('/images/'.length,-'.webp'.length);
 try {await api(`/api/images/${idPath(uuid)}`,{method:'DELETE'});} catch {toast(failureMessage);}
}
async function saveWithImage(path,options,newImage) {
 try {return await api(path,options);} catch(error) {
  // A lost response may follow a committed save; never delete its possible image.
  if(error.saveRejected){if(newImage)await discardUnusedImage(newImage);}
  else {error.saveUncertain=true;error.message+=' · ยังยืนยันผลบันทึกไม่ได้ กรุณาโหลดข้อมูลตรวจสอบก่อนลองอีกครั้ง ระบบจะไม่ลบภาพที่อาจบันทึกแล้ว';}
  throw error;
 }
}
async function cleanupReplacedImage(oldURL,newURL,approved) {
 if(approved&&imageURL(newURL)&&imageURL(oldURL)&&oldURL!==newURL)await discardUnusedImage(oldURL,'บันทึกสำเร็จแล้ว แต่ยังลบภาพเดิมเพื่อคืนโควตาไม่ได้ ภาพอาจยังถูกใช้งานอยู่ กรุณาแจ้งผู้ดูแล');
}
async function studioPage(token) {
 if(!requireRole(['writer','admin']))return; const series=await api('/api/studio');if(token!==state.route)return;
 const studio={series,selected:null,chapter:null,pages:[],busy:false,urls:new Set(),token};state.studio=studio;
 state.cleanup.push(()=>{studio.urls.forEach(url=>URL.revokeObjectURL(url));studio.urls.clear();if(state.studio===studio)state.studio=null;});
 app.innerHTML=`<div class="section-head"><div><div class="eyebrow">Creator's desk</div><h1>ห้องนักเขียน</h1><p class="muted">บ่มเรื่องราวในฉบับร่าง พร้อมเมื่อไรค่อยเผยแพร่</p></div><button id="new-series">+ สร้างเรื่อง</button></div><div class="studio-layout"><aside class="panel studio-sidebar"><h3>ผลงานของฉัน</h3><ul class="list" id="studio-series"></ul></aside><div id="studio-editor"></div></div>`;
 studioSidebar();seriesEditor(null);
 document.querySelector('#new-series').addEventListener('click',()=>{if(studio.busy)return toast('กรุณารอการอัปโหลดให้เสร็จ');if(pendingStudio(studio)&&!confirm('ละทิ้งงานที่ยังไม่บันทึก?'))return;clearPreviews(studio);seriesEditor(null);});
}
function clearPreviews(s, keepCover=false) {s.urls.forEach(u=>{if(!keepCover||u!==s.coverPreview){URL.revokeObjectURL(u);s.urls.delete(u);}});if(!keepCover)s.coverPreview=null;s.pages=[];s.chapter=null;s.orderDirty=false;}
function activeStudio(s) {return !!s&&state.studio===s&&s.token===state.route;}
function pendingStudio(s) {return !!s&&(s.orderDirty||s.uploadUncertain||s.pages.some(p=>!p.uploaded)||!!app.querySelector('form[data-dirty="true"],form[data-uncertain="true"]'));}
function confirmPendingStudio(s,except) {return !(s.orderDirty||s.uploadUncertain||s.pages.some(p=>!p.uploaded)||[...app.querySelectorAll('form[data-dirty="true"],form[data-uncertain="true"]')].some(form=>form!==except))||confirm('การบันทึกนี้จะโหลดห้องนักเขียนใหม่ งานที่ยังไม่บันทึกจะหายไป ต้องการดำเนินการต่อหรือไม่?');}
app.addEventListener('input',event=>{const form=event.target.closest('form');if(activeStudio(state.studio)&&form)form.dataset.dirty='true';});
app.addEventListener('change',event=>{const form=event.target.closest('form');if(activeStudio(state.studio)&&form)form.dataset.dirty='true';});
function lockStudioControls(s) {
 if(!activeStudio(s)||!s.busy)return;
 s.lockedControls ||= new Map();
 app.querySelectorAll('button,input,select,textarea').forEach(el=>{if(!s.lockedControls.has(el))s.lockedControls.set(el,el.disabled);el.disabled=true;});
}
function setStudioBusy(s,busy) {
 s.busy=busy;
 if(busy)lockStudioControls(s);
 else {s.lockedControls?.forEach((disabled,el)=>{el.disabled=disabled;});s.lockedControls?.clear();}
 if(activeStudio(s))renderPages(s);
}
function studioSidebar() {const s=state.studio;if(!activeStudio(s))return;const sidebar=document.querySelector('#studio-series');if(!sidebar)return;sidebar.innerHTML=s.series.length?s.series.map(item=>`<li><button class="secondary small" data-action="edit-series" data-id="${esc(item.id)}">${esc(item.title)}</button></li>`).join(''):'<li class="muted">ยังไม่มีผลงาน</li>';}
function seriesEditor(series) {
 const s=state.studio;if(!activeStudio(s))return;
 const editor=document.querySelector('#studio-editor');if(!editor)return;s.selected=series;s.chapter=null;
 if(series?.hidden){editor.innerHTML=empty('ผลงานนี้ถูกเก็บหรือระงับแล้ว','จะไม่แสดงในหน้าค้นหาและผู้อ่านไม่สามารถเปิดตอนหรือรูปได้');return;}
 editor.innerHTML=`<section class="panel"><h2>${series?'แก้ไขผลงาน':'เริ่มผลงานใหม่'}</h2><form id="series-form" class="form-grid"><label class="wide">ชื่อเรื่อง<input name="title" value="${esc(series?.title||'')}" required maxlength="160"></label><label class="wide">เรื่องย่อ<textarea name="synopsis" required maxlength="6000">${esc(series?.synopsis||'')}</textarea></label><label>แนวเรื่อง<select name="genre">${options([...new Set([...genreOptions,...(series?.genre?[series.genre]:[])])],series?.genre)}</select></label><label>สถานะ<select name="status">${statusOptions(series?.status||'ongoing')}</select></label><label class="wide">แท็ก (คั่นด้วยจุลภาค)<input name="tags" value="${esc(tagsText(series?.tags))}" maxlength="300"></label><label class="wide">ภาพปก (ไม่บังคับ / สูงสุด 5 MiB)<input type="file" name="cover" accept="image/jpeg,image/png,image/webp,image/gif"></label><div class="wide" id="cover-preview">${series?cover(series):''}</div><p class="form-error error wide" role="alert"></p><div class="wide"><button>${series?'บันทึกการแก้ไข':'สร้างเรื่อง'}</button>${series?` <button type="button" class="danger" data-action="archive-series" data-id="${esc(series.id)}">เก็บผลงานออกจากชั้นสาธารณะ</button>`:''}</div></form></section>${series?`<section class="panel"><div class="section-head"><h2>ตอนทั้งหมด</h2><a href="#/series/${idPath(series.id)}">ดูหน้าเรื่อง ↗</a></div><ul class="list">${(series.chapters||[]).map(ch=>`<li><div class="row"><div>ตอน ${esc(ch.chapter_number)} · ${esc(ch.title)}<br><small>${ch.published_at?'เผยแพร่แล้ว · แก้ไขหน้าไม่ได้ในเวอร์ชันนี้':'ฉบับร่าง · เฉพาะนักเขียน'}</small></div>${!ch.published_at?`<button class="secondary small" data-action="edit-chapter" data-id="${esc(ch.id)}">จัดการหน้า</button>`:`<a href="#/read/${idPath(ch.id)}">อ่าน</a>`}</div></li>`).join('')||'<li>ยังไม่มีตอน</li>'}</ul><h3>สร้างตอนฉบับร่าง</h3><form id="chapter-form" class="stack"><label>เลขตอน<input type="number" name="chapter_number" min="1" step="1" required></label><label>ชื่อตอน<input name="title" required maxlength="160"></label><p class="form-error error" role="alert"></p><div><button>สร้างฉบับร่าง</button></div></form></section><div id="chapter-editor"></div>`:''}`;
 replacementImageOption(editor.querySelector('#series-form'),series?.cover_image_url);
 editor.querySelector('[name="cover"]').addEventListener('change',e=>{if(!activeStudio(s)||s.busy)return;const file=e.target.files[0];if(!file)return;try{validateImage(file);if(s.coverPreview){URL.revokeObjectURL(s.coverPreview);s.urls.delete(s.coverPreview);}const url=URL.createObjectURL(file);s.coverPreview=url;s.urls.add(url);editor.querySelector('#cover-preview').innerHTML=`<img class="qr" src="${esc(url)}" alt="ตัวอย่างภาพปก">`;}catch(error){e.target.value='';toast(error.message);}});
 lockStudioControls(s);
}
function chapterEditor(chapter) {
 const s=state.studio;if(!activeStudio(s)||!chapter)return;clearPreviews(s,true);s.chapter=chapter;s.pages=(chapter.pages||[]).slice().sort((a,b)=>a.page_order-b.page_order).map(p=>({...p,uploaded:true,key:`saved-${p.id}`}));
 document.querySelector('#chapter-editor').innerHTML=`<section class="panel"><div class="section-head"><h2>ตอน ${esc(chapter.chapter_number)} · ${esc(chapter.title)}</h2><span class="pill">ฉบับร่างส่วนตัว</span></div><p class="muted">เพิ่มภาพหลายไฟล์ เรียงตามตัวเลขในชื่อไฟล์เมื่อเพิ่ม ใช้ปุ่มขึ้น/ลงเพื่อจัดลำดับ รูป GIF จะถูกระบบแปลงเป็นภาพนิ่งเฟรมแรก</p><div class="dropzone" id="dropzone"><strong>ลากภาพมาวางที่นี่</strong><label>หรือเลือกหลายไฟล์ (ไม่เกิน 5 MiB ต่อภาพ)<input id="page-files" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple></label></div><div class="actions"><button id="upload-pages">อัปโหลดหน้าที่ยังไม่ส่ง</button><button class="secondary" id="save-page-order">บันทึกลำดับ</button></div><p id="upload-status" class="muted" role="status"></p><div id="upload-grid" class="upload-grid"></div><div class="notice">ตอนจะยังเป็นส่วนตัวจนกดเผยแพร่ ต้องอัปโหลดทุกภาพและบันทึกลำดับสำเร็จก่อน ลบหรือจัดลำดับภาพได้เฉพาะตอนฉบับร่าง การลบภาพไม่สามารถย้อนกลับได้</div><div class="actions"><button id="publish-chapter">เผยแพร่ตอน</button><button class="danger" id="delete-chapter">ลบฉบับร่าง</button></div></section>`;
 const zone=document.querySelector('#dropzone');
 document.querySelector('#page-files').addEventListener('change',e=>{addPages([...e.target.files]);e.target.value='';});
 ['dragenter','dragover'].forEach(event=>zone.addEventListener(event,e=>{e.preventDefault();zone.classList.add('dragging');}));
 ['dragleave','drop'].forEach(event=>zone.addEventListener(event,e=>{e.preventDefault();zone.classList.remove('dragging');}));
 zone.addEventListener('drop',e=>addPages([...e.dataTransfer.files]));
 document.querySelector('#upload-pages').addEventListener('click',uploadPages);
 document.querySelector('#save-page-order').addEventListener('click',()=>studioOperation(async()=>{if(s.pages.some(p=>!p.uploaded))throw new Error('อัปโหลดทุกหน้าก่อนบันทึกลำดับ');await savePageOrder(s);toast('บันทึกลำดับแล้ว');}));
 document.querySelector('#publish-chapter').addEventListener('click',()=>studioOperation(async()=>{if(!s.pages.length||s.pages.some(p=>!p.uploaded))throw new Error('ต้องอัปโหลดทุกหน้าให้สำเร็จก่อน');if(!confirmPendingStudio(s)||!confirm('เผยแพร่ตอนนี้ให้ผู้อ่านทุกคน?'))return;await savePageOrder(s);await api(`/api/chapters/${idPath(s.chapter.id)}/publish`,{method:'POST',body:{}});toast('เผยแพร่ตอนแล้ว');await refreshStudio(s.selected.id,s);}));
 document.querySelector('#delete-chapter').addEventListener('click',()=>{if(s.busy||!confirmPendingStudio(s)||!confirm('ลบตอนฉบับร่างและภาพทั้งหมด? ไม่สามารถย้อนกลับได้'))return;studioOperation(async()=>{await api(`/api/chapters/${idPath(s.chapter.id)}`,{method:'DELETE'});for(const page of s.pages.filter(page=>page.uploaded))await discardUnusedImage(page.image_url);toast('ลบฉบับร่างแล้ว');await refreshStudio(s.selected.id,s);});});
 renderPages(s);lockStudioControls(s);document.querySelector('#chapter-editor').scrollIntoView({block:'start'});
}
function addPages(files) {
 const s=state.studio;if(!activeStudio(s)||s.busy)return;
 files.sort((a,b)=>a.name.localeCompare(b.name,'th',{numeric:true,sensitivity:'base'}));
 const errors=[];files.forEach(file=>{try{validateImage(file);const preview=URL.createObjectURL(file);s.urls.add(preview);s.pages.push({file,preview,uploaded:false,key:`local-${++addPages.counter}`,error:''});s.orderDirty=true;}catch(e){errors.push(e.message);}});renderPages();if(errors.length)toast(errors.join(' / '));
}addPages.counter=0;
function renderPages(s=state.studio) {
 if(!activeStudio(s)||!s.chapter)return;
 const grid=document.querySelector('#upload-grid');if(!grid)return;
 grid.innerHTML=s.pages.map((p,i)=>`<article class="upload-card">${p.preview||imageURL(p.image_url)?`<img src="${esc(p.preview||imageURL(p.image_url))}" alt="ตัวอย่างหน้า ${i+1}">`:''}<p>${i+1}. ${esc(p.file?.name||`หน้าที่อัปโหลด ${p.id}`)}</p><p class="${p.error?'error':'muted'}">${esc(p.error||(p.uploaded?'อัปโหลดแล้ว':'รออัปโหลด'))}</p><div class="actions"><button class="small secondary" data-action="move-page" data-index="${i}" data-direction="-1" aria-label="ย้ายหน้า ${i+1} ขึ้น" ${s.busy||i===0?'disabled':''}>↑</button><button class="small secondary" data-action="move-page" data-index="${i}" data-direction="1" aria-label="ย้ายหน้า ${i+1} ลง" ${s.busy||i===s.pages.length-1?'disabled':''}>↓</button><button class="small danger" data-action="remove-page" data-index="${i}" ${s.busy?'disabled':''}>${p.uploaded?'ลบหน้า':'นำออก'}</button></div></article>`).join('');
 document.querySelector('#publish-chapter').disabled=s.busy||!!s.uploadUncertain||!s.pages.length||s.pages.some(p=>!p.uploaded);
 document.querySelector('#upload-pages').disabled=s.busy||!!s.uploadUncertain||!s.pages.some(p=>!p.uploaded);
 document.querySelector('#save-page-order').disabled=s.busy||!!s.uploadUncertain||!s.pages.length||s.pages.some(p=>!p.uploaded);
 document.querySelector('#delete-chapter').disabled=s.busy;document.querySelector('#page-files').disabled=s.busy;
}
async function savePageOrder(s) {if(s.uploadUncertain)throw new Error('กรุณาโหลดข้อมูลตอนใหม่เพื่อตรวจสอบผลอัปโหลดก่อนบันทึกลำดับ');await api(`/api/chapters/${idPath(s.chapter.id)}/pages`,{method:'PUT',body:{page_ids:s.pages.map(p=>p.id)}});s.chapter.pages=s.pages.map((p,i)=>({id:p.id,image_url:p.image_url,page_order:i+1}));s.orderDirty=false;}
async function studioOperation(operation) {const s=state.studio;if(!activeStudio(s)||s.busy)return;setStudioBusy(s,true);try{await operation();}catch(e){toast(e.message);}finally{setStudioBusy(s,false);}}
async function uploadPages() {await studioOperation(async()=>{
 const s=state.studio,chapter=s.chapter,statusEl=document.querySelector('#upload-status');let failed=false;
 if(s.uploadUncertain)throw new Error('ยังยืนยันผลอัปโหลดครั้งก่อนไม่ได้ กรุณาโหลดข้อมูลตอนใหม่และตรวจสอบภาพก่อนเพิ่มหรือส่งซ้ำ');
 for(const p of s.pages){
  if(!activeStudio(s)||s.chapter!==chapter)return;if(p.uploaded)continue;
  statusEl.textContent=`กำลังอัปโหลด ${p.file.name}…`;
  try{
   const result=await api(`/api/chapters/${idPath(chapter.id)}/pages`,{method:'POST',body:p.file,raw:true});
   if(!result||result.id===undefined||!imageURL(result.image_url))throw new Error('ข้อมูลผลอัปโหลดไม่ครบ');
   Object.assign(p,result,{uploaded:true,error:''});chapter.pages=[...(chapter.pages||[]),{id:p.id,image_url:p.image_url,page_order:p.page_order}];
  }catch(e){p.uncertain=!e.saveRejected;if(p.uncertain)s.uploadUncertain=true;p.error=e.message+(p.uncertain?' · ต้องโหลดข้อมูลตอนใหม่เพื่อตรวจสอบก่อนส่งซ้ำ':'');failed=true;break;}
  if(!activeStudio(s)||s.chapter!==chapter)return;renderPages(s);
 }
 if(!activeStudio(s)||s.chapter!==chapter)return;
 if(!failed)await savePageOrder(s);
 if(activeStudio(s)&&s.chapter===chapter&&statusEl.isConnected)statusEl.textContent=failed?(s.pages.some(p=>p.uncertain)?'ยังยืนยันผลไม่ได้ หยุดส่งซ้ำเพื่อป้องกันหน้าซ้ำ กรุณาโหลดข้อมูลตอนใหม่':'อัปโหลดไม่ครบ กดอัปโหลดอีกครั้งเพื่อลองหน้าที่เหลือ'):'อัปโหลดและบันทึกลำดับสำเร็จ';
 });}
async function refreshStudio(selectedId,s=state.studio) {
 if(!activeStudio(s))return false;
 const selected=s.selected,chapter=s.chapter,list=await api('/api/studio');
 if(!activeStudio(s)||s.selected!==selected||s.chapter!==chapter||!document.querySelector('#studio-editor'))return false;
 s.series=list;s.uploadUncertain=false;clearPreviews(s);studioSidebar();seriesEditor(list.find(item=>String(item.id)===String(selectedId))||null);lockStudioControls(s);return true;
}
async function adminPage(token) {
 if(!requireRole(['admin']))return;const [reports,users]=await Promise.all([api('/api/admin/reports'),api('/api/admin/users')]);if(token!==state.route)return;
 app.innerHTML=`<div class="eyebrow">Moderation desk</div><h1>ดูแลพื้นที่ร่วมกัน</h1><p class="muted">จัดการรายงาน ซ่อนผลงาน และระงับบัญชีเท่านั้น ไม่มีการแต่งตั้งผู้ดูแลผ่านหน้านี้</p><section class="panel"><h2>คิวรายงาน</h2>${reports.length?reports.map(r=>`<article class="admin-item"><h3><a href="#/series/${idPath(r.series_id)}">${esc(r.series_title)}</a></h3><p>${esc(r.reason)}</p><p class="muted">ผู้รายงาน ${esc(r.reporter_name)} · สถานะ ${esc(r.status)}</p>${!['resolved','dismissed','hidden','closed'].includes(r.status)?`<div class="actions"><button class="secondary" data-action="resolve-report" data-id="${esc(r.id)}" data-resolution="dismiss">ยกเลิกรายงาน</button><button class="danger" data-action="resolve-report" data-id="${esc(r.id)}" data-resolution="hide">ซ่อนผลงาน</button></div>`:''}</article>`).join(''):empty('ยังไม่มีรายงาน')}</section><section class="panel"><h2>บัญชีผู้ใช้</h2><ul class="list">${users.map(u=>`<li><div class="row"><div>${esc(u.username)} <span class="badge">${esc(u.role)}</span><br><small>${u.suspended?'ถูกระงับ':'ใช้งานปกติ'}</small></div>${String(u.id)!==String(state.user.id)?`<button class="${u.suspended?'secondary':'danger'} small" data-action="suspend-user" data-id="${esc(u.id)}" data-suspended="${!u.suspended}">${u.suspended?'คืนสิทธิ์บัญชี':'ระงับบัญชี'}</button>`:''}</div></li>`).join('')}</ul></section>`;
}
async function formTask(form,operation) {const buttons=[...form.querySelectorAll('button')],disabled=buttons.map(b=>b.disabled);if(form.dataset.busy)return;if(form.dataset.uncertain){toast('กรุณาโหลดข้อมูลตรวจสอบผลครั้งก่อน ก่อนส่งซ้ำ');return;}form.dataset.busy='true';buttons.forEach(b=>b.disabled=true);const error=form.querySelector('.form-error');if(error)error.textContent='';try{await operation(new FormData(form));}catch(e){if(e.saveUncertain)form.dataset.uncertain='true';if(error)error.textContent=e.message;else toast(e.message);}finally{delete form.dataset.busy;buttons.forEach((b,i)=>b.disabled=disabled[i]);}}
app.addEventListener('submit',e=>{
 const form=e.target;if(!(form instanceof HTMLFormElement))return;e.preventDefault();
 if(form.id==='filter-form'){const params=new URLSearchParams(new FormData(form));location.hash=`/?${params}`;return;}
 const submissionToken=state.route,submissionHash=location.hash;
 const sameRoute=()=>submissionToken===state.route&&submissionHash===location.hash&&form.isConnected;
 formTask(form,async fd=>{
  const text=name=>String(fd.get(name)||'').trim();
  if(form.id==='login-form'||form.id==='register-form') {const register=form.id==='register-form';const body=register?{username:text('username'),email:text('email'),password:fd.get('password'),role:text('role'),pen_name:text('pen_name'),acceptGuidelines:fd.get('acceptGuidelines')==='on'}:{email:text('email'),password:fd.get('password')};await api(register?'/api/register':'/api/login',{method:'POST',body});await session();if(!sameRoute())return;if(register&&!state.user){toast('สมัครสำเร็จ กรุณาเข้าสู่ระบบ');location.hash='/login';}else location.hash='/profile';}
  else if(form.id==='report-form'){if(!state.user)throw new Error('กรุณาเข้าสู่ระบบก่อนส่งรายงาน');await api('/api/reports',{method:'POST',body:{series_id:form.dataset.id,reason:text('reason')}});form.reset();toast('ส่งรายงานให้ผู้ดูแลแล้ว');}
  else if(form.id==='upgrade-form'){await api('/api/upgrade',{method:'POST',body:{pen_name:text('pen_name'),acceptGuidelines:fd.get('acceptGuidelines')==='on'}});await session();toast('เปิดสิทธิ์นักเขียนแล้ว');if(sameRoute())await route();}
  else if(form.id==='profile-form'){
   const donation_url=text('donation_url');if(donation_url&&!httpsURL(donation_url))throw new Error('ใช้ลิงก์ HTTPS จาก buymeacoffee.com หรือ ko-fi.com เท่านั้น');
   const oldURL=form.dataset.replacedImageUrl,removeOld=fd.get('remove_replaced_image')==='on';
   const body={pen_name:text('pen_name'),donation_url},file=fd.get('donation_qr');
   if(file?.size)body.donation_qr_url=(await uploadImage(file)).image_url;
   await saveWithImage('/api/profile',{method:'PUT',body},body.donation_qr_url);
   form.dataset.uncertain='true';
   if(body.donation_qr_url)form.dataset.replacedImageUrl=body.donation_qr_url;
   toast('บันทึกโปรไฟล์แล้ว');await cleanupReplacedImage(oldURL,body.donation_qr_url,removeOld);
   try{await session();}catch{toast('บันทึกโปรไฟล์แล้ว แต่โหลดข้อมูลบัญชีใหม่ไม่ได้ กรุณาโหลดหน้าใหม่');return;}
   if(sameRoute())await route();
  }
  else if(form.id==='series-form'){
   const s=state.studio;if(!activeStudio(s)||!sameRoute())return;if(s.busy)throw new Error('รอการอัปโหลดให้เสร็จก่อน');if(!confirmPendingStudio(s,form))return;
   const selected=s.selected,chapter=s.chapter,oldURL=selected?.cover_image_url||'',removeOld=fd.get('remove_replaced_image')==='on';
   setStudioBusy(s,true);
   try{
    const body={title:text('title'),synopsis:text('synopsis'),genre:text('genre'),tags:text('tags').split(',').map(v=>v.trim()).filter(Boolean).join(','),status:text('status'),cover_image_url:oldURL},file=fd.get('cover');let newCover='';
    if(file?.size){newCover=(await uploadImage(file)).image_url;body.cover_image_url=newCover;}
    const result=await saveWithImage(selected?`/api/series/${idPath(selected.id)}`:'/api/series',{method:selected?'PUT':'POST',body},newCover);
    form.dataset.uncertain='true';
    if(newCover&&selected)selected.cover_image_url=newCover;
    toast('บันทึกผลงานแล้ว');await cleanupReplacedImage(oldURL,newCover,removeOld);
    if(!activeStudio(s)||s.selected!==selected||s.chapter!==chapter)return;
    try{await refreshStudio(selected?.id||result.id,s);}catch{toast('บันทึกผลงานแล้ว แต่โหลดห้องนักเขียนใหม่ไม่ได้ งานค้างยังอยู่ กรุณาโหลดข้อมูลตรวจสอบก่อนบันทึกซ้ำ');}
   }finally{setStudioBusy(s,false);}
  }
  else if(form.id==='chapter-form'){
   const s=state.studio;if(!activeStudio(s)||!sameRoute()||!s.selected)return;if(s.busy)throw new Error('กรุณารอการดำเนินการให้เสร็จ');if(!confirmPendingStudio(s,form))return;
   const selected=s.selected,chapter=s.chapter;setStudioBusy(s,true);
   try{
    const result=await saveWithImage(`/api/series/${idPath(selected.id)}/chapters`,{method:'POST',body:{title:text('title'),chapter_number:Number(text('chapter_number'))}});
    form.dataset.uncertain='true';
    toast('สร้างตอนฉบับร่างแล้ว');
    if(!activeStudio(s)||s.selected!==selected||s.chapter!==chapter)return;
    try{if(!await refreshStudio(selected.id,s))return;}catch{toast('สร้างตอนแล้ว แต่โหลดห้องนักเขียนใหม่ไม่ได้ กรุณาโหลดข้อมูลตรวจสอบก่อนสร้างซ้ำ');return;}
    if(!activeStudio(s)||String(s.selected?.id)!==String(selected.id))return;
    const ch=s.selected.chapters?.find(c=>String(c.id)===String(result.id));if(ch)chapterEditor(ch);
   }finally{setStudioBusy(s,false);}
  }
 });
});
app.addEventListener('click',async e=>{
 const button=e.target.closest('[data-action]');if(!button||button.disabled)return;const action=button.dataset.action,id=button.dataset.id;
 if(action==='edit-series'||action==='edit-chapter'){const s=state.studio;if(!activeStudio(s))return;if(s.busy)return toast('กรุณารอการอัปโหลดให้เสร็จ');if(pendingStudio(s)&&!confirm('งานที่ยังไม่บันทึกจะหายไป ต้องการเปลี่ยนหรือไม่?'))return;if(action==='edit-series'){clearPreviews(s);seriesEditor(s.series.find(item=>String(item.id)===id));}else chapterEditor(s.selected.chapters.find(ch=>String(ch.id)===id));return;}
 if(action==='move-page'||action==='remove-page'){
  const s=state.studio;if(s.busy)return;const i=Number(button.dataset.index);
  if(action==='move-page'){const j=i+Number(button.dataset.direction);if(j>=0&&j<s.pages.length){[s.pages[i],s.pages[j]]=[s.pages[j],s.pages[i]];s.orderDirty=true;}renderPages();}
  else {
   const p=s.pages[i];if(!p)return;
   if(p.uploaded){if(!confirm('ลบภาพหน้านี้จากฉบับร่างถาวร?'))return;await studioOperation(async()=>{await api(`/api/chapters/${idPath(s.chapter.id)}/pages/${idPath(p.id)}`,{method:'DELETE'});s.pages.splice(i,1);await discardUnusedImage(p.image_url);s.chapter.pages=(s.chapter.pages||[]).filter(page=>String(page.id)!==String(p.id));if(p.preview){URL.revokeObjectURL(p.preview);s.urls.delete(p.preview);}s.orderDirty=s.pages.length>0;if(s.pages.length&&s.pages.every(page=>page.uploaded))await savePageOrder(s);toast('ลบภาพแล้ว');});}
   else {s.pages.splice(i,1);if(p.preview){URL.revokeObjectURL(p.preview);s.urls.delete(p.preview);}s.orderDirty=true;renderPages();}
  }
  return;
 }
 const actionToken=state.route,actionHash=location.hash;
 const sameActionRoute=()=>actionToken===state.route&&actionHash===location.hash&&button.isConnected;
 button.disabled=true;
 try{
  if(action==='retry'){await route();}
  else if(action==='bookmark'||action==='like'){if(!state.user)throw new Error('กรุณาเข้าสู่ระบบก่อนเก็บเรื่องหรือกดถูกใจ');const result=await api(action==='bookmark'?`/api/series/${idPath(id)}/bookmark`:`/api/chapters/${idPath(id)}/like`,{method:'POST',body:{}});if(action==='bookmark'){button.textContent=result.bookmarked?'เก็บเข้าชั้นแล้ว ✓':'เก็บเข้าชั้นหนังสือ';button.setAttribute('aria-pressed',String(result.bookmarked));toast(result.bookmarked?'เพิ่มในชั้นหนังสือแล้ว':'นำออกจากชั้นหนังสือแล้ว');}else{button.textContent=result.liked?'ถูกใจแล้ว ♥':'ถูกใจ ♡';button.setAttribute('aria-pressed',String(result.liked));}}
  else if(action==='archive-series'){
   const s=state.studio;if(!activeStudio(s))return;if(s.busy)throw new Error('กรุณารอการอัปโหลดให้เสร็จ');
   if(!confirmPendingStudio(s)||!confirm('เก็บผลงานนี้? ผู้อ่านจะไม่สามารถเข้าถึงเรื่องและตอนทั้งหมด และยังคืนสถานะเองไม่ได้'))return;
   await studioOperation(async()=>{await api(`/api/series/${idPath(id)}`,{method:'DELETE'});toast('เก็บผลงานแล้ว');if(sameActionRoute()&&activeStudio(s))await refreshStudio(id,s);});
  }
  else if(action==='logout'){
   await api('/api/logout',{method:'POST',body:{}});state.user=null;state.csrf='';account();
   try{await session();}catch{state.sessionError='โหลดสถานะบัญชีไม่ได้ กรุณาลองใหม่';}
   if(sameActionRoute())location.hash='/';
  }
  else if(action==='resolve-report'){if(button.dataset.resolution==='hide'&&!confirm('ซ่อนผลงานที่ถูกรายงานนี้?'))return;await api(`/api/admin/reports/${idPath(id)}/resolve`,{method:'POST',body:{action:button.dataset.resolution}});toast('จัดการรายงานแล้ว');if(sameActionRoute())await route();}
  else if(action==='suspend-user'){const suspended=button.dataset.suspended==='true';if(!confirm(suspended?'ระงับบัญชีนี้?':'คืนสิทธิ์บัญชีนี้?'))return;await api(`/api/admin/users/${idPath(id)}/suspend`,{method:'POST',body:{suspended}});toast('ปรับสถานะบัญชีแล้ว');if(sameActionRoute())await route();}
 }catch(error){toast(error.message);}finally{button.disabled=false;}
});
async function route() {
 const targetHash=location.hash || '#/';
 if(state.restoringHash&&targetHash===state.currentHash){state.restoringHash=false;return;}
 if(state.studio?.busy){if(targetHash!==state.currentHash){toast('กำลังบันทึก กรุณารอให้เสร็จก่อนเปลี่ยนหน้า');state.restoringHash=true;location.replace(state.currentHash || '#/');}return;}
 if(pendingStudio(state.studio)&&!confirm('ยังมีงานที่ไม่ได้บันทึกหรือยังยืนยันผลไม่ได้ ต้องการออกจากห้องนักเขียนหรือไม่?')){if(targetHash!==state.currentHash){state.restoringHash=true;location.replace(state.currentHash || '#/');}return;}
 state.currentHash=targetHash;
 state.cleanup.splice(0).forEach(fn=>fn());const token=++state.route;app.className='fade-in';app.innerHTML='<div class="loading" role="status">กำลังเปิดพื้นที่ของคุณ…</div>';window.scrollTo(0,0);
 const raw=location.hash.slice(1)||'/', [path,query='']=raw.split('?'), segments=path.split('/').filter(Boolean);document.title='Kartoon — พักใจในลายเส้น';
 try{
  if(state.sessionError){try{await session();}catch(e){state.sessionError=e.message;}}
  if(token!==state.route)return;
  if(segments[0]==='read')app.classList.add('reader-main');
  if(!segments.length)await discover(new URLSearchParams(query),token);
  else if(segments[0]==='series'&&segments[1])await seriesDetail(decodeURIComponent(segments[1]),token);
  else if(segments[0]==='read'&&segments[1])await reader(decodeURIComponent(segments[1]),token);
  else if(segments[0]==='login'||segments[0]==='register')authPage(segments[0]==='register');
  else if(['profile','studio','admin'].includes(segments[0])){if(state.sessionError)throw new Error(state.sessionError);if(segments[0]==='profile')await profilePage(token);else if(segments[0]==='studio')await studioPage(token);else await adminPage(token);}
  else app.innerHTML=empty('ไม่พบหน้านี้','เลือกค้นพบจากเมนูเพื่อกลับไปหน้าหลัก');
 }catch(error){if(token===state.route)app.innerHTML=errorBlock(error.message);}
}
window.addEventListener('hashchange',route);
window.addEventListener('beforeunload',event=>{if(state.studio?.busy||pendingStudio(state.studio)){event.preventDefault();event.returnValue='';}});
(async()=>{try{await session();}catch(error){state.sessionError=error.message;}await route();})();
