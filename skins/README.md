# Skin del meter Punti Unione

Una skin è una cartella con un `skin.json` e le immagini che usa. Il meter di ogni PG è disegnato con la stessa skin.

## Usare una skin

- **Preset incluso**: `minimal`, scelto in *Impostazioni modulo → Punti unione: skin*.
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
| `portraitControls` | `true` toglie i pulsanti − e + al passaggio del mouse e li sostituisce con il ritratto del PG: clic sinistro +1, clic destro −1, con Maiusc ±5. Solo per chi può modificare i punti. |
| `bubbleAnimation` | `false` ferma l'alone pulsante sulle icone dei compagni pronti. |
| `portraitSize` | Diametro in pixel del ritratto del PG e delle icone dei compagni a scala 1. Default: 1,45 volte `height`. |
| `portraitShift` | Sposta in basso il ritratto di tanti pixel a scala 1. Serve quando la barra è inclinata e il suo capo sinistro sta più in basso del centro della riga. |

## Dimensione e posizione

La scala scelta da ciascun giocatore (default 0,5, da 0,3 a 2) ridimensiona tutto insieme: immagini, testo e icone. Si cambia dalle impostazioni o trascinando la maniglia nell'angolo in basso a destra della pila; doppio clic la riporta a 0,5. La maniglia in alto a sinistra sposta la pila, doppio clic la riporta alla posizione della skin. Entrambe sono per client.

## Limiti

- Il riempimento avanza solo da sinistra a destra: niente barre verticali o da destra a sinistra.
- C'è un solo `track` per skin, uguale per tutti i PG.
- Nessun layout alternativo per le icone dei compagni pronti: stanno sempre a destra del meter.
- Se la barra è inclinata, i compagni pronti restano comunque allineati al centro della riga, non alla barra.
- Con la scala cambiano immagini, testo del valore e ritratti; il nome del PG e gli spazi tra le righe hanno invece dimensione fissa in pixel.
