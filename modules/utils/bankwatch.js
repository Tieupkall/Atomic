
const fs = require('fs');
const path = require('path');
const { BANK } = require('./qr.js');

let watchInterval = null;
let lastTransactionCount = 0;
global.sepayWatcher = {
    processedTransactions: new Set(),
    isWatcherRunning: false,
    watcherApi: null
};
const TARGET_THREAD = '6691735800885668';
const SEPAY_FILE_PATH = path.join(__dirname, '..', '..', 'data', 'sepay', 'sepay.json');
const RENT_FILE_PATH = path.join(__dirname, '../commands/cache', 'data', 'thuebot.json');
const BANK_FILE_PATH = path.join(__dirname, '..', '..', 'data', 'sepay', 'bank.json');

const AUTO_CONFIG = {
    rent_price: BANK.defaultAmount,
    rent_days: 30,
    enabled: true,
    auto_approve: true,
    max_transactions_keep: 50,
    cleanup_threshold: 100
};

const ADMIN_NAMES = {};

function loadRentData() {
    try {
        const dir = path.dirname(RENT_FILE_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        if (!fs.existsSync(RENT_FILE_PATH)) {
            fs.writeFileSync(RENT_FILE_PATH, JSON.stringify([], null, 2), "utf-8");
            return [];
        }
        const data = fs.readFileSync(RENT_FILE_PATH, "utf-8");
        return JSON.parse(data);
    } catch (error) {
        console.error('[SEPAY WATCH] Lỗi đọc file thuebot.json:', error);
        return [];
    }
}

function saveRentData(data) {
    try {
        const dir = path.dirname(RENT_FILE_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(RENT_FILE_PATH, JSON.stringify(data, null, 2), "utf-8");
        return true;
    } catch (error) {
        console.error('[SEPAY WATCH] Lỗi lưu file thuebot.json:', error);
        return false;
    }
}

function loadBankData() {
    try {
        if (!fs.existsSync(BANK_FILE_PATH)) {
            fs.writeFileSync(BANK_FILE_PATH, JSON.stringify([], null, 2), "utf-8");
            return [];
        }
        const data = fs.readFileSync(BANK_FILE_PATH, "utf-8");
        return JSON.parse(data);
    } catch (error) {
        console.error('[SEPAY WATCH] Lỗi đọc file bank.json:', error);
        return [];
    }
}

function saveBankData(data) {
    try {
        fs.writeFileSync(BANK_FILE_PATH, JSON.stringify(data, null, 2), "utf-8");
        return true;
    } catch (error) {
        console.error('[SEPAY WATCH] Lỗi lưu file bank.json:', error);
        return false;
    }
}

function autoApproveBox(api, threadId, amount, transactionContent) {
    const correctPrice = BANK.defaultAmount;
    if (amount < correctPrice) return false;
    let thuebot = loadRentData();
    const now = Date.now();
    thuebot = thuebot.filter(item => new Date(item.expiresAt).getTime() > now);
    const existingEntry = thuebot.find(item => item.t_id === threadId);
    if (existingEntry) {
        const currentExpireTime = new Date(existingEntry.expiresAt).getTime();
        const remainingTime = Math.max(0, currentExpireTime - now);
        const additionalMs = AUTO_CONFIG.rent_days * 24 * 60 * 60 * 1000;
        const newExpireTime = now + remainingTime + additionalMs;
        const totalRemainingMs = newExpireTime - now;
        const totalDays = Math.floor(totalRemainingMs / (24 * 60 * 60 * 1000));
        const totalHours = Math.floor((totalRemainingMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
        let totalTimeText = "";
        if (totalDays > 0) totalTimeText += `${totalDays} ngày`;
        if (totalHours > 0 && totalDays === 0) {
            if (totalTimeText) totalTimeText += " ";
            totalTimeText += `${totalHours} giờ`;
        }
        const updatedEntry = {
            ...existingEntry,
            expiresAt: new Date(newExpireTime).toISOString(),
            durationText: totalTimeText || "dưới 1 giờ",
            time_end: new Date(newExpireTime).toLocaleDateString('vi-VN'),
            lastExtended: new Date().toISOString(),
            totalExtensions: (existingEntry.totalExtensions || 0) + 1
        };
        const index = thuebot.findIndex(item => item.t_id === threadId);
        thuebot[index] = updatedEntry;
        if (saveRentData(thuebot)) {
            try {
                const botID = api.getCurrentUserID();
                const botName = global.config.BOTNAME || "Bot";
                const prefix = global.config.PREFIX || "/";
                api.changeNickname(`[ ${prefix} ] • ${botName} | ${totalTimeText || "dưới 1 giờ"}`, threadId, botID);
            } catch (e) {
                console.error('[SEPAY WATCH] Lỗi đổi nickname:', e);
            }
            return "extended";
        }
        return false;
    }
    const totalMs = AUTO_CONFIG.rent_days * 24 * 60 * 60 * 1000;
    const expireTime = now + totalMs;
    const newEntry = {
        t_id: threadId,
        groupName: `Auto Approved - Thread ${threadId}`,
        expiresAt: new Date(expireTime).toISOString(),
        createdAt: new Date(now).toISOString(),
        durationText: `${AUTO_CONFIG.rent_days} ngày`,
        durationDays: AUTO_CONFIG.rent_days,
        durationMinutes: 0,
        time_end: new Date(expireTime).toLocaleDateString('vi-VN'),
        autoApproved: true,
        transactionContent: transactionContent,
        amount: amount
    };
    thuebot.push(newEntry);
    if (saveRentData(thuebot)) {
        try {
            const botID = api.getCurrentUserID();
            const botName = global.config.BOTNAME || "Bot";
            const prefix = global.config.PREFIX || "/";
            api.changeNickname(`[ ${prefix} ] • ${botName} | ${AUTO_CONFIG.rent_days} ngày`, threadId, botID);
        } catch (e) {
            console.error('[SEPAY WATCH] Lỗi đổi nickname:', e);
        }
        return true;
    }
    return false;
}

function extractThreadIdFromContent(content) {
    // Function disabled - no longer extract thread ID from content
    return null;
}

function findThreadByCode(content) {
    try {
        const bankData = loadBankData();
        if (!Array.isArray(bankData)) return null;
        
        // Tìm code trong nội dung chuyển khoản
        for (const bankItem of bankData) {
            if (bankItem.code && content.includes(bankItem.code)) {
                console.log(`[SEPAY WATCH] Tìm thấy code ${bankItem.code} trong nội dung: ${content}`);
                return {
                    threadID: bankItem.threadID,
                    code: bankItem.code
                };
            }
        }
        return null;
    } catch (error) {
        console.error('[SEPAY WATCH] Lỗi tìm thread từ code:', error);
        return null;
    }
}

function removeFromBank(threadID, code) {
    try {
        let bankData = loadBankData();
        const initialLength = bankData.length;
        
        bankData = bankData.filter(item => !(item.threadID === threadID && item.code === code));
        
        if (bankData.length < initialLength) {
            saveBankData(bankData);
            console.log(`[SEPAY WATCH] Đã xóa threadID ${threadID} với code ${code} khỏi bank.json`);
            return true;
        }
        return false;
    } catch (error) {
        console.error('[SEPAY WATCH] Lỗi xóa khỏi bank.json:', error);
        return false;
    }
}

function formatNewTransactionNotification(transaction) {
    let message = `ĐÃ NHẬN ĐƯỢC GIAO DỊCH\n`;
    message += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    message += `⏰ Thời gian: ${transaction.thoi_gian}\n`;
    message += `💵 Số tiền: ${transaction.so_tien.toLocaleString()} VND\n`;
    message += `📝 Nội dung: ${transaction.noi_dung}\n`;
    message += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    return message;
}

function createAdminMentions(adminIDs) {
    const mentions = [];
    let tagString = '';
    let currentIndex = 0;
    adminIDs.forEach((adminID, index) => {
        const adminName = ADMIN_NAMES[adminID] || 'Admin';
        const tag = `@${adminName}`;
        if (index > 0) {
            tagString += ' ';
            currentIndex += 1;
        }
        mentions.push({ tag, id: adminID, fromIndex: currentIndex });
        tagString += tag;
        currentIndex += tag.length;
    });
    return { mentions, tagString };
}

function checkForNewTransactions(api) {
    try {
        if (!fs.existsSync(SEPAY_FILE_PATH)) return;
        const data = JSON.parse(fs.readFileSync(SEPAY_FILE_PATH, 'utf8'));
        if (!Array.isArray(data)) return;
        const currentCount = data.length;
        if (currentCount > lastTransactionCount && lastTransactionCount > 0) {
            const newTransactions = data.slice(lastTransactionCount);
            const unprocessedTransactions = newTransactions.filter(transaction => {
                const transactionKey = transaction.referenceCode || `${transaction.ma_giao_dich}_${transaction.thoi_gian}`;
                if (global.sepayWatcher.processedTransactions.has(transactionKey)) return false;
                global.sepayWatcher.processedTransactions.add(transactionKey);
                return true;
            });
            if (unprocessedTransactions.length === 0) {
                lastTransactionCount = currentCount;
                return;
            }
            unprocessedTransactions.forEach((transaction, index) => {
                setTimeout(() => {
                    const bankMatch = findThreadByCode(transaction.noi_dung);
                    
                    let targetThreadId = null;
                    let isFromBank = false;
                    
                    if (bankMatch) {
                        targetThreadId = bankMatch.threadID;
                        isFromBank = true;
                        console.log(`🔔 [SEPAY] ${transaction.so_tien.toLocaleString()}₫ - Code từ bank.json: ${bankMatch.code} -> TID: ${targetThreadId}`);
                    } else {
                        console.log(`🔔 [SEPAY] ${transaction.so_tien.toLocaleString()}₫ - Không tìm thấy code hợp lệ`);
                    }

                    const notification = formatNewTransactionNotification(transaction);

                    if (targetThreadId) {
                        api.sendMessage(notification, targetThreadId, (err) => {
                            if (err) {
                                console.error('[SEPAY WATCH] Lỗi gửi thông báo giao dịch:', err);
                            } else {
                                setTimeout(() => {
                                    if (transaction.so_tien > 0) {
                                        const autoResult = autoApproveBox(api, targetThreadId, transaction.so_tien, transaction.noi_dung);
                                        if (autoResult === "extended") {
                                            setTimeout(() => {
                                                const extensionNotification = `🔄 TỰ ĐỘNG GIA HẠN THÀNH CÔNG!\n━━━━━━━━━━━━━━━━━━━━━━\n✅ Box ${targetThreadId} đã được gia hạn thêm ${AUTO_CONFIG.rent_days} ngày`;
                                                api.sendMessage(extensionNotification, targetThreadId, (err) => {
                                                    if (err) console.error('[SEPAY WATCH] Lỗi gửi thông báo gia hạn:', err);
                                                });
                                                
                                                // Xóa khỏi bank.json nếu là từ bank
                                                if (isFromBank && bankMatch) {
                                                    removeFromBank(bankMatch.threadID, bankMatch.code);
                                                }
                                            }, 1000);
                                        } else if (autoResult === true) {
                                            setTimeout(() => {
                                                const approvalNotification = `🎉 TỰ ĐỘNG DUYỆT THÀNH CÔNG!\n━━━━━━━━━━━━━━━━━━━━━━\n✅ Box ${targetThreadId} đã được duyệt ${AUTO_CONFIG.rent_days} ngày\n💰 Số tiền: ${transaction.so_tien.toLocaleString()} VND\n⏰ Hết hạn: ${new Date(Date.now() + AUTO_CONFIG.rent_days * 24 * 60 * 60 * 1000).toLocaleDateString('vi-VN')}`;
                                                api.sendMessage(approvalNotification, targetThreadId, (err) => {
                                                    if (err) console.error('[SEPAY WATCH] Lỗi gửi thông báo duyệt:', err);
                                                });
                                                
                                                // Xóa khỏi bank.json nếu là từ bank  
                                                if (isFromBank && bankMatch) {
                                                    removeFromBank(bankMatch.threadID, bankMatch.code);
                                                }
                                            }, 1000);
                                        }
                                    }
                                }, 2000);
                            }
                        });
                    } else {
                        const adminIDs = global.config.ADMINBOT || [];
                        if (adminIDs.length > 0) {
                            const { mentions, tagString } = createAdminMentions(adminIDs);
                            const errorNotification = `${tagString}\n\n⚠️ Giao dịch có nội dung sai format:\n\n${notification}`;
                            api.sendMessage({ body: errorNotification, mentions }, TARGET_THREAD, (err) => {
                                if (err) console.error('[SEPAY WATCH] Lỗi gửi thông báo giao dịch:', err);
                            });
                        } else {
                            const errorNotification = `⚠️ Giao dịch có nội dung sai format:\n\n${notification}`;
                            api.sendMessage(errorNotification, TARGET_THREAD, (err) => {
                                if (err) console.error('[SEPAY WATCH] Lỗi gửi thông báo giao dịch:', err);
                            });
                        }
                    }
                }, index * 1000);
            });
        }
        lastTransactionCount = currentCount;
        if (data.length >= AUTO_CONFIG.cleanup_threshold) {
            try {
                const trimmedData = data.slice(-AUTO_CONFIG.max_transactions_keep);
                fs.writeFileSync(SEPAY_FILE_PATH, JSON.stringify(trimmedData, null, 2), 'utf8');
                lastTransactionCount = trimmedData.length;
                global.sepayWatcher.processedTransactions.clear();
                trimmedData.forEach(transaction => {
                    const transactionKey = transaction.referenceCode || `${transaction.ma_giao_dich}_${transaction.thoi_gian}`;
                    global.sepayWatcher.processedTransactions.add(transactionKey);
                });
            } catch (error) {
                console.error('[SEPAY WATCH] Lỗi tự động dọn dẹp giao dịch:', error.message);
            }
        }
        if (global.sepayWatcher.processedTransactions.size > 1000) {
            const transactionsArray = Array.from(global.sepayWatcher.processedTransactions);
            global.sepayWatcher.processedTransactions.clear();
            transactionsArray.slice(-500).forEach(key => global.sepayWatcher.processedTransactions.add(key));
        }
    } catch (error) {
        console.error('[SEPAY WATCH] Lỗi kiểm tra giao dịch:', error.message);
    }
}

function startWatching(api) {
    if (watchInterval) {
        clearInterval(watchInterval);
        watchInterval = null;
    }
    global.sepayWatcher.isWatcherRunning = false;
    global.sepayWatcher.processedTransactions.clear();
    try {
        if (fs.existsSync(SEPAY_FILE_PATH)) {
            const data = JSON.parse(fs.readFileSync(SEPAY_FILE_PATH, 'utf8'));
            if (Array.isArray(data)) lastTransactionCount = data.length;
        }
    } catch {
        lastTransactionCount = 0;
    }
    watchInterval = setInterval(() => {
        checkForNewTransactions(api);
    }, 10000);
    global.sepayWatcher.isWatcherRunning = true;
    global.sepayWatcher.watcherApi = api;
}

function cleanup() {
    if (watchInterval) {
        clearInterval(watchInterval);
        watchInterval = null;
    }
    global.sepayWatcher.isWatcherRunning = false;
    global.sepayWatcher.watcherApi = null;
    global.sepayWatcher.processedTransactions.clear();
}

function getWatcherStatus() {
    return {
        isRunning: global.sepayWatcher.isWatcherRunning,
        transactionCount: lastTransactionCount,
        config: AUTO_CONFIG,
        targetThread: TARGET_THREAD
    };
}

// Export functions
module.exports = {
    loadRentData,
    saveRentData,
    loadBankData,
    saveBankData,
    autoApproveBox,
    extractThreadIdFromContent,
    findThreadByCode,
    removeFromBank,
    formatNewTransactionNotification,
    createAdminMentions,
    checkForNewTransactions,
    startWatching,
    cleanup,
    getWatcherStatus
};
