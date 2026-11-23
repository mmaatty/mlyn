/**
 * Dohnalův mlýn — synchronizace dokumentů z Google Disku do Realtime Database.
 *
 * CO TO DĚLÁ
 *   Projde kořenovou složku sezóny (např. "2027"), v ní složky koordinátorů,
 *   v každé podsložce svatby najde dokumenty, přečte smlouvu (nativní Google
 *   Doc) a výsledek zapíše do uzlu weddingDocs/<RRRR-MM-DD> ve Firebase.
 *
 * PROČ APPS SCRIPT A NE PROHLÍŽEČ
 *   Skript běží pod účtem, který ho autorizoval. Když ho autorizuje vlastník
 *   složek, **složky už nemusí být veřejně sdílené** — to je celý smysl téhle
 *   varianty. Aplikace v prohlížeči by na Disk nedosáhla (CORS) a veřejné
 *   sdílení by potřebovala napořád.
 *
 * NASTAVENÍ (jednorázově)
 *   1) script.google.com → Nový projekt → vložit tento soubor
 *   2) Nastavení projektu → Vlastnosti skriptu, přidat:
 *        FIREBASE_URL   = https://dohnaluv-mlyn-default-rtdb.europe-west1.firebasedatabase.app
 *        SA_EMAIL       = <e-mail servisního účtu>
 *        SA_PRIVATE_KEY = <privátní klíč z JSON, včetně BEGIN/END řádků>
 *      Servisní účet: Firebase konzole → Nastavení projektu → Servisní účty
 *      → Vygenerovat nový privátní klíč.
 *   3) Spustit syncNanecisto() a zkontrolovat výpis — NIC nezapisuje
 *   4) Teprve pak syncVse(), potvrdit oprávnění
 *   5) Spouštěče → časový spouštěč na syncVse(), např. 1× denně
 *
 * POZOR: privátní klíč servisního účtu obchází pravidla databáze a má plný
 * přístup ke všem datům. Patří jen do Vlastností skriptu, nikdy do kódu,
 * nikdy do gitu.
 */

// ============================================================
// KONFIGURACE
// ============================================================

/** Kořenová složka sezóny — obsahuje složky koordinátorů. */
var KOREN_SLOZKA = '1XsB33z9Cjo8QebT2CuwNl2iGJV8G-opj';   // "2027"

/** Rok sezóny. Doplní se u složek, které ho v názvu nemají (např. "5. 6. - Jméno"). */
var ROK_SEZONY = 2027;

var UZEL = 'weddingDocs';

// ============================================================
// ČISTÉ FUNKCE (bez Apps Script API — testovatelné i v prohlížeči)
// ============================================================

/**
 * Datum svatby z názvu složky.
 *
 * Zvládá "11.9.2027 - Jméno", "12.06.2027 – Jméno",
 * "ŠEDÝ ÚČET: 22. 5. 2027 – Jméno", "31.07.2027- Jméno"
 * i "6.5.2027–Jméno" (bez mezer kolem pomlčky).
 *
 * Když rok v názvu chybí ("5. 6. - Pařízek Jiří"), doplní se vychoziRok —
 * jedna taková složka ve složce 2027 reálně je a bez tohohle by se přeskočila.
 */
