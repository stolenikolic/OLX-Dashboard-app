# PRD — OLX Multi-Profil Dashboard & Automatizacija

> **Status:** Draft v1.0
> **Vlasnik:** Admin / Programer
> **Zadnje ažuriranje:** 2026-06-29
> **Jezik proizvoda:** Bosanski

---

## 1. Pregled i vizija

Web dashboard koji omogućava vlasniku (adminu/programeru) i njegovim radnicima da u
potpunosti upravljaju **OLX.ba profilima bez prijavljivanja na OLX**. Sistem u pozadini:

- povlači interni feed proizvoda,
- automatski postavlja nove oglase (bez duplikata),
- računa i obnavlja cijene (uključujući poseban režim za **uvozne/gabaritne** artikle),
- (Faza 2) prima i šalje poruke kupcima.

Sistem radi za **više OLX profila paralelno** (5–8 na startu), uz mjere da OLX **ne poveže
profile** kao da ih vodi jedna osoba. Svaki profil pripada zasebnom radniku koji odgovara na
poruke; admin je programer koji održava softver.

---

## 2. Ciljevi i opseg

### 2.1 MVP (Faza 1)
- Feed sinhronizacija → Supabase (snapshot svakih 24h).
- Mapiranje internih kategorija i atributa na OLX (admin, globalno).
- Automatsko postavljanje oglasa: kategorija-po-kategorija, dnevni limit, bez duplikata.
- Cjenovni engine: standardne formule + **uvozni režim** (gabaritni artikli) + globalne marže.
- Automatsko obnavljanje cijena na cijelom katalogu.
- Multi-profil sa razdvajanjem **admin/radnik** (Supabase RLS).
- Dashboard UI (stil sličan OLX.ba), responsive.
- Logovanje, retry, email notifikacije, detekcija suspenzije profila.
- Anti-detekcija (proxy po profilu opcionalno, jedinstven device/UA, stagger, varijacije).

### 2.2 Faza 2 (kasnije)
- Obnavljanje/bump oglasa po **score** sistemu (upiti, starost oglasa, prioriteti).
- Poruke: **primanje** upita i **slanje** odgovora (OLX ima endpoint za slanje).

### 2.3 Ne-ciljevi (za sad)
- Plaćene VAS promocije/isticanja.
- Kategorije koje zahtijevaju obavezan `brand_id`/`model_id`.
- Cjenovne min/max granice (svjesno izostavljene — vidi §6.6).

---

## 3. Korisnici i role

| Rola | Pristup | Šta vidi / radi |
|------|---------|-----------------|
| **Admin** (ti) | Svi profili | Globalna mapiranja (kategorije/atributi/vrijednosti), globalne marže, uvoz-flag po kategoriji, proxy/kredencijali, parametri profila, kreiranje naloga radnicima, pregled svih logova. |
| **Radnik** | Samo svoj profil | Status profila, njegovi aktivni oglasi, ručne akcije nad oglasima, (Faza 2) poruke, greške/upozorenja svog profila. |

- **Autentifikacija:** Supabase Auth (email + lozinka). Admin kreira naloge radnicima.
- **Izolacija:** Supabase **RLS** — radnik može pristupiti isključivo redovima vezanim za
  svoj `profile_id`.

---

## 4. Arhitektura sistema

```
┌─────────────────────┐        ┌──────────────────────┐
│   Dashboard (UI)     │        │   GitHub Actions      │
│  Next.js 16 / React  │        │   (cron workeri)      │
│  Vercel hosting      │        │  - sync-feed          │
│                      │        │  - post-listings      │
│  Admin + Radnik      │        │  - refresh-prices     │
└──────────┬──────────┘        └──────────┬───────────┘
           │                              │
           │  Supabase JS (RLS)           │  service role
           ▼                              ▼
        ┌────────────────────────────────────────┐
        │          Supabase (Postgres)            │
        │  Auth · RLS · Storage · tabele/logovi   │
        └────────────────────────────────────────┘
                          │
                          │  OLX API pozivi (PO PROFILU kroz proxy)
                          ▼
              ┌───────────────────────────┐
              │  Proxy sloj (po profilu)  │ → api.olx.ba
              └───────────────────────────┘
```

### 4.1 Komponente
- **Frontend/Dashboard:** Next.js 16 + React 19 + Tailwind v4. Host: **Vercel**. Jezik:
  bosanski. **Responsive** (radnici koriste i telefon).
