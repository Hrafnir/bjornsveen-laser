# ⚡ Bjørnsveen LaserStudio

Et intuitivt, lynraskt og 100 % nettbasert vektorgrafikkverktøy utviklet spesielt for **Bjørnsveen skaperverksted** (ungdomsskoleelever og voksne).

Programmet kjører direkte i nettleseren uten installasjon eller innlogging. Tegninger og bilder behandles lokalt. Fonter og biblioteker følger appen, uten tredjepartsforespørsler under bruk. Appen eksporterer ferdige **1:1 millimeter `.svg`-filer** tilpasset **xTool P3 (CO2-laser)** og **xTool F2 Ultra (UV-laser)**.

---

## ✨ Hovedfunksjoner

### 1. Skreddersydd for xTool P3 & xTool F2 Ultra
* **Maskinprofiler i millimeter:**
  * **xTool P3 CO2-laser:** $914 \times 457\text{ mm}$
  * **xTool F2 Ultra UV-laser:** $220 \times 220\text{ mm}$ (med senterkryss og galvo-arbeidsfelt)
  * Standard kryssfiner-/akrylplater ($600 \times 400\text{ mm}$, $450 \times 300\text{ mm}$, $300 \times 200\text{ mm}$, A3, A4 og egendefinert størrelse).
* **Fargekodede laserlag (xTool Creative Space / Studio-standard):**
  * 🔴 **KUTT (`#FF0000`):** Tynn konturlinje for gjennomkutting (`Cut`).
  * 🔵 **LINJE / SCORE (`#0000FF`):** Tynn konturlinje for rask overflategravering (`Score`).
  * ⚫ **GRAVERING (`#000000`):** Fylt flate for flategravering (`Engrave`).
  * 🟢 **HJELPELINJE:** Senterlinjer, delehjulssirkler på tannhjul og merkelapper (eksporteres **ikke** til laseren).

### 2. Innebygde Skaperverksted-generatorer
* 📦 **Finger-joint Boks-generator:** Genererer åpne bokser (5 sider), lukkede bokser med lokk (6 sider) eller bokser med skillevegger/rominndeling. Støtter eksakt materialtykkelse ($t$ i mm), indre/ytre mål og *kerf*-kompensasjon (stramhet i sammenføyningen).
* 🪧 **Dørskilt- & Nøkkelring-generator:** Velg skiltfasong, opphengshull (2 skruehull, 4 hjørnehull eller sveiset nøkkelring-øye), pynteramme, tekst og symbol.
* 🧩 **Puslespill-generator:** Genererer puslespill i valgfri millimeterstørrelse og antall brikker ($\text{Kolonner} \times \text{Rader}$) med ekte kurvede låsebrikker.
* ⚙️ **Evolvent Tannhjul-generator (Involute Spur Gears):** Genererer enkelt-tannhjul eller matchende tannhjul-par med valgfri *Modul (mm)*, antall tenner ($Z_1, Z_2$), senterhull for aksling, eiker og visning av eksakt senteravstand mellom akslene.
* ❄️ **Dekor-, Snøkrystall- & Mandala-generator:** Lag snøkrystaller, mandala-rosetter, glassbrikker (coasters) og hengende dekorasjoner.
* 🦌 **Symbolbibliotek & 🖼️ Bilde-til-vektor (Image Trace):** Sett inn ferdige vektorikoner (dyr, natur, gaming, sport, skilt) eller last opp en tegning/logo og spor den automatisk til vektorstier.

### 3. Magiske Laserverktøy & Laser-fonter
* **Tekst med automatisk konvertering til vektorstier (`<path>`):**
  * ✂️ **Laser Sjablong (Stencil):** Automatisk sjablong-broer slik at innmaten i *O, A, B, D, P, R, Æ, Ø, Å* ikke faller ut når bokstavene kuttes!
  * ⚡ **Laser Enkelstreg (Single-line Score):** Tegner hver bokstav med én enkelt strek – opptil 10 ganger raskere enn vanlig gravering!
  * Støtter også buet tekst og vanlig skilt-/serif-/håndskrift.
* **Boolean & Kontur:**
  * 🔗 **Slå sammen (Union / Weld):** Smelt sammen overlappende former eller bokstaver.
  * ✂️ **Trekk fra (Subtract):** Stans ut hull eller tekst fra en figur.
  * ⭕ **Lag ytterkant (Offset):** Lag en rød kuttelinje i valgfri avstand (f.eks. $+3,0\text{ mm}$) rundt tekst eller symboler.
  * 🔑 **+ Nøkkelring-øye:** Ett klikk for å sveise på et nøkkelring-feste ($\varnothing\,4,5\text{ mm}$) på enhver figur.

