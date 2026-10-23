const $=s=>document.querySelector(s);
const h=(t,a={},...c)=>{const e=document.createElement(t);Object.assign(e,a);e.append(...c);return e};
let token=localStorage.getItem('t'),user=null,products=[],cart={},mode='login';
const api=async(p,o={})=>{const r=await fetch(p,{...o,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:o.body&&JSON.stringify(o.body)});const d=await r.json();if(!r.ok)throw new Error(d.error||'Ошибка');return d};
// кинетический заголовок
const t=$('#title');t.dataset.t.split(' ').forEach((w,wi,all)=>{const s=h('span',{className:'w'});[...w].forEach((ch,i)=>s.append(h('span',{className:'c',textContent:ch},)));t.append(s)});
t.querySelectorAll('.c').forEach((c,i)=>c.style.setProperty('--i',i));
$('#tk').textContent=('BRUTAL ✦ GLASS ✦ DROP 2026 ✦ FREE SHIPPING ✦ ').repeat(8);
// параллакс глубины
addEventListener('pointermove',e=>{document.body.style.setProperty('--mx',(e.clientX/innerWidth-.5)*2);document.body.style.setProperty('--my',(e.clientY/innerHeight-.5)*2)});
const hue=['#d7ff3a','#ff3ea5','#3a6bff','#ffb13a'];
function render(){
  const g=$('#grid');g.replaceChildren(...products.map((p,i)=>{
    const c=h('article',{className:'glass card'},h('div',{className:'orb',textContent:p.name[0]}),h('h3',{textContent:p.name}),h('p',{className:'muted',textContent:p.desc}),
      h('div',{className:'price',textContent:'$'+p.price}),h('span',{className:'muted',textContent:p.stock>0?'В наличии: '+p.stock:'Нет в наличии'}),
      h('button',{className:'btn hot',textContent:'В корзину',disabled:p.stock<1,onclick:()=>{cart[p.id]=Math.min((cart[p.id]||0)+1,p.stock);drawCart()}}));
    c.querySelector('.orb').style.setProperty('--c1',hue[i%4]);
    c.onpointermove=e=>{const r=c.getBoundingClientRect();c.style.setProperty('--ry',((e.clientX-r.left)/r.width-.5)*14+'deg');c.style.setProperty('--rx',-((e.clientY-r.top)/r.height-.5)*14+'deg')};
    c.onpointerleave=()=>{c.style.setProperty('--rx','0deg');c.style.setProperty('--ry','0deg')};
    return c}));
}
function drawCart(){
  const ids=Object.keys(cart).filter(id=>products.some(p=>p.id==id));let sum=0,n=0;
  $('#items').replaceChildren(...ids.map(id=>{const p=products.find(x=>x.id==id),q=cart[id];sum+=p.price*q;n+=q;
    return h('div',{className:'row'},h('span',{textContent:`${p.name} ×${q}`}),h('button',{className:'btn sm',textContent:'−',onclick:()=>{if(--cart[id]<1)delete cart[id];drawCart()}}))}));
  $('#cnt').textContent=n;$('#total').textContent='Итого: $'+Math.round(sum*100)/100;
}
function setUser(u){user=u;$('#authBtn').textContent=u?u.name:'Вход';$('#adminLink').hidden=!(u&&u.role==='admin');$('#logout').hidden=!u}
function setMode(m){mode=m;$('#fName').hidden=m!=='register';document.querySelectorAll('[data-m]').forEach(b=>b.classList.toggle('alt',b.dataset.m===m))}
document.querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>setMode(b.dataset.m));
$('#authBtn').onclick=()=>user?$('#cart').classList.add('open'):$('#authDlg').showModal();
$('#authX').onclick=()=>$('#authDlg').close();
$('#authGo').onclick=async()=>{try{
  const d=await api('/api/'+mode,{method:'POST',body:{name:$('#fName').value,email:$('#fEmail').value,password:$('#fPass').value}});
  token=d.token;localStorage.setItem('t',token);setUser(d.user);$('#authDlg').close();$('#fPass').value='';$('#authMsg').textContent='';
}catch(e){$('#authMsg').textContent=e.message}};
$('#cartBtn').onclick=()=>$('#cart').classList.add('open');$('#cartX').onclick=()=>$('#cart').classList.remove('open');
$('#logout').onclick=()=>{token=null;localStorage.removeItem('t');setUser(null)};
$('#buy').onclick=async()=>{
  if(!user){$('#authDlg').showModal();return}
  try{const o=await api('/api/order',{method:'POST',body:{items:Object.entries(cart).map(([id,qty])=>({id:+id,qty}))}});
    cart={};drawCart();$('#cartMsg').textContent='Заказ №'+o.id+' оформлен: $'+o.total;products=await api('/api/products');render();
  }catch(e){$('#cartMsg').textContent=e.message}};
(async()=>{products=await api('/api/products');render();drawCart();
  if(token)try{setUser(await api('/api/me'))}catch{token=null;localStorage.removeItem('t')}})();
