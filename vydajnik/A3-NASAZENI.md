# A3: zapnutí ochrany importů v Cloudflare D1

Kód A3 potřebuje také změnu databáze D1. Samotný Commit a Push ji nespustí. Finanční import bez změny databáze vrátí srozumitelnou chybu a nic nezaúčtuje; ostatní části administrace zůstávají dostupné.

## 1. Vyberte správnou existující databázi

V Cloudflare otevřete projekt Pages `vydajnikcz` a jeho produkční vazbu D1 pojmenovanou `DB`. Zjistěte název a UUID právě této databáze. Použijte existující databázi s partnery, poptávkami a vyúčtováním.

Ve VS Code otevřete terminál ve složce aplikace:

```powershell
Set-Location -LiteralPath 'C:\Users\novak\Documents\git\vydajnikcz\vydajnik'
Copy-Item -LiteralPath 'wrangler-a3.example.jsonc' -Destination 'wrangler-a3.local.jsonc'
```

Soubor `wrangler-a3.local.jsonc` otevřete a nahraďte dvě hodnoty `DOPLNTE_…` skutečným názvem a UUID databáze. Pokud už lokální soubor máte vyplněný, znovu ho nekopírujte. Tento soubor, zálohy i místní stav Wrangleru jsou vyřazené z Gitu.

Přihlaste Wrangler do stejného účtu Cloudflare, ve kterém je projekt Pages:

```powershell
npx wrangler login
npx wrangler d1 info DB --config wrangler-a3.local.jsonc
```

Před pokračováním zkontrolujte, že výpis odpovídá produkční vazbě `DB`. Pro zkušební nasazení použijte samostatnou zkušební databázi a její vlastní lokální nastavení.

## 2. Zálohujte a zkontrolujte historii

Po dobu migrace zavřete formuláře pro import příjmů a reklamních výkazů ve všech záložkách administrace.

```powershell
New-Item -ItemType Directory -Force -Path 'database/backups' | Out-Null
$a3BackupStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
npx wrangler d1 export DB --remote --config wrangler-a3.local.jsonc --output "database/backups/pred-A3-$a3BackupStamp.sql"
npx wrangler d1 execute DB --remote --config wrangler-a3.local.jsonc --file database/a3-preflight.sql
```

Záloha musí úspěšně vzniknout. Druhý příkaz pouze čte data. **Prázdný seznam výsledků znamená, že kontrola nenašla překážky.** Chyba dotazu není prázdný výsledek.

Pokud kontrola vrátí řádky, nejprve je vyřešte podle původních vyúčtování:

| Hodnota `issue` | Co znamená |
| --- | --- |
| `duplicate_reference` | Stejný zdroj, partner a reference mají více ručních příjmů. |
| `invalid_revenue` | Chybí reference, částka/datum/měna nejsou platné nebo partner neexistuje. |
| `invalid_ad_report` | Výkaz má nepovoleného poskytovatele/pozici, neplatné datum, částku nebo počty. |
| `mixed_ad_reports` | Za poskytovatele a den existuje souhrn `all` i jednotlivá pozice. |
| `unmatched_or_ambiguous_ads_revenue` | Starý reklamní příjem nelze jednoznačně spojit s jedním výkazem nebo má jinou částku. |
| `multiple_revenues_for_ad_report` | Na jeden výkaz připadá více starých příjmů. |
| `orphan_product` / `orphan_lead` | Nabídka nebo poptávka odkazuje na chybějícího partnera. |

Sloupce `record_id` a `reference` určují řádek k prověření; u nabídek a poptávek je `record_id` interní SQLite rowid a `reference` jejich skutečné ID. U každého případu uchovejte původní export a potvrďte, který záznam odpovídá skutečnému vyúčtování. Potom spusťte kontrolu znovu. Migrace záměrně nevybírá „správnou“ částku z rozporné historie a neodstraňuje záznamy automaticky.

## 3. Spusťte migraci jednou

Pokud má existující databáze základní tabulky projektu a kontrola je bez výsledků:

```powershell
npx wrangler d1 migrations list DB --remote --config wrangler-a3.local.jsonc
npx wrangler d1 migrations apply DB --remote --config wrangler-a3.local.jsonc
npx wrangler d1 execute DB --remote --config wrangler-a3.local.jsonc --command "SELECT version FROM admin_schema_version WHERE id=1;"
```

