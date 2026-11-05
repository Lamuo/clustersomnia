# Skin del meter Punti Unione

Una skin è una cartella con un `skin.json` e le immagini che usa. Il meter di ogni PG è disegnato con la stessa skin.

## Usare una skin

- **Preset inclusi**: `ember` (tasselli obliqui color brace, nome in Modesto Condensed, è il predefinito) e `minimal`, scelti in *Impostazioni modulo → Punti unione: skin*.
- **Skin tua**: metti la cartella dove vuoi dentro i dati di Foundry (per esempio `Data/skins/mia-skin/`) e selezionala in *Punti unione: cartella skin personalizzata*. Se è impostata, ha la precedenza sul preset.
- Dopo aver modificato `skin.json` o le immagini ricarica il mondo (F5): il manifest viene letto una volta sola.
- Se `skin.json` non si trova o non è valido, il meter ripiega su `minimal` e scrive un avviso in console.

Per partire, copia `minimal/` e modificala. Il suo `skin.json` mostra solo le chiavi di base e di comportamento; l'esempio qui sotto elenca anche quelle del testo, per le skin che mostrano un valore.

## Come è composto il meter

Dal fondo verso l'alto:

1. `frame`: lo sfondo. È l'immagine che si vede quando la barra è vuota.
2. `fill`: la parte che si riempie. Viene mostrata da sinistra verso destra in base ai PU.
3. `overlay` (opzionale): decorazioni sopra il riempimento, per esempio un bordo che deve coprirne le estremità.
4. il testo del valore.

PNG e SVG con trasparenza funzionano senza altro lavoro: ogni livello è un'immagine normale e il canale alfa viene rispettato. Se `frame` ha parti trasparenti, ci vede attraverso la scena di Foundry. L'ombra del meter segue la sagoma dell'alfa.

**Regola fondamentale**: `frame`, `fill` e `overlay` devono avere la **stessa proporzione**, uguale a `width` × `height` del manifest, e vengono sovrapposti riga per riga. Esporta i livelli dallo stesso foglio di lavoro, con la stessa dimensione della tela. Un `fill` ritagliato stretto sulla barra non combacerebbe con il `frame`.

## `skin.json`

```json
{
  "name": "Esempio",
  "width": 300,
  "height": 200,
  "frame": "frame.png",
  "fill": "fill.png",
  "overlay": "overlay.png",
  "track": { "x0": 10, "x1": 85, "slant": 3 },
  "text": {
    "template": "{percent}%",
    "x": 97, "y": 86, "align": "right",
    "size": 46, "color": "#ffffff",
    "stroke": "#1a0a0a", "strokeWidth": 5,
    "font": "Impact, 'Arial Black', sans-serif"
  },
  "position": { "bottom": "120px", "left": "20px" }
}
```

| Chiave | Obbligatoria | Significato |
|---|---|---|
| `width`, `height` | sì | Dimensione in pixel dell'artwork a scala 1. Servono per la proporzione e per la dimensione del meter. |
| `frame`, `fill` | sì | Nomi dei file, relativi alla cartella della skin. |
| `overlay` | no | File disegnato sopra il riempimento. |
| `track.x0`, `track.x1` | consigliata | Dove inizia e finisce la parte riempibile, come **percentuale della larghezza dell'immagine** (non pixel). Con 0 e 100 il riempimento usa tutta la larghezza. |
| `track.slant` | no | Inclinazione del taglio del riempimento, in percentuale della larghezza. `0` = taglio verticale (barre dritte); un valore positivo dà il bordo obliquo tipico dei gauge JRPG. |
| `text.template` | no | Testo mostrato. Segnaposto: `{value}` (PU attuali), `{max}` (massimo della entry), `{percent}` (percentuale). Default `{percent}%`. |
| `text.x`, `text.y` | no | Posizione del testo, in percentuale dell'immagine (default 50, 50). |
| `text.align` | no | `left`, `center` (default) o `right`: da quale punto del testo si misura `x`. |
| `text.size` | no | Corpo del testo in pixel a scala 1 (default 40). |
| `text.color` | no | Colore del testo (default bianco). |
| `text.stroke`, `text.strokeWidth` | no | Contorno del testo: colore e spessore in pixel (default 4). Senza `stroke` niente contorno. |
| `text.font` | no | Valore CSS di `font-family`. Il font deve essere già installato o caricato in Foundry. |
| `position` | no | Dove sta la pila di meter sullo schermo: `top` oppure `bottom` (default `bottom: 120px`) e `left` oppure `right` (default `left: 20px`), come valori CSS. Se indichi `top`, `bottom` viene ignorato; se indichi `right`, `left` viene ignorato. |

