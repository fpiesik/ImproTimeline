# Song-Dateiformat

Songdateien liegen im Verzeichnis `songs/` und verwenden JSON.

## Struktur

```json
{
  "name": "Stadtfahrt",
  "musicians": [
    { "name": "Alle", "backgroundColor": "#1d1d1d" },
    { "name": "Gregor", "backgroundColor": "#1e2a3d" },
    { "name": "Ali", "backgroundColor": "#1f3a2d" },
    { "name": "Frank", "backgroundColor": "#3a2b1f" }
  ],
  "segments": [
    {
      "name": "Intro",
      "measures": 4,
      "timeSignature": "4/4",
      "tonart": "C-Dur",
      "tempo": 120,
      "gregorRole": "Harmonie",
      "aliRole": "Solo",
      "frankRole": "Beat",
      "instructions": {
        "Alle": ["Ruhig beginnen", "Viel Raum lassen"],
        "Gregor": ["Nur lange Töne"],
        "Ali": ["Kurze Einwürfe"],
        "Frank": ["Nur punktuelle Akzente"]
      }
    }
  ]
}
```

## Hinweise

- `name`: Anzeigename des Songs.
- Dateinamen müssen mit einem **zweistelligen Index** beginnen (z. B. `01_stadtfahrt.json`, `12_nachtzug.json`).
  - Dieser Dateiname-Index wird für die Songauswahl via UDP verwendet.
  - UDP darf weiterhin normale Zahlen ohne führende Null senden (`1`, `2`, `12`).
- `musicians`: Namen der Musiker als Objekte mit:
  - `name`: Anzeigename und Schlüssel für `instructions`.
  - `backgroundColor` (optional): Hintergrundfarbe der jeweiligen Track-Zeile (z. B. `#1e2a3d`).
- Die frühere Sonderkategorie `all` gibt es nicht mehr automatisch.
  - Wenn eine globale Spur gewünscht ist, füge in `musicians` einen Eintrag mit `name: "Alle"` hinzu.
  - Die passenden Anweisungen stehen dann unter `instructions.Alle`.
- `segments`: Liste der Songsegmente.
- Pro Segment bleiben musikalische Basisdaten erhalten (`measures`, `timeSignature`, `tonart`, `tempo`, Rollenfelder).
- `instructions.<Musikername>`: individuelle Anweisungen passend zu `musicians`.

## Technische Umsetzung

- Der Server liest alle `*.json` aus `songs/` ein und stellt sie über `GET /api/songs` bereit.
- Der aktuell aktive Song wird serverseitig zentral gehalten.
- Songwechsel erfolgen per WebSocket (`selectSong`) und werden an alle Clients broadcastet (`songChanged`).
- Bei Segmentwechsel sendet der Client `segmentChange` mit Segmentname, Tempo, Tonart, Taktart und Anweisungen; der Server kann diese Daten an weitere Systeme (UDP) weiterreichen.
