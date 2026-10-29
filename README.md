# ⚡ Bjørnsveen LaserStudio

Et intuitivt, lynraskt og 100 % nettbasert vektorgrafikkverktøy utviklet spesielt for **Bjørnsveen skaperverksted** (ungdomsskoleelever og voksne).

Programmet kjører direkte i nettleseren uten installasjon eller innlogging. Tegninger og bilder behandles lokalt. Fonter og biblioteker følger appen, uten tredjepartsforespørsler under bruk. Appen eksporterer **native `.xs`-prosjekter til xTool Studio**, eldre `.xcs` og **1:1 millimeter `.svg`-filer** tilpasset **xTool P3 (CO2-laser)** og **xTool F2 Ultra (UV-laser)**.

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
- **Kutt:** Hull får et eget XCS-lag før boksenes ytterkonturer. SVG har de samme fargegruppene, men rekkefølgen må settes i laserprogrammet. Delnavn vises som tydelig tekst inne på delene og eksporteres ikke. Navnene reserverer ingen ekstra plateplass. Hver del grupperes med hull og delnavn slik at de flyttes sammen. Delene legges uten overlapp; platebehov vises før innsetting. Lag eldre bokser på nytt for å bruke den nye geometrien.

Utvalg og parametere er inspirert av [Boxes.py](https://boxes.hackerspace-bamberg.de/?language=en), spesielt [skyvelokk](https://boxes.hackerspace-bamberg.de/SlidingLidBox?language=en) og forklaringen av [materialtykkelse og burn](https://florianfesti.github.io/boxes/html/usermanual.html). Boxes.py kaller **halv** snittbredde «burn»; her brukes **hel** snittbredde «kerf». Implementasjonen er skrevet for denne appen og kjører lokalt uten Boxes.py-tjenesten.

Testene kontrollerer skjøtene som ekstruderte flater i en 3D-sammenstilling, alle hjørner, kompensasjon på hver kant, rominndeling, hullkollisjoner og eksportmål. Fysisk prøvekutt, passform og montering av lokk/hengsler må fortsatt testes på maskinen.

## Stabilisering og lokal drift

Kjør `npm test` med Node.js 24 eller nyere for regresjonstestene. Appen trenger ingen byggejobb eller npm-installasjon. For nettlesertestene, start `python3 -m http.server 8767 --bind 127.0.0.1` og åpne `http://127.0.0.1:8767/tests/browser.html`. Nettlesertestene bruker en egen testdatabase og testnøkkel. Åpne selve editoren på samme server for manuell kontroll av kopiering, angre, gjenåpning, bildekontroller og eksport.

- **Lagring:** IndexedDB lagrer prosjektet etter endringer. Eldre localStorage-prosjekter migreres først når den nye lagringen er bekreftet. Tomme prosjekter gjenopprettes som tomme. En liten synkron gjenopprettingsjournal beskytter de siste endringene ved rask gjenåpning; store eksisterende bilder refereres fra IndexedDB. Status ved prosjektnavnet viser når lagringen er ferdig eller har feilet. Dersom et nytt stort bilde ennå ikke er sikret, ber nettleseren deg vente før lukking. Lagre en `.laserprosjekt`-fil før du bytter maskin/nettleser; lokal nettleserlagring er ikke en sikkerhetskopi.
- **Maskin:** «Maskin for xTool-eksport» bestemmer maskinen. Valg av en maskinflate øverst setter også målmaskinen. En plate eller materialprofil endrer ikke dette valget. Kontroller at materialparametrene passer valgt maskin; profilene er utgangspunkter og er ikke fysisk kalibrert av denne testpakken.
- **Foto:** Originalbildet beholdes. Redigering bruker en forhåndsvisning på inntil 750 piksler, mens eksport beregner oppløsning fra fysisk størrelse og valgt DPI. Eksport oppskalerer ikke kilden og begrenses til 8192 piksler per side / 16 megapiksler for å begrense minnebruk. «Følg fotomodus» bruker den globale modusen; et eksplisitt bildefilter overstyrer den. Gamle bilder som allerede er redusert til 750 piksler må importeres på nytt for å få tilbake detaljene.
- **SVG:** Import støtter vanlige former og baner, nestede gruppetransformasjoner, fargearv, viewBox og absolutte enheter (mm/cm/in/pt/pc/px). Uten enheter brukes SVG-standarden 96 px per tomme. Tekst, CSS-regler, `<use>`, masker, klipping, filtre, nestede SVG-arbeidsflater, prosentmål og skjevstilte bitmapbilder må bakes inn i kildeprogrammet. Ustøttet innhold gir en melding, og ugyldig XML avvises. Duplikatkontrollen sammenligner hele baner med 0,001 mm koordinatavrunding; den finner ikke alle delvis overlappende kutt.
- **Tekst:** Fontene følger med lokalt med lisenser. Konturene hentes fra TTF-filene med OpenType.js. Overlappende komponenter ryddes med non-zero-fylling og forenes til kutteklare ytter- og innerkonturer; ekte bokstavhull bevares.
- **Puslespill:** Nye puslespill har tre separate kuttelag: vannrette linjer → loddrette linjer → ytterkontur. XCS-eksport gir lagene fast rekkefølge og aktiverer behandling etter lag. Gravering og score ligger foran kuttene. SVG beholder tre farger/grupper, men behandlingsrekkefølgen må settes i laserprogrammet ved SVG-import. Lag eldre puslespill på nytt i generatoren for å få de tre kuttelagene. Ved rotasjon beholdes rekkefølgen fra generatoren.
- **XCS:** Koordinater og parameterobjekter er regresjonstestet. Åpning i en konkret xTool Studio-versjon og fysisk kjøring på P3/F2 gjenstår som separat akseptansetest. Kontroller mål, bilde, hull, behandling og parametere før produksjon.

Lagring, SVG-import, laserprofiler og fontfiler har egne moduler (`storage.js`, `svg-import.js`, `laser-settings.js`, `font-files.js`). Hovedkontrolleren er fortsatt stor og kan deles videre etter hvert som funksjoner endres.


### Flexverksted: fleksible deler og avrundede bokser

Åpne **Flex** i venstre verktøylinje, fanen **Flexverksted**, eller snarveien fra boksverktøyet.
Seks eksempler følger med: trehengsel, prøvebit, avrundet brett, boks med løst lokk, boks med fast topp og kapselboks.
Eksemplene endrer form og mål, men beholder materialtykkelse, kerf og flexmønsteret ditt.

- **Flexpanel:** velg platemål, bredde på det sentrerte bøyeområdet, loddrett/vannrett bøyeakse og endemarg. Snittene følger bøyeaksen. Endemarg 0 lar snittene nå ytterkanten; positiv endemarg gir en stiv kant som begrenser bøying.
- **Flexmønster:** juster avstand mellom kolonner, snittlengde og bro mellom snitt. Annenhver kolonne forskyves et halvt mønster. Dette er åpne enkeltsnitt med laserens faktiske snittbredde, ikke smale lukkede rektangler. Verktøyet avviser blant annet snitt som kan dele hele panelet, for få kolonner og broer/avstander som etter kerf gir under 0,4 mm restmateriale. Dette er en geometrisk grense, ikke en styrkegaranti.
- **Prøvebit med mine flexmål:** lager en liten del med gjeldende tykkelse, kerf, snittlengde, avstand og broer. Test i samme materiale og fiberretning før en hel boks. Bøyelighet og minste brukbare radius varierer med materiale, limlag og laserinnstillinger.
- **Avrundede bokser:** åpen, med løst lokk eller med fast topp. Målene er ytre mål inkludert bunn og lokk. Hjørneradius kan økes til halve bredden for en kapselboks (lengden må fortsatt gi plass til skjøtelappene). Én hel vegg eller to kortere vegger med skjøter midt på de rette langsidene. Bare hjørnene får flexsnitt, åpne mot topp/bunn for å unngå stive kantbånd.

Boksene er **limkonstruksjoner**. Lim styreringen sentrert oppå bunnen. Bøy veggene rundt ringen, sett fingerskjøtene i bunnen og lim dem. Lim skjøtelappene på innsiden av de rette veggskjøtene. Skjøtelappene skal stå over styreringen og, ved lokk, under lokkinnlegget. Sentrer dem i det ledige høyderommet. Fingerskjøtene ligger bare på de rette veggpartiene; hjørnene beholder åpne flexsnitt. Boks med lokk får også fingerskjøter mot lokket. Løst lokk har ekstra sideklaring i utsparingene og skal ikke limes til veggene; lim lokkinnlegget sentrert under lokket. Fast topp monteres og limes sammen med veggene. Styreringen tar litt plass langs innerkanten ved bunnen; fri høyde for boksen med lokk måles opp til lokkinnlegget.

Utbrettet vegglengde beregnes ved midten av materialtykkelsen: rette strekk pluss fire kvartbuer med radius `ytre radius − tykkelse/2`, minus valgt åpning per skjøt. Bøyde flexmaterialer følger ikke alltid denne idealiserte geometrien nøyaktig. Prøvemonter før liming, og juster radius/skjøteåpning etter prøvekutt. Illustrasjonen viser tiltenkt sammenstilling, ikke en simulering av materialets bøying.

**Kuttelag:** flexsnitt (rosa) → hull → ytterkonturer. XCS setter denne lagrekkefølgen. SVG har tilsvarende separate fargegrupper; behold rekkefølgen i laserprogrammet. Snittene forblir åpne stier, og kerf kompenseres kun på delkonturene og hullene. Delnavn eksporteres ikke; snitt, ytterkontur og navn flyttes som én gruppe per del. Endre dimensjonene i generatoren fremfor å skalere ferdige deler, som også ville skalere snitt, broer og materialtilpasning.

Inspirasjon: [Boxes.py RoundedBox](https://boxes.hackerspace-bamberg.de/RoundedBox?language=en) og [FlexTest](https://boxes.hackerspace-bamberg.de/FlexTest?language=en). Implementasjonen kjører lokalt og er uavhengig av tjenesten. Automatiske tester dekker utbrettet lengde, hjørnesoner, materialforbindelse, klaringer, åpne snitt og eksportrekkefølge; fysisk passform må prøvekuttes.

### Tegne, koble, feste og markere

- **Linje (L):** klikk startpunktet og fortsett med ett klikk per hjørne. Dra kan også brukes for ett linjestykke. Enter eller dobbeltklikk fullfører én sammenhengende sti. Klikk startpunktet for en lukket figur. Backspace fjerner siste punkt; Esc beholder bekreftede linjestykker og avslutter verktøyet. Bytte av verktøy fullfører den påbegynte stien. En uferdig forhåndsvisning eksporteres ikke.
- Med **Fest til objekter** på kan L starte på enden av en eksisterende åpen linje eller kurve, og fortsette den. Avslutt på enden av en annen linje for å koble dem til én sti. En grønn ring viser treffet. Automatisk kobling krever samme laserlag og kutterekkefølge. Bézier-kurver beholder ankerpunkter og håndtak ved kobling og SVG/XCS-eksport.
- **Koble valgte linjer** i høyrepanelet samler allerede tegnede linjer i riktig rekkefølge, uavhengig av retningen de ble tegnet. Velg dem med Shift-klikk eller markeringsboksen. Avstanden mellom endene kan stilles fra 0 til 5 mm; ender innen avstanden møtes i midtpunktet. Forgreninger og separate kjeder avvises i stedet for å lage utilsiktede kutt. Sammenkobling kan angres.
- **Fest til objekter** er uavhengig av rutenettet og huskes lokalt. Ved tegning og flytting fester linjeender og knutepunkter seg til hjørner og eksisterende punkter på andre figurer. Dette omfatter roterte rektangler, mangekanter, stjerner, kurvenoder og deler i grupper. Under flytting av hele objekter prioriteres punkt mot punkt, deretter kanter og midtlinjer på nærliggende objekter. Grønne markører viser festepunktet eller innrettingen. Hold **Alt** for å hoppe over objektsnapping midlertidig; rutenettvalget gjelder fortsatt. Flytting inntil hverandre endrer ikke antallet objekter – bruk Koble valgte linjer for å gjøre dem til én sti. Endepunkthåndtak har også feste.
- **Markeringsboksen velger alle berørte objekter**, inkludert linjer som bare krysser boksen og berørte deler av grupper. En tom del av en kurves avgrensningsboks teller ikke som treff. For fylte figurer teller også arealet, men ikke hull i figuren. Skjulte objekter og delnavn velges ikke gjennom markeringsboksen.

### Bézier-kurver med ankerpunkter og håndtak

- **L + Glatt kurve:** ett anker per klikk. Kurven lagres som kubiske Bézier-segmenter, uten å gjøre tegnepunktene mellom ankrene redigerbare.
- **Penn (B):** klikk for et hjørne, eller klikk og dra for tangent-håndtak. Enter, Esc, knappen **Fullfør åpen sti** eller bytte av verktøy beholder en åpen sti. Bare klikk på startpunktet eller **Lukk sti** lukker figuren. **Avbryt tegning** forkaster utkastet, og Backspace angrer siste punkt. Klikk et eksisterende endepunkt for å fortsette stien; avslutt på en annen sti for å koble dem sammen. Åpne stier bruker linjegravering (score) hvis fylt gravering er valgt. Automatisk glatting kan brukes når ingen håndtak er tegnet manuelt.
- Velg kurven med **V**. Oransje punkter er ankrene; de blå håndtakene styrer retning og bøy. Flytting av et anker tar med håndtakene. Glatte punkter holder håndtakene på samme tangent, med uavhengige lengder. **Alt + dra et håndtak** gjør det uavhengig. **Alt + klikk et anker** bytter mellom hjørne uten håndtak og et glatt punkt.
- Eldre kurver med mange punkter kan velges og **Forenkle til Bézier-kurve** brukes i dimensjonspanelet. Toleransen i mm styrer hvor tett tilpasningen følger originalen (standard 0,1 mm). Lavere verdi beholder flere detaljer. Geometrien endres først når knappen trykkes, og kan angres med ⌘/Ctrl+Z.
- Skalering, flytting, rotasjon, speiling, sammenkobling, utklippstavle og lagring bevarer håndtakene. Bézier-kurver eksporteres med kompakte `C`-kommandoer i SVG og XCS; polygonberegninger for eksempelvis offset bruker fortsatt beregnede kurvepunkter internt.

### Redigere ankerpunkter og enkeltsegmenter

- **Anker (A)** viser ankerpunkter på de tegnede stiene i gjeldende gruppe/arbeidsflate. Klikk et punkt eller linjestykke for å velge det. Blå markering viser valget; Shift-klikk velger flere. **V** velger og flytter hele objekter.
- **Slett punkt** eller Delete fjerner valgte ankerpunkter og forbinder de gjenværende naboene. En sti uten nok punkter fjernes. Alt+klikk bytter mellom hjørne og glatt punkt; håndtakene kan fortsatt dras.
- **Slett linjestykke** eller Delete med et segment valgt fjerner bare den valgte forbindelsen. En lukket figur blir åpen, og en åpen sti kan deles i to. Gjenværende kurver beholder formen. Åpne biter bruker omriss fremfor fyll, så hullet ikke fylles igjen.
- **Koble 2 endepunkter** eller ⌘/Ctrl+J kobler akkurat de to endepunktene du Shift-velger. Ender på forskjellige stier forbindes med et rett segment; sammenfallende endepunkter smeltes til ett anker. Ender på samme sti lukker den. Stiene må ha samme laserlag og kutterekkefølge. Indre punkter kan festes til hverandre med snapping, men forgreninger blir ikke laget som én kontur.
- Dobbeltklikk et linjestykke med A for å legge til et anker uten å endre kurveformen. Alle punktendringer kan angres og følger med i prosjektlagring.

### Fylt figur og offset

I dimensjonspanelet velger **Fylt figur** flategravering, mens **Kun omriss** bruker kutt eller gjenoppretter tidligere score. Valget vises både på arbeidsflaten og i SVG/XCS. Åpne linjer må lukkes før de kan fylles. Hjelpetekst og bilder endres ikke når fyll velges for en gruppe.

**Offset** finnes i venstre verktøylinje og høyrepanelet. Originalen beholdes, og en separat kuttelinje opprettes:

- **Kontur:** positiv avstand utvider, negativ trekker innover. Velg skarpe eller avrundede hjørner. Hull behandles riktig, og overlappende valgte figurer får en felles kontur. Åpne linjer får en lukket kontur på begge sider ved positiv avstand.
- **Parallell:** én åpen linje eller kurve får en ny åpen sti på én side. Med skjermens y-akse nedover er positiv avstand til høyre langs tegneretningen, negativ til venstre. Hjørnene er gjærede med avkapping av svært lange spisser. Offset som vender segmenter bakover eller krysser seg selv avvises.

Konturoffset bruker Clipper med 0,0001 mm koordinatoppløsning; eksport avrundes til 0,001 mm. Kurver polygoniseres, så dette er ikke en garanti for samme presisjon på alle buer. For stor innvendig offset gir en forklaring og endrer ikke tegningen.

Kjør `npm test` for geometritester og `tests/browser.html` for SVG/flex/lagring. `tests/editor.html` tester faktiske peker- og tastaturhandlinger i redigeringsflaten; bruk en separat lokal serverport fordi denne testen tømmer testtegningen.

### Utklippstavle, snarveier og lagrekkefølge

- **⌘/Ctrl+C, X og V** kopierer, klipper ut og limer inn valgte objekter. Grupper, redigerbare noder, laserinnstillinger og rekkefølge beholdes. Hver innliming gir nye objekt-ID-er og forskyves 8 mm fra forrige kopi. Native objektdata lagres som tekst på systemets utklippstavle, så de kan limes inn i en annen LaserStudio-fane. Ekstern SVG-kode importeres som vektorer; vanlig tekst blir et nytt tekstobjekt.
- **Kopier**, **Klipp ut** og **Lim inn** finnes også under Justering & plassering. Hvis nettleseren blokkerer lesing av utklippstavlen fra knappen, bruk tastatursnarveien. **Dupliser (⌘/Ctrl+D)** lager en kopi direkte i tegningen.
- **Lag og objekter** viser det fremste objektet øverst. Velg ett eller flere objekter og bruk **Opp**, **Ned**, **Fremst** eller **Bakerst**. ⌘/Ctrl+↑/↓ flytter ett trinn; hold også Shift for helt fremst/bakerst. Flere valgte objekter beholder sin innbyrdes rekkefølge. Under grupperedigering gjelder handlingene delene i gruppen.
- Øyeknappen skjuler/viser både hele objekter og deler i grupper. Rekkefølge og synlighet lagres i prosjektet og kan angres. Skjulte objekter utelates fra lasereksport. Visuell lagrekkefølge endrer ikke den særskilte kutterekkefølgen for puslespill og flex.
- **⌘/Ctrl+A** velger synlige objekter i aktiv gruppe eller på arbeidsflaten. **⌘/Ctrl+Z**, **Shift+⌘/Ctrl+Z** og **Ctrl+Y** angrer/gjør om. **⌘/Ctrl+S** lagrer prosjekt og **⌘/Ctrl+O** åpner en prosjektfil. **Shift+⌘/Ctrl+S** bruker Lagre som. Fil → Åpne / Bilde brukes for import av XCS, SVG og bilder. Tekstfelt beholder sine vanlige snarveier, og åpne dialoger sperrer handlinger på tegningen bak.

### Fest linjen til et rektangelhjørne

Slå på **Fest til objekter** øverst. Velg linjen med **V**, og dra det oransje endepunktet mot hjørnet. En **grønn ring** viser når punktet treffer; slipp for å plassere enden nøyaktig på hjørnet. Dette virker også når du tegner med **L** eller **B**, redigerer knutepunkter eller flytter hele linjen. Festingen bruker 8 skjermpiksler, har prioritet over rutenettet og kan hoppes over med **Alt**.

Linjen og rektangelet beholdes som separate, redigerbare objekter med et felles punkt. Sammenkobling til én sti skjer fortsatt bare ved kompatible endepunkter på åpne linjer. Festingen er en plassering, ikke en permanent binding: flytter du rektangelet senere, følger ikke linjen automatisk med. På avrundede rektangler fester du til overgangen mellom rette sider og buene, ikke til det tomme området der et skarpt hjørne ville vært.

### Tekstretning, bokstavavstand og flere fonter

Tekstpanelet har **47 fontvalg** med reelle fontnavn og kategorier. Duplikate navn for samme fontfil er fjernet. Alle vanlige konturfonter er testet med ÆØÅ/æøå. Søkefeltet filtrerer listen, og forhåndsvisningen bruker de samme vektorkonturene som teksten på platen. Fontfiler og lisenser følger prosjektet lokalt.

**Skriftretning** tilbyr vannrett tekst, tekst rotert for å leses oppover eller nedover, og stående bokstaver stablet oppover eller nedover. Innstillingen brukes både på valgt tekst og neste tekst du setter inn. Retningene følger med ved kopiering, lagring og XCS/SVG-eksport.

**Ekstra bokstavavstand** kan settes i millimeter, med glidebryter eller knappene Normal / +1 mm / +3 mm. Null bruker fontens normale avstand og kerning; positive verdier gir mer luft, negative verdier tettere bokstaver. Avstanden legges til etter skalering av bokstavhøyden, slik at verdien fortsatt er i millimeter også for tekst med aksenter eller bare små bokstaver. Ved eksplisitt bokstavavstand slås latinske ligaturer av slik at f.eks. «fi» fortsatt har to separate bokstaver. Endringer kan angres.

### Bokstaver langs buer og omriss

Hver bokstav flyttes og roteres som én samlet form langs banen. Konturer, hull, prikker og aksenter bevarer proporsjonene; bokstavene strekkes ikke rundt hjørner. På lukkede figurer sentreres teksten over toppen, med eksisterende justeringer for plassering, avstand og motsatt retning. Svært trange buer kan fortsatt kreve mindre tekst eller større avstand for å unngå at separate bokstaver overlapper.

Skriftretning for rett tekst og tekst langs bane er separate oppsett. Velger du oppover/nedover, frigjøres teksten fra bue/omriss. Binder du den til en form eller velger en bue, brukes vannrett grunntekst langs banen. Byttene kan angres.

Eksisterende lagrede konturer endres ikke automatisk. For tekst fra en eldre versjon: velg tekstobjektet og trykk **Oppdater tekstform** for å bruke den nye formen og millimeteravstanden. Handlingen kan angres. Vanlig redigering av teksten bruker også den nye metoden.

### Objektfarger og hull i former

Velg en figur, linje eller flere objekter og bruk **Objektfarge** i høyrepanelet. Paletten og fargevelgeren endrer visningsfargen for gravering eller omriss. Lag-listens fargeprikker følger objektfargen. **Bruk lagfarge** tilbakestiller til standardfargen for laserlaget. Bilder beholder bildefargene.

Fargene følger med i prosjektlagring, kopiering og angre. De endrer ikke kutt, score eller gravering; lasereksport bruker fortsatt laserlagenes vanlige farger.

For å fjerne for eksempel en stjerne fra en trekant: legg stjerna foran trekanten, Shift-velg begge og trykk **Lag hull** under **Kombiner former**. Stjerna kan være kun omriss. Den nederste valgte figuren beholder farge, laseroperasjon og plassering i lagrekkefølgen. De andre valgte figurene trekkes fra. Dette virker også når du redigerer deler inne i en gruppe. Angre gjenoppretter de opprinnelige figurene.

### Paneler og små vinduer

- **Oppsett** samler maskin, platestørrelse, rutenett og festing til objekter. **Fil** samler åpning og eksport. Lagre og Lasersjekk er direkte tilgjengelige.
- Høyrepanelet har fanene **Objekt**, **Lag** og **Laser**. Avanserte valg ligger under **Linjer, offset og mønster** og **Juster og ordne**. Farger vises når et vektorobjekt er valgt; formoperasjoner vises når flere objekter er valgt.
- **Panel** viser/skjuler høyrepanelet. Under 900 px åpnes det over tegneflaten. Tegneflaten beholder målestokk og sentrum når panelet åpnes eller lukkes.
- Offset-knappen åpner riktig fane og innstillinger automatisk. Tekstredigering åpner tekstfeltet. Menyer lukkes med Escape eller klikk utenfor; panel-fanene støtter piltaster.
- `tests/layout.html` kontrollerer skjermbredder fra 320 til 1440 px, menyer, paneler, felt, eksport og boksgenerator. Kjør på separat testport, som de øvrige nettlesertestene.

### Justering av flere objekter

**Juster og ordne** ligger øverst i Objekt-panelet og åpnes automatisk når utvalget går fra færre enn to til minst to objekter. De seks ikonene justerer venstre, vannrett sentrum, høyre, topp, loddrett sentrum og bunn. **Sentrer X + Y** gir alle valgte objekter samme sentrum i én operasjon. Justeringen bruker figurenes synlige avgrensning, også ved rotasjon og gruppering. Ett valgt objekt justeres mot platen. Manuell lukking respekteres frem til neste flervalg.

### Gravering mellom konturer

Velg ytterformen og innerformen og trykk **Graver mellom konturer** ved fyll/omriss i Objekt-panelet. Det opprettes én gravert flate med tomt hull i midten, uavhengig av lagrekkefølge. Det virker også på grupper med lukkede vektorformer og på en eksisterende sti med flere konturer. Flere innvendige former gir flere hull; ved kryssende eller nestede konturer veksler flaten mellom fylt og tomt for hver grense. Lagposisjon beholdes, og ett angresteg gjenoppretter originalene. Resultatet kan fortsatt byttes til **Kun omriss** for å kutte både ytre og indre kontur.

### Puslespill fra bilder og frie ytterkonturer

Velg et bilde og trykk **Lag puslespill av bildet** i Objekt-panelet, eller åpne **Puslespill** og velg et bilde fra arbeidsflaten. Bildet og kuttlinjene samles i én gruppe på bildets plass. Størrelse, proporsjonslås, rader, kolonner og låsstørrelse kan endres før innsetting. Originalbildet beholdes, slik at senere endringer ikke bygger på en allerede beskåret eller dithret kopi.

- **Automatisk** bruker motivets ytterkant når bildet har transparens, ellers hele bilderammen.
- **Motivsilhuett** finner også sammenhengende ensfarget bakgrunn; toleranse og konturforenkling kan justeres. Største sammenhengende motiv beholdes. Innvendige hull og små, separate motiver brukes ikke som ytterkutt. Dette er ikke automatisk motivutklipping fra vilkårlige fotografiske bakgrunner.
- **Rektangulær bildekant**, **Avrundede hjørner** og **Oval / sirkel** gir faste rammevalg. Positivt kantinnrykk flytter kuttet innover; negativt gir en kant utenfor.
- **Bruk valgt / redigert ytterkontur** bruker en lukket form valgt sammen med bildet. Formen erstattes sammen med bildet, slik at ytterkuttet ikke blir liggende dobbelt. Konkave konturer støttes; kuttene deles der de går utenfor motivet. Én sammenhengende ytterkontur uten hull kreves.
- Brikketyper: **Klassiske låsebrikker**, **Kantede låsebrikker**, **Bølgebrikker (uten låsehode)** og **Rette ruter**. Rader og kolonner beskriver rutenettet; uregelmessige konturer kan gi færre eller avskårne kantbrikker.

Velg den ferdige gruppen og bruk **Endre puslespill** for å endre oppsettet. For frie kurver: gå inn i gruppen, velg ytterkonturen og rediger med **Anker (A)**. Åpne deretter **Endre puslespill** og bruk den redigerte ytterkonturen for å beregne brikkelinjer og bildebeskjæring på nytt. Bilderamme, avrundet ramme og oval har henholdsvis 4, 8 og 4 ankerpunkter; eksisterende Bézier-håndtak beholdes ved ny beregning uten kantinnrykk.

Bildebeskjæring følger med i forhåndsvisning, prosjektlagring og XCS/SVG-eksport. Innvendige kutt er åpne stier og deles mellom nabobrikker. Kuttrekkefølgen er fortsatt **vannrette → loddrette → ytterkontur**, etter graveringen. Innsetting og oppdatering kan angres i ett steg.

`npm test` inkluderer geometriske tester for bildepuslespill. `tests/image-puzzle.html` tester bildeflyt, angre, ny beregning, silhuett, eksportbeskjæring og skjermbredder i nettleseren. Kjør nettlesertestene på en separat lokal testport; de bruker sin egen testtegning.


### Tettere plassering og flere boksdesign

Boks- og flexverkstedet bruker **1 mm deleavstand** som standard. Avstanden måles mellom kerfkompenserte kuttkonturer. Plasseringen prøver flere oppsett, fyller ledige felt mellom deler og prioriterer oppsett som passer valgt plate med 10 mm kantmarg. Delene roteres ikke automatisk, slik at fiberretning og flexakser beholdes. Dette er automatisk rektangulær pakking av delenes avgrensninger; små deler legges ikke inne i hull. Er hele oppsettet større enn platen, vises beskjed om å fordele delene på flere plater. Delnavn ligger innenfor delenes avgrensninger og kan slås av uten å endre plasseringen.

**Sparebøsse med løst lokk** har myntspor gjennom lokk og sentreringsplate. **Serviettboks** har avtakbart lokk med en større avrundet uttrekksåpning. **Kabelboks med lokk** har to kabelåpninger i kortsidene. Alle bruker de samme justerbare boks-, material- og skjøtemålene som de øvrige modellene. Flexverkstedet har i tillegg **Avrundet boks med fast topp**, med fingerskjøter i både bunn og topp. Nye flexvegger har tapper utenfor veggflaten; oppgitt delhøyde inkluderer tappene.

Materialprofilen **3 mm MDF-plate (P3 CO2)** bruker nå **75 % effekt og 30 mm/s**, én passering. Velg materialprofilen på nytt for å bruke verdiene i et eksisterende prosjekt; lagrede, egendefinerte innstillinger overskrives ikke automatisk.

### Arbeidstegninger og prosjektdokumentasjon

Åpne **Tegning** i topplinjen. Verktøyet virker på alle synlige deler på arbeidsflaten, også egne figurer, bilder og grupper. Hjelpelinjer og generatorenes delnavn tas ikke med som materialdeler. Tegningen lagres automatisk og følger med i prosjektets redigerbare `.laserprosjekt`-fil når du bruker **Lagre prosjekt**. XCS-eksport beholder også dokumentasjonen.

- **Delplassering** er en egen flat måltegning. Dra delene eller skriv X/Y og rotasjon. **Spre delene for målsetting** lager rom mellom delene. Originalens kutteoppsett beholdes.
- **Materialvisning** har egne X/Y-posisjoner og rotasjon, slik at sammenstillingen ikke roter til den flate måltegningen. Sett deler liggende (XY) eller stående (XZ/YZ), og bruk Z til å løfte eller stable dem. Delene har valgt materialtykkelse; enkeltdeler kan overstyre den. Materialnavn, tykkelse og utseende hentes fra laserprofilen ved opprettelse og kan endres i tegningen.
- **Målsett**: klikk to punkter på delene. Hjørner og eksisterende punkter fester seg automatisk. Under **Mål og eksport** velger du fri avstand, vannrett eller loddrett mål og avstanden til mållinjen. Målene følger delenes plassering, rotasjon og størrelse. Automatiske hovedmål viser bredde/høyde; detaljark viser også diameter for sirkler og radius for avrundede rektangler. Mål til hull, skrå kanter og andre detaljer legges inn med topunktsverktøyet.
- **Ark / dokumentasjon** viser A4/A3 i liggende format, med tittel, prosjekt, tegner, dato, revisjon, materiale, målestokk og sidetall. Dokumentasjonen inneholder oversikt med både flat tegning og sammenstilling, deleliste og valgfrie detaljark. Velg tilpasset eller fast målestokk; for stor målestokk gir beskjed før eksport.
- **Last ned ark som SVG** lagrer det valgte arket med fysisk papirstørrelse og innebygde bilder. **Skriv ut** åpner utskriftsdialogen, og **PDF** åpner samme dialog med veiledning for *Lagre som PDF*. Velg **Dette arket** eller **Hele dokumentet** før utskrift. Bruk 100 % / faktisk størrelse, riktig A4/A3-format og slå av nettleserens topp- og bunntekst.

Navn, kopier, synlighet og sletting inne i arbeidstegningen gjelder dokumentasjonen. Grupper kan deles opp der hvis delene skal monteres hver for seg; en generert boksdel beholder sine konturer og graveringer samlet. **Hent nye deler** legger til nye objekter fra arbeidsflaten, mens **Fra kutteoppsettet** tilbakestiller delplasseringene og de manuelle målene. Endringer kan angres i tegningsverktøyet. Endres kildegeometrien på arbeidsflaten, oppdateres den i dokumentasjonen; slettede eller skjulte kilder varsles.

Materialvisningen er en illustrasjon av plater med tykkelse, ikke en full 3D-modellering. Flex bøyes ikke automatisk. Mål viser den tegnede geometrien, inkludert eventuell kerfkompensasjon.

`tests/drawing.html` tester åpning, materialer, uavhengig sammenstilling, målsetting, angre, lagring, ark, SVG/PDF og smale vinduer. Kjør på en separat lokal testport. `npm test` inkluderer geometriske tester og kontroll av prosjektformatet for arbeidstegninger.


### Redigerbare dokumentasjonssider og materialbank

I **Tegning → Ark / dokumentasjon** ligger **Rediger dokumentasjonssiden** øverst i panelet. Dra måltegningen eller materialvisningen til ønsket sted, eller skriv venstre/topp/bredde/høyde i millimeter. Visninger kan skjules enkeltvis. **Ny dokumentside** legger til en side med egen tittel og eget oppsett. **Tilbakestill visningsoppsett** gjenoppretter standardplasseringen på den aktive siden. Visningszoom på 150–300 % gjør små detaljer lettere å redigere; eksportens fysiske målestokk endres ikke.

**Tekst / notat** lager en flyttbar tekstboks på den aktive siden. Du kan endre teksten, tekstbredden og skriftstørrelsen. **Notat med peker** har i tillegg en pekelinje med eget målpunkt (X/Y på arket). Notater, sider og oppsett følger med i prosjektlagring, SVG og PDF. Redigeringsrammene vises bare i programmet. Tekstbokser som ikke får plass varsles og må justeres før eksport. Lange generelle merknader tas med på egne sider med prosjektnotater, slik at teksten ikke bare blir forkortet i tittelfeltet.

**Målsett** virker både i Delplassering og direkte i måltegningen på arket. Klikk et eksisterende mål, eller velg det i mållisten, for å endre retning, beskrivelse og mållinjens avstand. Dra mållinjen for å plassere den. Beskrivelsen kommer foran den beregnede lengden; den erstatter ikke måleverdien. Automatiske mål på oversiktsark viser samlet utstrekning, mens detaljark viser delens hovedmål. Vertikale og skrå mål har tekst som følger mållinjen, med avstand mellom figuren og hjelpelinjene.

**Materialbanken** har bjørkekryssfiner, MDF, eik, valnøtt, furu, bambus, klar/svart/hvit akryl, børstet aluminium, papp, lær og filt. Hvert materiale har egen overflate, kantfarge, enkel struktur og foreslått tykkelse. Velg materiale og trykk **Bruk materialet og tykkelsen**, eller velg eget materiale for én del. Egne delmaterialer og tykkelser står i delelisten og detaljarkene. Banken gjelder dokumentasjonen; laserens effekt/hastighet velges i Laser-panelet. Klar akryl illustreres frostet, uten fysisk simulert transparens.

Materialvisningen skjuler flater og kantlinjer som ligger bak andre flater, også ved hull, konkave konturer og stående plater. Buede vegger tegnes uten kunstige vertikale skjøtestreker mellom kurvesegmentene. Prosjektets geometri og kuttlinjer endres ikke av visningen.

`tests/drawing-surfaces.test.js` kontrollerer synlig flatedekning og baksidefjerning, kurver, hull, fingerskjøter, prosjektlagring, materialer og teksteksport. `tests/drawing.html` dekker redigering, drag, zoom, notater, eksport og smale vinduer. `tests/drawing-visual.html` viser representative materialflater for visuell kontroll.


### Prosjektark på én side og lokale dokumenter

- Velg **Tegning → Prosjektark · én side**. Arket har måltegning, materialvisning, forklaringsboks og tittelfelt. Standard utskriftsvalg er bare dette arket, med sidenummer 1/1. Delelister og detaljark beholdes og kan fortsatt velges. Gjentatte trykk på prosjektark-knappen beholder egne tekster og plasseringer.
- **＋ Tekstboks på arket**: klikk der boksen skal stå, og skriv direkte på siden. Dobbeltklikk en eksisterende boks for å redigere. Klikk utenfor eller trykk Cmd/Ctrl+Enter for å bekrefte; Escape avbryter tekstredigeringen. Dra boksen, eller juster bredde, skriftstørrelse og koordinater i sidepanelet. Målsett-knappen legger til mål mellom punkter på delene.
- **Skriv ut** (Cmd/Ctrl+P inne i arbeidstegningen) sender de valgte arkene til nettleserens utskriftsdialog. Velg skriver for direkte utskrift, eller *Lagre som PDF*. PDF-valget åpner også utskriftsdialogen; den lager ikke en PDF-fil uten dette siste valget. Bruk faktisk størrelse / 100 %, riktig A4/A3-format og ingen nettlesertopptekst.
- **Lagre prosjekt / Cmd/Ctrl+S** lagrer en `.laserprosjekt`-fil med alle figurer, opprinnelige bilder, laserinnstillinger, arbeidstegning, materialer, mål og merknader. Dette er et redigerbart dokument; **Prosjekt → Eksporter og skriv ut → Til xTool** brukes for laseren.
- **Åpne / Cmd/Ctrl+O** velger et lagret prosjektdokument. **Lagre som / Shift+Cmd/Ctrl+S** lager en ny kopi. I nettlesere med [File System Access API](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access), som Chrome og Edge på skrivebord, skriver Lagre videre til den samme filen. Tilknytningen huskes lokalt over omlasting når nettleseren tillater det; nettleseren kan be om filtilgang igjen. Bruk HTTPS eller localhost.
- Nettlesere uten direkte filtilgang tilbyr åpning og nedlasting av en oppdatert kopi. Filstatus viser filnavn og ulagrede endringer. Ved endringer i filen utenfor programmet stoppes lagringen; åpne filen på nytt eller bruk Lagre som for å bevare begge versjoner. Nettleserens automatiske gjenoppretting fortsetter separat og erstatter ikke lagring i prosjektfilen.

`tests/project-document.test.js` tester format, bilder, lagring, avbrudd, feil og filkonflikter. `tests/project-file.html` tester åpning, Cmd+S, gjenåpning og Lagre som gjennom de faktiske UI-knappene, med ekte filhåndtak til isolerte testfiler i nettleserens private lagring. Ingen brukerfiler på disk skrives av testene. `tests/drawing.html` kontrollerer prosjektark, tekstbokser og én-sides utskrift uten å sende noe til en fysisk skriver.


## xTool Studio-format og behandlingsrekkefølge

**Eksporter .XS** bruker xTool Studios nye workspace-v2-format. Det er en ZIP-pakke med geometri, grupper, bilder, behandlingsprofiler og maskininnstillinger. `.XCS` er fortsatt tilgjengelig i eksportdialogen for eldre Creative Space. `.laserprosjekt` er formatet for videre redigering av hele prosjektet og dokumentasjonen i LaserStudio.

Standard kjørerekkefølge er **gravering/foto → score → flex-snitt og innvendige kutt → vanlige kutt → puslespill-/boksytterkonturer**. Puslespill kutter vannrett før loddrett og til slutt ytterkonturen. Under **Laser → Avansert · behandlingsrekkefølge** kan du flytte behandlingene opp/ned og tilbakestille anbefalingen. Innstillingen følger prosjektet og endrer ikke objektenes synlige stabling.

XS og XCS aktiverer **By layer** og lagrer lagrekkefølgen. xTool viser høyeste `order` øverst; tidligere eksport brukte motsatt retning. SVG har ikke maskinens behandlingsinnstillinger. For SVG må rekkefølgen stilles inn i mottakerprogrammet. Innenfor samme fargelag bestemmer xTool banen; rekkefølge for hvert enkelt objekt er ikke del av dette verktøyet. Gamle eksportfiler må eksporteres på nytt for å få rettingen.

Kompatibiliteten er kontrollert ved åpning og lokal lagring i xTool Studio 1.7.30, med vektorer, grupper og bitmap. Dette er ikke en fysisk lasertest. Se `tests/XS_FORMAT.md` for formatgrunnlag og regresjonstester.


## Prosjektmeny og bibliotek

**Prosjekt ▾** samler filhandlingene, både i tegneflaten og arbeidstegningen:

- **Nytt prosjekt**, **Mine prosjekter**, **Åpne prosjektfil**, **Gi nytt navn** og **Lag en kopi**.
- **Lagre prosjekt** (Cmd/Ctrl+S) og **Lagre prosjektfil som** (Shift+Cmd/Ctrl+S).
- **Eksporter og skriv ut**: **Til xTool** (XS som standard; eldre XCS under Avanserte filvalg), **SVG til laser** og **Arbeidstegning: PDF, SVG / utskrift**. Dokumenteksport lar deg velge hele dokumentet eller aktivt ark. SVG gjelder aktivt ark. PDF bruker nettleserens utskriftsdialog.
- **Sett inn bilde / SVG** legger elementer til tegningen. Prosjektfiler åpnes gjennom **Åpne prosjektfil**, som også støtter XS, XCS og eldre JSON-prosjekter.

**Mine prosjekter** viser forhåndsvisning, navn og sist lagret, med søk, åpning, kopiering, arkivering og gjenoppretting. Biblioteket ligger lokalt i denne nettleseren; det er ikke sky- eller Sites-lagring. Eksisterende arbeid tas inn automatisk. Arkivering sletter ikke innholdet. Et nytt prosjekt starter tomt med gjeldende maskin- og materialinnstillinger; en kopi beholder tegning, bilder, innstillinger og dokumentasjon.

Nettleserstatus og prosjektfilstatus vises hver for seg. Ved prosjektbytte med endringer i en åpnet prosjektfil kan du lagre filen først, beholde endringene bare i nettleserbiblioteket eller avbryte. Hvis nettleserlagringen feiler, må endringene sikres i en prosjektfil før byttet. Angrehistorikk starter på nytt ved prosjektbytte. Biblioteket husker filtilknytningen per prosjekt der nettleseren støtter dette, slik at Cmd/Ctrl+S skriver til riktig fil.

Bruk `.laserprosjekt` som flyttbart, redigerbart dokument og sikkerhetskopi. Nettleserbiblioteket følger ikke med til en annen maskin, nettleser eller nettadresse og forsvinner hvis nettstedsdata slettes.

`tests/project-library.html` dekker migrering, prosjektbytte, kopiering, arkivering, filtilknytning, lagring før bytte, feil under lagring, store bilder og smale skjermer. Kjør nettlesertestene på en egen lokal testport, én testside per origin om gangen. Testene bruker isolerte testfiler i nettleserens private lagring.


### Oppdatering av arbeidstegningen

Arbeidstegningen henter automatisk nye deler når den åpnes, også etter prosjektbytte. Tidligere lagrede, tomme arbeidstegninger fylles med prosjektets figurer ved åpning. Geometri og mål følger de gjeldende kildefigurene, mens egne notater, målreferanser, materialvalg og plasseringer i dokumentasjonen bevares. Nye medlemmer i grupper tas med uten å duplisere deler som allerede er dokumentert individuelt.

Deler som fjernes med **Fjern fra tegningen**, forblir utelatt ved gjenåpning. **Hent alle deler** tar dem med igjen; **Fra kutteoppsettet** tilbakestiller delplasseringene og målsettingen. Slettede eller skjulte kildefigurer beholder referansene sine og varsles som manglende, slik at de kan komme tilbake ved Angre på arbeidsflaten.

`tests/drawing-sync.html` gjenskaper tom tegning, senere innsetting, endrede mål, bevaring av eget oppsett, utelatte deler, eldre dokumenter, gjenåpning, prosjektbytte fra arbeidstegningen og SVG-eksport. Kjør på en separat lokal testport. `tests/drawing.test.js` dekker i tillegg grupper, duplikater og lagring av utelatte kilder.


### Rene fontkonturer og Pigpen

Overlappende deler inne i bokstaver forenes før visning. Etter bokstavavstand, tekstretning og eventuell buet plassering forenes også overlapping mellom bokstaver. Dette fjerner kunstige hull i gravering og indre dobbeltkutt i håndskrift. Ekte hull i eksempelvis B, O og Ø bevares. Åpne enkeltstreker brukes fortsatt direkte til score.

Sjablongfontene Black Ops One, Stardos Stencil og Saira Stencil One beholder sine egne åpninger. Fredoka-sjablongen får broer gjennom bokstavhullene; bokstaver uten hull deles ikke i to.

Nye familier: **Allura, Courgette, DM Serif Display, Marcellus, Prata, Kaushan Script, Italianno, Boogaloo og Audiowide**. Filene er hentet fra [Google Fonts](https://github.com/google/fonts/tree/main/ofl), med lisens ved hver font og kildeadresse/SHA-256 i `fonts/manifest.json`. Orbitron er tatt ut av fontlisten fordi den medfølgende filen mangler Ø/ø. Alle tilgjengelige TTF-fonter har nå norske bokstaver. Det er ikke laget migrering for gamle tekstobjekter.

**Pigpen · hemmelig skrift** finnes under **Symboler og koder**. Symbolene er egne vektorer for standardnøkkelen med 9 + 9 + 4 + 4 bokstaver: ABC/DEF/GHI, deretter prikket JKL/MNO/PQR; S øverst, T til venstre, U til høyre og V nederst i krysset; deretter prikket WXYZ. Nøkkeltypen er beskrevet i [Science Olympiads Codebusters-oversikt, side 80](https://www.soinc.org/sites/default/files/uploaded_files/CodeBusters_Overview25.pdf). Æ skrives AE, Ø blir O, Å blir A; aksenter fjernes. Tall og tegn vises som vanlig tekst. Bokstavavstand, retning, buet tekst og vektoreksport fungerer også med Pigpen.

`tests/font-contours.test.js` kontrollerer fontenes opprinnelige fylling mot de ryddede konturene, indre kuttkanter, håndskrift, bokstavhull, sjablongbroer og Pigpen. `tests/font-quality.html` viser før/etter, nye fonter og Pigpen-nøkkelen, og tester tekstverktøyet og SVG/XS-eksport i nettleseren. Bruk en separat lokal testport.


### Bildevisning og jevne puslespillkanter

Nye bitmapbilder vises som standard i detaljert oppløsning, opp til 4096 piksler på lengste side og 8 megapiksler. Bildepanelet har tre visninger: **Detaljert**, **Original** uten tone-/graveringsfilter og **Rask** med opptil 750 piksler. Maske og puslespillklipp vises i alle tre. Valget påvirker bare arbeidsflaten; SVG/XS/XCS behandles fra originalbildet med de valgte laserinnstillingene. Panelet viser original- og visningsoppløsning, effektiv DPI ved aktuell størrelse og eksportstørrelse. Import foreslår fysisk størrelse fra kildepiksler og valgt DPI, begrenset av platen, fremfor fast 75 mm.

Automatisk puslespillkontur bruker analytiske Bézier-kurver for avrundede og ovale bildemasker. Den avrundede rammen har åtte ankerpunkter; ovalen fire. Dette unngår å spore pikseltrappene fra den tidligere 360-pikslers masken tilbake til kuttelinjer. Transparente motivsilhuetter spores fortsatt når ingen slik geometrisk maske er valgt. For å erstatte en allerede generert ujevn kontur: åpne **Endre puslespill**, velg **Automatisk** for å følge masken eller **Avrundede hjørner** for egen radius, og sett inn igjen. Egendefinerte, redigerte konturer beholdes når «Bruk valgt / redigert ytterkontur» er valgt.

`tests/image-quality.test.js` kontrollerer oppløsningsgrenser, DPI og kurvepresisjon. `tests/image-quality.html` tester rasterbehandling, SVG/XS-eksport, bildeinspektør, automatisk puslespillkontur og bildeimport i en separat lokal testport. Den bruker et syntetisk detaljbilde; `?image=<lokal bildeadresse>` kan brukes med et 1672 × 941-testbilde for visuell sammenligning.


### Objektvalg og sammenhengende tegning

- Tekst, bilder og grupper viser sine relevante innstillinger øverst i **Objekt**. Valg på arbeidsflaten åpner riktig del av panelet. **T** åpner tekstinnstillingene med én gang, og valg av tekst i **Lag** går direkte til tekstredigeringen.
- Tomme kutt- og scorekonturer velges langs kanten. De blokkerer ikke lenger teksten eller andre objekter innenfor rammen. Tynne streker har en større, usynlig treffflate som bare brukes i editoren og aldri eksporteres.
- Dobbeltklikk tekst for å redigere innholdet. Dobbeltklikk tekst i en gruppe for å åpne gruppen med den aktuelle teksten valgt.
- **Tegn flere** øverst i verktøylinjen beholder rektangel, sirkel, mangekant, stjerne eller hjerte aktivt etter tegning. Neste figur beholder blant annet hjørneradius og antall kanter/tagger. Slå av for automatisk retur til **Velg**, eller bruk **Esc/V**. Innstillingen huskes i denne nettleseren.
- `tests/workflow.html` kontrollerer faktisk treff på SVG-flater, tekst bak kuttrammer, grupper, kontekstpaneler, gjentatt tegning, angre/gjør om og lagret preferanse. Kjør på en separat lokal testport, én testside per origin om gangen. `tests/layout.html` dekker menyer på 320–1440 px.
