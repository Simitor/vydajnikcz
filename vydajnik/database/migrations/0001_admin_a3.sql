-- Apply ONCE to the existing Cloudflare D1 database. Run a3-preflight.sql first.
-- An ambiguous history stops this migration before any financial rows change.
create table if not exists admin_a3_migration_guard (
 problem_count integer constraint A3_EXISTING_DATA_REQUIRE_REVIEW check(problem_count=0)
);
delete from admin_a3_migration_guard;
insert into admin_a3_migration_guard (problem_count) select count(*) from (
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
select 'orphan_lead', rowid, id from monetization_leads r where r.partner_id is not null and not exists (select 1 from monetization_partners p where p.id=r.partner_id)
);

alter table monetization_revenue add column ad_report_id integer references publisher_daily_stats(id);
update monetization_revenue set amount=round(amount,2),reference=trim(reference,char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279)),partner_id=nullif(trim(partner_id,char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279)),'');
update publisher_daily_stats set revenue=round(revenue,2),reference=trim(reference,char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279));
update monetization_revenue set ad_report_id=(
 select s.id from publisher_daily_stats s where s.report_date=substr(monetization_revenue.occurred_at,1,10) and s.reference=monetization_revenue.reference
),occurred_at=substr(occurred_at,1,10)||'T00:00:00.000Z' where source_type='ads';
insert into monetization_revenue (source_type,amount,currency,reference,occurred_at,ad_report_id)
select 'ads',s.revenue,'CZK',s.reference,s.report_date||'T00:00:00.000Z',s.id
from publisher_daily_stats s where not exists (select 1 from monetization_revenue r where r.ad_report_id=s.id);

create unique index monetization_revenue_manual_reference
 on monetization_revenue(source_type,coalesce(partner_id,''),trim(reference,char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))) where ad_report_id is null;
create unique index monetization_revenue_ad_report on monetization_revenue(ad_report_id);

create trigger admin_a3_revenue_validate_insert before insert on monetization_revenue
begin
 select case when typeof(new.amount) not in ('real','integer') or new.amount not between 0 and 1000000000
 or abs(new.amount-round(new.amount*100)/100) > 4.440892098500626e-16 * max(1,abs(new.amount)) or new.currency is not 'CZK'
 or typeof(new.reference) != 'text' or length(new.reference) not between 1 and 160 or new.reference != trim(new.reference,char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))
 or date(substr(new.occurred_at,1,10),'+0 days') is not substr(new.occurred_at,1,10)
 or (new.ad_report_id is null and new.source_type='ads')
 or (new.ad_report_id is not null and (new.source_type!='ads' or new.partner_id is not null
  or not exists (select 1 from publisher_daily_stats s where s.id=new.ad_report_id and s.revenue=new.amount and s.reference=new.reference and new.occurred_at=s.report_date||'T00:00:00.000Z'))) then raise(abort,'A3_INVALID_REVENUE') end;
 select case when new.partner_id is not null and not exists (select 1 from monetization_partners p where p.id=new.partner_id)
  then raise(abort,'A3_PARTNER_NOT_FOUND') end;
end;

create trigger admin_a3_report_validate_insert before insert on publisher_daily_stats
begin
 select case when new.provider not in ('adsense','gam','custom')
 or new.placement not in ('all','top-banner','between-hero-content','calculator-middle','calculator-bottom','article-inline-1','article-inline-2','before-faq','footer','sticky-mobile')
 or typeof(new.impressions) != 'integer' or new.impressions not between 0 and 9007199254740991
 or typeof(new.clicks) != 'integer' or new.clicks not between 0 and new.impressions
 or typeof(new.revenue) not in ('real','integer') or new.revenue not between 0 and 100000000
 or abs(new.revenue-round(new.revenue*100)/100) > 4.440892098500626e-16 * max(1,abs(new.revenue)) or new.currency is not 'CZK'
 or typeof(new.reference) != 'text' or length(new.reference) not between 1 and 160 or new.reference != trim(new.reference,char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))
 or date(new.report_date,'+0 days') is not new.report_date then raise(abort,'A3_INVALID_AD_REPORT') end;
 select case when exists (select 1 from publisher_daily_stats s where s.id!=new.id and s.provider=new.provider and s.report_date=new.report_date
  and ((new.placement='all' and s.placement!='all') or (new.placement!='all' and s.placement='all')))
  then raise(abort,'A3_MIXED_AD_REPORTS') end;
end;

-- The ledger follows the report within the same database statement/transaction.
create trigger admin_a3_report_revenue_insert after insert on publisher_daily_stats
begin
 insert into monetization_revenue (source_type,amount,currency,reference,occurred_at,ad_report_id)
 values ('ads',new.revenue,'CZK',new.reference,new.report_date||'T00:00:00.000Z',new.id)
 on conflict(ad_report_id) do update set amount=excluded.amount,reference=excluded.reference,occurred_at=excluded.occurred_at,imported_at=datetime('now');
