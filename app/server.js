'use strict';
// HTTP (сайт+API) + TCP (JSON-строки) + UDP (текстовые датаграммы). Без зависимостей: node server.js
const http=require('http'),net=require('net'),dgram=require('dgram'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const HOST=process.env.HOST||'127.0.0.1',HTTP_PORT=+process.env.PORT||3000,TCP_PORT=+process.env.TCP_PORT||4000,UDP_PORT=+process.env.UDP_PORT||4001;
const DB=path.join(__dirname,'db.json'),PUB=__dirname;
const MIME={'.html':'text/html;charset=utf-8','.css':'text/css','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml'};
const hash=(p,salt=crypto.randomBytes(16).toString('hex'))=>({salt,hash:crypto.scryptSync(p,salt,64).toString('hex')});
const verify=(p,u)=>{const a=Buffer.from(crypto.scryptSync(p,u.salt,64).toString('hex')),b=Buffer.from(u.hash);return a.length===b.length&&crypto.timingSafeEqual(a,b)};
let db;
const save=()=>{fs.writeFileSync(DB+'.tmp',JSON.stringify(db,null,2));fs.renameSync(DB+'.tmp',DB)};
if(fs.existsSync(DB))db=JSON.parse(fs.readFileSync(DB,'utf8'));
else{
  const pass=process.env.ADMIN_PASS||crypto.randomBytes(5).toString('hex');
  db={seq:10,users:[{id:1,name:'admin',email:'admin@shop.local',role:'admin',...hash(pass)}],
    products:[
      {id:1,name:'BRUTAL HOODIE',price:89,desc:'Тяжёлый хлопок, жёсткий крой.',stock:20},
      {id:2,name:'GLASS LAMP',price:140,desc:'Матовое стекло, холодный свет.',stock:8},
      {id:3,name:'CONCRETE MUG',price:25,desc:'Кружка из бетона. Да, серьёзно.',stock:50},
      {id:4,name:'LIQUID POSTER',price:35,desc:'Принт A2, плотная бумага.',stock:30}],
    orders:[]};
  save();console.log(`[admin] email: admin@shop.local  пароль: ${pass}`);
}
const sessions=new Map(),fails=new Map();
const pub=u=>({id:u.id,name:u.name,email:u.email,role:u.role});
const send=(res,code,obj)=>{res.writeHead(code,{'Content-Type':'application/json','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(obj))};
const body=req=>new Promise((ok,no)=>{let s='';req.on('data',c=>{s+=c;if(s.length>1e5){req.destroy();no(new Error('big'))}});req.on('end',()=>{try{ok(s?JSON.parse(s):{})}catch(e){no(e)}})});
const authUser=t=>{const id=sessions.get(t);return id&&db.users.find(u=>u.id===id)};
const stats=()=>({users:db.users.length,products:db.products.length,orders:db.orders.length,revenue:db.orders.reduce((s,o)=>s+o.total,0)});
const str=(v,min,max)=>typeof v==='string'&&v.trim().length>=min&&v.trim().length<=max?v.trim():null;
function product(b){
  const name=str(b.name,1,60),desc=str(b.desc||'',0,200),price=+b.price,stock=+b.stock;
  if(!name||desc===null||!(price>=0)||!Number.isInteger(stock)||stock<0)return null;
  return{name,desc,price:Math.round(price*100)/100,stock};
}
async function api(req,res,url,ip){
  const tok=(req.headers.authorization||'').replace('Bearer ','');const me=authUser(tok);
  const m=req.method,p=url.pathname;
  const b=(m==='POST'||m==='PUT')?await body(req):{};
  if(m==='GET'&&p==='/api/products')return send(res,200,db.products);
  if(m==='POST'&&p==='/api/register'){
    const name=str(b.name,2,40),email=str(b.email,5,80)?.toLowerCase(),pw=b.password;
    if(!name||!email||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)||typeof pw!=='string'||pw.length<8||pw.length>100)
      return send(res,400,{error:'Проверьте поля: имя, email, пароль от 8 символов'});
    if(db.users.some(u=>u.email===email))return send(res,409,{error:'Email уже занят'});
    const u={id:db.seq++,name,email,role:'user',...hash(pw)};db.users.push(u);save();
    const t=crypto.randomBytes(24).toString('hex');sessions.set(t,u.id);
    return send(res,201,{token:t,user:pub(u)});
  }
  if(m==='POST'&&p==='/api/login'){
    if((fails.get(ip)||0)>=10)return send(res,429,{error:'Слишком много попыток, подождите'});
    const u=db.users.find(x=>x.email===String(b.email||'').trim().toLowerCase());
    if(!u||typeof b.password!=='string'||!verify(b.password,u)){
      fails.set(ip,(fails.get(ip)||0)+1);setTimeout(()=>fails.delete(ip),300000).unref();
      return send(res,401,{error:'Неверный email или пароль'});
    }
    const t=crypto.randomBytes(24).toString('hex');sessions.set(t,u.id);
    return send(res,200,{token:t,user:pub(u)});
  }
  if(m==='GET'&&p==='/api/me')return me?send(res,200,pub(me)):send(res,401,{error:'Не авторизован'});
  if(m==='POST'&&p==='/api/order'){
    if(!me)return send(res,401,{error:'Войдите в аккаунт'});
    if(!Array.isArray(b.items)||!b.items.length||b.items.length>50)return send(res,400,{error:'Пустая корзина'});
    let total=0;const items=[];
    for(const it of b.items){
      const pr=db.products.find(x=>x.id===it.id),q=+it.qty;
      if(!pr||!Number.isInteger(q)||q<1||q>pr.stock)return send(res,400,{error:'Нет в наличии: '+(pr?pr.name:'товар')});
      items.push({id:pr.id,name:pr.name,qty:q,price:pr.price});total+=pr.price*q;
    }
    items.forEach(i=>{db.products.find(x=>x.id===i.id).stock-=i.qty});
    const o={id:db.seq++,userId:me.id,items,total:Math.round(total*100)/100,date:new Date().toISOString()};
    db.orders.push(o);save();return send(res,201,o);
  }
  if(p.startsWith('/api/admin/')){
    if(!me||me.role!=='admin')return send(res,403,{error:'Только для админа'});
    if(m==='GET'&&p==='/api/admin/stats')return send(res,200,stats());
    if(m==='GET'&&p==='/api/admin/users')return send(res,200,db.users.map(pub));
    if(m==='GET'&&p==='/api/admin/orders')return send(res,200,db.orders);
    if(m==='POST'&&p==='/api/admin/products'){
      const v=product(b);if(!v)return send(res,400,{error:'Неверные данные товара'});
      const pr={id:db.seq++,...v};db.products.push(pr);save();return send(res,201,pr);
    }
    const mm=p.match(/^\/api\/admin\/products\/(\d+)$/);
    if(mm){
      const i=db.products.findIndex(x=>x.id===+mm[1]);if(i<0)return send(res,404,{error:'Не найдено'});
      if(m==='PUT'){const v=product(b);if(!v)return send(res,400,{error:'Неверные данные товара'});db.products[i]={id:db.products[i].id,...v};save();return send(res,200,db.products[i])}
      if(m==='DELETE'){db.products.splice(i,1);save();return send(res,200,{ok:true})}
    }
  }
  send(res,404,{error:'Не найдено'});
}
http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://x');
    if(url.pathname.startsWith('/api/'))return await api(req,res,url,req.socket.remoteAddress);
    let f=decodeURIComponent(url.pathname);if(f==='/')f='/index.html';if(f==='/admin')f='/admin.html';
    const full=path.normalize(path.join(PUB,f));
    if(!full.startsWith(PUB+path.sep)||!fs.existsSync(full)||!fs.statSync(full).isFile()){res.writeHead(404);return res.end('404')}
    res.writeHead(200,{'Content-Type':MIME[path.extname(full)]||'application/octet-stream','X-Content-Type-Options':'nosniff'});
    fs.createReadStream(full).pipe(res);
  }catch(e){send(res,400,{error:'Bad request'})}
}).listen(HTTP_PORT,HOST,()=>console.log(`HTTP http://${HOST}:${HTTP_PORT}  (админка: /admin)`));

