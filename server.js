const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const dgram = require('dgram');

const HTTP_PORT = 8080;
const UDP_IN_PORT = 8099;
const UDP_SONG_SELECT_PORT = 8100;
const PD_HOST = '192.168.178.106';
const PD_PORT = 8000;
const SONGS_DIR = path.join(__dirname, 'songs');

let songsById = new Map();
let songList = [];
let songIdByIndexNumber = new Map();
let currentSongId = null;
let latestTick = 0;

function extractSongIndexNumberFromFileName(fileName) {
  const baseName = path.basename(String(fileName || ''), '.json');
  const match = baseName.match(/^(\d{2})(?:[^\d].*)?$/);
  if (!match) return null;

  const numericIndex = parseInt(match[1], 10);
  return Number.isNaN(numericIndex) ? null : numericIndex;
}

function readSongsFromDisk() {
  const files = fs
    .readdirSync(SONGS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name)
    .sort();

  const loadedSongs = [];
  const loadedMap = new Map();
  const loadedSongIdByIndexNumber = new Map();

  for (const fileName of files) {
    const filePath = path.join(SONGS_DIR, fileName);
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(fileContent);

    if (!parsed.name || !Array.isArray(parsed.segments)) {
      throw new Error(`Songdatei ${fileName} ist ungültig: Erwartet Felder 'name' und 'segments'.`);
    }

    const id = path.basename(fileName, '.json');
    const song = {
      id,
      fileName,
      name: parsed.name,
      musicians: Array.isArray(parsed.musicians) ? parsed.musicians : ['Gregor', 'Ali', 'Frank'],
      segments: parsed.segments,
    };

    loadedSongs.push({ id: song.id, name: song.name, fileName: song.fileName });
    loadedMap.set(id, song);

    const songIndexNumber = extractSongIndexNumberFromFileName(fileName);
    if (songIndexNumber !== null) {
      loadedSongIdByIndexNumber.set(songIndexNumber, song.id);
    } else {
      console.warn(
        `Songdatei ${fileName} hat keinen gültigen zweistelligen Index am Dateianfang (z. B. 01_mein-song.json).`,
      );
    }
  }

  songsById = loadedMap;
  songList = loadedSongs;
  songIdByIndexNumber = loadedSongIdByIndexNumber;

  if (!currentSongId || !songsById.has(currentSongId)) {
    currentSongId = songList.length > 0 ? songList[0].id : null;
  }
}

function getCurrentSong() {
  if (!currentSongId) return null;
  return songsById.get(currentSongId) || null;
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function getStatePayload() {
  return {
    songs: songList,
    currentSongId,
    currentSong: getCurrentSong(),
    latestTick,
  };
}

const server = http.createServer((req, res) => {
  if (req.url === '/') {
    fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
      if (err) {
        res.writeHead(500);
        res.end('Fehler beim Laden von index.html');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
    return;
  }

  if (req.url === '/api/songs') {
    sendJson(res, 200, getStatePayload());
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
});

const wss = new WebSocket.Server({ server });

const udpInSocket = dgram.createSocket('udp4');
udpInSocket.on('message', (msg, rinfo) => {
  const text = msg.toString().trim().replace(';', '');
  const numericTick = parseInt(text, 10);
  if (!Number.isNaN(numericTick)) {
    latestTick = numericTick;
  }

  console.log(`UDP Tick von ${rinfo.address}:${rinfo.port}: ${text}`);
  broadcastWS({ type: 'tick', data: { tick: latestTick, raw: text } });
});
udpInSocket.bind(UDP_IN_PORT, () => {
  console.log(`Empfange Ticks via UDP auf Port ${UDP_IN_PORT}`);
});

const udpSongSelectSocket = dgram.createSocket('udp4');
udpSongSelectSocket.on('message', (msg, rinfo) => {
  const text = msg.toString().trim().replace(';', '');
  const songIndex = parseInt(text, 10);
  if (Number.isNaN(songIndex)) {
    console.warn(`Ungültiger Song-Index via UDP von ${rinfo.address}:${rinfo.port}: ${text}`);
    return;
  }

  const songId = songIdByIndexNumber.get(songIndex);
  if (!songId || !songsById.has(songId)) {
    console.warn(`Kein Song mit Index ${songIndex} gefunden.`);
    return;
  }

  if (songId === currentSongId) {
    latestTick = 0;
    broadcastWS({ type: 'tick', data: { tick: latestTick, raw: '0' } });
    return;
  }

  currentSongId = songId;
  latestTick = 0;
  broadcastWS({ type: 'songChanged', data: getStatePayload() });
  console.log(`Aktiver Song via UDP gewechselt: ${songIndex} -> ${songId}`);
});
udpSongSelectSocket.bind(UDP_SONG_SELECT_PORT, () => {
  console.log(`Empfange Songauswahl via UDP auf Port ${UDP_SONG_SELECT_PORT}`);
});

const udpOutSocket = dgram.createSocket('udp4');

wss.on('connection', (ws) => {
  console.log('Neuer WebSocket-Client verbunden');
  ws.send(JSON.stringify({ type: 'state', data: getStatePayload() }));

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);

      if (msg.type === 'selectSong') {
        const { songId } = msg.data || {};
        if (!songId || !songsById.has(songId)) {
          return;
        }

        currentSongId = songId;
        latestTick = 0;
        broadcastWS({ type: 'songChanged', data: getStatePayload() });
        console.log(`Aktiver Song gewechselt: ${songId}`);
        return;
      }

      if (msg.type === 'segmentChange') {
        const seg = msg.data;
        const outMessage = JSON.stringify({
          type: 'segmentChange',
          name: seg.name,
          tempo: seg.tempo,
          tonart: seg.tonart,
          timeSignature: seg.timeSignature,
          instructions: seg.instructions,
        });

        udpOutSocket.send(outMessage, 0, outMessage.length, PD_PORT, PD_HOST, (err) => {
          if (err) {
            console.error('Fehler beim UDP-Senden an PD:', err);
          }
        });

        console.log('SegmentChange via WS empfangen => PD:', outMessage);
      }
    } catch (error) {
      console.error('Fehler beim Parse der WebSocket-Nachricht:', error);
    }
  });
});

function broadcastWS(payload) {
  const message = typeof payload === 'string' ? payload : JSON.stringify(payload);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

readSongsFromDisk();

server.listen(HTTP_PORT, () => {
  console.log(`HTTP + WS Server auf Port ${HTTP_PORT}.`);
});
