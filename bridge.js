// Minimaler Node.js-Server, der UDP-Pakete empfängt (Port 6000)
// und via WebSocket an Browser-Clients (Port 8080) weiterleitet.

const dgram = require('dgram');
const WebSocket = require('ws');
const http = require('http');

// 1) UDP-Socket einrichten (Port 6000)
const udpPort = 8099;
const udpSocket = dgram.createSocket('udp4');

udpSocket.on('message', (msg, rinfo) => {
  console.log('UDP-Paket empfangen:', msg.toString(), 'von', rinfo.address, rinfo.port);
  // An alle WebSocket-Clients verteilen
  broadcastToWebSockets(msg.toString());
});

udpSocket.on('listening', () => {
  const address = udpSocket.address();
  console.log(`UDP-Socket lauscht auf Port ${address.port}`);
});

// UDP starten
udpSocket.bind(udpPort);

// 2) WebSocket-Server
const httpServer = http.createServer();
const wss = new WebSocket.Server({ server: httpServer });

wss.on('connection', (ws) => {
  console.log('Neuer WebSocket-Client verbunden');

  // Optional: Begrüßungsnachricht
  // ws.send('Willkommen im UDP-zu-WebSocket-Server!');
});

function broadcastToWebSockets(message) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// HTTP-Server starten (Port 8080)
const wsPort = 8080;
httpServer.listen(wsPort, () => {
  console.log(`WebSocket-Server läuft auf Port ${wsPort}`);
});
