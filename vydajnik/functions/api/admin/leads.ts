interface D1 { prepare(sql: string): { bind(...values: unknown[]): { all<T>(): Promise<{ results: T[] }> } }; }
interface Env { DB?: D1; ADMIN_TOKEN?: string; }
export const onRequestGet = async ({ request, env }: { request: Request; env: Env }) => {
	if(!env.ADMIN_TOKEN||!env.DB)return Response.json({error:'Admin není nakonfigurován.'},{status:503});
	if(request.headers.get('authorization')!==`Bearer ${env.ADMIN_TOKEN}`)return Response.json({error:'Neautorizováno.'},{status:401});
	const {results}=await env.DB.prepare('select id,created_at,name,email,phone,calculator,partner_id,lead_type,consent_timestamp,status,payout_amount from monetization_leads order by created_at desc limit 5000').bind().all<Record<string,unknown>>();
	const csv=['id;created_at;jmeno;email;telefon;kalkulacka;partner;typ;souhlas;stav;payout',...results.map(row=>[row.id,row.created_at,row.name,row.email,row.phone,row.calculator,row.partner_id,row.lead_type,row.consent_timestamp,row.status,row.payout_amount].map(value=>`"${String(value??'').replaceAll('"','""')}"`).join(';'))].join('\r\n');
	return new Response(csv,{headers:{'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="vydajnik-leady.csv"','cache-control':'no-store'}});
};

export const onRequestPost = async ({ request, env }: { request: Request; env: Env }) => {
	if(!env.ADMIN_TOKEN||!env.DB)return Response.json({error:'Admin není nakonfigurován.'},{status:503});
	if(request.headers.get('authorization')!==`Bearer ${env.ADMIN_TOKEN}`)return Response.json({error:'Neautorizováno.'},{status:401});
	let body:Record<string,unknown>;try{body=await request.json();}catch{return Response.json({error:'Neplatný JSON.'},{status:400});}
	const id=String(body.id||'');const status=String(body.status||'');const statuses=new Set(['new','sent','contacted','qualified','converted','rejected','paid']);const payout=body.payout===''||body.payout==null?null:Number(body.payout);
	if(!/^[0-9a-f-]{36}$/i.test(id)||!statuses.has(status)||!(payout===null||(Number.isFinite(payout)&&payout>=0&&payout<=100000000)))return Response.json({error:'Zadejte platné ID, stav a případnou odměnu.'},{status:422});
	await env.DB.prepare('update monetization_leads set status=?,payout_amount=?,converted_at=case when ? in (\'converted\',\'paid\') and converted_at is null then ? else converted_at end where id=?').bind(status,payout,status,new Date().toISOString(),id).run();
	return Response.json({ok:true},{headers:{'cache-control':'no-store'}});
};
