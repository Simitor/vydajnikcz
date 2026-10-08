# Výdajník.cz

České finanční kalkulačky s výpočty v prohlížeči a staticky generovanými SEO stránkami. Projekt obsahuje monetizační stavebnici pro Cloudflare Pages Functions a D1.

## Vývoj

- `npm install`
- `npm run dev`
- `npm run build`
- `npm run preview`

## Kontrola administrace A1

`npm test` ověřuje všech pět ukládacích formulářů proti serverovým funkcím a oddělené testovací SQLite databázi. Zahrnuje zachování hodnot po znovuotevření databáze, prázdnou a nulovou cenu, chybné vstupy, odmítnutí nesprávného tokenu a CSV s českými znaky i ochranou proti vzorcům. Testy používají skutečné SQL projektu a nezapisují do Cloudflare D1.

Administrace odesílá partnery, produkty a reklamní pozice do `/api/admin/config`, příjmy do `/api/admin/revenue` a reklamní výkazy do `/api/admin/ad-report`. Export kontaktů se stahuje z `/api/admin/leads` s autorizační hlavičkou. Při ukládání jsou tlačítka dočasně vypnutá; chyby ponechávají zadané hodnoty. Po finančním zápisu se obnoví přehled. Neúspěšné obnovení přehledu nezmění potvrzené uložení na chybu ukládání.

Ochrana tlačítka brání opakovanému požadavku během ukládání. Deduplikace finančních referencí v databázi a seznamy s předvyplněnou editací patří do navazujících bodů A3 a A2. Stejný příjem z reklamního výkazu nevkládejte ještě jednou přes obecný formulář příjmů.

## Nasazení na Cloudflare Pages

Sestavení vytváří statické stránky v `dist/`; adresář `functions/` dodává API routy. V Cloudflare Pages nastavte build příkaz `npm run build`, výstupní složku `dist` a D1 binding pojmenovaný `DB`. Pro databázi použijte `database/monetization-d1.sql`.

Nastavte tajné proměnné:

- `ADMIN_TOKEN` — dlouhý náhodný token pro administrační API.
- `ADSENSE_CLIENT` — pouze po aktivaci schváleného účtu AdSense; pro Ad Manager se používá uložená ad-unit cesta.
- `GOOGLE_CMP_CONFIGURED=true` — nastavte až po nasazení skutečné Google-certified CMP s IAB TCF API a ověření souhlasového toku. Bez této proměnné API reklamy AdSense/Ad Manager nevydá; vlastní cookie banner sám o sobě certifikovanou CMP nenahrazuje.
- `LEAD_WEBHOOK_URL` a volitelně `LEAD_WEBHOOK_SECRET` — interní CRM/webhook pro poptávky.
- `PARTNER_*` endpoint secrets — volitelně, až bude zapojený konkrétní partner a výslovné předávání leadů.

Lead endpoint bez databáze i webhooku vrací 503. Zadané výpočtové vstupy se nikdy automaticky neposílají. Inzerční formulář odesílá jen údaje potřebné pro odpověď na danou poptávku. Před předáním kontaktu finančnímu nebo pojistnému partnerovi je nutné zobrazit jeho identitu a účel předání přímo u formuláře.

## Monetizační vrstvy

- Reklamní sloty jsou v `src/config/ads.config.ts` a všechna umístění jsou ve výchozím stavu vypnutá. Po připojení D1 a reklamního účtu je lze spravovat na `/admin/monetizace/`; reklamní skripty se nenačtou bez souhlasu s reklamním měřením a až při přiblížení slotu k viewportu.
- Produkty a partneři se spravují přes administrační API a D1, nikoli jako falešné ceny v UI. Veřejná nabídka vyžaduje aktivního partnera i aktivní produkt; u kategorie pojištění také příznak ověřeného licencovaného distributora.
- `/go/:partner/:product` přesměruje jen na aktivní HTTPS odkaz z katalogu. Affiliate měření se zapíše pouze s parametrem `track=1`, který klient přidá po souhlasu s partnerským měřením.
- Analytické události se odesílají jen po analytickém souhlasu. Události neobsahují vstupy ani výsledek kalkulačky.
- Revenue dashboard na `/admin/monetizace/` čte pouze skutečně importované reporty. Import reklamních reportů obsahuje zobrazení, kliknutí a příjem; souhrny partnerů se vkládají z jejich vyúčtování.
- Lead CSV export obsahuje osobní údaje a je dostupný jen s admin tokenem.

## Databáze

- `database/schema.sql` je samostatný základ pro PostgreSQL/Supabase (konstanty a leads).
- `database/monetization-d1.sql` obsahuje D1 tabulky pro partnery, katalog produktů, události, leady, reklamní pozice a ověřené revenue reporty.

## Stránky

- `/` — kalkulačky mzdy/OSVČ a nákladů na auto.
- `/kalkulacka-ciste-mzdy/` a `/naklady-na-auto/` — SEO landing pages.
- `/pojisteni-auto/` — transparentní stránka porovnání; skutečné nabídky se zobrazí až po napojení ověřených partnerů.
- `/inzerce/` — přímé reklamní poptávky a sponzorovaná spolupráce.
- `/admin/monetizace/` — administrační přehled, katalog, sloty a import reportů.
- `/ochrana-soukromi/` — technický návrh informační stránky a consent kategorií.

Právní texty jsou zatím návrh, ne hotová dokumentace pro veřejný provoz. Před spuštěním doplňte skutečné údaje správce, retenční lhůty, právní tituly a kontaktní osobu; nechte zkontrolovat consent i každý proces předání údajů.
