
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SEPAY_CONFIG = {
    enabled: true,
    webhook_url: 'https://a8ca3f9d-1c82-427f-af65-527852aaff4c-00-d746hw7ljei6.sisko.replit.dev',
    target_thread: '6691735800885668',
    webhook_secret: null
};

function loadSepayConfig() {
    return { ...SEPAY_CONFIG };
}

function updateSepayConfig(updates) {
    Object.assign(SEPAY_CONFIG, updates);
}

function verifyWebhookSignature(payload, signature, secret) {
    if (!secret || !signature) return false;
    const expectedSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return signature === expectedSignature || signature === `sha256=${expectedSignature}`;
}

function formatSepayNotification(jsonData) {
    const thoiGian = jsonData.thoi_gian || new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    const soTaiKhoan = jsonData.so_tai_khoan || 'Không có';
    const tenTaiKhoan = jsonData.ten_tai_khoan || 'Không có';
    const soTien = jsonData.so_tien || 0;
    const noiDung = jsonData.noi_dung || 'Không có';
    const maGiaoDich = jsonData.ma_giao_dich || 'Không có';
    const nganHang = jsonData.ngan_hang || 'Không có';
    const icon = soTien > 0 ? '💰' : '💸';
    const typeText = soTien > 0 ? 'TIỀN VÀO' : 'TIỀN RA';
    let message = `${icon} SEPAY WEBHOOK - ${typeText}\n`;
    message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    message += `⏰ Thời gian: ${thoiGian}\n`;
    message += `🏦 Số tài khoản: ${soTaiKhoan}\n`;
    message += `👤 Tên tài khoản: ${tenTaiKhoan}\n`;
    message += `💵 Số tiền: ${soTien.toLocaleString()} VND\n`;
    message += `📝 Nội dung: ${noiDung}\n`;
    message += `🔖 Mã giao dịch: ${maGiaoDich}\n`;
    message += `🏧 Ngân hàng: ${nganHang}\n`;
    message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n💳 Sepay Payment Gateway`;
    return message;
}

function saveSepayRequest(req, data) {
    try {
        const requestPath = path.join(__dirname, '..', '..', 'data', 'sepay', 'sepay.json');
        const dir = path.dirname(requestPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        let requests = [];
        if (fs.existsSync(requestPath)) {
            const content = fs.readFileSync(requestPath, 'utf8');
            requests = JSON.parse(content);
        }
        const simpleData = {
            thoi_gian: new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
            so_tai_khoan: data.account_number || data.accountNumber || 'Không có',
            ten_tai_khoan: data.account_name || 'Không có',
            so_tien: data.amount || data.transferAmount || 0,
            noi_dung: data.content || data.description || 'Không có',
            ma_giao_dich: data.reference_code || data.referenceCode || 'Không có',
            ngan_hang: data.bank_brand || data.gateway || 'Không có'
        };
        const referenceCode = simpleData.ma_giao_dich;
        const isDuplicate = requests.some(req => req.ma_giao_dich === referenceCode && referenceCode !== 'Không có');
        if (isDuplicate) return null;
        requests.push(simpleData);
        if (requests.length > 500) requests = requests.slice(-500);
        fs.writeFileSync(requestPath, JSON.stringify(requests, null, 2), 'utf8');
        return simpleData;
    } catch (error) {
        console.error('[SEPAY] Lỗi lưu request:', error.message);
        return null;
    }
}

function saveSepayTransaction(data) {
    try {
        const transactionPath = path.join(__dirname, '..', '..', 'data', 'sepay', 'sepay_transactions.json');
        const dir = path.dirname(transactionPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        let transactions = [];
        if (fs.existsSync(transactionPath)) {
            const content = fs.readFileSync(transactionPath, 'utf8');
            transactions = JSON.parse(content);
        }
        const transaction = {
            ...data,
            processed_at: new Date().toISOString(),
            vietnam_time: new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
        };
        transactions.push(transaction);
        if (transactions.length > 1000) transactions = transactions.slice(-1000);
        fs.writeFileSync(transactionPath, JSON.stringify(transactions, null, 2), 'utf8');
        return transaction;
    } catch (error) {
        console.error('[SEPAY] Lỗi lưu giao dịch:', error.message);
        return null;
    }
}

function handleSepayWebhook(req, res, api) {
    try {
        console.log('🔔 [SEPAY WEBHOOK] Đã nhận request webhook từ Sepay');
        
        const config = loadSepayConfig();
        if (!config.enabled) return res.status(403).json({ success: false, message: 'Sepay webhook không được kích hoạt' });
        const payload = JSON.stringify(req.body);
        const signature = req.headers['x-sepay-signature'] || req.headers['sepay-signature'];
        if (config.webhook_secret && signature) {
            if (!verifyWebhookSignature(payload, signature, config.webhook_secret)) {
                console.error('[SEPAY WEBHOOK] Signature không hợp lệ');
                return res.status(401).json({ success: false, message: 'Signature không hợp lệ' });
            }
        }
        const data = req.body;
        const savedData = saveSepayRequest(req, data);
        if (!data.transferAmount && !data.amount && !data.transaction_code) {
            return res.status(400).json({ success: false, message: 'Dữ liệu webhook không hợp lệ' });
        }
        const savedTransaction = saveSepayTransaction(data);
        if (savedData) {
            const notification = formatSepayNotification(savedData);
            if (api && config.target_thread) {
                api.sendMessage(notification, config.target_thread, (err) => {
                    if (err) console.error('[SEPAY WEBHOOK] Lỗi gửi tin nhắn:', err);
                });
            }
        }
        res.status(200).json({ 
            success: true, 
            message: 'Webhook processed successfully',
            transaction_id: savedTransaction?.reference_code || data.transaction_code
        });
    } catch (error) {
        console.error('[SEPAY WEBHOOK] Lỗi:', error.message);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
}

function getBankInfo() {
    const config = loadSepayConfig();
    return {
        webhook_url: `${config.webhook_url}/sepay/webhook`,
        target_thread: config.target_thread,
        status: config.enabled ? 'Kích hoạt' : 'Tắt'
    };
}

// Export functions
module.exports = {
    loadSepayConfig,
    updateSepayConfig,
    verifyWebhookSignature,
    formatSepayNotification,
    saveSepayRequest,
    saveSepayTransaction,
    handleSepayWebhook,
    getBankInfo
};