// TCP: одна JSON-команда на строку. {"cmd":"ping"} | {"cmd":"products"} | {"cmd":"stats","token":"<admin token>"}
net.createServer(s=>{
  s.setEncoding('utf8');s.setTimeout(60000,()=>s.destroy());let buf='';
  s.on('data',d=>{
    buf+=d;if(buf.length>1e4)return s.destroy();
    let i;while((i=buf.indexOf('\n'))>=0){
      const line=buf.slice(0,i).trim();buf=buf.slice(i+1);let r;
      try{
        const c=JSON.parse(line);
        if(c.cmd==='ping')r={ok:true,pong:Date.now()};
        else if(c.cmd==='products')r={ok:true,products:db.products};
        else if(c.cmd==='stats'){const u=authUser(c.token);r=u&&u.role==='admin'?{ok:true,...stats()}:{ok:false,error:'forbidden'}}
        else r={ok:false,error:'unknown cmd'};
      }catch{r={ok:false,error:'bad json'}}
      s.write(JSON.stringify(r)+'\n');
    }
  });
  s.on('error',()=>{});
}).listen(TCP_PORT,HOST,()=>console.log(`TCP  ${HOST}:${TCP_PORT}`));

// UDP: текстовые датаграммы "ping" | "products" | "count"
const udp=dgram.createSocket('udp4');
udp.on('message',(msg,rinfo)=>{
  const t=msg.toString().trim().toLowerCase();
  const r=t==='ping'?'pong':t==='products'?JSON.stringify(db.products.map(p=>({id:p.id,name:p.name,price:p.price}))):t==='count'?String(db.products.length):'unknown';
  udp.send(r,rinfo.port,rinfo.address);
});
udp.on('error',e=>console.log('UDP error',e.message));
udp.bind(UDP_PORT,HOST,()=>console.log(`UDP  ${HOST}:${UDP_PORT}`));