end;

create trigger admin_a3_revenue_validate_update before update on monetization_revenue
begin
 select case when typeof(new.amount) not in ('real','integer') or new.amount not between 0 and 1000000000
 or abs(new.amount-round(new.amount*100)/100) > 4.440892098500626e-16 * max(1,abs(new.amount)) or new.currency is not 'CZK'
 or typeof(new.reference) != 'text' or length(new.reference) not between 1 and 160 or new.reference != trim(new.reference,char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))
 or date(substr(new.occurred_at,1,10),'+0 days') is not substr(new.occurred_at,1,10)
 or (new.ad_report_id is null and new.source_type='ads')
 or (new.ad_report_id is not null and (new.source_type!='ads' or new.partner_id is not null
  or not exists (select 1 from publisher_daily_stats s where s.id=new.ad_report_id and s.revenue=new.amount and s.reference=new.reference and new.occurred_at=s.report_date||'T00:00:00.000Z'))) then raise(abort,'A3_INVALID_REVENUE') end;
 select case when new.partner_id is not null and not exists (select 1 from monetization_partners p where p.id=new.partner_id)
  then raise(abort,'A3_PARTNER_NOT_FOUND') end;
end;

create trigger admin_a3_report_validate_update before update on publisher_daily_stats
begin
 select case when new.provider not in ('adsense','gam','custom')
 or new.placement not in ('all','top-banner','between-hero-content','calculator-middle','calculator-bottom','article-inline-1','article-inline-2','before-faq','footer','sticky-mobile')
 or typeof(new.impressions) != 'integer' or new.impressions not between 0 and 9007199254740991
 or typeof(new.clicks) != 'integer' or new.clicks not between 0 and new.impressions
 or typeof(new.revenue) not in ('real','integer') or new.revenue not between 0 and 100000000
 or abs(new.revenue-round(new.revenue*100)/100) > 4.440892098500626e-16 * max(1,abs(new.revenue)) or new.currency is not 'CZK'
 or typeof(new.reference) != 'text' or length(new.reference) not between 1 and 160 or new.reference != trim(new.reference,char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))
 or date(new.report_date,'+0 days') is not new.report_date then raise(abort,'A3_INVALID_AD_REPORT') end;
 select case when exists (select 1 from publisher_daily_stats s where s.id!=new.id and s.provider=new.provider and s.report_date=new.report_date
  and ((new.placement='all' and s.placement!='all') or (new.placement!='all' and s.placement='all')))
  then raise(abort,'A3_MIXED_AD_REPORTS') end;
end;

-- The ledger follows the report within the same database statement/transaction.
create trigger admin_a3_report_revenue_update after update on publisher_daily_stats
begin
 insert into monetization_revenue (source_type,amount,currency,reference,occurred_at,ad_report_id)
 values ('ads',new.revenue,'CZK',new.reference,new.report_date||'T00:00:00.000Z',new.id)
 on conflict(ad_report_id) do update set amount=excluded.amount,reference=excluded.reference,occurred_at=excluded.occurred_at,imported_at=datetime('now');
end;

create trigger admin_a3_product_partner_insert before insert on monetization_products
begin
 select case when not exists (select 1 from monetization_partners p where p.id=new.partner_id) then raise(abort,'A3_PARTNER_NOT_FOUND') end;
end;
create trigger admin_a3_product_partner_update before update on monetization_products
begin
 select case when not exists (select 1 from monetization_partners p where p.id=new.partner_id) then raise(abort,'A3_PARTNER_NOT_FOUND') end;
end;
create trigger admin_a3_lead_partner_insert before insert on monetization_leads
begin
 select case when new.partner_id is not null and not exists (select 1 from monetization_partners p where p.id=new.partner_id) then raise(abort,'A3_PARTNER_NOT_FOUND') end;
end;
create trigger admin_a3_lead_partner_update before update on monetization_leads
begin
 select case when new.partner_id is not null and not exists (select 1 from monetization_partners p where p.id=new.partner_id) then raise(abort,'A3_PARTNER_NOT_FOUND') end;
end;
create trigger admin_a3_partner_history before delete on monetization_partners
begin
 select case when exists (select 1 from monetization_products where partner_id=old.id)
  or exists (select 1 from monetization_leads where partner_id=old.id)
  or exists (select 1 from monetization_revenue where partner_id=old.id)
  then raise(abort,'A3_PARTNER_IN_USE') end;
end;

create table if not exists admin_schema_version (id integer primary key check(id=1),version integer not null);
insert into admin_schema_version (id,version) values (1,3) on conflict(id) do update set version=excluded.version;
drop table admin_a3_migration_guard;