Při potvrzení má být uvedená migrace `0001_admin_a3.sql`. Závěrečný dotaz musí vrátit `version = 3`. Wrangler eviduje provedenou migraci v samostatné tabulce `vydajnik_admin_migrations`, takže opakované `migrations apply` už stejný soubor nespustí.

Migrace přidá vazbu reklamního příjmu na konkrétní výkaz, ochranu jedinečnosti ručních referencí a databázové kontroly. Existující jednoznačně odpovídající reklamní příjmy propojí bez vytvoření kopie. Pokud výkaz existuje a jeho příjem chybí, doplní ho podle částky výkazu; takto se opraví dřívější nedokončený import. ID existujících příjmů a jejich původní čas importu zůstávají zachované.

Pokud migrace skončí chybou, nepřeskakujte kontrolu ani ji ručně neoznačujte jako provedenou. Podle chyby a zálohy nejprve vyřešte příčinu. Při hlášení `A3_EXISTING_DATA_REQUIRE_REVIEW` znovu spusťte `a3-preflight.sql`. Soubor migrace nespouštějte opakovaně přes `d1 execute --file`, protože změna sloupců je jednorázová.

**Úplně nová prázdná databáze:** nejdřív vytvořte základ příkazem níže, potom pokračujte kontrolou a migrací. U existující databáze tento krok není potřebný.

```powershell
npx wrangler d1 execute DB --remote --config wrangler-a3.local.jsonc --file database/monetization-d1.sql
```

## 4. Odešlete kód a ověřte nasazení

Ve VS Code zkontrolujte změněné soubory, vytvořte commit `Dokončení A3: validace a ochrana finančních importů` a proveďte Push. Po úspěšném nasazení Pages obnovte administraci a přihlaste se.

V oddělené zkušební databázi ověřte:

1. Ruční příjem se po druhém odeslání stejné reference nezdvojí a zobrazí „již zaúčtováno“.
2. Stejná reference s jinou částkou ukáže rozpor a původní příjem zachová.
3. Reklamní výkaz za stejného poskytovatele, den a pozici se uloží pouze jednou. Oprava ze 100 Kč na 120 Kč změní odpovídající příjem na 120 Kč.
4. Souhrn `all` a jednotlivá pozice za stejného poskytovatele a den se odmítnou kombinovat.
5. Chybějící partner, nepovolená hodnota nebo neexistující upravovaný záznam ukáže chybu.

Do produkční databáze pro ověření nevkládejte smyšlené příjmy. Produkci ověřte existujícími skutečnými daty; opakování již uloženého skutečného výkazu musí dát nezměněný součet. Automatické testy projektu všechny zkušební částky zapisují pouze do oddělené SQLite databáze.

## Co A3 považuje za tentýž záznam

- Ruční příjem: **zdroj + partner (nebo žádný partner) + reference**. Datum není součástí klíče; změna data se stejnou referencí proto nevytvoří nový příjem. Reference je citlivá na velikost písmen; používejte přesné číslo vyúčtování. Okrajové mezery se odstraní.
- Reklamní výkaz: **poskytovatel + datum + pozice**. Reference může být společná pro více řádků výkazu. Jiný poskytovatel nebo jiná jednotlivá pozice jsou samostatné záznamy.
- Oprava výkazu aktualizuje i jeho příjem uvnitř stejné databázové transakce. V databázi tuto vazbu udržuje trigger, takže zápis výkazu nemůže uspět bez odpovídajícího příjmu.
- Ruční formulář nepřijímá zdroj `ads`; reklamní příjmy se ukládají výhradně přes výkazy.
- Částky jsou nezáporné s přesností na haléře. Prázdná cena nabídky je „neuvedeno“, nulová cena je nula. Počty zobrazení a kliknutí jsou celá čísla; kliknutí nesmí být více než zobrazení.

Při návratu ke starší verzi kódu zachovejte databázové ochrany a nejprve ověřte kompatibilitu finančních importů ve zkušební databázi. Problémové nasazení řešte opravou kódu nebo kontrolovanou obnovou ze zálohy; nemažte produkční databázi.

Postup příkazů vychází z [dokumentace Wrangler D1](https://developers.cloudflare.com/d1/wrangler-commands/) a [migrací D1](https://developers.cloudflare.com/d1/reference/migrations/). Atomické dávky popisuje [D1 Database](https://developers.cloudflare.com/d1/worker-api/d1-database/).
