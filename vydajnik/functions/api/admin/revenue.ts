interface D1 { prepare(sql: string): { bind(...values: unknown[]): { run(): Promise<unknown> } }; }
interface Env { DB?: D1; ADMIN_TOKEN?: string; }
const sources = new Set(['ads','affiliate','lead','direct','sponsored','premium']);
export const onRequestPost = async ({ request, env }: { request: Request; env: Env }) => {
	if(!env.ADMIN_TOKEN||!env.DB)return Response.json({error:'Admin není nakonfigurován.'},{status:503});
	if(request.headers.get('authorization')!==`Bearer ${env.ADMIN_TOKEN}`)return Response.json({error:'Neautorizováno.'},{status:401});
	let input:Record<string,unknown>;try{input=await request.json();}catch{return Response.json({error:'Neplatný JSON.'},{status:400});}
	if(!input||typeof input!=='object'||Array.isArray(input))return Response.json({error:'Neplatné údaje formuláře.'},{status:422});
	const amount=typeof input.amount==='number'?input.amount:NaN;const occurred=new Date(String(input.occurredAt||''));const source=String(input.sourceType||'');
	const date=String(input.occurredAt||'');const dateOk=/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(occurred.getTime())&&occurred.toISOString().slice(0,10)===date;
	if(typeof input.reference!=='string'||!input.reference.trim())return Response.json({error:'Vyplňte referenci reportu.'},{status:422});
	if(!sources.has(source)||!Number.isFinite(amount)||amount<0||amount>1_000_000_000||!dateOk)return Response.json({error:'Doplňte platný zdroj, částku a datum.'},{status:422});
	await env.DB.prepare('insert into monetization_revenue (source_type,partner_id,amount,currency,reference,occurred_at) values (?,?,?,?,?,?)').bind(source,String(input.partnerId||'').slice(0,80)||null,amount,'CZK',String(input.reference||'').slice(0,160)||null,occurred.toISOString()).run();
	return Response.json({ok:true},{headers:{'cache-control':'no-store'}});
};
