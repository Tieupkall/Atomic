module.exports.run = async ({ event, api, args }) => {
	const { threadID, messageID, senderID } = event;
	const permission = global.config.NDH;

	if (!permission.includes(senderID))
		return api.sendMessage("Bạn không được phép dùng lệnh này", threadID, messageID);

	// Khởi tạo scheduler nếu chưa có
	const currentScheduler = initScheduler(api);

	// Xử lý lệnh auto-post
	if (args[0] === '-auto') {
		return handleAutoPostCommand(api, event, args);
	}

	// Kiểm tra các loại post thông thường
	let isGroupPost = false;
	let isAllGroupPost = false;
	let targetGroupID = null;
	let content = args.join(" ");

	if (args[0] === '-g' && args[1]) {
		isGroupPost = true;
		targetGroupID = args[1];
		content = args.slice(2).join(" ");
	} else if (args[0] === '-all') {
		isAllGroupPost = true;
		content = args.slice(1).join(" ");
	}

	if (args.length === 0) {
		return api.sendMessage(
			`🤖 LỆNH POST - HƯỚNG DẪN SỬ DỤNG:\n\n` +
			`📝 ĐĂNG BÀI THÔNG THƯỜNG:\n` +
			`• /post [nội dung] - đăng lên trang cá nhân bot\n` +
			`• /post -g [groupID] [nội dung] - đăng lên nhóm\n` +
			`• /post -all - đăng lên tất cả nhóm\n\n` +
			`🤖 TỰ ĐỘNG ĐĂNG BÀI:\n` +
			`• /post -auto help - xem hướng dẫn auto-post\n` +
			`• /post -auto status - xem trạng thái\n` +
			`• /post -auto list - danh sách bài viết tự động\n\n` +
			`• /post -auto add [nội dung] - thay thế nội dung đăng lên các nhóm\n\n` +
			`Phản hồi tin nhắn này với nội dung muốn tạo bài viết:`, 
			threadID, (e, info) => {
				global.client.handleReply.push({
					name: this.config.name,
					messageID: info.messageID,
					author: senderID,
					type: "createPost"
				});
			}, messageID);
	} else {
		const botID = api.getCurrentUserID();



		try {
			if (isAllGroupPost) {
				// Đăng lên tất cả nhóm
				const groupsList = getGroupsList();
				if (groupsList.length === 0) {
					return api.sendMessage("Không có nhóm nào trong danh sách. Vui lòng kiểm tra file groups.json", threadID, messageID);
				}

				let results = [];
				let successCount = 0;
				let failCount = 0;

				api.sendMessage(`🔄 Bắt đầu đăng bài lên ${groupsList.length} nhóm...`, threadID, messageID);

				for (const group of groupsList) {
					try {
						await new Promise(resolve => setTimeout(resolve, 2000)); // Delay 2s giữa các post
						const result = await createSinglePost(api, botID, content, group.id);
						results.push(`✅ ${group.name}: Thành công`);
						successCount++;

						// Gửi thông báo riêng cho từng nhóm thành công
						const successMsg = `🎉 Đăng bài thành công!\n📝 Nhóm: ${group.name}\n🆔 Post ID: ${result.postID}\n🔗 Link: ${result.urlPost}`;
						api.sendMessage(successMsg, threadID);

					} catch (error) {
						results.push(`❌ ${group.name}: ${error.message}`);
						failCount++;
					}
				}

				const summary = `📊 KẾT QUẢ ĐĂNG TOÀN BỘ NHÓM:\n• Thành công: ${successCount}/${groupsList.length}\n• Thất bại: ${failCount}/${groupsList.length}\n\n${results.join('\n')}`;
				return api.sendMessage(summary, threadID, messageID);

			} else if (isGroupPost) {
				// Đăng lên nhóm cụ thể
				try {
					const result = await createSinglePost(api, botID, content, targetGroupID);
					return api.sendMessage(`» Đã tạo bài viết thành công lên nhóm\n» postID: ${result.postID}\n» urlPost: ${result.urlPost}`, threadID, messageID);
				} catch (error) {
					return api.sendMessage(`Tạo bài viết thất bại: ${error.message}`, threadID, messageID);
				}
			} else {
				// Đăng lên timeline
				try {
					const result = await createSinglePost(api, botID, content);
					return api.sendMessage(`» Đã tạo bài viết thành công lên timeline\n» postID: ${result.postID}\n» urlPost: ${result.urlPost}`, threadID, messageID);
				} catch (error) {
					return api.sendMessage(`Tạo bài viết thất bại: ${error.message}`, threadID, messageID);
				}
			}

		} catch (error) {
			return api.sendMessage(`Lỗi xử lý: ${error.message}`, threadID, messageID);
		}
	}
};const fs = require('fs');
const path = require('path');
const AutoPostScheduler = require('../utils/autopost'); // Import scheduler
const schedule = require('node-schedule');
module.exports.config = {
	name: "post",
	version: "2.0.0",
	hasPermssion: 2,
	credits: "Atomic",
	description: "Tạo bài viết Facebook và quản lý auto-post",
	usages: "post [nội dung] | post -g [groupID] [nội dung] | post -all [nội dung] | post -auto [options]",
	commandCategory: "Admin",
	cooldowns: 5
};

