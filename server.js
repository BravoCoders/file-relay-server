import express from "express";
import fs from "fs";
import path from "path";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS so any client can access
app.use(cors());

// Directory to serve files from (change this to your actual folder path)
const FILES_DIR = path.join(process.cwd(), "files");

// Ensure files folder exists (for testing)
if (!fs.existsSync(FILES_DIR)) {
  fs.mkdirSync(FILES_DIR);
  fs.writeFileSync(path.join(FILES_DIR, "example.txt"), "This is a test file.");
}

// List all files in directory (non-recursive)
app.get("/files", (req, res) => {
  fs.readdir(FILES_DIR, (err, files) => {
    if (err) {
      return res.status(500).json({ error: "Unable to list files" });
    }
    // Optionally filter out hidden files or dirs if needed here
    res.json(files);
  });
});

// Download a file by name
app.get("/download/:filename", (req, res) => {
  const filename = req.params.filename;

  // Sanitize filename to prevent directory traversal attack
  if (filename.includes("..") || path.isAbsolute(filename)) {
    return res.status(400).json({ error: "Invalid filename" });
  }

  const filePath = path.join(FILES_DIR, filename);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      return res.status(404).json({ error: "File not found" });
    }

    res.download(filePath, filename, (err) => {
      if (err) {
        console.error("Download error:", err);
        res.status(500).json({ error: "Failed to download file" });
      }
    });
  });
});

// Root route
app.get("/", (req, res) => {
  res.send(`
    <h1>Simple HTTP File Server</h1>
    <p>Use <a href="/files">/files</a> to get JSON file list.</p>
    <p>Download a file at <code>/download/filename</code></p>
  `);
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
