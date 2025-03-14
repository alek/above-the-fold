const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3001;

// Get image directory from command-line argument
const IMAGE_DIR = process.argv[2];

if (!IMAGE_DIR) {
    console.error("Error: Please specify the images directory.");
    console.log("Usage: node server.js /path/to/images");
    process.exit(1);
}

const EXCLUSION_FILE = path.join(IMAGE_DIR, "exclusion.txt");
const MIN_FILE_SIZE = 2 *64 * 1024; // 64KB

// Enable CORS for frontend requests
app.use(require("cors")());

// Serve images statically
app.use("/images", express.static(IMAGE_DIR));

// Function to read exclusion list (IDs)
function getExclusionList() {
    try {
        if (fs.existsSync(EXCLUSION_FILE)) {
            return new Set(
                fs.readFileSync(EXCLUSION_FILE, "utf-8")
                    .split("\n")
                    .map(line => line.trim())
                    .filter(line => /^\d+$/.test(line)) // Only allow numeric IDs
            );
        }
    } catch (err) {
        console.error("Error reading exclusion file:", err);
    }
    return new Set();
}

// Function to extract the full numeric ID from filename (before .png)
function extractNumericID(filename) {
    const match = filename.match(/^(\d+)\.png$/); // Match full number before ".png"
    return match ? match[1] : null; // Keep as string for exact comparison
}

// API to get the list of PNG files, sorted numerically by ID
app.get("/list-images", (req, res) => {
    const exclusionList = getExclusionList();

    fs.readdir(IMAGE_DIR, (err, files) => {
        if (err) {
            return res.status(500).json({ error: "Error reading directory" });
        }

        // Filter, check file size, and sort files
        const pngFiles = files
            .filter(file => file.endsWith(".png"))
            .map(file => ({
                file,
                id: extractNumericID(file),
                size: fs.statSync(path.join(IMAGE_DIR, file)).size
            }))
            .filter(({ id, size }) => 
                id !== null &&
                !exclusionList.has(id) && // Exact ID match
                size > MIN_FILE_SIZE
            )
            .sort((a, b) => parseInt(a.id, 10) - parseInt(b.id, 10)) // Sort numerically
            .map(({ file }) => file); // Return only filenames

        res.json(pngFiles);
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Serving images from: ${IMAGE_DIR}`);
});
