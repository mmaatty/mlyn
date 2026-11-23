# Nasazení — podrobný postup

Pořadí není libovolné. Každý krok má **kontrolu** („hotovo, když…") a **návrat**
(„kdyby se to pokazilo"). Dokud kontrola neprojde, nepokračujte dál.

**Rozdělte to na dvě sezení.** Kroky 0–2 jsou jedno (zabezpečení + changelog),
kroky 3–5 druhé (dokumenty). Mezi nimi den dva pauza. Kdyby se něco rozbilo,
hned víte co.

Potřebné údaje:

| | |
|---|---|
| Projekt Firebase | `dohnaluv-mlyn` |
| Databáze | `https://dohnaluv-mlyn-default-rtdb.europe-west1.firebasedatabase.app` |
| Admini | `dohnalmat@gmail.com`, `jan.dohnal@jdak.cz` |
| Kořenová složka Disku | `1XsB33z9Cjo8QebT2CuwNl2iGJV8G-opj` („2027") |

---

# SEZENÍ 1 — zabezpečení a changelog

## Krok 0 — záchranná kopie (2 min)

1. [console.firebase.google.com](https://console.firebase.google.com) → projekt **dohnaluv-mlyn**
2. Vlevo **Realtime Database** → záložka **Rules**
3. Kliknout do editoru, `Ctrl+A`, `Ctrl+C`
4. Vložit do textového souboru a uložit, např. `pravidla-pred-nasazenim.txt`

> **Proč:** Realtime Database si historii pravidel neuchovává. Po stisku
> Publish je předchozí verze nenávratně pryč. Tahle kopie je jediná cesta zpět.

**Při té příležitosti se podívejte, co tam je.**

Zvenčí jsem ověřil, že **původní pravidla už živá nejsou** — anonymní dotaz
na `svatebni_sezona` i `bankAccounts` vrací `401 Permission denied`, zatímco
původní pravidla měla `svatebni_sezona` veřejně čitelný. Něco novějšího se
tedy publikovalo. **Které z toho, poznáte jen v konzoli**, bez přihlášení to
rozlišit nejde:

| Co v pravidlech vidíte | Co to znamená |
|---|---|
| `".read": "auth != null"` na kořeni | Původní stav, nic se zatím nepublikovalo |
| `"$ostatni"` | Publikovala se slabší verze — čísla účtů vidí všichni přihlášení |
| `".read": false` na kořeni + `"bankAccounts"` | Už je nasazeno to správné, krok 1 přeskočte |

**Nejspíš uvidíte `$ostatni`.** Verze s `bankAccounts` totiž kvůli chybné
syntaxi komentářů nešla uložit (viz níže), takže publikovaná být nemohla —
a anonymní přístup je přitom zablokovaný, takže původní stav to také není.
Pokud se to potvrdí, **čísla účtů a platební QR kódy teď vidí každý
přihlášený zaměstnanec** a krok 1 je naléhavý.

**Hotovo, když:** máte soubor s původními pravidly a víte, který ze tří stavů platí.

---

## Krok 1 — publikovat pravidla (10 min)

1. Otevřít [firebase-rules.json](firebase-rules.json), `Ctrl+A`, `Ctrl+C`
2. V konzoli Firebase → Rules → `Ctrl+A` → vložit
3. Zkontrolovat, že editor **nehlásí chybu** (žádná červená tečka u čísla řádku)
4. **Publish**

> **Komentáře v pravidlech.** Soubor obsahuje řádkové komentáře `//` — Firebase
> je v pravidlech podporuje. Není to tedy přísné JSON a některé editory si na to
> můžou stěžovat; konzoli to nevadí.
>
> Co naopak **nefunguje** je zápis komentáře jako klíče s textovou hodnotou
> (`"//" : "nějaký text"`). Firebase bere každý klíč jako definici uzlu a ta
> musí být `{}`, takže takový řádek odmítne hláškou
> **„Error saving rules - Expected '{'."** Na tohle dřívější verze souboru
> narazila; opraveno.

### Co se mění

- Kořen dostane `".read": false, ".write": false` — co není výslovně povoleno, je zakázáno
- `bankAccounts`, `personQR`, `crmEvents` → jen admini
- `auditLog` → čte jen admin, zapsat nový záznam smí každý přihlášený, **přepsat ani smazat nemůže nikdo kromě adminů**
- `weddingDocs` → jen admini (zatím prázdný uzel, naplní se v sezení 2)
- `svatebni_sezona` → zamčeno úplně

### Riziko `svatebni_sezona` — prověřeno, je bezpečné

Dřív jsem tenhle krok označoval za rizikový, protože nebylo jasné, co uzel
`svatebni_sezona` čte. **Dohledáno:**

V historii aplikace se `svatebni_sezona` objevuje ve čtyřech commitech, ale
**není to uzel databáze** — je to adresa vloženého rámce na jinou aplikaci:

```
https://mmaatty.github.io/dohnaluv_mlyn_before_after/svatebni_sezona.html
```

Tahle stránka se připojuje k **úplně jinému projektu Firebase**:

| | |
|---|---|
| Aplikace Mlýn | `dohnaluv-mlyn` ← tady měníme pravidla |
| Stránka Svatební sezóna | `mlynbeforeafter` ← jiná databáze |

Zamčení `svatebni_sezona` v databázi `dohnaluv-mlyn` ji tedy **rozbít nemůže**.
V současné verzi aplikace navíc ten rámec už vůbec není.

Uzel `svatebni_sezona` v databázi `dohnaluv-mlyn` je zbytek po starém importu
(viz `svatebni_sezona_weddings_import.json` ve složce projektu) a nic ho nečte.

> Až budete v konzoli, podívejte se na **Data → `svatebni_sezona`**. Pokud
> obsahuje jména a kontakty klientů, je lepší ho rovnou **smazat** než jen
> zamknout — data, která nikdo nepoužívá, nemají co ležet v databázi.

**Hotovo, když:** otevřete aplikaci (tu, co běží teď, ještě před nasazením nové)
a **Termíny** i **Hodinovka** mají data.

**Návrat:** vložit zpátky obsah `pravidla-pred-nasazenim.txt` → Publish.

> Ověřeno napříč **všemi 70 commity** v historii: aplikace kdy použila
> 29 různých uzlů a **všechny mají pravidlo**. Prázdná stránka by tedy
> znamenala něco jiného než chybějící uzel — návrat je stejně na jedno vložení.

---

## Krok 2 — nasadit aplikaci (20 min)

Nasadit `dohnaluv-mlyn.html` tak, jak to děláte běžně.
*(Tohle je jediná část, kterou o vašem provozu nevím — v repozitáři není
žádný automat na nasazení.)*

### Tři kontroly

**2a — aplikace běží**
Otevřít, přihlásit se. Termíny a Hodinovka mají data. V hlavičce přibyla
záložka **Changelog 🔒** (jen pod admin účtem).

**2b — changelog se plní**
Jako admin otevřít libovolný termín, zaškrtnout položku v checklistu.
Pak záložka **Changelog** → nahoře musí přibýt řádek:

```
Checklist   ·   <datum svatby>   ·   <název položky>: zaškrtnuto
```

Když je tabulka prázdná a hlásí chybu načtení, pravidla pro `auditLog`
se nepublikovala — zpět na krok 1.

**2c — ne-admin se k logu nedostane**

Tohle je ta důležitá kontrola. Rozhraní jsme otestovali 18 testy, ale
tohle testuje **server**, a jen to je skutečná ochrana.

Přihlásit se **ne-admin účtem** (kterákoli ze zaměstnankyň) a:

- Záložka **Changelog** nesmí být vidět
- V adresním řádku dopsat `#changelog` → musí to skočit na **Přehled**,
  sekce nesmí ani probliknout
- V konzoli prohlížeče (`F12` → Console) spustit:

```javascript
db.ref('auditLog').once('value').then(s => console.log('PROBLÉM, přečetl jsem:', s.val())).catch(e => console.log('SPRÁVNĚ:', e.code))
```

Musí vypsat `SPRÁVNĚ: PERMISSION_DENIED`. Kdyby vypsalo data, pravidla
nejsou publikovaná.

Totéž vyzkoušet s `bankAccounts` — čísla účtů taky nesmí přečíst:

```javascript
db.ref('bankAccounts').once('value').then(s => console.log('PROBLÉM:', s.val())).catch(e => console.log('SPRÁVNĚ:', e.code))
```

**Hotovo, když:** 2a, 2b i 2c prošly.

**Návrat:** nasadit předchozí verzi `dohnaluv-mlyn.html`
(v gitu commit `74dd643`), pravidla můžou zůstat.

---

## 🛑 Pauza — den až dva

Changelog a zamčená databáze jsou hotová věc, která dává hodnotu sama o sobě.
Nechte to běžet a podívejte se, jestli týmu něco nechybí.

**Řekněte týmu, že changelog existuje a co zaznamenává.** Transparentně
oznámený audit je nástroj, objevený skrytý audit je problém.

---

# SEZENÍ 2 — dokumenty z Disku

## Předpoklad

Účet, kterým budete Apps Script autorizovat, musí **vidět všech pět složek
koordinátorů** ve složce „2027". Skript čte Disk pod tímhle účtem, ne pod
servisním účtem.

## Krok 3 — servisní účet (15 min)

Servisní účet slouží **jen k zápisu do databáze**. S Diskem nemá nic společného.

1. Firebase konzole → ozubené kolo → **Nastavení projektu**
2. Záložka **Servisní účty**
3. **Vygenerovat nový privátní klíč** → potvrdit → stáhne se soubor `.json`
4. Otevřít ho v textovém editoru, najít dvě položky:
   - `"client_email"` → budete potřebovat jako `SA_EMAIL`
   - `"private_key"` → budete potřebovat jako `SA_PRIVATE_KEY`

> ⚠️ **Ten klíč obchází všechna pravidla databáze.** Má plný přístup ke všem
> datům včetně `auditLog` a `bankAccounts`. Stažený `.json` po nastavení smažte
> z Downloads. Nikdy ho nedávejte do gitu ani do souboru v projektu.

**Hotovo, když:** máte otevřený `.json` a víte, kde jsou obě hodnoty.

---

## Krok 4 — Apps Script (45 min)

### 4a — založit projekt

1. [script.google.com](https://script.google.com) → **Nový projekt**
2. Smazat obsah `Code.gs`
3. Vložit celý obsah [mlyn-drive-sync.gs](mlyn-drive-sync.gs)
4. Projekt pojmenovat, např. „Mlýn — synchronizace dokumentů"
5. Uložit (`Ctrl+S`)

### 4b — vlastnosti skriptu

Ozubené kolo **Nastavení projektu** → dolů na **Vlastnosti skriptu** →
**Přidat vlastnost**, třikrát:

| Vlastnost | Hodnota |
|---|---|
| `FIREBASE_URL` | `https://dohnaluv-mlyn-default-rtdb.europe-west1.firebasedatabase.app` |
| `SA_EMAIL` | hodnota `client_email` z JSON |
| `SA_PRIVATE_KEY` | hodnota `private_key` z JSON |

U `SA_PRIVATE_KEY` zkopírujte hodnotu **přesně jak je v JSON**, včetně
`-----BEGIN PRIVATE KEY-----` a sekvencí `\n`. Skript si je přeloží sám.

### 4c — zkouška naprázdno

V rozbalovátku nahoře vybrat funkci **`syncNanecisto`** → **Spustit**.

Při prvním spuštění vyskočí autorizace:
*Zkontrolovat oprávnění → vybrat účet → Rozšířené → Přejít na projekt (nebezpečné) → Povolit.*
To je normální u vlastních skriptů.

> `syncNanecisto()` **nic nezapisuje**. Jen projde Disk a vypíše, co by udělal.

Otevřít **Protokoly spuštění** (`Ctrl+Enter`). Očekávaný výstup:

```
2027-04-17            12 souborů  GROCHY_2027 / 17.4.2027 – Kateřina Výletová, Karel Och
2027-04-24   [šedý]    3 souborů  ELIŠKA a VOJTA_2027 / ŠEDÝ ÚČET: 24.4.2027 - Kristýna Růžičková
...
--- KOLIZE DATUMŮ MEZI AKTIVNÍMI ---
žádné — klíčování podle data je bezpečné
```

**Zkontrolujte:**

- Vypsalo se **51 řádků** (48 aktivních + 3 `[ZRUŠENO]`)
- Žádný řádek nezačíná `????-??-??`
- Kolize datumů: **žádné**

Kdyby se objevilo `????-??-??`, znamená to složku, ze které nejde přečíst
datum — přejmenovat ji na tvar `D.M.RRRR – Jméno` a spustit znovu.

### 4d — ostré spuštění

Vybrat **`syncVse`** → **Spustit**. Na konci protokolu je souhrn:

```json
{ "zapsano": 48, "zrusenePreskoceno": 3, "bezData": [], "nesedDatum": [], "bezSmlouvy": [...] }
```

- `zapsano: 48` — sedí
- `zrusenePreskoceno: 3` — zrušené se správně nezapsaly
- `bezData: []` — prázdné
- `nesedDatum` — když tu něco je, datum ve složce nesedí se smlouvou; **to je nález, ne chyba skriptu** — zkontrolujte tu svatbu
- `bezSmlouvy` — složky bez smlouvy jako Google dokumentu; dokumenty se zobrazí, jen se z nich nevyčtou údaje

### 4e — spouštěč

Vlevo ikona budíku **Spouštěče** → **Přidat spouštěč**:

- Funkce: `syncVse`
- Zdroj události: **Řízený časem**
- Typ: **Časovač podle dnů** → např. 4:00–5:00

**Hotovo, když:** souhrn hlásí `zapsano: 48` a spouštěč je nastavený.

---

## Krok 5 — ověřit v aplikaci a zavřít Disk (20 min)

### 5a — dokumenty v aplikaci

Jako **admin** otevřít termín, který má na Disku složku — např. **11. 9. 2027**.
Dole pod fotkami musí být sekce **Dokumenty**:

- seznam souborů (podepsaná smlouva → pracovní dokument → faktura)
- blok **Ze smlouvy**: nájemné, záloha, doplatek, jistota, účet, termín nájmu
- buď rozdíly s tlačítky **Převzít**, nebo „✓ Údaje v aplikaci se smlouvou souhlasí"
- odkaz **📁 Otevřít složku na Disku**

Kliknout na dokument → otevře se na novém panelu. Pak **Changelog** →
musí přibýt řádek **Otevření dokumentu**.

Vyzkoušet jedno **Převzít** → hodnota se propíše do pole nahoře v detailu
a v changelogu přibude **Převzetí ze smlouvy** se starou i novou hodnotou.

### 5b — ne-admin dokumenty nevidí

Pod ne-admin účtem otevřít tentýž termín — sekce **Dokumenty** tam nesmí být vůbec.

### 5c — teprve teď zavřít složku na Disku

Až všechno výše funguje.

Složka „2027" → **Sdílet** → změnit z *„Kdokoli, kdo má odkaz"* na
**Omezeno** a přidat konkrétní lidi:

- vlastníka / účet, který autorizoval skript
- koordinátorky (Verča, Grochy, Eliška, Matěj) — **pracují se složkami dál přímo na Disku**

> Skriptu to nevadí — běží pod autorizovaným účtem.
> **Tohle byl celý důvod, proč jsme zvolili variantu se zrcadlením
> místo levnějšího vloženého výpisu.**

**Hotovo, když:** dokumenty v aplikaci fungují a složka už není veřejná.

---

# Až to poběží

**Přejmenovat složku** `5. 6. - Pařízek Jiří` → `5.6.2027 - Pařízek Jiří`.
Skript si s ní poradí (doplní rok sezóny), ale spoléhat se na záchrannou
větev v kódu je horší než mít data v pořádku.

**Nová sezóna 2028:** ve skriptu změnit `KOREN_SLOZKA` a `ROK_SEZONY`.

**Až budou dokumenty potřebovat koordinátorky**, rozšíření je na dvou místech:

1. `firebase-rules.json` → `weddingDocs/.read` povolit šířeji
2. `dohnaluv-mlyn.html` → funkce `muzeVidetDokumenty(date)` — jediné místo
   v kódu, kde se o přístupu rozhoduje
