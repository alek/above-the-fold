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

// Enable CORS for frontend requests
app.use(require("cors")());

// Serve images statically
app.use("/images", express.static(IMAGE_DIR));

// Function to read exclusion list
function getExclusionList() {
    try {
        if (fs.existsSync(EXCLUSION_FILE)) {
            return new Set(
                fs.readFileSync(EXCLUSION_FILE, "utf-8")
                    .split("\n")
                    .map(line => line.trim())
                    .filter(line => line.length > 0) // Remove empty lines
            );
        }
    } catch (err) {
        console.error("Error reading exclusion file:", err);
    }
    return new Set();
}

// Function to extract numeric ID from filename
function extractNumericID(filename) {
    const match = filename.match(/\d+/); // Extract first number found in the filename
    return match ? parseInt(match[0], 10) : Infinity; // Default to a high value if no number
}

// API to get the list of PNG files, sorted numerically by ID
app.get("/list-images", (req, res) => {
    const exclusionList = getExclusionList();

    fs.readdir(IMAGE_DIR, (err, files) => {
        if (err) {
            return res.status(500).json({ error: "Error reading directory" });
        }

        // Filter and sort files
        const pngFiles = files
            .filter(file => file.endsWith(".png"))
            .map(file => ({ file, id: extractNumericID(file) })) // Extract numeric IDs
            .filter(({ file }) => !exclusionList.has(path.parse(file).name)) // Apply exclusion
            .sort((a, b) => a.id - b.id) // Sort numerically
            .map(({ file }) => file); // Return only filenames

        res.json(pngFiles);
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Serving images from: ${IMAGE_DIR}`);
});
