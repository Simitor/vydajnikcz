-- Read-only audit before applying 0001_admin_a3.sql. Zero rows means no blockers.
select 'duplicate_reference' as issue, min(id) as record_id, trim(reference,char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279)) as reference
from monetization_revenue where source_type != 'ads'
group by source_type, coalesce(nullif(trim(partner_id,char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279)),''),''), trim(reference,char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279)) having count(*) > 1
union all
select 'invalid_revenue', id, reference from monetization_revenue
where typeof(amount) not in ('real','integer') or amount < 0 or amount > 1000000000
 or abs(amount-round(amount*100)/100) > 4.440892098500626e-16 * max(1,abs(amount)) or currency is not 'CZK'
 or typeof(reference) != 'text' or length(trim(reference,char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))) not between 1 and 160
 or date(substr(occurred_at,1,10),'+0 days') is not substr(occurred_at,1,10)
 or (nullif(trim(partner_id,char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279)),'') is not null and not exists (select 1 from monetization_partners p where p.id=trim(partner_id,char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))))
union all
select 'invalid_ad_report', id, reference from publisher_daily_stats
where provider not in ('adsense','gam','custom')
 or placement not in ('all','top-banner','between-hero-content','calculator-middle','calculator-bottom','article-inline-1','article-inline-2','before-faq','footer','sticky-mobile')
 or typeof(impressions) != 'integer' or impressions not between 0 and 9007199254740991
 or typeof(clicks) != 'integer' or clicks not between 0 and impressions
 or typeof(revenue) not in ('real','integer') or revenue not between 0 and 100000000
 or abs(revenue-round(revenue*100)/100) > 4.440892098500626e-16 * max(1,abs(revenue)) or currency is not 'CZK'
 or typeof(reference) != 'text' or length(trim(reference,char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))) not between 1 and 160
 or date(report_date,'+0 days') is not report_date
union all
select 'mixed_ad_reports', a.id, a.reference from publisher_daily_stats a
where a.placement='all' and exists (select 1 from publisher_daily_stats b where b.provider=a.provider and b.report_date=a.report_date and b.placement!='all')
union all
select 'unmatched_or_ambiguous_ads_revenue', r.id, r.reference from monetization_revenue r
where r.source_type='ads' and ((select count(*) from publisher_daily_stats s where s.report_date=substr(r.occurred_at,1,10) and trim(s.reference,char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))=trim(r.reference,char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))) != 1
 or r.partner_id is not null
 or not exists (select 1 from publisher_daily_stats s where s.report_date=substr(r.occurred_at,1,10) and trim(s.reference,char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))=trim(r.reference,char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279)) and round(s.revenue,2)=round(r.amount,2) and s.currency=r.currency))
union all
select 'multiple_revenues_for_ad_report', s.id, s.reference from publisher_daily_stats s
where (select count(*) from monetization_revenue r where r.source_type='ads' and substr(r.occurred_at,1,10)=s.report_date and trim(r.reference,char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))=trim(s.reference,char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))) > 1
union all
select 'orphan_product', rowid, id from monetization_products r where not exists (select 1 from monetization_partners p where p.id=r.partner_id)
union all
select 'orphan_lead', rowid, id from monetization_leads r where r.partner_id is not null and not exists (select 1 from monetization_partners p where p.id=r.partner_id);
