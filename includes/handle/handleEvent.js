const fs = require("fs");
const path = require("path");
const moment = require("moment");

module.exports = function ({ api, models, Users, Threads, Currencies }) {
	const logger = require("../../utils/log.js");

	const thuebotPath = path.join(__dirname, "../../modules/commands/cache/data/thuebot.json");
	const lastCheckPath = path.join(__dirname, "../../modules/commands/cache/data/lastCheck.json");
	const syncDataPath = path.join(__dirname, "../../modules/commands/cache/data/syncData.json");

	// Đảm bảo thư mục tồn tại
	const ensureDirectoryExists = () => {
		const dir = path.dirname(thuebotPath);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}
	};

	// ✅ Hàm đọc dữ liệu sync
	const readSyncData = () => {
		try {
			if (!fs.existsSync(syncDataPath)) {
				const defaultData = {
					lastSyncTime: null,
					syncInterval: 60000, // 1 phút
					syncCount: 0,
					createdAt: new Date().toISOString()
				};
				fs.writeFileSync(syncDataPath, JSON.stringify(defaultData, null, 2), "utf-8");
				return defaultData;
			}
			return JSON.parse(fs.readFileSync(syncDataPath, "utf-8"));
		} catch (error) {
			console.error("❌ [handleEvent] Lỗi đọc syncData.json:", error);
			return {
				lastSyncTime: null,
				syncInterval: 43200000, // 12 tiếng
				syncCount: 0,
				createdAt: new Date().toISOString()
			};
		}
	};

	// ✅ Hàm ghi dữ liệu sync
	const writeSyncData = (data) => {
		try {
			ensureDirectoryExists();
			fs.writeFileSync(syncDataPath, JSON.stringify(data, null, 2), "utf-8");
		} catch (error) {
			console.error("❌ [handleEvent] Lỗi ghi syncData.json:", error);
		}
	};

	// Hàm tính thời gian còn lại (đồng bộ với rent.js và upbot.js)
	const calculateTimeRemaining = (expiresAt) => {
		const now = Date.now();
		const expireTime = new Date(expiresAt).getTime();
		const remaining = expireTime - now;

		if (remaining <= 0) return null;

		const days = Math.floor(remaining / (24 * 60 * 60 * 1000));
		const hours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
		const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));

		let timeText = "";
		if (days > 0) timeText += `${days} ngày`;
		if (hours > 0) {
			if (timeText) timeText += " ";
			timeText += `${hours} giờ`;
		}
		if (minutes > 0 && days === 0) { // Chỉ hiện phút nếu dưới 1 ngày
			if (timeText) timeText += " ";
			timeText += `${minutes} phút`;
		}

		return timeText.trim() || "dưới 1 phút";
	};

	// ✅ Kiểm tra và xử lý nhóm hết hạn thuê bot
	async function checkExpiredRentGroups() {
		const botID = api.getCurrentUserID();
		const botName = global.config.BOTNAME || "Bot";

		ensureDirectoryExists();

		let thuebot;
		try {
			if (!fs.existsSync(thuebotPath)) {
				fs.writeFileSync(thuebotPath, JSON.stringify([], null, 2), "utf-8");
				thuebot = [];
			} else {
				thuebot = JSON.parse(fs.readFileSync(thuebotPath, "utf-8"));
			}
		} catch (err) {
			console.error("❌ [handleEvent] Lỗi đọc file thuebot.json:", err);
			return;
		}

		const now = Date.now();
		const expired = [];
		const soonExpired = [];
		const stillValid = [];

		// Phân loại các nhóm
		thuebot.forEach(item => {
			const expireTime = new Date(item.expiresAt).getTime();
			const remaining = expireTime - now;
			const hoursLeft = remaining / (60 * 60 * 1000);

			if (remaining <= 0) {
				expired.push(item);
			} else if (hoursLeft <= 24) {
				soonExpired.push({
					...item,
					timeLeft: calculateTimeRemaining(item.expiresAt)
				});
				stillValid.push(item);
			} else {
				stillValid.push(item);
			}
		});

		// Xử lý nhóm hết hạn
		for (const item of expired) {
			console.log(`[⏰] Nhóm ${item.groupName || item.t_id} đã hết hạn thuê bot (hết hạn lúc ${item.expiresAt}).`);
			try {
				await api.changeNickname(`${botName} | Chưa thuê`, item.t_id, botID);
				console.log(`✅ Đã đổi biệt danh nhóm ${item.groupName || item.t_id} thành "${botName} | Chưa thuê"`);

				// Delay nhỏ để tránh spam API
				await new Promise(resolve => setTimeout(resolve, 200));
			} catch (e) {
				console.error(`❌ Không thể đổi tên nhóm ${item.groupName || item.t_id}:`, e.message || e);
			}
		}

		// Thông báo cho admin về nhóm hết hạn
		if (expired.length > 0) {
			const adminIDs = global.config.ADMINBOT || [];
			const expiredMsg = `⚠️ CÓ ${expired.length} NHÓM ĐÃ HẾT HẠN THUÊ:\n\n` +
								expired.map((item, i) => 
								`${i + 1}. ${item.groupName || 'Không tên'}\n   ID: ${item.t_id}\n   Hết hạn: ${new Date(item.expiresAt).toLocaleString('vi-VN')}`
								).join('\n\n');

			for (const adminID of adminIDs) {
				try {
					await api.sendMessage(expiredMsg, adminID);
					await new Promise(resolve => setTimeout(resolve, 100));
				} catch (e) {
					console.error(`❌ Không thể gửi thông báo cho admin ${adminID}:`, e.message);
				}
			}
		}

		// Thông báo về nhóm sắp hết hạn (chỉ 1 lần/ngày)
		if (soonExpired.length > 0) {
			const adminIDs = global.config.ADMINBOT || [];
			const soonExpiredMsg = `🔔 CÓ ${soonExpired.length} NHÓM SẮP HẾT HẠN TRONG 24H:\n\n` +
									 soonExpired.map((item, i) => 
									 `${i + 1}. ${item.groupName || 'Không tên'}\n   ID: ${item.t_id}\n   ⏰ Còn: ${item.timeLeft}`
									 ).join('\n\n');

			for (const adminID of adminIDs) {
				try {
					await api.sendMessage(soonExpiredMsg, adminID);
					await new Promise(resolve => setTimeout(resolve, 100));
				} catch (e) {
					console.error(`❌ Không thể gửi cảnh báo cho admin ${adminID}:`, e.message);
				}
			}
		}

		// Lưu dữ liệu đã làm sạch
		try {
			fs.writeFileSync(thuebotPath, JSON.stringify(stillValid, null, 2), "utf-8");
			fs.writeFileSync(lastCheckPath, JSON.stringify({ 
				lastDate: new Date().toDateString(),
				lastCheckTime: new Date().toISOString(),
				expiredCount: expired.length,
				soonExpiredCount: soonExpired.length,
				totalValid: stillValid.length
			}), "utf-8");

			if (expired.length > 0) {
				console.log(`🧹 [handleEvent] Đã dọn dẹp ${expired.length} nhóm hết hạn`);
			}
		} catch (err) {
			console.error("❌ [handleEvent] Lỗi ghi file sau khi cập nhật:", err);
		}
	}

	// ✅ Hàm gọi lệnh upbot sync
	async function callUpbotSync() {
		try {
			// Tải module upbot
			const upbotPath = path.join(__dirname, "../../modules/commands/upbot.js");
			if (!fs.existsSync(upbotPath)) {
				console.error("❌ [handleEvent] Không tìm thấy file upbot.js");
				return;
			}

			// Xóa cache và load lại module
			delete require.cache[require.resolve(upbotPath)];
			const upbotModule = require(upbotPath);

			// Gọi hàm run với args = ["sync"]
			await upbotModule.run({
				api: api,
				event: { threadID: null, messageID: null },
				args: ["sync"],
				Users: Users
			});

			// ✅ Cập nhật thời gian sync vào syncData.json
			const syncData = readSyncData();
			syncData.lastSyncTime = new Date().toISOString();
			syncData.syncCount = (syncData.syncCount || 0) + 1;
			syncData.lastSyncTimestamp = Date.now();
			writeSyncData(syncData);

		} catch (error) {
			console.error("❌ [handleEvent] Lỗi khi gọi upbot sync:", error.message);

			// Ghi lỗi vào syncData
			const syncData = readSyncData();
			syncData.lastError = {
				message: error.message,
				time: new Date().toISOString()
			};
			writeSyncData(syncData);
		}
	}

	// ✅ Tính toán thời gian để sync tiếp theo
	const calculateNextSyncTime = () => {
		const syncData = readSyncData();
		const now = Date.now();

		if (!syncData.lastSyncTime) {
			// Chưa sync lần nào, sync ngay sau 1 phút
			return 60000;
		}

		const lastSyncTime = syncData.lastSyncTimestamp || new Date(syncData.lastSyncTime).getTime();
		const timeSinceLastSync = now - lastSyncTime;
		const syncInterval = syncData.syncInterval || 43200000; // 12 tiếng

		if (timeSinceLastSync >= syncInterval) {
			// Đã quá thời gian sync, sync ngay
			return 1000; // 1 giây
		} else {
			// Chưa đến thời gian, tính thời gian còn lại
			return syncInterval - timeSinceLastSync;
		}
	};

	// ✅ Khởi tạo sync với thời gian tính toán từ syncData
	const initializeSync = () => {
		const nextSyncDelay = calculateNextSyncTime();

		// Sync lần đầu
		setTimeout(async () => {
			await callUpbotSync();

			// Sau đó sync đều đặn mỗi 12 tiếng
			const syncData = readSyncData();
			const interval = syncData.syncInterval || 43200000; // 12 tiếng

			setInterval(async () => {
				await callUpbotSync();
			}, interval);

		}, nextSyncDelay);
	};

	// ✅ Khởi chạy sync
	initializeSync();

	// ✅ Set để theo dõi các event đã được xử lý bởi handleRefresh
	const processedEvents = new Set();
	const PROCESSED_EVENT_TTL = 5000; // 5 giây

	// ✅ Hàm xử lý sự kiện chính
	return async function ({ event }) {
		const timeStart = Date.now();
		const time = moment.tz("Asia/Ho_Chi_Minh").format("HH:mm:ss L");
		const { userBanned, threadBanned } = global.data;
		const { events } = global.client;
		const { allowInbox, DeveloperMode } = global.config;
		var { senderID, threadID, logMessageType, messageID } = event;
		senderID = String(senderID);
		threadID = String(threadID);

		if (userBanned.has(senderID) || threadBanned.has(threadID) || allowInbox === false && senderID === threadID) return;

		// ✅ Kiểm tra hết hạn thuê nếu hôm nay chưa kiểm tra
		const today = new Date().toDateString();
		let lastChecked = null;

		if (fs.existsSync(lastCheckPath)) {
			try {
				const data = JSON.parse(fs.readFileSync(lastCheckPath, "utf-8"));
				lastChecked = data.lastDate;
			} catch {}
		}

		if (lastChecked !== today) {
			await checkExpiredRentGroups();
		}

		// ✅ Tạo unique key cho event để tránh duplicate processing
		const eventKey = `${threadID}_${logMessageType}_${messageID}_${Date.now()}`;

		// ✅ Kiểm tra xem event này có phải là log event và đã được xử lý bởi handleRefresh chưa
		const isLogEvent = logMessageType && logMessageType.startsWith('log:');
		const isAlreadyProcessed = processedEvents.has(eventKey);

		// ✅ Nếu là log event, đánh dấu là đã xử lý và set timeout để cleanup
		if (isLogEvent && !isAlreadyProcessed) {
			processedEvents.add(eventKey);
			setTimeout(() => {
				processedEvents.delete(eventKey);
			}, PROCESSED_EVENT_TTL);
		}

		// ✅ Xử lý các sự kiện từ client.events (bỏ qua log events để tránh duplicate)
		for (const [key, value] of events.entries()) {
			// ✅ Chỉ xử lý non-log events hoặc log events chưa được xử lý
			if (value.config.eventType.includes(event.logMessageType || event.type)) {
				// ✅ Bỏ qua nếu là log event và đã được handleRefresh xử lý
				if (isLogEvent && !isAlreadyProcessed) {
					console.log(`[handleEvent] ⏭️ Bỏ qua log event ${logMessageType} đã được handleRefresh xử lý`);
					continue;
				}

				const eventRun = events.get(key);
				try {
					const Obj = { api, event, models, Users, Threads, Currencies };
					await eventRun.run(Obj);
					if (DeveloperMode === true)
						logger(global.getText('handleEvent', 'executeEvent', time, eventRun.config.name, threadID, Date.now() - timeStart), '[ Event ]');
				} catch (error) {
					logger(global.getText('handleEvent', 'eventError', eventRun.config.name, JSON.stringify(error)), "error");
				}
			}
		}
	};
};