const express = require('express');
const axios = require('axios');
const cors = require('cors');
const contentDisposition = require('content-disposition');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const app = express();

// 👇 FIX: Use environment variable for port (Render sets this)
const PORT = process.env.PORT || 3000;

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

// Download endpoint using yt-dlp (via yt-dlp-exec)
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// ... (other requires and code)

app.post('/download', async (req, res) => {
    const { videoUrl } = req.body;
    
    if (!videoUrl) {
        return res.status(400).json({ error: 'Missing videoUrl' });
    }
    
    const platform = detectPlatform(videoUrl);
    console.log(`Processing ${platform} URL: ${videoUrl}`);
    
    const outputId = crypto.randomBytes(8).toString('hex');
    const outputPath = path.join(TEMP_DIR, `${outputId}.mp4`);
    
    try {
        // Use global yt-dlp command
        const command = `yt-dlp -f best "${videoUrl}" -o "${outputPath}"`;
        console.log('Executing:', command);
        
        const { stdout, stderr } = await execPromise(command);
        console.log('yt-dlp stdout:', stdout);
        if (stderr) console.error('yt-dlp stderr:', stderr);
        
        if (!fs.existsSync(outputPath)) {
            return res.status(500).json({ error: 'Downloaded file not found' });
        }
        
        res.setHeader('Content-Disposition', contentDisposition(`video_${platform}.mp4`));
        res.setHeader('Content-Type', 'video/mp4');
        
        const fileStream = fs.createReadStream(outputPath);
        fileStream.pipe(res);
        
        fileStream.on('end', () => {
            fs.unlink(outputPath, (err) => {
                if (err) console.error('Error deleting temp file:', err);
            });
        });
        
        fileStream.on('error', (err) => {
            console.error('Stream error:', err);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Stream failed' });
            }
        });
    } catch (error) {
        console.error('yt-dlp error:', error);
        res.status(500).json({ 
            error: 'Failed to download video', 
            details: error.message 
        });
    }
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