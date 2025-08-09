import express from "express";
import fs from "fs";
import path from "path";
import cors from "cors";
import { fileURLToPath } from "url";
import { WebSocketServer } from "ws";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS
app.use(cors());

// Directory to serve files from - change this to your desired folder
const FILES_DIR = path.join(__dirname, "files");

// Ensure files folder exists and create example.txt if missing
if (!fs.existsSync(FILES_DIR)) {
    fs.mkdirSync(FILES_DIR, { recursive: true });
}
const examplePath = path.join(FILES_DIR, "example.txt");
if (!fs.existsSync(examplePath)) {
    fs.writeFileSync(examplePath, "This is a test file.");
}

// HTTP endpoints for browser or HTTP clients (optional)
app.get("/", (req, res) => {
    res.send(`
        <h1>File Server</h1>
        <p>Use <a href="/files">/files</a> to see file list</p>
    `);
});

app.get("/files", (req, res) => {
    fs.readdir(FILES_DIR, (err, files) => {
        if (err) return res.status(500).json({ error: "Unable to list files" });
        res.json(files);
    });
});

app.get("/download/:filename", (req, res) => {
    const filePath = path.join(FILES_DIR, req.params.filename);
    if (fs.existsSync(filePath)) {
        res.download(filePath);
    } else {
        res.status(404).json({ error: "File not found" });
    }
});

const server = app.listen(PORT, () => {
    console.log(`HTTP server running on port ${PORT}`);
});

// WebSocket server attached to the same HTTP server
const wss = new WebSocketServer({ server });

console.log("WebSocket server created");

wss.on("connection", (ws) => {
    console.log("WebSocket client connected");

    ws.on("message", async (data) => {
        // Expecting JSON text commands from clients
        try {
            const msg = data.toString();
            const obj = JSON.parse(msg);

            if (obj.action === "getFiles") {
                const files = await getFilesList();
                ws.send(JSON.stringify(files));
            } else if (obj.action === "downloadFile" && obj.path) {
                const reqId = obj.reqId || Date.now().toString();
                streamFileInChunks(ws, obj.path, reqId);
            }
        } catch (err) {
            console.error("Failed to process WS message:", err);
        }
    });

    ws.on("close", () => {
        console.log("WebSocket client disconnected");
    });
});

async function getFilesList() {
    return new Promise((resolve, reject) => {
        fs.readdir(FILES_DIR, { withFileTypes: true }, (err, files) => {
            if (err) return reject(err);
            const arr = files.map((file) => {
                const fullPath = path.join(FILES_DIR, file.name);
                return {
                    path: fullPath,
                    name: file.isDirectory() ? file.name + "/" : file.name,
                    isDir: file.isDirectory(),
                    size: file.isFile() ? fs.statSync(fullPath).size : 0,
                    lastModified: fs.statSync(fullPath).mtimeMs
                };
            });
            resolve(arr);
        });
    });
}

function streamFileInChunks(ws, filePath, reqId) {
    // Only allow files within FILES_DIR for security
    if (!filePath.startsWith(FILES_DIR)) {
        ws.send(JSON.stringify({ error: "Access denied" }));
        return;
    }
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        ws.send(JSON.stringify({ error: "File not found" }));
        return;
    }

    const CHUNK_SIZE = 64 * 1024; // 64 KB
    const stream = fs.createReadStream(filePath, { highWaterMark: CHUNK_SIZE });

    stream.on("data", (chunk) => {
        const base64Chunk = chunk.toString("base64");
        ws.send(`${reqId}:${base64Chunk}`);
    });

    stream.on("end", () => {
        ws.send(`__END__:${reqId}`);
    });

    stream.on("error", (err) => {
        ws.send(JSON.stringify({ error: "Read error", details: err.message }));
    });
}