- **Baza/Backend:** **Supabase** (Postgres + Auth + RLS + Storage).
- **Pozadinski poslovi:** **GitHub Actions** (cron). Koriste Supabase **service role** key.
- **Proxy sloj:** svaki **OLX API poziv izlazi kroz proxy tog profila**. Opcionalno po profilu
  na startu (ako je polje prazno → radi bez proxy-ja).

### 4.2 Arhitektonsko pravilo (kritično za anti-detekciju)
Hosting IP (Vercel/GitHub) **nikad se ne smije pojaviti prema OLX-u**. Svi OLX zahtjevi za
određeni profil moraju proći kroz proxy konfigurisan za taj profil (kad je proxy podešen).
Dashboard ne poziva OLX iz browsera korisnika — sve OLX akcije rade workeri.

---

## 5. Izvor podataka — Feed

- **URL:** potpisani Supabase Storage link `feeds/olx.json` (vidi `FEED_API_KEY` u §16).
- **Učestalost:** povlači se **svakih 24h**; snima se **snapshot u Supabase**; sve operacije
  rade iz baze (ne iz live feed-a).
- **Struktura artikla (primjer):**

```json
{
  "id": "0034c779-784f-420c-a310-dd913ab85af4",
  "title": "ARCTIC COOLING Liquid Freezer III Pro 280 A-RGB black",
  "shop_price": 199,
  "offers": {
    "HU": { "acquisition_price": 28750, "acquisition_currency": "HUF", "supplier_code": "firstshop" },
    "BA": { "acquisition_price": 250, "acquisition_currency": "KM", "supplier_code": "comtrade" }
  },
  "category": { "name": "Vodena hladjenja", "slug": "vodena-hladjenja" },
  "main_image": "https://.../products/<id>/0.webp",
  "specs": { "fan_size": "140mm", "fan_count": "2pcs" }
}
```

- **`shop_price`** se **NE koristi** za izračun OLX cijene (samo eventualni prikaz kao referenca).
- **`id` (uuid)** je feed identifikator; nije isti kao interni **`ipon_id`** (vidi §11.2).

---

## 6. Cjenovni engine

### 6.1 Parametri PO PROFILU (admin podešava u UI)
| Parametar | Default | Opis |
|-----------|---------|------|
| `KURS` | 380 | Redovni kurs (HUF) za standardni izračun. |
| `kurs_uvoz` | 350 | Kurs za **uvozne/gabaritne** HUF artikle. Odvojen od `KURS`. |

### 6.2 Marže — GLOBALNE za sve profile
Marža je **matrica `kategorija × porijeklo`**, ista za sve profile:
- po svakoj kategoriji: `marza_bih` i `marza_huf`,
- **globalni default = 1.10** (primjenjuje se dok se ne postavi specifična vrijednost).

> Napomena: ovo zamjenjuje raniju ideju da je marža po profilu. Cijene i dalje **ostaju
> različite po profilu** jer su `KURS`/`kurs_uvoz` po profilu + random ±% po profilu (§6.5).

Konstante fiksne u kodu: `EUR = 1.95`, `PDV = 1.17`.

### 6.3 Formule
Neka je `acq = offers[...].acquisition_price`, a `kat` kategorija artikla.

- **Standardni HUF:**
  `cijena_huf = acq_HUF / KURS * 1.95 * marza_huf[kat]`
- **Uvozni HUF (gabaritan):**
  `cijena_huf = acq_HUF / kurs_uvoz * 1.95 * marza_huf[kat] * 1.17`
- **BiH (uvijek standardno):**
  `cijena_bih = acq_KM * marza_bih[kat] * 1.17`

Uvozni HUF koristi **HUF maržu** te kategorije (ne posebnu uvoznu maržu).

### 6.4 Izbor finalne cijene
1. Izračunaj primjenjivi **HUF** (standardni *ili* uvozni — zavisno od uvoz-flag-a, §6.7).
2. Izračunaj **BiH** (uvijek standardno).
3. Ako postoje **obje** ponude → uzmi **nižu** od dvije izračunate cijene.
4. Ako postoji **samo jedna** ponuda → koristi nju.

### 6.5 Zaokruživanje i randomizacija
- **Zaokruživanje:** na cijeli broj (KM bez decimala).
- **Random ±1–2%:** primjenjuje se **po profilu**, i pri **postavljanju** i pri **obnavljanju**
  cijena (da nijedan profil nema identičnu cijenu). Identično se primjenjuje i na uvozne cijene.

