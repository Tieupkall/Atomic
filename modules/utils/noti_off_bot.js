const https = require('https');
const process = require('process');

class TelegramNotifier {
    constructor(botToken, chatId) {
        this.botToken = botToken;
        this.chatId = chatId;
    }

    async sendMessage(message) {
        return new Promise((resolve, reject) => {
            if (!this.botToken || !this.chatId) {
                resolve(false);
                return;
            }

            const data = JSON.stringify({
                chat_id: this.chatId,
                text: message,
                parse_mode: 'HTML'
            });

            const options = {
                hostname: 'api.telegram.org',
                port: 443,
                path: `/bot${this.botToken}/sendMessage`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(data)
                }
            };

            const req = https.request(options, (res) => {
                let responseData = '';
                
                res.on('data', (chunk) => {
                    responseData += chunk;
                });
                
                res.on('end', () => {
                    try {
                        const response = JSON.parse(responseData);
                        
                        if (res.statusCode === 200 && response.ok) {
                            resolve(true);
                        } else {
                            resolve(false);
                        }
                    } catch (parseError) {
                        resolve(false);
                    }
                });
            });

            req.on('error', (error) => {
                resolve(false);
            });

            req.write(data);
            req.end();
        });
    }
}

class ReplitMonitor {
    constructor(telegramNotifier) {
        this.notifier = telegramNotifier;
        this.isRunning = true;
        this.startTime = new Date();
        this.heartbeatInterval = null;
    }

    getVietnameTime() {
        return new Date().toLocaleString('vi-VN', { 
            timeZone: 'Asia/Ho_Chi_Minh',
            year: 'numeric',
            month: '2-digit', 
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }

    getUptime() {
        const uptimeMs = Date.now() - this.startTime.getTime();
        const days = Math.floor(uptimeMs / (1000 * 60 * 60 * 24));
        const hours = Math.floor((uptimeMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((uptimeMs % (1000 * 60)) / 1000);
        
        let uptimeStr = '';
        if (days > 0) uptimeStr += `${days}d `;
        if (hours > 0 || days > 0) uptimeStr += `${hours}h `;
        if (minutes > 0 || hours > 0 || days > 0) uptimeStr += `${minutes}m `;
        uptimeStr += `${seconds}s`;
        
        return uptimeStr.trim();
    }

    startHeartbeat() {
        this.heartbeatInterval = setInterval(async () => {
            if (this.isRunning) {
                const uptime = this.getUptime();
                const memoryUsage = process.memoryUsage();
                const memoryMB = Math.round(memoryUsage.rss / 1024 / 1024);
                
                const message = `
🟢 <b>UPTIME REPORT</b>
📅 Thời gian: ${this.getVietnameTime()}
⏱️ Uptime: ${uptime}
💾 Memory: ${memoryMB} MB
                `;
                
                await this.notifier.sendMessage(message.trim());
            }
        }, 3600000); // Gửi mỗi 1 tiếng
    }

    async startMonitoring() {
        // Gửi thông báo khởi động đơn giản
        const message = `
🟢 <b>BOT STARTED</b>
📅 ${this.getVietnameTime()}
⏱️ Uptime tracking begins...
        `;
        
        await this.notifier.sendMessage(message.trim());
        
        this.startHeartbeat();
        
        const keepAlive = () => {
            if (this.isRunning) {
                setTimeout(keepAlive, 1000);
            }
        };
        keepAlive();
    }
}

async function main() {
    require('dotenv').config();
    const BOT_TOKEN = process.env.TOKEN;
    const CHAT_ID = process.env.ID;
    
    if (!BOT_TOKEN || !CHAT_ID || BOT_TOKEN === "YOUR_BOT_TOKEN_HERE" || CHAT_ID === "YOUR_CHAT_ID_HERE") {
        console.log("❌ Vui lòng cấu hình BOT_TOKEN và CHAT_ID trước khi chạy!");
        console.log("\n📝 Hướng dẫn cấu hình:");
        console.log("1. Tạo bot mới với @BotFather trên Telegram");
        console.log("2. Lấy bot token từ @BotFather");
        console.log("3. Lấy chat ID từ @userinfobot hoặc @get_id_bot");
        console.log("4. Thay thế YOUR_BOT_TOKEN_HERE và YOUR_CHAT_ID_HERE trong code");
        console.log("\n📦 Cài đặt: npm install (không cần thư viện thêm)");
        process.exit(1);
    }
    
    const notifier = new TelegramNotifier(BOT_TOKEN, CHAT_ID);
    const monitor = new ReplitMonitor(notifier);
    
    await monitor.startMonitoring();
}

if (require.main === module) {
    main().catch(error => {
        console.error('💥 Lỗi khởi động:', error);
        process.exit(1);
    });
}

module.exports = { TelegramNotifier, ReplitMonitor };