### Chiavi di comportamento (tutte facoltative)

| Chiave | Significato |
|---|---|
| `showName` | `false` nasconde il nome del PG sopra la barra. |
| `showText` | `false` non disegna l'etichetta del valore: il valore si legge solo dalla barra. |
| `portraitControls` | `true` toglie i pulsanti − e + al passaggio del mouse sulla barra Unione e li sostituisce con il clic sulla barra stessa (tasselli e icona): clic sinistro +1, clic destro −1, con Maiusc ±5. Vale anche per la barra HP (sinistro cura, destro danno). Solo per chi può modificare i punti. Le bolle dei compagni pronti restano fuori da quest'area. |
| `bubbleAnimation` | `false` ferma l'alone pulsante sulle icone dei compagni pronti. |
| `portraitSize` | Diametro in pixel del ritratto del PG e delle icone dei compagni a scala 1. Default: 1,45 volte `height`. |
| `segments` | Disegna la barra Unione come un tassello obliquo per ogni punto (▰▰▰▱▱) al posto delle immagini: con questa chiave `frame`, `fill`, `overlay` e `track` non servono. Oggetto con `icon` (immagine a sinistra dei tasselli, percorso relativo ai dati di Foundry) e/o `label` (testo dopo i tasselli, nessuno di default) e i colori `on`/`on2` (tassello acceso, dall'alto al basso), `off` (spento) e `border`. Con `gradient` (lista di colori `#…`, per esempio 5) ogni tassello prende un colore diverso lungo la scala, dal primo all'ultimo (sfumati tra una tappa e l'altra, con luce in alto e alone del suo colore); i tasselli spenti conservano una tinta leggera del colore che prenderanno. Senza `gradient` valgono `on`/`on2`. Ember usa blu, ciano, oro chiaro, ambra e arancio, presi dall'icona. I tasselli sono al massimo 20. |
| `font` | Valore CSS di `font-family` per il nome del PG sopra la barra (default: quello di Foundry). |
| `hp` | Colori della barra HP: `{ "ok": "#…", "injured": "#…", "down": "#…" }`: sono i tre punti (100%, 50%, 0%) tra cui il colore sfuma. Quelli omessi restano verde, ambra e rosso. |
| `readyColor` | Colore dell'alone delle icone dei compagni pronti (default turchese). |
| `portraitShift` | Sposta in basso il ritratto di tanti pixel a scala 1. Serve quando la barra è inclinata e il suo capo sinistro sta più in basso del centro della riga. |

## Dettagli del party

Ogni riga mostra, oltre alla barra dei PU, anche lo stato del PG. Questi elementi **non fanno parte della skin**: sono disegnati in CSS (`styles/union-meter.css`) e seguono la scala come il resto.

- **Statistiche**: difesa (DEF), velocità (SPD), incubo (INC) e corruzione (COR) accanto al nome, su colonne fisse; il tasso di guarigione (HR) sta a destra della barra HP.
- **Barra HP**: occupa tutta la larghezza della card, fino al bordo destro della riga con le statistiche, con `HR` di fianco; mostra la vita *rimasta* (`health.value` è il danno subito). Il colore segue la percentuale, come le barre dei token: sfuma con continuità dal colore "sano" (pieno) a "ferito" (metà) a "a terra" (vuoto). Il valore è scritto dentro la barra. Su hover, per chi può modificare l'attore (GM e proprietario), compaiono `−` (danno) a sinistra e `+` (cura) a destra; con Maiusc il passo è 5. Con `portraitControls` i pulsanti non ci sono: è la barra stessa a rispondere, clic sinistro +1 HP (cura), clic destro −1 HP (danno), con Maiusc ±5, come per il ritratto con i punti unione.
- **Emblema**: per i PG che ne hanno uno (l'ombrello di Zoe) un'icona accanto alla barra HP, il cui nome compare al passaggio del mouse. Viene dal flag dell'attore `clustersomnia.signature` = `{ "icon": "fa-solid fa-umbrella", "name": "Jiji Cool" }` (`icon` è una classe FontAwesome; in alternativa `image` è il percorso di un'immagine quadrata); senza il flag non si vede nulla.
- **Magie rimaste**: accanto a `HR`, una bacchetta e il numero di lanci che il PG ha ancora, sommando tutte le sue magie senza distinguere il livello (per ogni magia, `castings.max` meno `castings.value`, che nel sistema conta i lanci usati). Se il PG non ha magie non si vede nulla; a zero il numero si spegne.
- **Effetti** (solo nelle card estese, vedi sotto): le icone degli effetti scelti nel Tracker (*Search Effects*) e attivi, al massimo 6 più un `+N` col resto nel tooltip.
- **Contatori** (solo nelle card estese): i contatori del Tracker, in sola lettura.

Statistiche, effetti e contatori si possono spegnere per client dalle impostazioni del modulo.

## Dimensione e posizione

La scala scelta da ciascun giocatore (default 0,5, da 0,3 a 2) ridimensiona tutto insieme: immagini, testo e icone. Si cambia dalle impostazioni o trascinando la maniglia nell'angolo in basso a destra della pila; doppio clic la riporta a 0,5. La maniglia in alto a sinistra sposta la pila, doppio clic la riporta alla posizione della skin. Entrambe sono per client.

## Limiti

- Il riempimento avanza solo da sinistra a destra: niente barre verticali o da destra a sinistra.
- C'è un solo `track` per skin, uguale per tutti i PG.
- Nessun layout alternativo per le icone dei compagni pronti: stanno sempre a destra del meter.
- Se la barra è inclinata, i compagni pronti restano comunque allineati al centro della riga, non alla barra.
- Con la scala cambiano immagini, testo del valore e ritratti; il nome del PG e gli spazi tra le righe hanno invece dimensione fissa in pixel.

## Card personale

Oltre alla pila e al Combat Tracker (card compatte: ritratto, DEF/SPD, HP con HR e barra Unione), ogni giocatore ha una **card dettagliata e flottante** del proprio PG, con in più le icone degli effetti e i contatori del Tracker. Per il GM mostra l'ultimo token del party selezionato. Si sposta con la maniglia in alto a sinistra (doppio clic: posizione iniziale) e si ridimensiona con quella in basso a destra (doppio clic: scala iniziale); posizione e scala sono per client e si accende o spegne dalle impostazioni (*Card personale*). Effetti e contatori compaiono solo qui.

### Staccare una card in una finestra

La pila e la card personale hanno, accanto alla maniglia di spostamento, un pulsante **Stacca** (icona freccia): la card si sposta in una finestra del browser, che puoi trascinare sul secondo schermo, e continua ad aggiornarsi dal vivo. Dentro la finestra la card si adatta alle sue dimensioni (ridimensiona la finestra per ingrandirla). Chiudendo la finestra la card torna nella pagina. Posizione e dimensione della finestra si ricordano per client; il browser deve consentire i popup per il sito.

### Espandere una card

Nella pila e nel Combat Tracker le card sono compatte. Un **clic sinistro sul ritratto** espande quella card e mostra anche gli effetti attivi e i contatori; un altro clic sinistro la riporta compatta. Vale per ogni card separatamente, per tutti i giocatori, ed è ricordato per client. La card personale è sempre estesa. Dalle impostazioni si possono nascondere effetti e contatori anche nelle card estese (*Card estesa*).

### Nascondere le card nel Combat Tracker

In cima al Combat Tracker c'è una barretta **Party**: un clic chiude le card (resta solo la barretta, e la lista dei combattenti riprende lo spazio), un altro le riapre. La scelta è ricordata per client. Per non avere neanche la barretta, spegni *Party: mostra le card nel Combat Tracker* nelle impostazioni del modulo.

### Staccare una scheda

Anche le **schede degli attori** (la scheda del PG compresa) hanno nell'intestazione un pulsante **Stacca** (freccia): la scheda si sposta in una finestra del browser, da portare sul secondo schermo, dove riempie la finestra e resta viva (schede, campi, aggiornamenti). Lo stesso pulsante, o la chiusura della finestra, la riporta nella pagina; chiudendo la scheda si chiude anche la finestra. Posizione e dimensione si ricordano per client. Limiti: finestre di dialogo, menu contestuali e schede degli oggetti che la scheda apre compaiono ancora nella finestra principale, e il trascinamento tra le due finestre non funziona.


La pila e la card personale non superano mai le dimensioni della finestra: se la scala salvata è troppo grande (o la finestra si rimpicciolisce) viene applicata una scala minore, così le maniglie restano sempre raggiungibili. La scala salvata non cambia.

### Pulsante nei controlli della scena

Nella colonna di sinistra (accanto a token, righello, matita...) ci sono due pulsanti: **Party** (icona delle persone) accende e spegne la pila flottante dei PG, e **Card personale** (icona della persona singola) la card del solo PG. Evidenziato = attiva. Sono le stesse impostazioni di *Mostra i meter dei punti unione* e *Card personale: mostra la card dettagliata del mio PG*, per client.

### Icona dei contatori

Nel Tracker di un attore (dal Token HUD) ogni contatore ha un pulsante icona a sinistra del nome: un clic apre il **selettore file nativo di Foundry** per scegliere l'immagine, il clic destro la toglie. Nelle card del party un contatore con icona si vede come **icona più un numerino in alto a destra**, che mostra solo il valore attuale (il totale resta nel Tracker); a zero l'icona si spegne. Questo vale per **tutti** i contatori: senza un'icona scelta, il riquadro mostra le iniziali del nome (per esempio "PA" per "pallottole"). Compaiono nelle card espanse e nella personale, insieme alle passive. I contatori sono dell'attore del mondo: aperto da un token non collegato, il Tracker modifica comunque quelli dell'attore.

### Tag degli effetti temporanei

In **tutte** le card (compatte, espanse e personale) una riga di testo come le statistiche (`Atk`, `Mag`, `Hit`, `Crit`, `Def`, `Str`, `Agi`, `Int`, `Wil`, `Per`, `Spd`, `HP`, `Pow`, `Size`), ognuno con una pila di frecce a V, dice a colpo d'occhio che cosa sta modificando quel PG. **Non guarda i numeri**: ogni singola voce di bonus o di penalità su quella categoria è un gradino.

- **Gradini**: 3 frecce riempiono un livello (`ARROWS_PER_TIER` in `scripts/tags.js`); la voce successiva riparte da una freccia nel colore del livello dopo. Con 9 voci si arriva in cima; la **decima** voce (in su o in giù) è lo step speciale: le frecce lasciano il posto a un'emblema e la scritta si anima. Bonus: la scritta dorata ha un lampo che la attraversa e un'emblema a stella che brilla. Penalità: la scritta viola scuro pulsa e al suo fianco c'è un'emblema a stella nera con bordo viola. Le animazioni sono lente e si fermano se il sistema chiede meno movimento. Bonus: bianco-giallo, arancio, rosso caldo. Penalità (frecce in giù): viola chiaro, viola, viola scuro. Il tooltip elenca le voci che formano il tag (una stessa magia con più modifiche nella stessa categoria conta una volta).
- **Specializzazione**: accanto al contatore delle magie, un'icona e il nome abbreviato nei toni neutri delle altre scritte, in base alla statistica più alta tra Forza (`Vig`), Agilità (`Rap`), Intelligenza (`Arc`) e Volontà (`Spi`); le icone sono glifi FontAwesome: manubrio, foglia, cappello da mago, mani in preghiera; la Percezione non conta. Si legge il valore attuale. Il tooltip dà il nome intero. Un PG ha una sola specializzazione: a pari merito vince l'ordine della tabella (Forza, Agilità, Intelligenza, Volontà); se le quattro sono uguali non si vede nulla. L'emblema (come l'ombrello di Zoe) sta prima della specializzazione.
- **Automatici**: **ogni effetto attivo conta**, anche quelli permanenti (livelli di percorso come Spellguard, equipaggiamento come la Soft Leather, talenti e tratti). Un effetto spento (Forma Gatto non attiva) non conta finché non lo accendi. Nelle impostazioni del modulo, *Tag: ogni effetto attivo conta*, se spento restringe ai soli effetti temporanei (magie, effetti messi a mano sulla scheda, afflizioni, effetti con una durata) più quelli scelti nel Tracker con *Search Effects*; ciò che non è né l'uno né l'altro (per esempio Perizia marziale o Addestramento alle Armi) non conta.
- **Categorie**: i bonus ai danni sono `Atk` (anche Due Mani); i danni e i boon **alle magie** sono `Mag`; gli altri **boon** agli attacchi alzano `Hit` e `Crit` insieme (Accerchiamento). `Size` segue la taglia: l'effetto viene applicato alla taglia base nella sua modalità (somma, moltiplica, imposta) e il tag va in giù o in su a seconda del risultato: Forma Gatto, che la moltiplica per 1/4, dà `Size` in giù.
- **Manuali**: per ciò che nessun effetto descrive (una magia solo a parole, il buff di un alleato) il Tracker dell'attore ha la sezione *Tag*: un pulsante per categoria, **clic sinistro +1 gradino di bonus, clic destro +1 di penalità** (da 0 a ±10). Si sommano a quelli automatici. Sono dell'attore del mondo.

I tag stanno su file uguali e allineate in colonne: fino a 7 su una riga, oltre vengono divisi in modo bilanciato (8 diventano 4 + 4, non 7 + 1). Si spengono dalle impostazioni (*Party: mostra i tag...*). Nelle card espanse stanno sopra la riga di effetti e contatori.