---

## 🚀 Kjøre lokalt eller publisere på GitHub Pages

### Kjøre lokalt på Mac
Fra mappen `bjornsveen-laser`:
```bash
python3 -m http.server 8080
```
Åpne `http://localhost:8080` i Safari eller Chrome.

### Publisere gratis på GitHub Pages
1. Opprett et nytt repository på GitHub (f.eks. `bjornsveen-laser`).
2. Last opp innholdet i `bjornsveen-laser/` (`index.html`, `styles.css`, `README.md`, `js/`, `fonts/` og `vendor/`).
3. Gå til **Settings → Pages** på GitHub, velg **Deploy from a branch (`main` / root)** og klikk **Save**.
4. I løpet av 1 minutt er programmet tilgjengelig på `https://<ditt-brukernavn>.github.io/bjornsveen-laser/` for alle elevene!

## Stabilisering og lokal drift

Kjør `npm test` med Node.js 24 eller nyere for regresjonstestene. Appen trenger ingen byggejobb eller npm-installasjon. For nettlesertestene, start `python3 -m http.server 8767 --bind 127.0.0.1` og åpne `http://127.0.0.1:8767/tests/browser.html`. Nettlesertestene bruker en egen testdatabase og testnøkkel. Åpne selve editoren på samme server for manuell kontroll av kopiering, angre, gjenåpning, bildekontroller og eksport.

- **Lagring:** IndexedDB lagrer prosjektet etter endringer. Eldre localStorage-prosjekter migreres først når den nye lagringen er bekreftet. Tomme prosjekter gjenopprettes som tomme. En liten synkron gjenopprettingsjournal beskytter de siste endringene ved rask gjenåpning; store eksisterende bilder refereres fra IndexedDB. Status nederst viser når lagringen er ferdig eller har feilet. Dersom et nytt stort bilde ennå ikke er sikret, ber nettleseren deg vente før lukking. Last ned XCS som sikkerhetskopi før du bytter maskin/nettleser; lokal nettleserlagring er ikke en sikkerhetskopi.
- **Maskin:** «Maskin for XCS-eksport» bestemmer maskinen. Valg av en maskinflate øverst setter også målmaskinen. En plate eller materialprofil endrer ikke dette valget. Kontroller at materialparametrene passer valgt maskin; profilene er utgangspunkter og er ikke fysisk kalibrert av denne testpakken.
- **Foto:** Originalbildet beholdes. Redigering bruker en forhåndsvisning på inntil 750 piksler, mens eksport beregner oppløsning fra fysisk størrelse og valgt DPI. Eksport oppskalerer ikke kilden og begrenses til 8192 piksler per side / 16 megapiksler for å begrense minnebruk. «Følg fotomodus» bruker den globale modusen; et eksplisitt bildefilter overstyrer den. Gamle bilder som allerede er redusert til 750 piksler må importeres på nytt for å få tilbake detaljene.
- **SVG:** Import støtter vanlige former og baner, nestede gruppetransformasjoner, fargearv, viewBox og absolutte enheter (mm/cm/in/pt/pc/px). Uten enheter brukes SVG-standarden 96 px per tomme. Tekst, CSS-regler, `<use>`, masker, klipping, filtre, nestede SVG-arbeidsflater, prosentmål og skjevstilte bitmapbilder må bakes inn i kildeprogrammet. Ustøttet innhold gir en melding, og ugyldig XML avvises. Duplikatkontrollen sammenligner hele baner med 0,001 mm koordinatavrunding; den finner ikke alle delvis overlappende kutt.
- **Tekst:** Google-fontene følger med lokalt med lisenser. Tekstkonturer hentes fra TTF-filene med OpenType.js og samples til polygoner, uten rastersporing. Tidligere systemfontvalg bruker navngitte lokale alternativer i fontvelgeren. Eksisterende lagrede tekstbaner beholdes til teksten redigeres. Endring av slik tekst kan derfor gi et annet utseende enn den opprinnelige systemfonten.
- **XCS:** Koordinater og parameterobjekter er regresjonstestet. Åpning i en konkret xTool Studio-versjon og fysisk kjøring på P3/F2 gjenstår som separat akseptansetest. Kontroller mål, bilde, hull, behandling og parametere før produksjon.

Lagring, SVG-import, laserprofiler og fontfiler har egne moduler (`storage.js`, `svg-import.js`, `laser-settings.js`, `font-files.js`). Hovedkontrolleren er fortsatt stor og kan deles videre etter hvert som funksjoner endres.