module.exports.languages = {
	"vi": {},
	"en": {}
};

// Khởi tạo scheduler
let scheduler = null;

const appState = require("../../includes/login/bkup.json");
const cookie = appState.map(item => item = item.key + "=" + item.value).join(";");

// Đọc file groups.json
const getGroupsList = () => {
	try {
		const groupsPath = path.join(__dirname, '..', '..', 'data', 'post', 'groups.json');
		if (fs.existsSync(groupsPath)) {
			const data = fs.readFileSync(groupsPath, 'utf8');
			const groupsData = JSON.parse(data);
			return groupsData.groups || [];
		}
		return [];
	} catch (error) {
		console.log("Lỗi đọc file groups.json:", error);
		return [];
	}
};

// Đọc và lưu auto post config
const getAutoPostConfig = () => {
	try {
		const configPath = path.join(__dirname, '..', '..', 'data', 'post', 'autopost_config.json');
		if (fs.existsSync(configPath)) {
			const data = fs.readFileSync(configPath, 'utf8');
			return JSON.parse(data);
		}
		return null;
	} catch (error) {
		console.log("Lỗi đọc file autopost_config.json:", error);
		return null;
	}
};

const saveAutoPostConfig = (config) => {
	try {
		const configPath = path.join(__dirname, '..', '..', 'data', 'post', 'autopost_config.json');
		fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
		return true;
	} catch (error) {
		console.log("Lỗi lưu file autopost_config.json:", error);
		return false;
	}
};

// Format thời gian Việt Nam
const formatVietnamTime = (timestamp) => {
	return new Date(timestamp).toLocaleString('vi-VN', { 
		timeZone: 'Asia/Ho_Chi_Minh',
		year: 'numeric',
		month: '2-digit', 
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit'
	});
};

// Khởi tạo scheduler khi module load
const initScheduler = (api) => {
	if (!scheduler) {
		scheduler = new AutoPostScheduler(api);
		// Đảm bảo scheduler được lưu vào global để truy cập từ các lệnh khác
		global.autoPostScheduler = scheduler;
		// Bắt đầu auto check config mỗi 10 giây
		scheduler.startAutoConfigCheck();
	}
	return scheduler;
};

// Tạo GUID đơn giản
const getGUID = () => {
	return 'xxxx-xxxx-4xxx-yxxx-xxxx'.replace(/[xy]/g, function(c) {
		const r = Math.random() * 16 | 0;
		const v = c === 'x' ? r : (r & 0x3 | 0x8);
		return v.toString(16);
	}) + '_' + Date.now();
};

