# ClusterSomnia

Modulo per **Foundry VTT** dedicato a *Shadow of the Demon Lord*: raccoglie i compendi del nostro tavolo e aggiunge un tracker di PV, contatori personalizzati ed effetti attivi, richiamabile direttamente dal token.

## Requisiti

- Foundry VTT **v12** (minimo 12, verificato su 12)
- Sistema di gioco **Shadow of the Demon Lord** (`demonlord`)

## Installazione

**Dal manifest (consigliato)** — in Foundry: *Add-on Modules → Install Module*, incollare nel campo *Manifest URL*:

```
https://raw.githubusercontent.com/Lamuo/clustersomnia/main/module.json
```

**Manuale** — copiare (o creare un link simbolico del) contenuto del repository dentro la cartella dati di Foundry:

```
Data/modules/clustersomnia
```

Il nome della cartella deve essere **esattamente `clustersomnia`**: i percorsi interni del modulo sono assoluti (`modules/clustersomnia/templates/tracker.hbs`) e con un nome diverso il tracker non si apre.

In entrambi i casi, poi: *Game Settings → Manage Modules*, spuntare ClusterSomnia e ricaricare il mondo.

## Compendi inclusi

| Compendio | Contenuto |
|---|---|
| Spells | Incantesimi |
| Paths | Sentieri |
| Ancestries | Stirpi |
| Party | Attori del gruppo |
| Items | Oggetti ed equipaggiamento |
| Languages and Professions | Lingue e professioni |
| Features and Talents | Caratteristiche e talenti |

Permessi impostati dal modulo:

- **Giocatore** — sola lettura: può consultare e importare, non modificare.
- **Trusted Player** — pieno controllo. È il ruolo pensato per chi costruisce i contenuti: può creare, modificare e cancellare qualsiasi documento dei compendi.
- **Assistant GM** — pieno controllo.

I permessi valgono per l'intero compendio, non per singola cartella. Se il GM configura i permessi del compendio dentro il mondo, quella impostazione ha la precedenza su quella del modulo.

## Il tracker

Si apre dal **Token HUD**: selezionare un token sulla scena e cliccare l'icona aggiunta dal modulo (tooltip *Open Tracker*). Ogni attore ha la sua finestra.

**PV** — i pulsanti `−1` e `+1` modificano i punti ferita dell'attore; il valore resta sempre tra 0 e il massimo.

**Contatori personalizzati** — `+ Add Counter` aggiunge una riga. Il nome è modificabile a mano, così come il massimo: lasciarlo vuoto (segnaposto `∞`) significa nessun limite. I pulsanti `−` e `+` incrementano il valore entro i limiti; l'icona del cestino elimina il contatore. I contatori sono salvati sull'attore e restano tra una sessione e l'altra.

**Effetti attivi** — la lista mostra solo gli effetti che hai scelto di tenere d'occhio; cliccando su un effetto lo attivi o disattivi. Il pulsante *Search Effects* apre la lista completa degli effetti applicabili all'attore, dove si spunta quali mostrare nel tracker.

La finestra si aggiorna da sola quando l'attore, i suoi effetti o i suoi oggetti cambiano — anche se la modifica arriva da un altro utente.

### Note

- I dati del tracker (contatori ed effetti selezionati) sono salvati nei flag `clustersomnia` dell'attore.
- Chi arriva da una versione precedente che usava il modulo separato `my-tracker`: al primo avvio del mondo con un GM collegato i dati vengono migrati automaticamente, senza interventi manuali.

## Per chi contribuisce

Il modulo non ha una build: Foundry carica direttamente `scripts/*.js`, quindi basta modificare i file e ricaricare il mondo (F5).

I compendi in `packs/` sono invece un **output**. La sorgente sono i file YAML in [`src/packs/`](src/packs/), uno per documento:

```
npm install
npm run packs:extract   # packs/ -> src/packs/   (dopo aver modificato dalla UI di Foundry)
npm run packs:compile   # src/packs/ -> packs/   (dopo aver modificato lo YAML a mano)
```

Tre avvertenze che evitano danni:

- **Chiudere Foundry** (o almeno il mondo) prima di lanciare gli script, e ricaricare il mondo dopo un `compile`.
- **Non modificare le due direzioni in contemporanea**: l'ultima eseguita sovrascrive l'altra.
- **Non cambiare mai gli `_id`** nei file YAML: sono la base di ogni UUID, collegamento e riferimento.

Il resto delle convenzioni (spostare documenti tra cartelle, creare nuove cartelle, struttura degli script) è documentato in [`CLAUDE.md`](CLAUDE.md).

## Crediti

Autore: Daniele.

*Shadow of the Demon Lord* è proprietà di Schwalb Entertainment. Questo modulo è contenuto non ufficiale, realizzato per uso al tavolo. Il repository non include un file di licenza.
