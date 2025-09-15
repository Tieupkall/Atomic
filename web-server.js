const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 5000;

// Thư mục chứa code và background
const codeDir = path.join(__dirname, 'public', 'code');
const backgroundDir = path.join(__dirname, 'public', 'background');

// Middleware
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API để lấy danh sách file từ thư mục code
app.get('/api/files', (req, res) => {
    try {
        if (!fs.existsSync(codeDir)) {
            return res.json([]);
        }

        const files = fs.readdirSync(codeDir);
        const fileList = files
            .filter(file => {
                // Chỉ lấy các file code
                const ext = path.extname(file).toLowerCase();
                return ['.js', '.html', '.css', '.py', '.java', '.cpp', '.c', '.php', '.json', '.xml', '.txt'].includes(ext);
            })
            .map(file => {
                const filePath = path.join(codeDir, file);
                const stats = fs.statSync(filePath);
                
                return {
                    id: file.replace(/[^a-zA-Z0-9]/g, ''), // ID từ tên file
                    title: file,
                    description: `File ${path.extname(file).substring(1).toUpperCase()}`,
                    filename: file,
                    originalname: file,
                    size: stats.size,
                    uploadDate: stats.mtime.toISOString(),
                    socialLinks: {
                        facebook: 'https://facebook.com',
                        zalo: 'https://zalo.me',
                        tiktok: 'https://tiktok.com'
                    }
                };
            });

        res.json(fileList);
    } catch (error) {
        console.error('Error reading files:', error);
        res.status(500).json({ error: 'Lỗi khi đọc danh sách file' });
    }
});

// API để tải file xuống
app.get('/api/download/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(codeDir, filename);
    
    if (fs.existsSync(filePath)) {
        res.download(filePath, filename);
    } else {
        res.status(404).json({ error: 'File không tồn tại' });
    }
});

// API để xem nội dung file
app.get('/api/view/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(codeDir, filename);
    
    if (fs.existsSync(filePath)) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            res.json({ 
                filename: filename,
                content: content,
                success: true 
            });
        } catch (error) {
            console.error('Error reading file:', error);
            res.status(500).json({ error: 'Lỗi khi đọc file' });
        }
    } else {
        res.status(404).json({ error: 'File không tồn tại' });
    }
});

// API để lấy background image
app.get('/api/background', (req, res) => {
    try {
        if (!fs.existsSync(backgroundDir)) {
            return res.json({ background: null });
        }

        const files = fs.readdirSync(backgroundDir);
        const imageFiles = files.filter(file => {
            const ext = path.extname(file).toLowerCase();
            return ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);
        });

        if (imageFiles.length > 0) {
            // Lấy ảnh đầu tiên tìm thấy
            return res.json({ background: `background/${imageFiles[0]}` });
        }

        res.json({ background: null });
    } catch (error) {
        console.error('Error loading background:', error);
        res.json({ background: null });
    }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Web server đang chạy tại http://localhost:${PORT}`);
    console.log(`📁 Thư mục code: ${codeDir}`);
    console.log(`🎨 Thư mục background: ${backgroundDir}`);
});