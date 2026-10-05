export type Kind = 'task' | 'need' | 'note' | 'event' | 'trip';
export type Person = 'Serkan' | 'Rabia' | 'Birlikte';
export type Item = {
  id: string; kind: Kind; title: string; details: string; date: string;
  endDate: string; assignee: Person; category: string; done: boolean;
  pinned: boolean; place: string; createdAt: string; updatedAt?: string;
};
export type Transaction = { id: string; type: 'income' | 'expense'; amount_cents: number; category: string; description: string; date: string; paid_by: Person };
export const kinds: Record<Kind,string> = { task: 'Ev işi', need: 'İhtiyaç', note: 'Not', event: 'Etkinlik', trip: 'Gezi' };
export const categories = ['Market', 'Ev', 'Ulaşım', 'Gezi', 'Arya', 'Fatura', 'Sağlık', 'Diğer'];
export function today(now = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', {timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
export function fromDay(value: string): Date { return new Date(value + 'T12:00:00Z'); }
export function dayKey(value: Date): string { return value.toISOString().slice(0,10); }
export function addDays(value: string, n: number): string { const d = fromDay(value); d.setUTCDate(d.getUTCDate()+n); return dayKey(d); }
export function weekStart(value: string): string { const d=fromDay(value); return addDays(value, -((d.getUTCDay()+6)%7)); }
export function validDay(value: unknown): value is string { return typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(fromDay(value).getTime()) && dayKey(fromDay(value))===value; }
export function friendlyDate(value: string, short=false): string { return value ? new Intl.DateTimeFormat('tr-TR',{day:'numeric',month:short?'short':'long',timeZone:'UTC'}).format(fromDay(value)) : 'Tarihsiz'; }
export function isOnDay(item: Item, day: string): boolean { return !!item.date && item.date<=day && (item.kind==='trip' ? (item.endDate||item.date)>=day : item.date===day); }
export function parseMoney(value: string): number {
  const s=value.trim().replace(/\s/g,'');
  if(!/^\d{1,10}([.,]\d{1,2})?$/.test(s)) throw new Error('Tutarı 1250,50 biçiminde, binlik ayırıcı kullanmadan yaz.');
  const [whole, fraction='']=s.split(/[.,]/); const cents=Number(whole)*100+Number(fraction.padEnd(2,'0'));
  if(!Number.isSafeInteger(cents)||cents<=0||cents>1e12)throw new Error('Geçerli, sıfırdan büyük bir tutar gir.');
  return cents;
}
export function money(cents: number): string { return new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY',maximumFractionDigits:2}).format(cents/100); }
export function newItem(kind:Kind='task',date=''): Item { return {id:crypto.randomUUID(),kind,title:'',details:'',date,endDate:'',assignee:'Birlikte',category:kind==='need'?'Market':'Ev',done:false,pinned:false,place:'',createdAt:new Date().toISOString()}; }
export function validateItem(value: unknown): Item {
  if(!value||typeof value!=='object')throw new Error('Kayıt biçimi geçersiz.');
  const v=value as Item;
  if(typeof v.id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.id)||typeof v.kind!=='string'||!Object.hasOwn(kinds,v.kind)||typeof v.title!=='string'||!v.title.trim()||v.title.length>120)throw new Error('Kayıt başlığı veya kimliği geçersiz.');
  if(!['Serkan','Rabia','Birlikte'].includes(v.assignee)||typeof v.done!=='boolean'||typeof v.pinned!=='boolean')throw new Error('Kayıt alanları geçersiz.');
  if(typeof v.details!=='string'||v.details.length>3000||typeof v.place!=='string'||v.place.length>250||typeof v.category!=='string'||v.category.length>50)throw new Error('Kayıt açıklaması çok uzun veya geçersiz.');
  if(typeof v.date!=='string'||typeof v.endDate!=='string'||(v.date&&!validDay(v.date))||(v.endDate&&!validDay(v.endDate))||(v.endDate&&(!v.date||v.endDate<v.date)))throw new Error('Başlangıç ve bitiş tarihlerini kontrol et.');
  if(['event','trip'].includes(v.kind)&&!v.date)throw new Error('Etkinlik ve gezi için başlangıç tarihi gerekli.');
  if(typeof v.createdAt!=='string'||!Number.isFinite(Date.parse(v.createdAt)))throw new Error('Kayıt tarihi geçersiz.');
  return {id:v.id,kind:v.kind,title:v.title.trim(),details:v.details,date:v.date,endDate:v.endDate,assignee:v.assignee,category:v.category,done:v.done,pinned:v.pinned,place:v.place,createdAt:v.createdAt,...(typeof v.updatedAt==='string'?{updatedAt:v.updatedAt}:{})};
}
export function seedItems(): Item[] {
  const d=today(); const w=weekStart(d);
  const make=(kind:Kind,title:string,extra:Partial<Item>={})=>({...newItem(kind),title,...extra});
  return [
    make('task','Alışverişi tamamla',{assignee:'Serkan',date:d,done:true}),
    make('task','Çamaşırları katla',{assignee:'Rabia',date:d}),
    make('task',"Arya'nın suyunu yenile",{assignee:'Serkan',date:d,category:'Arya'}),
    make('task','Bitkileri sula',{assignee:'Birlikte',date:addDays(d,2)}),
    make('event','Market',{date:w,category:'Market'}),
    make('event','Ev günü',{date:addDays(w,3),details:'Çay, güzel bir film ve biraz dinlenme.'}),
    make('trip','Hafta sonu gezisi',{date:addDays(w,5),endDate:addDays(w,6),category:'Gezi',place:'Birlikte seçelim',details:'Gidilecek yerleri ve yanımıza alacaklarımızı buraya yazabiliriz.'}),
    make('need','Kahve al',{category:'Market'}),
    make('need','Arya için mama',{category:'Arya',assignee:'Rabia'}),
    make('need','Bulaşık makinesi tableti',{category:'Ev'}),
    make('note','Yeni gezi fikri',{details:'Bu hafta sonu doğada yürüyüş yapalım mı?',pinned:true,category:'Gezi'}),
  ];
}
