interface D1 { prepare(sql:string):{bind(...values:unknown[]):{run():Promise<unknown>}}; }
interface Env { DB?:D1; ADMIN_TOKEN?:string; }
export const onRequestPost=async({request,env}:{request:Request;env:Env})=>{
	if(!env.ADMIN_TOKEN||!env.DB)return Response.json({error:'Admin není nakonfigurován.'},{status:503});
	if(request.headers.get('authorization')!==`Bearer ${env.ADMIN_TOKEN}`)return Response.json({error:'Neautorizováno.'},{status:401});
	let d:Record<string,unknown>;try{d=await request.json();}catch{return Response.json({error:'Neplatný JSON.'},{status:400});}
	if(!d||typeof d!=='object'||Array.isArray(d))return Response.json({error:'Neplatné údaje formuláře.'},{status:422});
	const date=String(d.date||'');const impressions=typeof d.impressions==='number'?d.impressions:NaN;const clicks=typeof d.clicks==='number'?d.clicks:NaN;const revenue=typeof d.revenue==='number'?d.revenue:NaN;const parsedDate=new Date(`${date}T00:00:00Z`);const dateOk=/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(parsedDate.getTime())&&parsedDate.toISOString().slice(0,10)===date;
	if(typeof d.reference!=='string'||!d.reference.trim()||typeof d.placement!=='string'||!d.placement.trim())return Response.json({error:'Vyplňte reklamní pozici a referenci výkazu.'},{status:422});
	if(!dateOk||!['adsense','gam','custom'].includes(String(d.provider))||!Number.isInteger(impressions)||impressions<0||!Number.isInteger(clicks)||clicks<0||clicks>impressions||!Number.isFinite(revenue)||revenue<0||revenue>100000000)return Response.json({error:'Ověřte datum a hodnoty ve výkazu poskytovatele.'},{status:422});
	const placement=String(d.placement||'all').slice(0,60);const reference=String(d.reference||'').slice(0,160);
	await env.DB.prepare('insert into publisher_daily_stats (report_date,provider,placement,impressions,clicks,revenue,reference) values (?,?,?,?,?,?,?) on conflict(report_date,provider,placement) do update set impressions=excluded.impressions,clicks=excluded.clicks,revenue=excluded.revenue,reference=excluded.reference').bind(date,String(d.provider),placement,impressions,clicks,revenue,reference||null).run();
	const revenueReference=reference||`${d.provider} ${date}`;
	await env.DB.prepare("insert into monetization_revenue (source_type,amount,currency,reference,occurred_at) select 'ads',?,'CZK',?,? where not exists (select 1 from monetization_revenue where source_type='ads' and reference=? and substr(occurred_at,1,10)=?)").bind(revenue,revenueReference,`${date}T00:00:00.000Z`,revenueReference,date).run();
	return Response.json({ok:true},{headers:{'cache-control':'no-store'}});
};
