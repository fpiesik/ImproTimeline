/**
 * server.js
 * Node.js-Server, der:
 *  - HTTP auf Port 8080 (servet index.html)
 *  - WebSocket (ebenfalls Port 8080)
 *  - UDP-Socket (Port 6000) => empfängt Ticks, leitet an WebSockets
 *  - empfängt WebSocket-Nachrichten vom Browser, leitet Segment-Parameter an PD_HOST:PD_PORT via UDP
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const dgram = require('dgram');

// Konfiguration
const HTTP_PORT = 8080;      // HTTP + WS-Port
const UDP_IN_PORT = 8099;    // eingehende Ticks
const PD_HOST = '192.168.178.106'; // Pure Data IP
const PD_PORT = 8000;        // Pure Data Port (wo PD lauscht)

// HTTP-Server
const server = http.createServer((req, res) => {
  if(req.url === '/'){
    // index.html ausliefern
    fs.readFile(path.join(__dirname, 'index.html'), (err,data) => {
      if(err){
        res.writeHead(500);
        res.end('Fehler beim Laden von index.html');
        return;
      }
      res.writeHead(200, {'Content-Type':'text/html'});
      res.end(data);
    });
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

// WebSocket-Server
const wss = new WebSocket.Server({ server });

// UDP-Socket für eingehende Ticks
const udpInSocket = dgram.createSocket('udp4');
udpInSocket.on('message', (msg, rinfo) => {
  console.log(`UDP Tick von ${rinfo.address}:${rinfo.port}: ${msg.toString()}`);
  // Broadcast an WebSocket-Clients
  broadcastWS(msg.toString());
});
udpInSocket.bind(UDP_IN_PORT, () => {
  console.log(`Empfange Ticks via UDP auf Port ${UDP_IN_PORT}`);
});

// UDP-Socket für Ausgehend an Pure Data
const udpOutSocket = dgram.createSocket('udp4');

// WebSocket-Events
wss.on('connection', (ws) => {
  console.log('Neuer WebSocket-Client verbunden');

  ws.on('message', (data) => {
    // data könnte z.B. JSON sein
    try {
      let msg = JSON.parse(data);
      if(msg.type === 'segmentChange'){
        // Parameter an PD
        let seg = msg.data;
        // Hier ein rudimentäres Format:
        // z.B. "segmentChange name=Hauptteil tempo=140 tonart=G-Moll"
        //let outStr = `SEGMENTCHANGE name=${seg.name} tempo=${seg.tempo} tonart=${seg.tonart} timeSig=${seg.timeSignature}`;
        let outStr = `${seg.tempo}`;
        // An PD schicken
        udpOutSocket.send(outStr, 0, outStr.length, PD_PORT, PD_HOST, (err) => {
          if(err) console.error('Fehler beim UDP-Senden an PD:', err);
        });
        console.log('SegmentChange via WS empfangen, => PD:', outStr);
      }
    } catch(e){
      console.error('Fehler beim Parse der WebSocket-Nachricht:', e);
    }
  });
});

// Funktion: Broadcast an alle WS-Clients
function broadcastWS(message){
  wss.clients.forEach(client => {
    if(client.readyState === WebSocket.OPEN){
      client.send(message);
    }
  });
}

// HTTP/WS-Server starten
server.listen(HTTP_PORT, () => {
  console.log(`HTTP + WS Server auf Port ${HTTP_PORT}.`);
});
