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
* 📦 **Finger-joint Boks-generator:** Sju varianter: åpen, løst lokk, skyvelokk, hengsellokk for løse beslag, brett med håndtak, sorteringsboks og fast topp. Rominndeling (1–12 rom i hver retning) kan kombineres med lokk. Viser kuttedeler eller sammensatt boks. Mål og full snittbredde kompenseres analytisk i millimeter.
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

## Bokser: mål, skjøter og montering

Boksmotoren i `js/box-generator.js` bygger parvise fingerskjøter fra samme mål. Hjørnene møtes vinkelrett. Bunn og eventuell fast topp eier hjørnevolumet slik at tre plater ikke kolliderer. Konturer avrundes til 0,001 mm uten å skaleres gjennom en grovere avrundet ramme.

- **Ytre mål** inkluderer lokket. **Indre høyde** er fri høyde under lokk/sentreringsplate. Skyvelokkets skinner tar noe plass langs sideveggene; skilleveggene senkes under de nedre skinnene for å unngå kollisjon. Skilleveggene er litt lavere enn fri høyde og har valgt klaring ved endene.
- **Materialtykkelse** er målt tykkelse. **Kerf** er hele snittbredden: konturen flyttes en halv snittbredde ut, og hull en halv snittbredde inn. XCS-eksport slår av ytterligere kerfkompensasjon. Ikke legg på kompensasjon en gang til i laserprogrammet. Standardverdien er et utgangspunkt; prøvemonter en liten boks i samme materiale først.
- **Løst lokk:** Lim sentreringsplaten midt under lokket. Begge får samme fingerhull dersom det er valgt.
- **Skyvelokk:** Fire skinner limes på innsiden av sideveggene, to på hver side. Øvre skinner flukter med veggenes overkant. De nedre skinnenes overkant flukter med den lave frontveggen. Sporet mellom skinnene er materialtykkelsen pluss valgt klaring. Lokket skyves inn fra fronten. Skinner og øvrige fingerskjøter krever lim.
- **Hengsellokk:** Krever to separate utvendige hengsler egnet for en bakvegg og et lokk i 90° når boksen er lukket. Generatoren tilbyr to hull per blad, med justerbar hullavstand, diameter og avstand fra topp/bakkant. Hengslene plasseres ved ¼ og ¾ av lengden. Tilpass hullene til faktiske beslag; slå dem av dersom hengslene har et annet hullmønster. Dette er ikke et integrert trehengsel eller et bøyelig laserskåret hengsel.
- **Rom:** Like store rom, med materialtykkelsen til hver skillevegg trukket fra. Kryssende skillevegger har motsatte halv-i-halv-spor. Skillevegger i bare én retning må limes eller festes separat.
- **Kutt:** Hull får et eget XCS-lag før boksenes ytterkonturer. SVG har de samme fargegruppene, men rekkefølgen må settes i laserprogrammet. Delnavn vises som vanlig, tydelig tekst under delene og eksporteres ikke. Hver del grupperes med hull og delnavn slik at de flyttes sammen. Delene legges uten overlapp; platebehov vises før innsetting. Lag eldre bokser på nytt for å bruke den nye geometrien.

