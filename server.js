// server.js
import express from "express";
import fs from "fs";
import path from "path";
import cors from "cors";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS
app.use(cors());

// Directory to serve files from (change this later to your target directory)
const FILES_DIR = path.join(__dirname, "files");

// Ensure files folder exists
if (!fs.existsSync(FILES_DIR)) {
    fs.mkdirSync(FILES_DIR);
    fs.writeFileSync(path.join(FILES_DIR, "example.txt"), "This is a test file.");
}

// List all files (JSON)
app.get("/files", (req, res) => {
    fs.readdir(FILES_DIR, (err, files) => {
        if (err) {
            return res.status(500).json({ error: "Unable to list files" });
        }
        res.json(files);
    });
});

// Download specific file
app.get("/download/:filename", (req, res) => {
    const filePath = path.join(FILES_DIR, req.params.filename);
    if (fs.existsSync(filePath)) {
        res.download(filePath);
    } else {
        res.status(404).json({ error: "File not found" });
    }
});

// Root route
app.get("/", (req, res) => {
    res.send(`
        <h1>File Server</h1>
        <p>Use <a href="/files">/files</a> to see file list</p>
    `);
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
