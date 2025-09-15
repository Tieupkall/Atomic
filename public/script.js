document.addEventListener('DOMContentLoaded', function() {
    const filesList = document.getElementById('filesList');

    // Load files và background khi trang được tải
    loadFiles();
    loadBackground();

    // Hàm tải danh sách file
    async function loadFiles() {
        try {
            const response = await fetch('/api/files');
            const files = await response.json();
            
            displayFiles(files);
        } catch (error) {
            console.error('Error loading files:', error);
            showMessage('Không thể tải danh sách file', 'error');
        }
    }

    // Hiển thị danh sách file
    function displayFiles(files) {
        if (files.length === 0) {
            filesList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-folder-open"></i>
                    <h3>Chưa có file code nào</h3>
                    <p>Hãy thêm file code vào thư mục public/code để hiển thị tại đây!</p>
                </div>
            `;
            return;
        }

        filesList.innerHTML = files.map(file => `
            <div class="file-card">
                <div class="file-header">
                    <div class="file-info">
                        <h3><i class="fas fa-file-code"></i> ${escapeHtml(file.title)}</h3>
                        <div class="file-meta">
                            <span><i class="fas fa-calendar"></i> ${formatDate(file.uploadDate)}</span>
                            <span><i class="fas fa-weight"></i> ${formatFileSize(file.size)}</span>
                            <span><i class="fas fa-file"></i> ${escapeHtml(file.originalname)}</span>
                        </div>
                        ${file.description ? `<div class="file-description">${escapeHtml(file.description)}</div>` : ''}
                    </div>
                </div>
                
                <div class="file-actions">
                    <button onclick="viewFile('${file.filename}')" class="btn btn-view">
                        <i class="fas fa-eye"></i> Xem Code
                    </button>
                    <a href="/api/download/${file.filename}" class="btn btn-download">
                        <i class="fas fa-download"></i> Tải xuống
                    </a>
                </div>
            </div>
        `).join('');
    }


    // Xem nội dung file
    window.viewFile = async function(filename) {
        try {
            showMessage('Đang tải nội dung file...', 'info');
            
            const response = await fetch(`/api/view/${filename}`);
            const result = await response.json();

            if (result.success) {
                document.getElementById('viewerFileName').textContent = filename;
                document.getElementById('fileContent').textContent = result.content;
                document.getElementById('fileViewer').style.display = 'flex';
                
                // Lưu nội dung để copy
                window.currentFileContent = result.content;
                
                // Xóa thông báo loading
                const existingMessage = document.querySelector('.message');
                if (existingMessage) {
                    existingMessage.remove();
                }
            } else {
                showMessage(result.error || 'Có lỗi xảy ra khi đọc file', 'error');
            }
        } catch (error) {
            console.error('View file error:', error);
            showMessage('Lỗi kết nối. Vui lòng thử lại!', 'error');
        }
    };

    // Đóng file viewer
    window.closeFileViewer = function() {
        document.getElementById('fileViewer').style.display = 'none';
    };

    // Copy code
    window.copyCode = async function() {
        try {
            await navigator.clipboard.writeText(window.currentFileContent);
            showMessage('Đã sao chép code vào clipboard!', 'success');
        } catch (error) {
            console.error('Copy error:', error);
            // Fallback cho trình duyệt không hỗ trợ clipboard API
            const textArea = document.createElement('textarea');
            textArea.value = window.currentFileContent;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            showMessage('Đã sao chép code vào clipboard!', 'success');
        }
    };

    // Đóng modal khi click bên ngoài
    document.getElementById('fileViewer').addEventListener('click', function(e) {
        if (e.target === this) {
            closeFileViewer();
        }
    });

    // Mở liên kết mạng xã hội
    window.openSocialLink = function(url) {
        window.open(url, '_blank');
    };

    // Hiển thị thông báo
    function showMessage(message, type) {
        // Xóa thông báo cũ nếu có
        const existingMessage = document.querySelector('.message');
        if (existingMessage) {
            existingMessage.remove();
        }

        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;
        let iconClass = 'fas fa-info-circle';
        
        if (type === 'success') iconClass = 'fas fa-check-circle';
        else if (type === 'error') iconClass = 'fas fa-exclamation-circle';
        
        messageDiv.innerHTML = `
            <i class="${iconClass}"></i>
            ${message}
        `;

        // Thêm vào đầu container
        const container = document.querySelector('.container');
        container.insertBefore(messageDiv, container.firstChild);

        // Tự động xóa sau 5 giây
        setTimeout(() => {
            if (messageDiv.parentNode) {
                messageDiv.remove();
            }
        }, 5000);

        // Cuộn lên top để xem thông báo
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Utility functions
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleString('vi-VN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Hàm load background
    async function loadBackground() {
        try {
            const response = await fetch('/api/background');
            const result = await response.json();
            
            if (result.background) {
                // Áp dụng background cho files section và file viewer header
                document.documentElement.style.setProperty('--background-url', `url('${result.background}')`);
                
                // Cũng áp dụng trực tiếp vào style để đảm bảo hoạt động
                const filesSection = document.querySelector('.files-section');
                if (filesSection) {
                    const beforeElement = window.getComputedStyle(filesSection, '::before');
                    filesSection.style.setProperty('--bg-image', `url('${result.background}')`);
                }
                
                console.log('Background loaded:', result.background);
            } else {
                console.log('No background found');
            }
        } catch (error) {
            console.error('Error loading background:', error);
        }
    }

    // Auto-refresh files và background every 30 seconds
    setInterval(() => {
        loadFiles();
        loadBackground();
    }, 30000);
});