### 6.6 Bez cjenovnih granica (prihvaćen rizik)
Svjesno **nema** min/max sanity provjera. Posljedica: pogrešno unesen `KURS`/`kurs_uvoz` može
objaviti pogrešne cijene na cijelom katalogu. Ovo je eksplicitna odluka vlasnika.

### 6.7 Režim "uvoz" (gabaritni artikli) — utiče SAMO na HUF
BiH ponuda se **uvijek** računa standardno; uvoz mijenja samo HUF granu.

- **Nivo kategorije:** globalni **on/off** prekidač (npr. "kućišta = uvoz" za sve profile).
- **Nivo artikla:** **3 stanja** — `inherit` (naslijedi od kategorije, default) / `on`
  (uključi uvoz) / `off` (isključi uvoz). **Artikal nadjačava kategoriju.**
- **Doseg:** i kategorijski i artikalski prekidač djeluju **globalno** (isto za sve profile).

**Rezolucija flag-a za artikal:**
```
ako artikal.import_override == 'on'      -> uvoz
ako artikal.import_override == 'off'     -> standardno
inače (inherit)                          -> kategorija.import_flag
```

---

## 7. Postavljanje oglasa

### 7.1 Raspored i limiti
- Pokreće se **svakih 24h** (GitHub Actions), po profilu, u **različitim terminima po profilu**
  + random jitter (§10).
- **Dnevni limit: 350 oglasa po profilu.**
- Postavljanje ide **kategorija-po-kategorija**, redoslijedom/prioritetom **definisanim po
  profilu**, dok se ne potroši dnevni limit.

### 7.2 Sprječavanje duplikata
- Baza vodi vezu `feed_product_id (uuid) → olx_listing_id` **po profilu** (`listings`).
- Ako veza postoji → artikal se **preskače**.
- **Postojeći (ručno postavljeni) oglasi:** ubacuju se kroz **upload CSV/JSON po profilu**
  (`olx_listing_id ↔ ipon_id`), čime se popunjava dedup tabela prije prvog automatskog ciklusa.

### 7.3 Tok kreiranja oglasa (OLX API)
1. `POST /listings` → kreira **DRAFT** (title, opis, cijena, state, listing_type, atributi…).
2. `POST /listings/:id/image-upload` → postavi `main_image` (kao `image_url`) i označi je glavnom.
3. `POST /listings/:id/publish` → objavi oglas.
4. Tek **objavljen** oglas se broji u dnevni limit.

### 7.4 Mapiranje polja feed → OLX listing
| OLX polje | Vrijednost |
|-----------|-----------|
| `title` | feed `title` (kako jeste) |
| `description` | **fiksni šablon po profilu** (popunjen iz title/specs) |
| `state` | `new` |
| `listing_type` | `sell` |
| `price` | izračunata cijena (§6) |
| `price_by_agreement` | `false` (fiksna cijena) |
| `quantity` | `1` |
| `available` | `true` |
| `shipping` | omogućena ako kategorija podržava |
| `location` | **NE šalje se** — vezana je za profil na OLX-u (§9.3) |
| `attributes` | iz mapiranja (§7.5) |

### 7.5 Mapiranje atributa
- **Spec → OLX atribut:** ručno mapiranje (admin), po kategoriji.
- **Vrijednosti:** ako spec vrijednost nije u listi dozvoljenih OLX opcija → koristi
  **tabelu mapiranja vrijednosti** (`feed vrijednost → OLX opcija`); ako nema mapiranja →
  **fallback** vrijednost.
- **Obavezan atribut bez vrijednosti u feed-u:** koristi **default/fallback po atributu**.

### 7.6 Brend/model i plaćene kategorije
- **Brend/model:** za sad postavljamo **samo kategorije bez obaveznog brenda/modela**.
- **Plaćene kategorije:** profili su plaćeni mjesečno → sve kategorije efektivno besplatne
  (bez dodatne naknade po oglasu).

---

## 8. Obnavljanje cijena

- Obuhvata **cijeli katalog** profila, **svakih 7 dana** (konfigurabilno po profilu).
- Računa po istim formulama (§6), uključujući uvoz-flag i random ±%.
- **Update se šalje samo ako se nova cijena razlikuje** od trenutne (`PUT /listings/:id`) — štedi
  API pozive.

---

