const express = require('express');
const axios = require('axios');
const cors = require('cors');
const contentDisposition = require('content-disposition');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Create temp directory for downloads
const TEMP_DIR = path.join(__dirname, 'temp');
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR);
}

// Clean up old temp files periodically (every hour)
setInterval(() => {
    const files = fs.readdirSync(TEMP_DIR);
    const now = Date.now();
    files.forEach(file => {
        const filePath = path.join(TEMP_DIR, file);
        const stats = fs.statSync(filePath);
        // Delete files older than 10 minutes
        if (now - stats.mtimeMs > 10 * 60 * 1000) {
            fs.unlinkSync(filePath);
        }
    });
}, 60 * 60 * 1000);

// Platform detection
function detectPlatform(url) {
    const platforms = {
        'snapchat': ['snapchat.com'],
        'youtube': ['youtube.com', 'youtu.be'],
        'tiktok': ['tiktok.com'],
        'instagram': ['instagram.com'],
        'twitter': ['twitter.com', 'x.com'],
        'facebook': ['facebook.com', 'fb.com'],
        'reddit': ['reddit.com']
    };
    
    for (const [platform, domains] of Object.entries(platforms)) {
        if (domains.some(domain => url.includes(domain))) {
            return platform;
        }
    }
    return 'unknown';
}

// Download endpoint using yt-dlp
app.post('/download', async (req, res) => {
    const { videoUrl } = req.body;
    
    if (!videoUrl) {
        return res.status(400).json({ error: 'Missing videoUrl' });
    }
    
    const platform = detectPlatform(videoUrl);
    console.log(`Processing ${platform} URL: ${videoUrl}`);
    
    // Generate unique filename
    const outputId = crypto.randomBytes(8).toString('hex');
    const outputPath = path.join(TEMP_DIR, `${outputId}.%(ext)s`);
    const finalPath = path.join(TEMP_DIR, `${outputId}.mp4`);
    
    // Build yt-dlp command with optimal settings
    // For Snapchat specifically, this extracts the highest quality without watermark [citation:1]
// For LISTING formats (use this temporarily)
// For LISTING formats (use this temporarily)
let command = `"C:\\Users\\USER\\AppData\\Local\\Packages\\PythonSoftwareFoundation.Python.3.13_qbz5n2kfra8p0\\LocalCache\\local-packages\\Python313\\Scripts\\yt-dlp.exe" -f "best" "${videoUrl}" -o "${outputPath}"`;    // Output template
    command += ` -o "${outputPath}"`;
    
    // Add URL
    command += ` "${videoUrl}"`;
    
    // Add cookies from browser (helps with platforms that require auth)
    // You can also provide a cookies.txt file
    // command += ` --cookies-from-browser chrome`;
    
    console.log('Executing:', command);
    
    // Execute yt-dlp
    exec(command, { maxBuffer: 1024 * 1024 * 100 }, async (error, stdout, stderr) => {
        if (error) {
            console.error('yt-dlp error:', error);
            console.error('stderr:', stderr);
            return res.status(500).json({ 
                error: 'Failed to download video', 
                details: stderr || error.message 
            });
        }
        
        console.log('yt-dlp stdout:', stdout);
        
        // Find the downloaded file (yt-dlp might output different extension)
        const files = fs.readdirSync(TEMP_DIR);
        const downloadedFile = files.find(f => f.startsWith(outputId));
        
        if (!downloadedFile) {
            return res.status(500).json({ error: 'Downloaded file not found' });
        }
        
        const filePath = path.join(TEMP_DIR, downloadedFile);
        
        // Send the file to client
        res.setHeader('Content-Disposition', contentDisposition(`video_${platform}.mp4`));
        res.setHeader('Content-Type', 'video/mp4');
        
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
        
        // Clean up after sending
        fileStream.on('end', () => {
            fs.unlink(filePath, (err) => {
                if (err) console.error('Error deleting temp file:', err);
            });
        });
        
        fileStream.on('error', (err) => {
            console.error('Stream error:', err);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Stream failed' });
            }
        });
    });
});

// Alternative: Direct download for simple video URLs (fallback)
app.post('/download-direct', async (req, res) => {
    const { videoUrl } = req.body;
    
    if (!videoUrl) {
        return res.status(400).json({ error: 'Missing videoUrl' });
    }
    
    try {
        const response = await axios({
            method: 'GET',
            url: videoUrl,
            responseType: 'stream',
            timeout: 15000,
        });
        
        const filename = videoUrl.split('/').pop() || 'video.mp4';
        res.setHeader('Content-Disposition', contentDisposition(filename));
        res.setHeader('Content-Type', response.headers['content-type'] || 'video/mp4');
        
        response.data.pipe(res);
        
        response.data.on('error', (err) => {
            console.error('Stream error:', err);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Stream failed' });
            }
        });
    } catch (error) {
        console.error('Download error:', error.message);
        res.status(500).json({ error: 'Failed to fetch video' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});