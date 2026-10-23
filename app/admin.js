const $=s=>document.querySelector(s);
const h=(t,a={},...c)=>{const e=document.createElement(t);Object.assign(e,a);e.append(...c);return e};
let token=localStorage.getItem('t'),editId=null;
const api=async(p,o={})=>{const r=await fetch(p,{...o,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:o.body&&JSON.stringify(o.body)});const d=await r.json();if(!r.ok)throw new Error(d.error||'Ошибка');return d};
const table=(el,head,rows)=>el.replaceChildren(h('tr',{},...head.map(x=>h('th',{textContent:x}))),...rows.map(r=>h('tr',{},...r.map(c=>h('td',{},c instanceof Node?c:String(c))))));
async function load(){
  const [s,p,u,o]=await Promise.all([api('/api/admin/stats'),api('/api/products'),api('/api/admin/users'),api('/api/admin/orders')]);
  $('#stats').replaceChildren(...[['Пользователи',s.users],['Товары',s.products],['Заказы',s.orders],['Выручка','$'+s.revenue]].map(([k,v])=>h('div',{className:'glass stat'},h('b',{textContent:v}),k)));
  table($('#pt'),['ID','Название','Цена','Остаток',''],p.map(x=>[x.id,x.name,'$'+x.price,x.stock,h('span',{},
    h('button',{className:'btn sm',textContent:'Изм.',onclick:()=>{editId=x.id;$('#pn').value=x.name;$('#pd').value=x.desc;$('#pp').value=x.price;$('#ps').value=x.stock;scrollTo(0,document.body.scrollHeight/3)}}),' ',
    h('button',{className:'btn sm hot',textContent:'Удал.',onclick:async()=>{if(confirm('Удалить '+x.name+'?')){await api('/api/admin/products/'+x.id,{method:'DELETE'});load()}}}))]));
  table($('#ut'),['ID','Имя','Email','Роль'],u.map(x=>[x.id,x.name,x.email,x.role]));
  table($('#ot'),['№','Пользователь','Состав','Сумма','Дата'],o.map(x=>[x.id,x.userId,x.items.map(i=>i.name+'×'+i.qty).join(', '),'$'+x.total,new Date(x.date).toLocaleString()]));
}
async function enter(){try{await load();$('#login').hidden=true;$('#app').hidden=false}catch(e){$('#login').hidden=false;$('#app').hidden=true;if(token)$('#m').textContent=e.message}}
$('#go').onclick=async()=>{try{const d=await api('/api/login',{method:'POST',body:{email:$('#e').value,password:$('#p').value}});
  if(d.user.role!=='admin'){$('#m').textContent='Нет прав админа';return}token=d.token;localStorage.setItem('t',token);enter()}catch(e){$('#m').textContent=e.message}};
const clear=()=>{editId=null;['#pn','#pd','#pp','#ps'].forEach(s=>$(s).value='')};
$('#reset').onclick=clear;
$('#save').onclick=async()=>{try{const b={name:$('#pn').value,desc:$('#pd').value,price:$('#pp').value,stock:$('#ps').value};
  await api(editId?'/api/admin/products/'+editId:'/api/admin/products',{method:editId?'PUT':'POST',body:b});clear();$('#pm').textContent='';load()}catch(e){$('#pm').textContent=e.message}};
addEventListener('pointermove',e=>{document.body.style.setProperty('--mx',(e.clientX/innerWidth-.5)*2);document.body.style.setProperty('--my',(e.clientY/innerHeight-.5)*2)});
enter();