## 9. Životni ciklus zaliha i profila

### 9.1 Artikal nestao iz feed-a (nema na zalihama)
- Oglas se **sakrije** (`POST /listings/:id/hide`).
- Ako se artikal vrati u feed → **unhide** (`POST /listings/:id/unhide`).

### 9.2 Suspenzija profila (neplaćanje)
- Kad OLX API vrati grešku autorizacije/zabrane → profil se označi **`suspended`**, posao
  **staje**, ponovni pokušaj za **24h**, + **email adminu**.

### 9.3 Lokacija
- **Ne šalje se** uz API zahtjev. Lokacija je vezana za profil pri kreiranju na OLX-u i ne
  konfiguriše se u ovom softveru.

---

## 10. Anti-detekcija (da OLX ne poveže profile)

OLX kod **zvanične API integracije** ne vidi browser fingerprint; ono što može korelirati je:
IP adresa, identitet naloga, ponašanje, `device_name`/`User-Agent`. Mjere:

- **Proxy po profilu** (zaseban, stabilan IP). Opcionalno polje u dashboardu
  (`host:port:user:pass`); prazno → bez proxy-ja. Preporuka za kasnije: datacenter
  *dedicated/static* IP po profilu, nadogradiv na rezidencijalni/mobilni bez izmjene koda.
- **Jedinstven `device_name` + `User-Agent` po profilu** (auto-generisani, stabilni).
- **Različite cijene** (random ±%) + **različit redoslijed kategorija** po profilu.
- **Različiti termini izvršavanja** po profilu + random pauze između zahtjeva (human-like
  throttling).
- Prirodno razdvojeni nalozi (svaki profil = svoj radnik, email, telefon, plaćanje).

---

## 11. Multi-profil, sigurnost i mapiranja

### 11.1 Sigurnost
- Supabase **RLS**: radnik pristupa samo redovima svog `profile_id`.
- Kredencijali (OLX login/token, proxy) čuvaju se po profilu; koriste ih backend/workeri
  (service role). Kombinovani pristup: master/okruženje + zapis u bazi.

### 11.2 ipon ↔ feed mapiranje
- `ipon_id` i feed `uuid` **NISU isti**. Mapiranje (`ipon_id ↔ feed_uuid`) radi se **eksterno**
  (kasnije i uz AI), a u sistem se ubacuje **gotov rezultat** (tabela `ipon_feed_map`).

---

## 12. Poruke (Faza 2)

- **Primanje:** upiti kupaca se prikazuju u dashboardu (po profilu, vidi radnik).
- **Slanje:** OLX ima endpoint za slanje → radnik odgovara iz dashboarda.
- **Mehanizam primanja:** potvrditi (polling vs webhook `incoming_message`) prije Faze 2.
- Tabela `messages` se priprema u šemi već u MVP-u (bez aktivne logike).

---

## 13. Autentifikacija na OLX (po profilu)

- **Primarno:** `POST /auth/login` (username/password, `device_name` jedinstven po profilu) →
  Bearer token, koji se čuva i **automatski osvježava**.
- **Fallback:** stari tokeni (`OLX-CLIENT-ID` + `OLX-CLIENT-TOKEN`) za profile gdje nemamo šifru.

---

## 14. UI / Stranice (stil sličan OLX.ba)

### 14.1 Globalni layout i tema
- **Layout:** gornja traka (logo, pretraga, **profil-switcher**, korisnik) + **lijevi sidebar**.
- **Tema:** tirkizna/teal kao OLX.ba, čist i moderan svijetli UI.
- **Responsive:** obavezno (radnici koriste telefon).
- **Jezik:** bosanski.

### 14.2 Admin — početna
- Pregled svih profila: status (aktivan/suspendovan), broj aktivnih oglasa, % dnevnog limita.
- Zbirne brojke (ukupno oglasa, postavljeno danas, broj nepročitanih poruka — Faza 2).
- Posljednja izvršavanja poslova + greške.
- Brze akcije: ručno pokreni postavljanje / obnovu cijena za profil.

### 14.3 Radnik — početna (njegov profil)
- Status profila + koliko postavljeno danas / od limita.
- Njegovi aktivni oglasi (**grid kartica** kao OLX).
- Poruke/upiti (Faza 2).
- Posljednje greške/upozorenja za njegov profil.

