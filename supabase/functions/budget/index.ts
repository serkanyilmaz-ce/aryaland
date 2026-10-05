import {createBudgetHandler} from './handler.ts';
const handler=createBudgetHandler({
 url:Deno.env.get('SUPABASE_URL')||'',
 publicKey:Deno.env.get('SUPABASE_ANON_KEY')||'',
 serviceKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',
 origins:(Deno.env.get('ALLOWED_ORIGINS')||'').split(',').map(x=>x.trim()).filter(Boolean),
});
Deno.serve(handler);
