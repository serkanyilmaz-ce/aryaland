import {type Item,type Transaction,validateItem} from './domain';
const envUrl=import.meta.env.VITE_SUPABASE_URL?.trim()||'';
const envKey=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()||'';
export const cloud=!!envUrl&&!!envKey;
export const configIncomplete=!!envUrl!==!!envKey;
const url=envUrl.replace(/\/$/,'');
type Session={access_token:string;refresh_token:string;expires_at:number;user:{id:string;email:string}};
type Member={household_id:string;user_id:string;display_name:string};
let session:Session|null=null;
try{session=JSON.parse(sessionStorage.getItem('aryaland.auth')||'null')}catch{session=null}
export let member:Member|null=null;
function saveSession(s:Session|null){session=s;if(s)sessionStorage.setItem('aryaland.auth',JSON.stringify(s));else sessionStorage.removeItem('aryaland.auth');}
export function currentSession(){return session}
async function authFetch(path:string,body?:object,bearer?:string){
 const r=await fetch(url+'/auth/v1/'+path,{method:body?'POST':'GET',headers:{apikey:envKey,'Content-Type':'application/json',...(bearer?{Authorization:'Bearer '+bearer}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const data=await r.json().catch(()=>null);if(!r.ok)throw new Error('Giriş doğrulanamadı. E-posta ve şifreni kontrol et.');return data;
}
export async function login(email:string,password:string){
 const s=await authFetch('token?grant_type=password',{email,password});saveSession({...s,expires_at:Date.now()+s.expires_in*1000});
 try{await loadMember()}catch(e){await logout();throw e}
}
let refresh:Promise<void>|null=null;
async function token():Promise<string>{
 if(!session)throw new Error('Devam etmek için giriş yap.');
 if(session.expires_at<Date.now()+60000){
   if(!refresh)refresh=(async()=>{try{const s=await authFetch('token?grant_type=refresh_token',{refresh_token:session!.refresh_token});saveSession({...s,expires_at:Date.now()+s.expires_in*1000})}catch{saveSession(null);throw new Error('Oturum süresi doldu. Yeniden giriş yap.')}finally{refresh=null}})();
   await refresh;
 }
 return session!.access_token;
}
export async function logout(){
 if(session)await fetch(url+'/auth/v1/logout?scope=local',{method:'POST',headers:{apikey:envKey,Authorization:'Bearer '+session.access_token}}).catch(()=>{});
 saveSession(null);member=null;
}
async function rest(path:string,method='GET',body?:unknown){
 const bearer=await token();const r=await fetch(url+'/rest/v1/'+path,{method,headers:{apikey:envKey,Authorization:'Bearer '+bearer,'Content-Type':'application/json',Prefer:'return=representation'},...(body!==undefined?{body:JSON.stringify(body)}:{})});
 const result=await r.json().catch(()=>null);
 if(!r.ok)throw new Error(r.status===401?'Oturumun sona erdi. Yeniden giriş yap.':r.status===403?'Bu işlem için ev üyeliği veya yetki bulunamadı.':'Kayıt işlemi tamamlanamadı. Bağlantını kontrol et.');return result;
}
export async function loadMember(){const rows=await rest('household_members?user_id=eq.'+session!.user.id+'&select=household_id,user_id,display_name');if(rows.length!==1)throw new Error('Bu hesap bir eve bağlı değil. Ev üyeliğini tamamlamak gerekiyor.');member=rows[0];return member!;}
export async function loadItems():Promise<Item[]>{
 if(!member)await loadMember();
 const rows=[];
 for(let offset=0;offset<10000;offset+=500){
  const batch=await rest('items?household_id=eq.'+member!.household_id+'&select=id,kind,payload,updated_at&order=created_at.desc,id&limit=500&offset='+offset);
  rows.push(...batch);
  if(batch.length<500)return rows.map((r:{id:string;kind:Item['kind'];payload:Item;updated_at:string})=>validateItem({...r.payload,id:r.id,kind:r.kind,updatedAt:r.updated_at}));
 }
 throw new Error('Kayıt sayısı büyüdü. Arşivleme yapılmadan eksik bir liste gösterilmez.');
}
export async function saveItem(item:Item):Promise<Item>{
 if(!member)throw new Error('Ev üyeliği bulunamadı.');
 const clean=validateItem(item);const {updatedAt,...payload}=clean;
 const rows=updatedAt?await rest('items?id=eq.'+item.id+'&updated_at=eq.'+encodeURIComponent(updatedAt),'PATCH',{kind:item.kind,payload}):await rest('items','POST',{id:item.id,household_id:member.household_id,kind:item.kind,payload});
 if(!rows.length)throw new Error('Bu kayıt diğer cihazda değişti. Listeyi yenileyip tekrar dene.');
 return {...payload,updatedAt:rows[0].updated_at};
}
export async function deleteItem(item:Item){const rows=await rest('items?id=eq.'+item.id+(item.updatedAt?'&updated_at=eq.'+encodeURIComponent(item.updatedAt):''),'DELETE');if(!rows.length)throw new Error('Kayıt değişmiş olabilir. Önce listeyi yenile.');}
export async function budgetRequest(action:string,data:Record<string,unknown>={},grant?:string):Promise<{grant?:string;expires_at?:number;transactions?:Transaction[]}> {
 const bearer=await token();const r=await fetch(url+'/functions/v1/budget',{method:'POST',headers:{apikey:envKey,Authorization:'Bearer '+bearer,'Content-Type':'application/json',...(grant?{'X-Budget-Token':grant}:{})},body:JSON.stringify({action,...data})});
 const body=await r.json().catch(()=>({}));if(!r.ok)throw new Error(body.error||'Bütçe işlemi tamamlanamadı.');return body;
}
