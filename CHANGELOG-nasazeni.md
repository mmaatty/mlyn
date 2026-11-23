# Changelog (auditní stopa) — co je hotové a co ještě musíte udělat

## Co přibylo v `dohnaluv-mlyn.html`

Nová záložka **Changelog 🔒**, viditelná jen pro adminy (`ADMIN_EMAILS`).
Zaznamenává **změny dat a přihlášení** — ne prohlížení stránek.

Sledované akce (21 míst v kódu):

| Oblast | Co se zapíše |
|---|---|
| Účet | přihlášení do aplikace (1× za relaci prohlížeče, ne při každém F5) |
| Směny | přihlášení / odhlášení ze směny |
| Termíny | uložení detailu svatby, smazání termínu, checklist, změna koordinátora |
| Hodinovka | přidání hodin, změna sazby (včetně původní hodnoty), smazání hodin |
| Náklady | přidání a smazání nákladu |
| To-Do | nový úkol, změna stavu, úprava, smazání |
| Tým | přidání a odebrání zaměstnance |
| CRM | úprava buňky (včetně původní → nové hodnoty) |
| Výplaty | zápis vyplacené částky |

Každý záznam: `ts`, `email`, `person`, `action`, `target`, `detail`.

Sekce umí filtrovat podle textu, uživatele, typu akce a období, a exportovat
zobrazené záznamy do CSV (s BOM, aby Excel nerozhodil diakritiku).

## Viditelnost: pouze admini

V rozhraní jsou tři nezávislé pojistky:

1. **Záložka** je v HTML `display:none` a zobrazí ji jen `applyRoleUI()` adminovi.
   Výchozí stav je tedy skrytý — i kdyby `applyRoleUI()` nikdy neproběhlo.
2. **`showTab()`** kontroluje roli **ještě před tím**, než stránku označí jako
   aktivní (`ADMIN_ONLY_PAGES`). Bez toho by sekce na okamžik probliskla, když
   si uživatel do adresy napíše `#changelog` — hash router volá `showTab()`
   s čímkoli. Týká se to stejně i Výplat.
3. **`openChangelog()` / `renderChangelog()`** se pro ne-admina ukončí hned
   na začátku a nic nevykreslí.

Navíc: při přihlášení jiného účtu na stejném prohlížeči se obsah sekce
vymaže z DOM i z paměti (`auditLog`, `auditLoaded`), aby v okně nezůstaly
záznamy předchozího admina.

**Pozor na hranici:** tohle všechno je *prohlížeč*. Kdo umí otevřít vývojářskou
konzoli, může si roli přepsat. Proti skutečnému čtení dat chrání jedině
pravidla níže — ta běží na serveru a přepsat je z prohlížeče nejde.

## ⚠️ Bez tohoto kroku je log k ničemu

Skrytí záložky je **jen v rozhraní**. Dokud nenastavíte pravidla Firebase,
může si kdokoli přihlášený log přečíst — nebo smazat záznam o tom, co udělal.

V konzoli Firebase → Realtime Database → Rules přidejte uzel `auditLog`
do stávajících pravidel (tohle **není** celý soubor pravidel, jen ta část,
kterou je potřeba doplnit):

```json
"auditLog": {
  ".read": "auth != null && (auth.token.email === 'dohnalmat@gmail.com' || auth.token.email === 'jan.dohnal@jdak.cz')",
  "$zaznam": {
    ".write": "auth != null && (!data.exists() || auth.token.email === 'dohnalmat@gmail.com' || auth.token.email === 'jan.dohnal@jdak.cz')",
    ".validate": "newData.hasChildren(['ts','email','action'])"
  }
}
```

Co to dělá:

- **číst** smí jen oba admini,
- **zapsat nový** záznam smí každý přihlášený (jinak by se log neplnil),
- **přepsat nebo smazat** existující záznam smí jen admin — proto `!data.exists()`.
  Tím je log pro běžného uživatele *append-only*: může přidat, nemůže zahladit.

Mazání starších záznamů (retence) běží pod adminem, takže mu pravidla nevadí.

## Retence

90 dní. Starší záznamy se mažou automaticky **při každém otevření sekce adminem**
— aplikace nemá server, kde by běžel cron. Když do sekce půl roku nikdo nepůjde,
log se do té doby nepročistí.

## Co bylo otestováno

43 automatických testů proti skutečnému kódu (ne kopii) s falešnou databází:
zápis a doplnění autora, ořez dlouhých hodnot, mlčení u nepřihlášeného uživatele,
odolnost proti výpadku databáze, retence 90 dní, vykreslení, filtry, fulltext,
ošetření XSS, formátování času (25 testů).

Samostatná sada na viditelnost (18 testů) proti skutečnému `showTab()`,
`applyRoleUI()` a hash routeru: skrytá záložka, `showTab('changelog')`
i `#changelog` v adrese u ne-admina, prázdné vykreslení, chování admina,
přepnutí účtu za běhu (odchod ze sekce + vyčištění DOM i paměti)
a stav bez přihlášení.

Všechny prošly. Celý upravený soubor prochází syntaktickou kontrolou.

**Neotestováno:** běh proti ostrému Firebase (vyžaduje přihlášení vaším účtem)
a chování pravidel výše. Po nasazení prosím ověřte, že se záložka zobrazuje jen
adminovi a že se do `auditLog` opravdu zapisuje.

## Záloha

Stav před úpravou: `dohnaluv-mlyn_zaloha_pred_changelogem.html`
