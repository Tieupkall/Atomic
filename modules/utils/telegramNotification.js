
const axios = require('axios');
const fs = require('fs');

class TelegramNotifier {
    constructor() {
        this.botToken = process.env.TOKEN;
        this.chatId = process.env.ID;
        this.isEnabled = this.botToken && this.chatId;
    }

    async sendNotification(message) {
        if (!this.isEnabled) {
            console.log('⚠️ [TELEGRAM] Token hoặc ID chưa được cấu hình');
            return false;
        }

        try {
            const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
            const data = {
                chat_id: this.chatId,
                text: message,
                parse_mode: 'HTML'
            };

            const response = await axios.post(url, data);
            console.log('✅ [TELEGRAM] Gửi thông báo thành công');
            return true;
        } catch (error) {
            console.error('❌ [TELEGRAM] Lỗi gửi thông báo:', error.message);
            return false;
        }
    }

    async sendAppstateError(errorDetails) {
        const timestamp = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
        
        const message = `
🚨 <b>CẢNH BÁO APPSTATE LỖI</b> 🚨

⏰ <b>Thời gian:</b> ${timestamp}
🤖 <b>Bot:</b> Facebook Chatbot
❌ <b>Lỗi:</b> Appstate đã bị lỗi hoặc hết hạn

📝 <b>Chi tiết:</b>
${errorDetails || 'Cookie đã bị lỗi, cần thay AppState mới'}

🔧 <b>Hướng dẫn khắc phục:</b>
1. Vào trình duyệt ẩn danh
2. Đăng nhập Facebook
3. Lấy AppState mới
4. Thay thế trong file appstate.json

⚡ <b>Trạng thái bot:</b> Đã dừng hoạt động
        `.trim();

        return await this.sendNotification(message);
    }

    async sendBackupError() {
        const timestamp = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
        
        const message = `
🔥 <b>LỖI NGHIÊM TRỌNG - BACKUP THẤT BẠI</b> 🔥

⏰ <b>Thời gian:</b> ${timestamp}
🤖 <b>Bot:</b> Facebook Chatbot
💥 <b>Lỗi:</b> Backup AppState thất bại

📝 <b>Tình trạng:</b>
- AppState chính bị lỗi
- Backup cũng không khả dụng
- Bot không thể khôi phục

🆘 <b>CẦN XỬ LÝ NGAY:</b>
1. Kiểm tra file appstate.json
2. Lấy AppState mới từ trình duyệt
3. Khởi động lại bot
        `.trim();

        return await this.sendNotification(message);
    }

    async sendLoginError(error) {
        const timestamp = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
        
        const message = `
⚠️ <b>LỖI ĐĂNG NHẬP</b> ⚠️

⏰ <b>Thời gian:</b> ${timestamp}
🤖 <b>Bot:</b> Facebook Chatbot
🔐 <b>Lỗi:</b> ${error}

💡 <b>Khuyến nghị:</b>
Kiểm tra AppState và thử lại
        `.trim();

        return await this.sendNotification(message);
    }
}

module.exports = new TelegramNotifier();
