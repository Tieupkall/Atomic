
const fs = require('fs-extra');
const path = require('path');

/**
 * Wrapper function để đổi theme và lưu theme ID
 */
async function changeThemeAndTrack(api, themeId, threadID) {
    try {
        // Đổi theme
        await new Promise((resolve, reject) => {
            api.changeThreadColor(themeId, threadID, (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        });
        
        // Lưu theme ID vào tracking file
        await saveThemeId(themeId, threadID);
        
        return {
            success: true,
            themeId: themeId,
            message: `Đã đổi theme thành công! Theme ID: ${themeId}`
        };
        
    } catch (error) {
        return {
            success: false,
            error: error.message,
            message: `Không thể đổi theme! Lỗi: ${error.message}`
        };
    }
}

/**
 * Lưu theme ID vào file tracking
 */
async function saveThemeId(themeId, threadID, changedBy = 'system') {
    try {
        const historyPath = path.join(__dirname, '../data/theme_history.json');
        
        // Đảm bảo file tồn tại
        await fs.ensureFile(historyPath);
        
        // Đọc dữ liệu hiện tại
        let historyData = {};
        
        try {
            historyData = await fs.readJson(historyPath);
        } catch (e) {
            historyData = {};
        }
        
        // Khởi tạo array cho thread nếu chưa có
        if (!historyData[threadID]) {
            historyData[threadID] = [];
        }
        
        // Kiểm tra xem theme ID đã tồn tại chưa
        if (historyData[threadID].includes(themeId)) {
            console.log(`📝 [THEME_TRACKER] Theme ID ${themeId} đã tồn tại, không lưu lại`);
            return true;
        }
        
        // Thêm theme ID vào danh sách
        historyData[threadID].push(themeId);
        
        // Lưu file
        await fs.writeJson(historyPath, historyData, { spaces: 2 });
        
        console.log(`📝 [THEME_TRACKER] Đã lưu theme ID: ${themeId} cho thread: ${threadID}`);
        
        return true;
    } catch (error) {
        console.error(`❌ [THEME_TRACKER] Lỗi khi lưu theme ID:`, error);
        return false;
    }
}

/**
 * Lấy lịch sử theme của thread
 */
async function getThemeHistory(threadID) {
    try {
        const historyPath = path.join(__dirname, '../data/theme_history.json');
        
        if (!await fs.pathExists(historyPath)) {
            return [];
        }
        
        const historyData = await fs.readJson(historyPath);
        return historyData[threadID] || [];
    } catch (error) {
        console.error(`❌ [THEME_TRACKER] Lỗi khi đọc lịch sử:`, error);
        return [];
    }
}

/**
 * Lấy theme hiện tại của thread
 */
async function getCurrentTheme(threadID) {
    try {
        const themePath = path.join(__dirname, '../modules/commands/cache/data/theme_tracking.json');
        
        if (!await fs.pathExists(themePath)) {
            return null;
        }
        
        const themeData = await fs.readJson(themePath);
        return themeData[threadID]?.currentTheme || null;
    } catch (error) {
        console.error(`❌ [THEME_TRACKER] Lỗi khi đọc theme hiện tại:`, error);
        return null;
    }
}

module.exports = { 
    changeThemeAndTrack,
    saveThemeId,
    getThemeHistory,
    getCurrentTheme
};
