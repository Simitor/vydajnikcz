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

Ochrana tlačítka brání opakovanému požadavku během ukládání. A3 navíc chrání reference v databázi a váže reklamní příjem přímo na výkaz. Reklamní příjmy se vkládají výhradně přes reklamní výkazy.

## Správa záznamů A2

Na `/admin/monetizace/` jsou po přihlášení seznamy partnerů, nabídek a poptávek s hledáním, filtry a stránkováním po 25 záznamech. Data načítá `/api/admin/records` pouze s admin tokenem a bez ukládání do mezipaměti. Odhlášení odstraní seznamy, detail poptávky, hledané výrazy a hodnoty editorů; opožděné odpovědi je znovu nezobrazí.

- **Upravit** otevře uložený záznam a předvyplní formulář. ID partnera, ID nabídky a její partner jsou během úpravy uzamčené. **Nový partner / Nová nabídka** vyčistí formulář pro nový záznam. Nové ID, které už existuje, vrátí chybu místo přepsání. Úprava neexistujícího záznamu jej znovu nevytvoří. Nepřístupná pole regionů a pojistného krytí se při běžné editaci zachovají.
- **Vypnout / Aktivovat** mění pouze aktivní stav. Vypnutí partnera skryje všechny jeho nabídky; zapnutí obnoví jen ty, které samy zůstaly aktivní. Data a historie se nemažou. Vypnutý partner nebo nabídka nemají funkční veřejný partnerský přesměrovací odkaz. Úprava ceny nebo názvu firmy se projeví v dalším načtení veřejného katalogu.
- **Otevřít detail** poptávky ukáže kontakt, firmu, předmět zájmu, souhlas, zdroj a další uložené údaje. Uložením stavu a případné potvrzené odměny se obnoví detail, seznam i přehled stavů. Ostatní údaje poptávky se nemění. CSV export z A1 zůstává dostupný.

A2 používá stávající tabulky D1; nevyžaduje novou migraci ani nové proměnné prostředí. `npm test` navíc ověřuje skutečné SQL seznamů a filtrů, složenou identitu nabídek, editaci bez ztráty dalších údajů, konflikty ID, aktivaci a veřejné chování i změny stavu poptávky. Testovací databáze je oddělená od provozních dat.

## Kontroly serveru a finanční importy A3

Administrační API ověřuje typy, povolené hodnoty, délky, částky na haléře, skutečná data a vazby na partnery. Neplatné hodnoty nekrátí ani nezahazuje. Chybějící záznam při úpravě vrací 404; neplatná data 422; rozpor v existující referenci nebo souběh souhrnného a dílčího výkazu 409. Chyby databáze vrací čitelnou zprávu bez vnitřních detailů.

Ruční příjem identifikuje zdroj, partner a reference bez okrajových mezer. Stejné údaje vrátí `unchanged`, rozdílné údaje se stejným klíčem původní částku nepřepíšou. Reklamní výkaz identifikuje poskytovatel, datum a pozice. Jeho opakování nezvýší příjmy; oprava aktualizuje existující řádek i příjem. Databáze brání kombinaci souhrnu `all` s jednotlivými pozicemi stejného poskytovatele a dne. Jedinečné indexy a transakční zápisy chrání i souběžné požadavky.

**A3 vyžaduje jednorázovou migraci D1.** Přesný postup, kontrola starých dat a záloha jsou v [A3-NASAZENI.md](A3-NASAZENI.md). Bez migrace server finanční import odmítne s pokynem k přípravě databáze. Nejasná stará historie migraci zastaví před změnou finančních záznamů; jasné vazby zachová a chybějící příjem existujícího výkazu doplní. Nasazovací konfigurace má vlastní název souboru a používá se pouze s výslovným `--config`.

`npm test` používá základní schéma a skutečnou SQL migraci v oddělené SQLite databázi. Ověřuje opakované a souběžné importy, opravy částek, shodné reference více pozic, rollback při selhání příjmu, zachování staré historie, zastavení migrace při nejasných údajích i kontroly ostatních administračních formulářů.

## Nasazení na Cloudflare Pages

Sestavení vytváří statické stránky v `dist/`; adresář `functions/` dodává API routy. V Cloudflare Pages nastavte build příkaz `npm run build`, výstupní složku `dist` a D1 binding pojmenovaný `DB`. Pro novou databázi použijte `database/monetization-d1.sql`, poté migraci `database/migrations/0001_admin_a3.sql` podle [A3-NASAZENI.md](A3-NASAZENI.md). Existující databázi migrujte podle téhož postupu.

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