function parseDatumZeSlozky(nazev, vychoziRok) {
  var s = String(nazev);
  var d, mes, r;

  var m = s.match(/(\d{1,2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{4})/);
  if (m) {
    d = parseInt(m[1], 10); mes = parseInt(m[2], 10); r = parseInt(m[3], 10);
  } else if (vychoziRok) {
    // "5. 6. - Jméno" — den a měsíc bez roku
    var m2 = s.match(/(\d{1,2})\s*\.\s*(\d{1,2})\s*\.(?!\s*\d)/);
    if (!m2) return null;
    d = parseInt(m2[1], 10); mes = parseInt(m2[2], 10); r = parseInt(vychoziRok, 10);
  } else {
    return null;
  }

  if (!(d >= 1 && d <= 31) || !(mes >= 1 && mes <= 12)) return null;
  return r + '-' + ('0' + mes).slice(-2) + '-' + ('0' + d).slice(-2);
}

/** Složka s prefixem ŠEDÝ ÚČET se platí z jiného účtu. */
function jeSedyUcet(nazev) {
  return /Š?EDÝ\s*ÚČET|SEDY\s*UCET/i.test(String(nazev));
}

/**
 * Zrušená svatba. DŮLEŽITÉ: zrušené se do weddingDocs nezapisují.
 * Tři z nich mají stejné datum jako jiná, aktivní svatba — kdyby se zapsaly,
 * přepsaly by ji, protože klíčem je datum.
 */
function jeZrusena(nazev) {
  return /ZRU[ŠS]EN/i.test(String(nazev));
}

/**
 * Druh dokumentu. Názvy souborů jsou nekonzistentní, proto se rozhoduje
 * podle typu souboru a jen pomocně podle názvu — nikdy jen podle něj.
 */
function klasifikujSoubor(nazev, mimeType) {
  if (mimeType === 'application/vnd.google-apps.document') return 'smlouva_pracovni';
  var n = String(nazev).toLowerCase();
  // Pozor na diakritiku: soubory se jmenují 'podepsáno' i 'podepsano'.
  if (/smlouv|signed|podeps/.test(n)) return 'smlouva_podepsana';
  if (/^\d{8}[-_]/.test(n)) return 'faktura';
  if (mimeType === 'application/pdf') return 'pdf_ostatni';
  return 'ostatni';
}

function _cislo(s) {
  if (!s) return null;
  var n = parseInt(String(s).replace(/[\s  ]/g, ''), 10);
  return isNaN(n) ? null : n;
}

function _iso(d, m, r) {
  return r + '-' + ('0' + m).slice(-2) + '-' + ('0' + d).slice(-2);
}

/**
 * Rozebere text smlouvy.
 *
 * Kontaktní blok má u všech ověřených smluv pevnou strukturu: na každého
 * nájemce čtyři řádky v pořadí jméno / adresa / telefon / e-mail. Čte se proto
 * POZIČNĚ po čtveřicích, ne hádáním podle regexu — to selhávalo na adresách
 * bez PSČ a na telefonech s předvolbou.
 */
function parseSmlouvu(text) {
  var o = { chyby: [] };

  // Termín nájmu: pátek od 12:00 až neděle do 13:00.
  var t = text.match(
    /v\s*termínu\s+\S+\s+(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})\s*od\s*(\d{1,2}:\d{2})[\s\S]{0,40}?\S+\s+(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})\s*do\s*(\d{1,2}:\d{2})/);
  if (t) {
    o.najemOd = _iso(t[1], t[2], t[3]);
    o.najemOdCas = t[4];
    o.najemDo = _iso(t[5], t[6], t[7]);
    o.najemDoCas = t[8];
  } else {
    o.chyby.push('termín nájmu');
  }

  o.najemne = _cislo((text.match(/Nájemné se sjednává[\s\S]*?ve výši\s*([\d\s  ]+),-/) || [])[1]);
  o.zaloha  = _cislo((text.match(/zálohu na nájemné ve výši\s*([\d\s  ]+),-/) || [])[1]);
  o.jistota = _cislo((text.match(/jistot[uy]\s+ve výši\s*Kč\s*([\d\s  ]+)/i) || [])[1]);
  o.ucet    = (text.match(/na účet\s*([\d-]+\/\d+)/) || [])[1] || null;
  if (o.najemne == null) o.chyby.push('nájemné');
  if (o.zaloha == null) o.chyby.push('záloha');
  if (!o.ucet) o.chyby.push('číslo účtu');

  // Doplatek = nájemné minus záloha (smlouva ho uvádí jen slovně).
  o.doplatek = (o.najemne != null && o.zaloha != null) ? (o.najemne - o.zaloha) : null;

  var blok = (text.match(/na straně jedné([\s\S]*?)\(dále (?:společně )?jen/) || [])[1] || '';
  var radky = blok.split(/\r?\n/).map(function (x) { return x.trim(); }).filter(Boolean);

  o.najemci = [];
  for (var i = 0; i + 3 < radky.length; i += 4) {
    var ctverice = radky.slice(i, i + 4);
    // Pojistka: čtvrtý řádek musí vypadat jako e-mail, jinak struktura nesedí
    // a raději nic nehádáme, než abychom do aplikace zapsali nesmysl.
    if (!/[\w.+-]+@[\w.-]+\.\w+/.test(ctverice[3])) {
      o.chyby.push('kontaktní blok má jinou strukturu');
      o.najemci = [];
      break;
    }
    o.najemci.push({
      jmeno: ctverice[0],
      adresa: ctverice[1],
      telefon: ctverice[2].replace(/\s+/g, ' '),
      email: ctverice[3]
    });
  }
  if (!o.najemci.length) o.chyby.push('nájemci');

  return o;
}