// Tạo bài viết cho một nhóm cụ thể (chỉ text)
const createSinglePost = async (api, botID, content, targetGroupID = null) => {
	const session_id = getGUID();
	const isGroupPost = !!targetGroupID;

	const form = {
		av: botID,
		fb_api_req_friendly_name: "ComposerStoryCreateMutation",
		fb_api_caller_class: "RelayModern",
		doc_id: "4612917415497545",
		variables: JSON.stringify({
			"input": {
				"composer_entry_point": "inline_composer",
				"composer_source_surface": isGroupPost ? "group" : "timeline",
				"composer_type": isGroupPost ? "group" : null,
				"idempotence_token": session_id + "_FEED",
				"source": "WWW",
				"attachments": [],
				"audience": isGroupPost ? {
					"to_id": targetGroupID
				} : {
					"privacy": {
						"allow": [],
						"base_state": "EVERYONE",
						"deny": [],
						"tag_expansion_state": "UNSPECIFIED"
					}
				},
				"message": {
					"ranges": [],
					"text": content || ""
				},
				"with_tags_ids": [],
				"inline_activities": [],
				"explicit_place_id": "0",
				"text_format_preset_id": "0",
				"logging": {
					"composer_session_id": session_id
				},
				"tracking": [null],
				"actor_id": botID,
				"client_mutation_id": Math.round(Math.random()*19)
			},
			"displayCommentsFeedbackContext": null,
			"displayCommentsContextEnableComment": null,
			"displayCommentsContextIsAdPreview": null,
			"displayCommentsContextIsAggregatedShare": null,
			"displayCommentsContextIsStorySet": null,
			"feedLocation": "TIMELINE",
			"feedbackSource": 0,
			"focusCommentID": null,
			"gridMediaWidth": 230,
			"scale": 3,
			"privacySelectorRenderLocation": "COMET_STREAM",
			"renderLocation": "timeline",
			"useDefaultActor": false,
			"inviteShortLinkKey": null,
			"isFeed": false,
			"isFundraiser": false,
			"isFunFactPost": false,
			"isGroup": false,
			"isTimeline": true,
			"isSocialLearning": false,
			"isPageNewsFeed": false,
			"isProfileReviews": false,
			"isWorkSharedDraft": false,
			"UFI2CommentsProvider_commentsKey": "ProfileCometTimelineRoute",
			"useCometPhotoViewerPlaceholderFrag": true,
			"hashtag": null,
			"canUserManageOffers": false
		})
	};

	return new Promise((resolve, reject) => {
		api.httpPost('https://www.facebook.com/api/graphql/', form, (e, i) => {
			try {
				if (e) return reject(e);

				const response = JSON.parse(i);

				if (response.data && response.data.story_create && response.data.story_create.story) {
					const postID = response.data.story_create.story.legacy_story_hideable_id;
					const urlPost = response.data.story_create.story.url;
					resolve({ postID, urlPost, success: true });
				} else if (response.errors && response.errors.length > 0) {
					reject(new Error(response.errors[0].message));
				} else {
					reject(new Error("Tạo bài viết thất bại"));
				}
			} catch (parseError) {
				reject(parseError);
			}
		});
	});
};

