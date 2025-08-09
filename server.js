const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const url = require('url');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let androidSocket = null; // Store connected Android device socket

// When Android app connects via WebSocket
wss.on('connection', (ws, req) => {
    console.log('Device connected via WebSocket');
    androidSocket = ws;

    ws.on('close', () => {
        console.log('Device disconnected');
        androidSocket = null;
    });
});

// Public endpoint to get file list
app.get('/files', (req, res) => {
    if (!androidSocket) {
        return res.status(503).send({ error: "Device offline" });
    }

    // Ask Android app for file list
    androidSocket.once('message', (message) => {
        try {
            const files = JSON.parse(message);
            res.json(files);
        } catch (err) {
            res.status(500).send({ error: "Invalid file list format" });
        }
    });

    androidSocket.send(JSON.stringify({ action: "getFiles" }));
});

// Public endpoint to download a file
app.get('/download', (req, res) => {
    if (!androidSocket) {
        return res.status(503).send({ error: "Device offline" });
    }

    const filePath = req.query.path;
    if (!filePath) {
        return res.status(400).send({ error: "File path required" });
    }

    // Stream file data from Android app
    res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${filePath.split('/').pop()}"`
    });

    androidSocket.send(JSON.stringify({ action: "downloadFile", path: filePath }));

    androidSocket.on('message', (chunk) => {
        if (chunk === '__END__') {
            res.end();
        } else {
            res.write(chunk);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Relay server running on port ${PORT}`);
});