### 14.4 Katalog / oglasi
- **Grid kartica** (slika, naslov, cijena, kategorija, status) + filteri i pretraga.
- **Po artiklu:** 3-state prekidač **"uvoz"** (`inherit`/`on`/`off`).
- **Ručne akcije nad oglasom:** Postavi sad / Sakrij / Završi / Obnovi cijenu; ručni **override
  cijene** (mimo formule); **isključi iz automatizacije** (blacklist).

### 14.5 Podešavanja (po profilu)
- `KURS`, `kurs_uvoz`; prioritet/redoslijed kategorija.
- Šablon opisa; OLX kredencijali (login/token); proxy podaci.
- Dnevni limit; raspored/termin izvršavanja; pauziraj/aktiviraj profil.
- Random ±% raspon cijene.

### 14.6 Admin — mapiranja i marže (globalno)
- Mapiranje: interni slug → OLX kategorija; spec → OLX atribut + vrijednosti.
- **Uvoz on/off po kategoriji** (globalno).
- **Marže:** matrica kategorija × {BiH, HUF}, globalni default 1.10.

---

## 15. Logovanje, greške, notifikacije

- **Log po profilu:** šta je postavljeno, greške, potrošeno od limita, vremena izvršavanja
  (`job_runs`, `job_logs`).
- **Retry sa backoff-om**; ako i dalje pada → preskoči artikal i loguj za sljedeći ciklus.
- **Email adminu** + prikaz u dashboardu kod kritičnih grešaka (token istekao, posao pao,
  suspenzija).

---

## 16. Konfiguracija / Env varijable

| Varijabla | Gdje | Opis |
|-----------|------|------|
| `FEED_API_KEY` | GitHub Secret / env | Ključ za preuzimanje feed-a (`stolenikolic1999apikey`). |
| `FEED_URL` | env | Potpisani Supabase Storage URL feed-a. |
| `NEXT_PUBLIC_SUPABASE_URL` | env | Supabase URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | env | Anon key (frontend, RLS). |
| `SUPABASE_SERVICE_ROLE_KEY` | GitHub Secret | Service role za workere. |
| OLX login/token (po profilu) | DB (enkriptovano) | Kredencijali profila. |
| Proxy (po profilu) | DB | `host:port:user:pass` (opcionalno). |
| `device_name` / `User-Agent` (po profilu) | DB | Auto-generisani, stabilni. |

> Napomena: ključeve ne commit-ovati u repo. `FEED_API_KEY` i `SUPABASE_SERVICE_ROLE_KEY`
> idu kao GitHub Actions Secrets.

---

## 17. Faze isporuke

### Faza 1 (MVP)
1. Šema baze + RLS + Auth.
2. Feed sync worker + tabele proizvoda/ponuda.
3. Admin mapiranja (kategorije/atributi/vrijednosti) + uvoz-flag + marže.
4. Cjenovni engine (standard + uvoz + izbor niže + random + zaokruživanje).
5. Worker za postavljanje (dedup, draft→publish, limiti, prioritet kategorija).
6. Worker za obnavljanje cijena.
7. Out-of-stock i suspenzija logika.
8. Dashboard UI (admin + radnik) + ručne akcije + logovi.
9. Anti-detekcija (proxy/device/UA/stagger).
10. Email notifikacije.

### Faza 2
- Bump/refresh oglasa + score sistem.
- Poruke (primanje + slanje).

---

## 18. Otvorene stavke / pretpostavke
- **Mehanizam primanja poruka** (polling vs webhook) — potvrditi prije Faze 2.
- **Tačan OLX endpoint za slanje poruka** — dokumentovati prije Faze 2.
- **Format CSV/JSON** za import postojećih oglasa i `ipon_feed_map` — finalizovati pri implementaciji.

---

## 19. Reference (OLX API)
- Auth: `POST /auth/login`, Bearer token, fallback `OLX-CLIENT-ID/TOKEN`.
- Listings: `POST /listings`, `PUT /listings/:id`, `POST /listings/:id/publish`,
  `POST /listings/:id/image-upload`, `POST /listings/:id/hide|unhide|finish`,
  `PUT /listings/:id/refresh`, `GET /listing-limits`, `GET /listing/refresh/limits`.
- Categories: `GET /categories`, `GET /categories/:id`, `GET /categories/:id/attributes`,
  `GET /categories/suggest`, `GET /categories/find`.
- Users: `GET /users/:username/listings` (+ finished/inactive/expired/hidden).

Dokumentacija: https://api-documentation.olx.ba/
