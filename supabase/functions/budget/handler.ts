type Env={url:string;publicKey:string;serviceKey:string;origins:string[]};
type Fetch=typeof fetch;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
class HttpError extends Error{status:number;constructor(status:number,message:string){super(message);this.status=status}}
function validDate(x:unknown):x is string{return typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(new Date(x+'T12:00:00Z').getTime())&&new Date(x+'T12:00:00Z').toISOString().slice(0,10)===x}
export async function tokenHash(token:string){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('')}
export function createBudgetHandler(env:Env,request:Fetch=fetch,now:()=>number=Date.now){
 return async(req:Request):Promise<Response>=>{
  const origin=req.headers.get('Origin')||'';
  const headers:Record<string,string>={'Content-Type':'application/json','Cache-Control':'no-store, private','Vary':'Origin','X-Content-Type-Options':'nosniff'};
  const respond=(status:number,value:unknown)=>new Response(JSON.stringify(value),{status,headers});
  if(!env.url||!env.publicKey||!env.serviceKey||!env.origins.length)return respond(503,{error:'Bütçe bağlantısı henüz tamamlanmadı.'});
  if(!env.origins.includes(origin))return respond(403,{error:'Bu site üzerinden erişime izin verilmiyor.'});
  headers['Access-Control-Allow-Origin']=origin;headers['Access-Control-Allow-Headers']='authorization, apikey, content-type, x-budget-token';headers['Access-Control-Allow-Methods']='POST, OPTIONS';
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method!=='POST')return respond(405,{error:'Desteklenmeyen işlem.'});
  const auth=req.headers.get('Authorization');
  if(!auth?.startsWith('Bearer ')||auth.length<20)return respond(401,{error:'Giriş yapman gerekiyor.'});
  const base=env.url.replace(/\/$/,'');
  const db=async(path:string,method='GET',body?:unknown,prefer='return=representation')=>{
   const r=await request(base+'/rest/v1/'+path,{method,headers:{apikey:env.serviceKey,Authorization:'Bearer '+env.serviceKey,'Content-Type':'application/json',Prefer:prefer},...(body!==undefined?{body:JSON.stringify(body)}:{})});
   const data=await r.json().catch(()=>null);if(!r.ok)throw new HttpError(500,'Bütçe işlemi tamamlanamadı.');return data;
  };
  try{
   // Verifies signature/session with Auth. Never trust a client-supplied user or house id.
   const userResponse=await request(base+'/auth/v1/user',{headers:{apikey:env.publicKey,Authorization:auth}});
   if(!userResponse.ok)throw new HttpError(401,'Oturumun sona erdi. Yeniden giriş yap.');
   const user=await userResponse.json();if(!UUID.test(user.id)||!user.email)throw new HttpError(401,'Geçerli hesap bulunamadı.');
   const members=await db('household_members?user_id=eq.'+user.id+'&select=household_id,can_manage_budget');
   if(members.length!==1||members[0].can_manage_budget!==true)throw new HttpError(403,'Bütçeye erişim yetkin yok.');
   const house=members[0].household_id;if(!UUID.test(house))throw new HttpError(403,'Ev üyeliği bulunamadı.');
   if(Number(req.headers.get('Content-Length')||0)>10000)throw new HttpError(413,'İstek çok büyük.');
   const raw=await req.text();if(raw.length>10000)throw new HttpError(413,'İstek çok büyük.');
   let body:Record<string,any>;try{body=JSON.parse(raw)}catch{throw new HttpError(400,'İstek biçimi geçersiz.')}
   if(!body||Array.isArray(body)||typeof body!=='object')throw new HttpError(400,'İstek biçimi geçersiz.');
   if(body.action==='unlock'){
    if(typeof body.password!=='string'||!body.password||body.password.length>512)throw new HttpError(400,'Şifreni gir.');
    const allowed=await db('rpc/consume_budget_unlock_attempt','POST',{p_user:user.id});
    if(allowed!==true)throw new HttpError(429,'Çok fazla deneme yapıldı. 15 dakika sonra tekrar dene.');
    const proof=await request(base+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:env.publicKey,'Content-Type':'application/json'},body:JSON.stringify({email:user.email,password:body.password})});
    const verified=await proof.json().catch(()=>null);
    if(!proof.ok||!verified?.access_token||verified?.user?.id!==user.id)throw new HttpError(401,'Şifre doğrulanamadı.');
    // Retire the temporary password verification session, never the user's active app session.
    await request(base+'/auth/v1/logout?scope=local',{method:'POST',headers:{apikey:env.publicKey,Authorization:'Bearer '+verified.access_token}});
    const bytes=crypto.getRandomValues(new Uint8Array(32));const grant=Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
    const expires=now()+10*60*1000;
    await db('budget_grants?user_id=eq.'+user.id+'&expires_at=lt.'+encodeURIComponent(new Date(now()).toISOString()),'DELETE');
    await db('budget_grants','POST',{token_hash:await tokenHash(grant),household_id:house,user_id:user.id,expires_at:new Date(expires).toISOString()});
    return respond(200,{grant,expires_at:expires});
   }
   const rawGrant=req.headers.get('X-Budget-Token')||'';
   if(!/^[a-f0-9]{64}$/.test(rawGrant))throw new HttpError(403,'Bütçe kilitli. Önce şifreni doğrula.');
   const hash=await tokenHash(rawGrant);
   const grantPath='budget_grants?token_hash=eq.'+hash+'&user_id=eq.'+user.id+'&household_id=eq.'+house;
   if(body.action==='lock'){await db(grantPath,'DELETE');return respond(200,{locked:true})}
   const grants=await db(grantPath+'&expires_at=gt.'+encodeURIComponent(new Date(now()).toISOString())+'&select=token_hash');
   if(grants.length!==1)throw new HttpError(403,'Bütçe kilidi sona erdi. Şifreni yeniden doğrula.');
   if(body.action==='list'){
    if(typeof body.month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(body.month)||!validDate(body.month+'-01'))throw new HttpError(400,'Geçerli bir ay seç.');
    const start=body.month+'-01';const date=new Date(start+'T12:00:00Z');date.setUTCMonth(date.getUTCMonth()+1);const end=date.toISOString().slice(0,10);
    const transactions=[];for(let offset=0;offset<10000;offset+=500){const batch=await db('budget_transactions?household_id=eq.'+house+'&date=gte.'+start+'&date=lt.'+end+'&select=id,type,amount_cents,category,description,date,paid_by&order=date.desc,id&limit=500&offset='+offset);transactions.push(...batch);if(batch.length<500)return respond(200,{transactions});}
    throw new HttpError(422,'Bu ay çok fazla kayıt var. Tarih aralığının daraltılması gerekiyor.');
   }
   if(body.action==='add'){
    const t=body.transaction;
    if(!t||!UUID.test(t.id)||!['income','expense'].includes(t.type)||!Number.isSafeInteger(t.amount_cents)||t.amount_cents<=0||t.amount_cents>1e12||!validDate(t.date)||typeof t.description!=='string'||!t.description.trim()||t.description.length>160||!['Serkan','Rabia','Birlikte'].includes(t.paid_by)||!['Market','Ev','Ulaşım','Gezi','Arya','Fatura','Sağlık','Diğer'].includes(t.category))throw new HttpError(400,'Muhasebe kaydının alanlarını kontrol et.');
    await db('budget_transactions','POST',{id:t.id,household_id:house,type:t.type,amount_cents:t.amount_cents,category:t.category,description:t.description.trim(),date:t.date,paid_by:t.paid_by,created_by:user.id},'resolution=ignore-duplicates,return=minimal');
    return respond(200,{saved:true});
   }
   if(body.action==='delete'){
    if(typeof body.id!=='string'||!UUID.test(body.id))throw new HttpError(400,'Kayıt kimliği geçersiz.');
    await db('budget_transactions?id=eq.'+body.id+'&household_id=eq.'+house,'DELETE');return respond(200,{deleted:true});
   }
   throw new HttpError(400,'Desteklenmeyen bütçe işlemi.');
  }catch(error){return respond(error instanceof HttpError?error.status:500,{error:error instanceof HttpError?error.message:'İşlem tamamlanamadı. Lütfen yeniden dene.'})}
 };
}