/**
 * Datum svatby ze smlouvy = den po začátku nájmu (pronájem pátek→neděle,
 * svatba v sobotu). Slouží jako nezávislá kontrola proti názvu složky.
 */
function datumSvatbyZeSmlouvy(najemOd) {
  if (!najemOd) return null;
  var d = new Date(najemOd + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// ============================================================
// APPS SCRIPT — DISK A FIREBASE
// ============================================================

function _vlastnost(klic) {
  var v = PropertiesService.getScriptProperties().getProperty(klic);
  if (!v) throw new Error('Chybí vlastnost skriptu: ' + klic);
  return v;
}

/** OAuth token servisního účtu pro zápis do Realtime Database. */
function _token() {
  var email = _vlastnost('SA_EMAIL');
  var klic = _vlastnost('SA_PRIVATE_KEY').replace(/\\n/g, '\n');
  var ted = Math.floor(Date.now() / 1000);
  var hlavicka = Utilities.base64EncodeWebSafe(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  var telo = Utilities.base64EncodeWebSafe(JSON.stringify({
    iss: email,
    scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email',
    aud: 'https://oauth2.googleapis.com/token',
    exp: ted + 3600,
    iat: ted
  }));
  var podpis = Utilities.base64EncodeWebSafe(
    Utilities.computeRsaSha256Signature(hlavicka + '.' + telo, klic));
  var odpoved = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    payload: {
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: hlavicka + '.' + telo + '.' + podpis
    },
    muteHttpExceptions: true
  });
  var data = JSON.parse(odpoved.getContentText());
  if (!data.access_token) throw new Error('Nepodařilo se získat token: ' + odpoved.getContentText());
  return data.access_token;
}

function _zapis(cesta, data, token) {
  var url = _vlastnost('FIREBASE_URL').replace(/\/$/, '') + '/' + cesta + '.json';
  var odpoved = UrlFetchApp.fetch(url, {
    method: 'put',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify(data),
    muteHttpExceptions: true
  });
  if (odpoved.getResponseCode() >= 300) {
    throw new Error('Zápis selhal (' + odpoved.getResponseCode() + '): ' + odpoved.getContentText());
  }
}

/**
 * Projde strom a vrátí seznam složek svateb.
 * Struktura není úplně pravidelná: většina svateb je ve složce koordinátora,
 * jedna leží přímo v kořeni. Proto se bere obojí.
 */
function _najdiSvatby() {
  var koren = DriveApp.getFolderById(KOREN_SLOZKA);
  var nalez = [];

  var urovenJedna = koren.getFolders();
  while (urovenJedna.hasNext()) {
    var s1 = urovenJedna.next();
    var podslozky = s1.getFolders();

    if (podslozky.hasNext()) {
      // složka koordinátora (nebo složka zrušených)
      while (podslozky.hasNext()) {
        var s2 = podslozky.next();
        nalez.push({ koordinator: s1.getName(), slozka: s2 });
      }
    } else {
      // svatba ležící rovnou v kořeni
      nalez.push({ koordinator: '(kořen)', slozka: s1 });
    }
  }
  return nalez;
}

/** Hlavní funkce — tuhle pouštět ručně i ze spouštěče. */
function syncVse() {
  var token = _token();
  var souhrn = { zapsano: 0, zrusenePreskoceno: 0, bezData: [], nesedDatum: [], bezSmlouvy: [], chyby: [] };

  _najdiSvatby().forEach(function (polozka) {
    var slozka = polozka.slozka;
    var nazev = slozka.getName();

    if (jeZrusena(nazev) || jeZrusena(polozka.koordinator)) {
      souhrn.zrusenePreskoceno++;
      return;   // zrušené se nezapisují — kolidovaly by s aktivními svatbami
    }

    var datum = parseDatumZeSlozky(nazev, ROK_SEZONY);
    if (!datum) {
      souhrn.bezData.push(polozka.koordinator + ' / ' + nazev);
      return;
    }

    var zaznam = {
      koordinator: polozka.koordinator,
      slozkaId: slozka.getId(),
      slozkaNazev: nazev,
      slozkaUrl: slozka.getUrl(),
      sedyUcet: jeSedyUcet(nazev),
      aktualizovano: new Date().toISOString(),
      soubory: {},
      smlouva: null,
      upozorneni: []
    };

    var smlouvaDocId = null;
    var soubory = slozka.getFiles();
    while (soubory.hasNext()) {
      var f = soubory.next();
      var druh = klasifikujSoubor(f.getName(), f.getMimeType());
      if (druh === 'smlouva_pracovni' && !smlouvaDocId) smlouvaDocId = f.getId();
      zaznam.soubory[f.getId()] = {
        nazev: f.getName(),
        druh: druh,
        mime: f.getMimeType(),
        velikost: f.getSize(),
        url: f.getUrl(),
        zmeneno: f.getLastUpdated().toISOString()
      };
    }

    if (smlouvaDocId) {
      try {
        var text = DocumentApp.openById(smlouvaDocId).getBody().getText();
        var s = parseSmlouvu(text);
        zaznam.smlouva = s;

        // Nezávislá kontrola: datum ze složky vs. datum odvozené ze smlouvy.
        var zeSmlouvy = datumSvatbyZeSmlouvy(s.najemOd);
        if (zeSmlouvy && zeSmlouvy !== datum) {
          zaznam.upozorneni.push('Datum ve složce (' + datum + ') nesedí se smlouvou (' + zeSmlouvy + ')');
          souhrn.nesedDatum.push(nazev + ': ' + datum + ' vs ' + zeSmlouvy);
        }
        if (s.chyby.length) {
          zaznam.upozorneni.push('Ze smlouvy se nepodařilo přečíst: ' + s.chyby.join(', '));
        }
      } catch (e) {
        zaznam.upozorneni.push('Smlouvu se nepodařilo otevřít: ' + e.message);
        souhrn.chyby.push(nazev + ': ' + e.message);
      }
    } else {
      zaznam.upozorneni.push('Ve složce není smlouva jako Google dokument');
      souhrn.bezSmlouvy.push(polozka.koordinator + ' / ' + nazev);
    }

    _zapis(UZEL + '/' + datum, zaznam, token);
    souhrn.zapsano++;
    Logger.log('OK ' + datum + '  ' + nazev
      + (zaznam.upozorneni.length ? '  [' + zaznam.upozorneni.length + ' upozornění]' : ''));
  });

  Logger.log('--- HOTOVO ---');
  Logger.log(JSON.stringify(souhrn, null, 2));
  return souhrn;
}

/**
 * Zkouška naprázdno — NIC nezapisuje, jen vypíše, co by se stalo,
 * a upozorní na kolize datumů. Tohle pouštět jako první.
 */
function syncNanecisto() {
  var podleData = {};
  var radky = [];

  _najdiSvatby().forEach(function (p) {
    var nazev = p.slozka.getName();
    var zrusena = jeZrusena(nazev) || jeZrusena(p.koordinator);
    var datum = parseDatumZeSlozky(nazev, ROK_SEZONY);
    var pocet = 0, f = p.slozka.getFiles();
    while (f.hasNext()) { f.next(); pocet++; }

    radky.push((datum || '????-??-??') + '  ' + (zrusena ? '[ZRUŠENO] ' : '          ')
      + (jeSedyUcet(nazev) ? '[šedý] ' : '       ')
      + pocet + ' souborů  ' + p.koordinator + ' / ' + nazev);

    if (datum && !zrusena) (podleData[datum] = podleData[datum] || []).push(nazev);
  });

  radky.sort().forEach(function (r) { Logger.log(r); });

  Logger.log('--- KOLIZE DATUMŮ MEZI AKTIVNÍMI ---');
  var kolize = 0;
  Object.keys(podleData).forEach(function (d) {
    if (podleData[d].length > 1) { kolize++; Logger.log(d + ': ' + podleData[d].join('  ||  ')); }
  });
  if (!kolize) Logger.log('žádné — klíčování podle data je bezpečné');
}