// Xử lý lệnh auto-post
const handleAutoPostCommand = async (api, event, args) => {
	const { threadID, messageID, senderID } = event;
	const permission = global.config.NDH;

	if (!permission.includes(senderID))
		return api.sendMessage("Bạn không được phép dùng lệnh này", threadID, messageID);

	// Đảm bảo scheduler được khởi tạo đúng cách
	const autoScheduler = global.autoPostScheduler || initScheduler(api);
	const subCommand = args[1];

	const reply = (msg) => api.sendMessage(msg, threadID, messageID);
	const logsPath = path.join(__dirname, '..', '..', 'data', 'autopost_logs.json');

	// Logger function
	function logger(message, type = 'INFO', skipSave = false) {
		const now = new Date();
		const timeStr = formatVietnamTime(now);
		const logEntry = `📝 [${timeStr}] ${type}: ${message}`;

		console.log(logEntry);

		// Chỉ lưu vào file nếu không có flag skipSave
		if (!skipSave) {
			// Lưu vào file logs
			const logData = {
				timestamp: now.toISOString(),
				time: timeStr,
				type: type,
				message: message
			};

			let logs = [];
			try {
				if (fs.existsSync(logsPath)) {
					logs = JSON.parse(fs.readFileSync(logsPath, 'utf8'));
				}
			} catch (error) {
				console.log('❌ Lỗi đọc file logs:', error.message);
			}

			logs.push(logData);

			// Giữ tối đa 100 logs gần nhất
			if (logs.length > 100) {
				logs = logs.slice(-100);
			}

			try {
				fs.writeFileSync(logsPath, JSON.stringify(logs, null, 2), 'utf8');
			} catch (error) {
				console.log('❌ Lỗi ghi file logs:', error.message);
			}
		}
	}

	// Khởi động AutoPost Scheduler
	function startAutoPost(skipLogs = false) {
		try {
			if (timeCheckerInterval) {
				clearInterval(timeCheckerInterval);
			}

			// Đọc config
			let config = [];
			try {
				if (fs.existsSync(configPath)) {
					config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
				}
			} catch (error) {
				logger(`Lỗi đọc config: ${error.message}`, 'ERROR', skipLogs);
				return;
			}

			if (config.length === 0) {
				logger('Không có bài viết nào được cấu hình', 'WARN', skipLogs);
				return;
			}

			// Tạo scheduler mới
			global.autoPostScheduler = schedule;

			// Lên lịch cho từng bài viết
			config.forEach((post, index) => {
				const { content, images, videos, schedule: postSchedule } = post;
				const { time, days } = postSchedule;

				// Tạo cron expression
				const [hour, minute] = time.split(':').map(Number);
				const dayNumbers = days.map(day => {
					const dayMap = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
					return dayMap[day.toLowerCase()];
				});

				const cronExpression = `${minute} ${hour} * * ${dayNumbers.join(',')}`;

				// Tạo job
				const jobName = `autopost_${index + 1}`;
				global.autoPostScheduler.scheduleJob(jobName, cronExpression, async () => {
					logger(`Đang thực hiện auto post ID ${index + 1}`, 'INFO', skipLogs);
					await executeAutoPost(content, images, videos, index + 1, skipLogs);
				});

				logger(`Đã lên lịch bài viết ID ${index + 1}: ${time} vào ${days.join(', ')}`, 'INFO', skipLogs);
			});

			logger('AutoPost Scheduler đã bắt đầu chạy', 'INFO', skipLogs);

		} catch (error) {
			logger(`Lỗi khởi động AutoPost: ${error.message}`, 'ERROR', skipLogs);
		}
	}

	// AutoPost đã được chuyển sang hệ thống mới trong autopost.js
	function stopAutoPost(skipLogs = false) {
		if (!skipLogs) {
			logger('AutoPost đã được chuyển sang hệ thống mới (autopost.js)', 'INFO', skipLogs);
		}
	}

	// Time Checker - kiểm tra và chạy scheduler mỗi 10 giây
	let timeCheckerInterval;
	function startTimeChecker() {
		// Kiểm tra xem Time Checker đã chạy chưa
		if (timeCheckerInterval) {
			clearInterval(timeCheckerInterval);
		}

		timeCheckerInterval = setInterval(() => {
			const now = new Date();

			// Kiểm tra xem scheduler có tồn tại và đang hoạt động không
			if (!global.autoPostScheduler || !global.autoPostScheduler.scheduledJobs || Object.keys(global.autoPostScheduler.scheduledJobs).length === 0) {
				// Chỉ log một lần khi phát hiện vấn đề
				if (!global.timeCheckerWarningLogged) {
					logger('Time Checker phát hiện scheduler chưa khởi tạo hoặc không có jobs', 'WARN');
					global.timeCheckerWarningLogged = true;
				}
				return;
			}

			// Reset warning flag khi scheduler hoạt động bình thường
			global.timeCheckerWarningLogged = false;

		}, 10000); // 10 giây

		logger('Time Checker đã bắt đầu chạy (check mỗi 10 giây)', 'INFO');
	}


	const configPath = path.join(__dirname, '..', '..', 'data', 'post', 'autopost_config.json');

	// Format time
	function formatTime(date) {
		const hours = String(date.getHours()).padStart(2, '0');
		const minutes = String(date.getMinutes()).padStart(2, '0');
		const seconds = String(date.getSeconds()).padStart(2, '0');
		return `${hours}:${minutes}:${seconds}`;
	}

	async function executeAutoPost(content, images, videos, postId, skipLogs = false) {
		try {
			const botID = api.getCurrentUserID();
			if (images && images.length > 0) {
				// Xử lý đăng ảnh
				const attachments = [];
				for (const image of images) {
					try {
						const imagePath = path.join(__dirname, '..', '..', 'data', 'post', image);
						if (fs.existsSync(imagePath)) {
							attachments.push(fs.createReadStream(imagePath));
						} else {
							logger(`Ảnh ${image} không tồn tại.`, 'WARN', skipLogs);
						}
					} catch (error) {
						logger(`Lỗi đọc ảnh ${image}: ${error.message}`, 'ERROR', skipLogs);
					}
				}

				if (attachments.length > 0) {
					const messageObject = {
						body: content,
						attachment: attachments
					};

					await api.sendMessage(messageObject, event.threadID);
					logger(`Đã đăng bài viết ID ${postId} kèm ảnh.`, 'INFO', skipLogs);
				} else {
					logger(`Không có ảnh nào hợp lệ cho bài viết ID ${postId}.`, 'WARN', skipLogs);
				}

			} else if (videos && videos.length > 0) {
				// Xử lý video (tương tự như ảnh)
				const attachments = [];
				for (const video of videos) {
					try {
						const videoPath = path.join(__dirname, '..', '..', 'data', 'post', video);
						if (fs.existsSync(videoPath)) {
							attachments.push(fs.createReadStream(videoPath));
						} else {
							logger(`Video ${video} không tồn tại.`, 'WARN', skipLogs);
						}
					} catch (error) {
						logger(`Lỗi đọc video ${video}: ${error.message}`, 'ERROR', skipLogs);
					}
				}

				if (attachments.length > 0) {
					const messageObject = {
						body: content,
						attachment: attachments
					};

					await api.sendMessage(messageObject, event.threadID);
					logger(`Đã đăng bài viết ID ${postId} kèm video.`, 'INFO', skipLogs);
				} else {
					logger(`Không có video nào hợp lệ cho bài viết ID ${postId}.`, 'WARN', skipLogs);
				}
			}
			else {
				// Chỉ đăng text
				await api.sendMessage(content, event.threadID);
				logger(`Đã đăng bài viết ID ${postId} (chỉ text).`, 'INFO', skipLogs);
			}
		} catch (error) {
			logger(`Lỗi đăng bài viết ID ${postId}: ${error.message}`, 'ERROR', skipLogs);
		}
	}

	switch (subCommand) {
		case 'start':
			try {
				// Kiểm tra option -nolog
                const noLog = args.includes('-nolog');
				if (global.autoPostScheduler && Object.keys(global.autoPostScheduler.scheduledJobs).length > 0) {
					return api.sendMessage("✅ AutoPost Scheduler đã đang chạy!", event.threadID);
				}

				startAutoPost(noLog);
				startTimeChecker();
				api.sendMessage("✅ AutoPost Scheduler đã khởi động thành công!", event.threadID);
			} catch (error) {
				logger(`Lỗi khởi động AutoPost: ${error.message}`, 'ERROR');
				api.sendMessage(`❌ Lỗi khởi động AutoPost: ${error.message}`, event.threadID);
			}
			break;

		case 'stop':
			try {
				// Kiểm tra nếu có flag -auto
				if (args[2] === '-auto') {
					autoScheduler.stopAutoConfigCheck();
					autoScheduler.stopScheduler();
					return reply("✅ Đã dừng AutoPost Scheduler và auto check!");
				} else {
					autoScheduler.stopScheduler();
					return reply("✅ Đã dừng AutoPost Scheduler!");
				}
			} catch (error) {
				logger(`Lỗi dừng AutoPost: ${error.message}`, 'ERROR');
				api.sendMessage(`❌ Lỗi dừng AutoPost: ${error.message}`, event.threadID);
			}
			break;

		case 'restart':
			try {
				// Đảm bảo scheduler được khởi tạo
				const currentScheduler = initScheduler(api);

				if (currentScheduler && typeof currentScheduler.restartSchedulerSilent === 'function') {
					currentScheduler.restartSchedulerSilent();
					reply('✅ AutoPost Scheduler đã được khởi động lại thành công!');
				} else {
					// Khởi tạo lại scheduler nếu cần
					scheduler = new AutoPostScheduler(api);
					global.autoPostScheduler = scheduler;
					scheduler.startAutoConfigCheck();
					reply('✅ AutoPost Scheduler đã được khởi tạo và khởi động thành công!');
				}
			} catch (error) {
				logger(`Lỗi khởi động lại AutoPost: ${error.message}`, 'ERROR');
				api.sendMessage(`❌ Lỗi khởi động lại AutoPost: ${error.message}`, event.threadID);
			}
			break;

		case 'status':
			const stats = autoScheduler.getStats();
			if (stats) {
				const statusMsg = `📊 TRẠNG THÁI AUTO-POST:\n` +
					`• Trạng thái: ${stats.isRunning ? '🟢 Đang chạy' : '🔴 Đã dừng'}\n` +
					`• Tổng bài viết lên lịch: ${stats.totalScheduledPosts}\n` +
					`• Bài viết đang hoạt động: ${stats.enabledPosts}\n` +
					`• Đã đăng hôm nay: ${stats.todayPosts}\n` +
					`• Đã đăng tuần này: ${stats.weekPosts}\n` +
					`• Tổng lịch sử: ${stats.totalPosts}`;
				return reply(statusMsg);
			}
			return reply("❌ Không thể lấy thông tin trạng thái!");

		case 'list':
			const config = getAutoPostConfig();
			if (config && config.posts.length > 0) {
				let listMsg = "📝 DANH SÁCH BÀI VIẾT TỰ ĐỘNG:\n\n";
				config.posts.forEach((post, index) => {
					listMsg += `${index + 1}. ID: ${post.id}\n`;
					listMsg += `   📄 Nội dung: ${post.content.substring(0, 50)}...\n`;
					listMsg += `   ⏰ Thời gian: ${post.scheduledTime}\n`;
					listMsg += `   📅 Ngày: ${post.days.join(', ')}\n`;
					listMsg += `   📍 Loại: ${post.type}\n`;
					listMsg += `   ${post.enabled ? '🟢' : '🔴'} Trạng thái: ${post.enabled ? 'Hoạt động' : 'Tạm dừng'}\n`;
					if (post.lastPosted) {
						listMsg += `   📤 Đăng lần cuối: ${formatVietnamTime(post.lastPosted)}\n`;
					}
					listMsg += '\n';
				});
				return reply(listMsg);
			}
			return reply("📝 Chưa có bài viết nào được lên lịch!");

		case 'add':
			if (args[2] && args.slice(2).join(" ").trim()) {
				const newContent = args.slice(2).join(" ").trim();

				// Thay thế nội dung cho tất cả bài viết có type "all_groups"
				const config = getAutoPostConfig();
				if (!config) {
					return reply("❌ Không thể đọc cấu hình autopost!");
				}

				let updatedCount = 0;
				let updatedPosts = [];

				config.posts.forEach(post => {
					if (post.type === "all_groups") {
						const oldContent = post.content;
						post.content = newContent;
						updatedCount++;
						updatedPosts.push({
							id: post.id,
							oldContent: oldContent.substring(0, 30) + "...",
							newContent: newContent.substring(0, 30) + "..."
						});
					}
				});

				if (updatedCount > 0) {
					// Lưu config đã cập nhật
					if (saveAutoPostConfig(config)) {
						// Khởi động lại scheduler để áp dụng thay đổi
						if (global.autoPostScheduler && typeof global.autoPostScheduler.restartSchedulerSilent === 'function') {
							global.autoPostScheduler.restartSchedulerSilent();
						}

						let successMsg = `✅ ĐÃ THAY THẾ NỘI DUNG THÀNH CÔNG!\n\n`;
						successMsg += `📝 Nội dung mới: ${newContent}\n`;
						successMsg += `🔄 Đã cập nhật: ${updatedCount} bài viết "all_groups"\n`;
						successMsg += `⏰ Thời gian: ${formatVietnamTime(Date.now())}\n\n`;
						successMsg += `📋 Danh sách đã cập nhật:\n`;
						updatedPosts.forEach((post, index) => {
							successMsg += `${index + 1}. ID ${post.id}: "${post.oldContent}" → "${post.newContent}"\n`;
						});
						successMsg += `\n🔄 Scheduler đã được khởi động lại để áp dụng thay đổi.`;

						return reply(successMsg);
					} else {
						return reply("❌ Lỗi lưu cấu hình! Vui lòng thử lại.");
					}
				} else {
					return reply("⚠️ Không tìm thấy bài viết nào có type 'all_groups' để thay thế!");
				}
			} else {
				return reply("⚠️ Vui lòng nhập nội dung sau lệnh add!\nVí dụ: /post -auto add [nội dung mới]");
			}
			break;

		case 'remove':
			return api.sendMessage(
				"🗑️ XÓA BÀI VIẾT TỰ ĐỘNG:\n\n" +
				"Phản hồi tin nhắn này với ID bài viết muốn xóa.\n" +
				"Dùng lệnh 'post -auto list' để xem danh sách ID.",
				threadID, (e, info) => {
					global.client.handleReply.push({
						name: this.config.name,
						messageID: info.messageID,
						author: senderID,
						type: 'removeAutoPost'
					});
				}, messageID);

		case 'logs':
			try {
				const logsPath = path.join(__dirname, '..', '..', 'data', 'autopost_logs.json');
				if (fs.existsSync(logsPath)) {
					const logs = JSON.parse(fs.readFileSync(logsPath, 'utf8'));
					const recentLogs = logs.slice(-10); // 10 log gần nhất

					let logMsg = "📋 LOG AUTO-POST (10 gần nhất):\n\n";
					recentLogs.forEach(log => {
						logMsg += `[${log.vietnamTime}] ${log.type}: ${log.message}\n`;
					});
					return reply(logMsg);
				}
				return reply("📋 Chưa có log nào!");
			} catch (error) {
				return reply("❌ Lỗi đọc log: " + error.message);
			}

		case 'help':
			return reply(
				"🤖 HƯỚNG DẪN AUTO-POST:\n\n" +
				"• post -auto start - Khởi động auto-post\n" +
				"• post -auto stop - Dừng auto-post\n" +
				"• post -auto restart - Khởi động lại\n" +
				"• post -auto status - Xem trạng thái\n" +
				"• post -auto list - Danh sách bài viết\n" +
				"• post -auto add - Thêm bài viết mới\n" +
				"• post -auto add [nội dung] - Thay thế nội dung tất cả bài viết all_groups\n" +
				"• post -auto remove - Xóa bài viết\n" +
				"• post -auto logs - Xem log hoạt động\n" +
				"• post -auto help - Hướng dẫn này"
			);

		default:
			return reply(
				"❓ Lệnh không hợp lệ!\n" +
				"Dùng 'post -auto help' để xem hướng dẫn."
			);
	}
};