Utvalg og parametere er inspirert av [Boxes.py](https://boxes.hackerspace-bamberg.de/?language=en), spesielt [skyvelokk](https://boxes.hackerspace-bamberg.de/SlidingLidBox?language=en) og forklaringen av [materialtykkelse og burn](https://florianfesti.github.io/boxes/html/usermanual.html). Boxes.py kaller **halv** snittbredde «burn»; her brukes **hel** snittbredde «kerf». Implementasjonen er skrevet for denne appen og kjører lokalt uten Boxes.py-tjenesten.

Testene kontrollerer skjøtene som ekstruderte flater i en 3D-sammenstilling, alle hjørner, kompensasjon på hver kant, rominndeling, hullkollisjoner og eksportmål. Fysisk prøvekutt, passform og montering av lokk/hengsler må fortsatt testes på maskinen.

## Stabilisering og lokal drift

Kjør `npm test` med Node.js 24 eller nyere for regresjonstestene. Appen trenger ingen byggejobb eller npm-installasjon. For nettlesertestene, start `python3 -m http.server 8767 --bind 127.0.0.1` og åpne `http://127.0.0.1:8767/tests/browser.html`. Nettlesertestene bruker en egen testdatabase og testnøkkel. Åpne selve editoren på samme server for manuell kontroll av kopiering, angre, gjenåpning, bildekontroller og eksport.

- **Lagring:** IndexedDB lagrer prosjektet etter endringer. Eldre localStorage-prosjekter migreres først når den nye lagringen er bekreftet. Tomme prosjekter gjenopprettes som tomme. En liten synkron gjenopprettingsjournal beskytter de siste endringene ved rask gjenåpning; store eksisterende bilder refereres fra IndexedDB. Status nederst viser når lagringen er ferdig eller har feilet. Dersom et nytt stort bilde ennå ikke er sikret, ber nettleseren deg vente før lukking. Last ned XCS som sikkerhetskopi før du bytter maskin/nettleser; lokal nettleserlagring er ikke en sikkerhetskopi.
- **Maskin:** «Maskin for XCS-eksport» bestemmer maskinen. Valg av en maskinflate øverst setter også målmaskinen. En plate eller materialprofil endrer ikke dette valget. Kontroller at materialparametrene passer valgt maskin; profilene er utgangspunkter og er ikke fysisk kalibrert av denne testpakken.
- **Foto:** Originalbildet beholdes. Redigering bruker en forhåndsvisning på inntil 750 piksler, mens eksport beregner oppløsning fra fysisk størrelse og valgt DPI. Eksport oppskalerer ikke kilden og begrenses til 8192 piksler per side / 16 megapiksler for å begrense minnebruk. «Følg fotomodus» bruker den globale modusen; et eksplisitt bildefilter overstyrer den. Gamle bilder som allerede er redusert til 750 piksler må importeres på nytt for å få tilbake detaljene.
- **SVG:** Import støtter vanlige former og baner, nestede gruppetransformasjoner, fargearv, viewBox og absolutte enheter (mm/cm/in/pt/pc/px). Uten enheter brukes SVG-standarden 96 px per tomme. Tekst, CSS-regler, `<use>`, masker, klipping, filtre, nestede SVG-arbeidsflater, prosentmål og skjevstilte bitmapbilder må bakes inn i kildeprogrammet. Ustøttet innhold gir en melding, og ugyldig XML avvises. Duplikatkontrollen sammenligner hele baner med 0,001 mm koordinatavrunding; den finner ikke alle delvis overlappende kutt.
- **Tekst:** Google-fontene følger med lokalt med lisenser. Tekstkonturer hentes fra TTF-filene med OpenType.js og samples til polygoner, uten rastersporing. Tidligere systemfontvalg bruker navngitte lokale alternativer i fontvelgeren. Eksisterende lagrede tekstbaner beholdes til teksten redigeres. Endring av slik tekst kan derfor gi et annet utseende enn den opprinnelige systemfonten.
- **Puslespill:** Nye puslespill har tre separate kuttelag: vannrette linjer → loddrette linjer → ytterkontur. XCS-eksport gir lagene fast rekkefølge og aktiverer behandling etter lag. Gravering og score ligger foran kuttene. SVG beholder tre farger/grupper, men behandlingsrekkefølgen må settes i laserprogrammet ved SVG-import. Lag eldre puslespill på nytt i generatoren for å få de tre kuttelagene. Ved rotasjon beholdes rekkefølgen fra generatoren.
- **XCS:** Koordinater og parameterobjekter er regresjonstestet. Åpning i en konkret xTool Studio-versjon og fysisk kjøring på P3/F2 gjenstår som separat akseptansetest. Kontroller mål, bilde, hull, behandling og parametere før produksjon.

Lagring, SVG-import, laserprofiler og fontfiler har egne moduler (`storage.js`, `svg-import.js`, `laser-settings.js`, `font-files.js`). Hovedkontrolleren er fortsatt stor og kan deles videre etter hvert som funksjoner endres.
