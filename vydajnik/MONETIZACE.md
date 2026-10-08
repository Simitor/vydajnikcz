# Monetizace – stav integrace

## Co je nasazeno v kódu

- `src/components/AdSlot.astro` je společná, označená a CLS-rezervující reklamní plocha. Bez validního publisher ID, povolení, ID jednotky a TCF souhlasu nic nevykreslí ani nenačte.
- `src/config/monetization.ts` eviduje unikátní sloty, stránky a pozice. Aktuální klientská konfigurace je určena pro AdSense; přechod na Ad Manager nebo přímé kampaně potřebuje serverovou integraci.
- Google skript se načítá nejvýše jednou. Pro EHP vyžaduje callback IAB TCF CMP a souhlas pro účely 1, 3, 4 a vendora Google (755). Při odmítnutí, chybě CMP nebo prázdné reklamní jednotce slot skryje.
- `supabase/migrations/202609290001_monetization_core.sql` připravuje soukromé tabulky partnerů, affiliate programů, slotů, přímých kampaní, poptávek, záznamů souhlasu, pokusů o předání, událostí a auditního logu. Veřejné role nemají do schématu přístup.
- `/pojisteni-auta` a `/reklama-a-spoluprace` jsou transparentní informační stránky. Zatím netvrdí, že mají živé nabídky, partnery, návštěvnost ani výnosy.
- Testy pravidel pro reklamní ID a uzavřené chování při chybějícím TCF souhlasu: `npm test`.

## Zatím vypnuto / čeká na externí nastavení

Web je stále staticky generovaný a v repozitáři není připojen Supabase projekt, administrátorské přihlášení, API pro poptávky ani schválený CMP. Proto nejsou zapnuté reklamy, sběr leadů, analytika, affiliate trackování, admin UI ani statistiky. Migrace zatím nebyla spuštěna proti databázi.

K zapnutí AdSense budou potřeba schválení webu a účtu, `ca-pub-…` ID, ID každé reklamní jednotky z účtu a integrace Google-certified CMP registrované v IAB TCF. `.env.example` obsahuje jen prázdné klíče; zapnutí `PUBLIC_MONETIZATION_ADS_ENABLED` samo o sobě reklamy nerozjede bez všech těchto podmínek.

Pro leady je nejprve třeba zvolit a smluvně schválit konkrétního příjemce, určit správce údajů a právní titul, potvrdit obsah souhlasu, retenční lhůtu a způsob předání. Pak bude nutné přepnout Astro na serverový výstup, přidat serverové endpointy s validací, rate limitingem a autentizovanou administrací a nakonfigurovat Supabase. `SUPABASE_SERVICE_ROLE_KEY` smí zůstat pouze v serverovém prostředí; nikdy nepatří do `PUBLIC_` proměnné ani klientského kódu.

## Partnerská prověrka

Veřejné podklady ePojisteni.cz popisují partnerský program s provizí přes identifikovaný affiliate odkaz. To potvrzuje možnost požádat o affiliate spolupráci, nikoli schválení Výdajník.cz, dostupnost API nebo právo zobrazovat pojistné nabídky. Dokud partner nepřidělí identifikátor/odkaz a neschválí použití, nic se na webu nevydává za nabídku partnera.

