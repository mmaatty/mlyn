# Dokumenty ze sdíleného Disku — co je hotové a jak to nasadit

## Jak to funguje

```
Google Disk (složka 2027)          Apps Script              Firebase              Aplikace
├── MATĚJ_2027/                    mlyn-drive-sync.gs   →   weddingDocs/     →    detail svatby
│   └── 11.9.2027 – Konečná/   →   projde složky            2027-09-11            sekce Dokumenty
│       ├── smlouva.pdf            přečte smlouvu            {soubory,             (jen admin)
│       ├── faktura.pdf            vytáhne údaje              smlouva, …}
│       └── smlouva (Google Doc)
```

Skript běží pod účtem, který ho autorizuje. **Proto složky na Disku už nemusí
být veřejně sdílené** — to byl hlavní důvod volby téhle varianty.

## Rozsah

| | |
|---|---|
| Koordinátoři | 5 (GROCHY 18, ELIŠKA a VOJTA 11, VERČA 11, MATĚJ 7, 1 v kořeni) |
| Svateb celkem | 51 |
| Z toho aktivních | 48 |
| Zrušených (nesynchronizují se) | 3 |
| Na šedý účet | 16 |
| Termínů 2027 v aplikaci | 54 |
| **Svateb z Disku bez termínu v aplikaci** | **0** |

## Nasazení — tři kroky

### 1. Pravidla Firebase

V `firebase-rules.json` přibyl uzel `weddingDocs` (čtení i zápis jen admini).
Nahrát obsah souboru v konzoli → Realtime Database → Rules → Publish.

### 2. Apps Script

Postup je v hlavičce souboru `mlyn-drive-sync.gs`. Stručně:

1. script.google.com → nový projekt → vložit soubor
2. Vlastnosti skriptu: `FIREBASE_URL`, `SA_EMAIL`, `SA_PRIVATE_KEY`
3. **Nejdřív `syncNanecisto()`** — nic nezapisuje, jen vypíše, co by udělal,
   a zkontroluje kolize datumů
4. Pak `syncVse()`
5. Spouštěč: `syncVse()` 1× denně

> ⚠️ **Privátní klíč servisního účtu obchází všechna pravidla databáze.**
> Má plný přístup ke všem datům včetně `auditLog` a `bankAccounts`.
> Patří jen do Vlastností skriptu — nikdy do kódu, nikdy do gitu.

### 3. Aplikace

Už je hotová, stačí nasadit `dohnaluv-mlyn.html`.

## Co sekce umí

- **Seznam dokumentů** seřazený podle typu (podepsaná smlouva → pracovní → faktura)
- **Údaje ze smlouvy**: nájemné, záloha, doplatek, jistota, účet, termín nájmu
- **Porovnání s aplikací** — kde se liší, ukáže `staré → nové` a tlačítko **Převzít**
  (jednotlivě i hromadně). **Nic se nepřepisuje samo** — smlouva nemusí být
  aktuální a ruční oprava má přednost.
- **Odkaz na složku** na Disku
- **Upozornění** ze synchronizace (např. datum ve složce nesedí se smlouvou)
- Otevření dokumentu i převzetí údaje se **zapisuje do changelogu**
  (`doc_open`, `doc_prevzato`) — jde o smlouvy s osobními údaji

## Přístup

Zatím **jen admini** (Matěj Dohnal, Jan Dohnal). Koordinátorky Verča, Grochy
a Eliška dokumenty v aplikaci neuvidí ani u vlastních svateb — pracují s nimi
dál přímo na Disku.

**Až to budou potřebovat**, rozšíření je na dvou místech:

1. `firebase-rules.json` → `weddingDocs/.read` povolit šířeji
2. `dohnaluv-mlyn.html` → funkce **`muzeVidetDokumenty(date)`** — jediné místo
   v kódu, kde se o přístupu rozhoduje

## Zádrhele, na které se narazilo

| Co | Řešení |
|---|---|
| 3 zrušené svatby mají stejné datum jako aktivní — přepsaly by je | Zrušené se nesynchronizují |
| `5. 6. - Pařízek Jiří` nemá v názvu rok | Doplní se rok sezóny. **Lepší složku přejmenovat.** |
| Jedna svatba leží přímo v kořeni, ne u koordinátora | Skript bere obě úrovně |
| `podepsáno.pdf` se nezařadilo (diakritika) | Opraveno |
| Smlouva uvádí termín nájmu, ne datum svatby | Datum svatby = začátek + 1 den; slouží jako kontrola proti názvu složky |

## Co bylo otestováno

**103 automatických testů** proti skutečnému kódu (test načítá soubory z disku
a ověřuje jejich SHA-256, takže netestuje kopii):

- **66** — parsování: datum ze všech reálných tvarů názvů, šedý účet, zrušené
  svatby, klasifikace skutečných souborů, 7 skutečných smluv, konzistence
  částek, odolnost
- **37** — sekce v aplikaci: skrytí před ne-adminem (včetně toho, že se vůbec
  nedotáže databáze), líné načítání a cache, řazení, návrhy ze smlouvy,
  převzetí, zápis do changelogu, okrajové případy, XSS

Celý upravený `dohnaluv-mlyn.html` prochází syntaktickou kontrolou.

**Neotestováno:** běh Apps Scriptu proti ostrému Disku a Firebase — vyžaduje
servisní účet a autorizaci. Po prvním spuštění zkontrolovat výpis
`syncNanecisto()` a pak v aplikaci otevřít libovolný termín.
