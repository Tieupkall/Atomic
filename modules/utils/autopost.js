const fs = require('fs');
const path = require('path');
const schedule = require('node-schedule');

class AutoPostScheduler {
  constructor(api) {
    this.api = api;
    this.isRunning = false;
    this.scheduledJobs = new Map();
    this.configCheckInterval = null;
    this.timezone = 'Asia/Ho_Chi_Minh';
    this.configPath = path.join(__dirname, '..', '..', 'data', 'post', 'autopost_config.json');
    this.groupsPath = path.join(__dirname, '..', '..', 'data', 'post', 'groups.json');
    this.logPath = path.join(__dirname, '..', '..', 'data', 'post', 'autopost_logs.json');
    this.init();
  }

  init() {
    try {
      const config = this.getAutoPostConfig();
      if (!config) {
        this.writeLog('ERROR', 'Không thể đọc config, dừng khởi tạo');
        return;
      }
      this.loadSchedules();
      this.startScheduler();
      console.log('[LISTEN] AutoPost Started');
    } catch (error) {
      console.error('❌ Lỗi khởi tạo AutoPost Scheduler:', error);
      this.writeLog('ERROR', `Lỗi khởi tạo AutoPost Scheduler: ${error.message}`);
    }
  }

  getAutoPostConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf8');
        if (!data.trim()) {
          this.writeLog('WARNING', 'File config trống, tạo config mặc định');
          return this.createDefaultConfig();
        }
        const config = JSON.parse(data);
        if (!config || typeof config !== 'object') {
          this.writeLog('WARNING', 'Config không hợp lệ, tạo config mặc định');
          return this.createDefaultConfig();
        }
        if (!config.posts || !Array.isArray(config.posts)) config.posts = [];
        if (!config.settings || typeof config.settings !== 'object') {
          config.settings = { maxPostsPerDay: 10, delayBetweenPosts: 2000 };
        }
        if (!config.history || !Array.isArray(config.history)) config.history = [];
        if (typeof config.enabled !== 'boolean') config.enabled = true;
        return config;
      }
      return this.createDefaultConfig();
    } catch (error) {
      console.error('Lỗi đọc autopost_config.json:', error);
      this.writeLog('ERROR', `Lỗi đọc config: ${error.message}`);
      return this.createDefaultConfig();
    }
  }

  createDefaultConfig() {
    const defaultConfig = {
      enabled: true,
      posts: [],
      settings: { maxPostsPerDay: 10, delayBetweenPosts: 2000 },
      history: []
    };
    this.saveAutoPostConfig(defaultConfig);
    this.writeLog('INFO', 'Đã tạo config mặc định');
    return defaultConfig;
  }

  saveAutoPostConfig(config) {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf8');
      return true;
    } catch (error) {
      console.error('Lỗi lưu autopost_config.json:', error);
      return false;
    }
  }

  getGroupsList() {
    try {
      if (fs.existsSync(this.groupsPath)) {
        const data = fs.readFileSync(this.groupsPath, 'utf8');
        const groupsData = JSON.parse(data);
        return groupsData.groups.filter(g => g.autoPost !== false);
      }
      return [];
    } catch (error) {
      console.error('Lỗi đọc groups.json:', error);
      return [];
    }
  }

  writeLog(type, message, data = null) {
    try {
      const logEntry = {
        timestamp: new Date().toISOString(),
        vietnamTime: new Date().toLocaleString('vi-VN', { timeZone: this.timezone }),
        type,
        message,
        data
      };
      let logs = [];
      if (fs.existsSync(this.logPath)) {
        try {
          const logData = fs.readFileSync(this.logPath, 'utf8');
          if (logData.trim()) logs = JSON.parse(logData);
        } catch {
          console.log('File log bị hỏng, tạo mới...');
          logs = [];
        }
      }
      logs.push(logEntry);
      if (logs.length > 200) logs = logs.slice(-200);
      fs.writeFileSync(this.logPath, JSON.stringify(logs, null, 2), 'utf8');
      console.log(`📝 [${logEntry.vietnamTime}] ${type}: ${message}`);
    } catch (error) {
      console.error('Lỗi ghi log:', error);
    }
  }

  createScheduleRule(time, days) {
    const [hours, minutes] = time.split(':').map(Number);
    const dayMap = {
      sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
      thursday: 4, friday: 5, saturday: 6
    };
    const dayOfWeek = days.map(day => dayMap[day.toLowerCase()]);
    return { hour: hours, minute: minutes, dayOfWeek, tz: this.timezone };
  }

  async createPost(api, botID, content, targetGroupID = null) {
    const session_id = this.getGUID();
    const isGroupPost = !!targetGroupID;
    const form = {
      av: botID,
      fb_api_req_friendly_name: 'ComposerStoryCreateMutation',
      fb_api_caller_class: 'RelayModern',
      doc_id: '4612917415497545',
      variables: JSON.stringify({
        input: {
          composer_entry_point: 'inline_composer',
          composer_source_surface: isGroupPost ? 'group' : 'timeline',
          composer_type: isGroupPost ? 'group' : null,
          idempotence_token: session_id + '_FEED',
          source: 'WWW',
          attachments: [],
          audience: isGroupPost
            ? { to_id: targetGroupID }
            : { privacy: { allow: [], base_state: 'EVERYONE', deny: [], tag_expansion_state: 'UNSPECIFIED' } },
          message: { ranges: [], text: content || '' },
          with_tags_ids: [],
          inline_activities: [],
          explicit_place_id: '0',
          text_format_preset_id: '0',
          logging: { composer_session_id: session_id },
          tracking: [null],
          actor_id: botID,
          client_mutation_id: Math.round(Math.random() * 19)
        },
        displayCommentsFeedbackContext: null,
        displayCommentsContextEnableComment: null,
        displayCommentsContextIsAdPreview: null,
        displayCommentsContextIsAggregatedShare: null,
        displayCommentsContextIsStorySet: null,
        feedLocation: 'TIMELINE',
        feedbackSource: 0,
        focusCommentID: null,
        gridMediaWidth: 230,
        scale: 3,
        privacySelectorRenderLocation: 'COMET_STREAM',
        renderLocation: 'timeline',
        useDefaultActor: false,
        inviteShortLinkKey: null,
        isFeed: false,
        isFundraiser: false,
        isFunFactPost: false,
        isGroup: false,
        isTimeline: true,
        isSocialLearning: false,
        isPageNewsFeed: false,
        isProfileReviews: false,
        isWorkSharedDraft: false,
        UFI2CommentsProvider_commentsKey: 'ProfileCometTimelineRoute',
        useCometPhotoViewerPlaceholderFragment: true,
        hashtag: null,
        canUserManageOffers: false
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
            reject(new Error('Tạo bài viết thất bại'));
          }
        } catch (parseError) {
          reject(parseError);
        }
      });
    });
  }

  shouldExecutePost(postConfig) {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const [scheduledHour, scheduledMinute] = postConfig.scheduledTime.split(':').map(Number);
    this.writeLog(
      'INFO',
      `✅ Bài viết ID ${postConfig.id} sẽ chạy - Hiện tại: ${currentHour.toString().padStart(2, '0')}:${currentMinute
        .toString()
        .padStart(2, '0')}, Lên lịch: ${scheduledHour.toString().padStart(2, '0')}:${scheduledMinute
        .toString()
        .padStart(2, '0')}`
    );
    return true;
  }

  async executeScheduledPost(postConfig) {
    try {
      const botID = this.api.getCurrentUserID();
      const config = this.getAutoPostConfig();
      if (!config || !config.enabled) {
        this.writeLog('WARNING', 'AutoPost bị tắt, bỏ qua bài viết', postConfig);
        return;
      }
      if (!this.shouldExecutePost(postConfig)) return;

      const today = new Date().toDateString();
      const todayPosts = config.history.filter(h => new Date(h.timestamp).toDateString() === today);
      if (todayPosts.length >= config.settings.maxPostsPerDay) {
        this.writeLog('WARNING', 'Đã đạt giới hạn số bài đăng trong ngày', { limit: config.settings.maxPostsPerDay });
        return;
      }

      this.writeLog('INFO', `Bắt đầu thực hiện bài viết: ${postConfig.content.substring(0, 50)}...`);
      const results = [];
      let successCount = 0;
      let failCount = 0;

      if (postConfig.type === 'timeline') {
        try {
          const result = await this.createPost(this.api, botID, postConfig.content);
          results.push({ type: 'timeline', success: true, result });
          successCount++;
          this.writeLog('SUCCESS', 'Đăng timeline thành công', result);
        } catch (error) {
          results.push({ type: 'timeline', success: false, error: error.message });
          failCount++;
          this.writeLog('ERROR', 'Đăng timeline thất bại', error.message);
        }
      } else if (postConfig.type === 'all_groups') {
        const groupsList = this.getGroupsList();
        for (const group of groupsList) {
          try {
            await new Promise(r => setTimeout(r, config.settings.delayBetweenPosts));
            const result = await this.createPost(this.api, botID, postConfig.content, group.id);
            results.push({ type: 'group', groupId: group.id, groupName: group.name, success: true, result });
            successCount++;
            this.writeLog('SUCCESS', `Đăng nhóm ${group.name} thành công`, result);
          } catch (error) {
            results.push({ type: 'group', groupId: group.id, groupName: group.name, success: false, error: error.message });
            failCount++;
            this.writeLog('ERROR', `Đăng nhóm ${group.name} thất bại`, error.message);
          }
        }
      } else if (postConfig.type === 'specific_groups') {
        const groupsList = this.getGroupsList();
        const targetGroups = groupsList.filter(group => postConfig.targetGroups.includes(group.id));
        for (const group of targetGroups) {
          try {
            await new Promise(r => setTimeout(r, config.settings.delayBetweenPosts));
            const result = await this.createPost(this.api, botID, postConfig.content, group.id);
            results.push({ type: 'group', groupId: group.id, groupName: group.name, success: true, result });
            successCount++;
            this.writeLog('SUCCESS', `Đăng nhóm ${group.name} thành công`, result);
          } catch (error) {
            results.push({ type: 'group', groupId: group.id, groupName: group.name, success: false, error: error.message });
            failCount++;
            this.writeLog('ERROR', `Đăng nhóm ${group.name} thất bại`, error.message);
          }
        }
      }

      const historyEntry = {
        postId: postConfig.id,
        content: postConfig.content,
        type: postConfig.type,
        timestamp: new Date().toISOString(),
        vietnamTime: new Date().toLocaleString('vi-VN', { timeZone: this.timezone }),
        results,
        successCount,
        failCount
      };

      config.history.push(historyEntry);
      this.saveAutoPostConfig(config);
      this.writeLog('INFO', `Hoàn thành bài viết - Thành công: ${successCount}, Thất bại: ${failCount}`, historyEntry);

      const notificationMessage = this.formatPostNotification(postConfig, results, successCount, failCount);
      await this.sendNotificationToGroup('6691735800885668', notificationMessage);
    } catch (error) {
      this.writeLog('ERROR', 'Lỗi thực hiện bài viết theo lịch', error.message);
      let errorMessage = `🚨 AUTOPOST ERROR - ${new Date().toLocaleString('vi-VN', { timeZone: this.timezone })}\n`;
      errorMessage += `━━━━━━━━━━━━━━━━━━━━━━\n`;
      errorMessage += `❌ Lỗi thực hiện bài viết AutoPost\n`;
      errorMessage += `📝 Nội dung: ${postConfig.content.substring(0, 50)}${postConfig.content.length > 50 ? '...' : ''}\n`;
      errorMessage += `🔍 Chi tiết lỗi: ${error.message}\n`;
      errorMessage += `━━━━━━━━━━━━━━━━━━━━━━`;
      await this.sendNotificationToGroup('6691735800885668', errorMessage);
    }
  }

  loadSchedules() {
    try {
      const config = this.getAutoPostConfig();
      if (!config) {
        this.writeLog('ERROR', 'Không thể đọc cấu hình autopost');
        return;
      }
      if (!config.enabled) {
        this.writeLog('INFO', 'AutoPost bị tắt');
        return;
      }
      this.scheduledJobs.forEach(job => {
        if (job && typeof job.cancel === 'function') job.cancel();
      });
      this.scheduledJobs.clear();

      const now = new Date();
      const currentDay = now
        .toLocaleDateString('en-US', { weekday: 'long', timeZone: this.timezone })
        .toLowerCase();

      if (!config.posts || !Array.isArray(config.posts)) {
        this.writeLog('WARNING', 'Không có posts nào trong config hoặc config.posts không phải là array');
        return;
      }

      config.posts.forEach(post => {
        if (post.enabled && post.scheduledTime && post.days) {
          const rule = this.createScheduleRule(post.scheduledTime, post.days);
          const job = schedule.scheduleJob(`autopost_${post.id}`, rule, () => {
            if (this.shouldExecutePost(post)) this.executeScheduledPost(post);
          });
          this.scheduledJobs.set(post.id, job);
        }
      });
    } catch (error) {
      this.writeLog('ERROR', `Lỗi trong loadSchedules: ${error.message}`);
      return;
    }
  }

  startScheduler() {
    if (!this.isRunning) this.isRunning = true;
  }

  stopScheduler() {
    if (this.isRunning) {
      this.scheduledJobs.forEach(job => {
        if (job && typeof job.cancel === 'function') job.cancel();
      });
      this.isRunning = false;
      this.writeLog('INFO', 'AutoPost Scheduler đã dừng');
    }
  }

  restartScheduler() {
    this.stopScheduler();
    this.loadSchedules();
    this.startScheduler();
    this.writeLog('INFO', 'AutoPost Scheduler đã khởi động lại');
  }

  restartSchedulerSilent() {
    this.stopScheduler();
    this.loadSchedules();
    this.startScheduler();
    console.log('🔄 AutoPost Scheduler đã khởi động lại (silent mode)');
  }

  startAutoConfigCheck() {
    if (this.configCheckInterval) clearInterval(this.configCheckInterval);
    this.configCheckInterval = setInterval(() => {
      try {
        const config = this.getAutoPostConfig();
        if (config) {
          const vietnamTime = this.getCurrentVietnamTime();
          if (config.enabled && !this.isRunning) {
            console.log('⚠️ AutoPost bị tắt bất thường, đang khởi động lại...');
            this.restartSchedulerSilent();
          }
        } else {
          console.log(`❌ [${this.getCurrentVietnamTime()}] Không thể đọc config AutoPost`);
        }
      } catch (error) {
        console.log(`❌ [${this.getCurrentVietnamTime()}] Lỗi check config: ${error.message}`);
      }
    }, 10000);
  }

  stopAutoConfigCheck() {
    if (this.configCheckInterval) {
      clearInterval(this.configCheckInterval);
      this.configCheckInterval = null;
      console.log('🛑 Đã dừng auto check config AutoPost');
    }
  }

  addScheduledPost(
    content,
    scheduledTime,
    days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    type = 'all_groups'
  ) {
    try {
      const config = this.getAutoPostConfig();
      if (!config) return false;
      const newPost = {
        id: Date.now(),
        content,
        type,
        scheduledTime,
        days,
        enabled: true,
        lastPosted: null
      };
      config.posts.push(newPost);
      this.saveAutoPostConfig(config);
      this.restartScheduler();
      this.writeLog('INFO', `Đã thêm bài viết mới: "${content.substring(0, 30)}..." lúc ${scheduledTime}`);
      return newPost;
    } catch (error) {
      this.writeLog('ERROR', 'Lỗi thêm bài viết vào lịch', error.message);
      return false;
    }
  }

  removeScheduledPost(postId) {
    try {
      const config = this.getAutoPostConfig();
      if (!config) return false;
      const postIndex = config.posts.findIndex(p => p.id === postId);
      if (postIndex === -1) return false;
      config.posts.splice(postIndex, 1);
      this.saveAutoPostConfig(config);
      this.restartScheduler();
      this.writeLog('INFO', `Đã xóa bài viết khỏi lịch: ID ${postId}`);
      return true;
    } catch (error) {
      this.writeLog('ERROR', 'Lỗi xóa bài viết khỏi lịch', error.message);
      return false;
    }
  }

  getStats() {
    try {
      const config = this.getAutoPostConfig();
      if (!config) return null;
      const today = new Date().toDateString();
      const thisWeek = new Date();
      thisWeek.setDate(thisWeek.getDate() - 7);
      const todayPosts = config.history.filter(h => new Date(h.timestamp).toDateString() === today);
      const weekPosts = config.history.filter(h => new Date(h.timestamp) >= thisWeek);
      return {
        totalScheduledPosts: config.posts.length,
        enabledPosts: config.posts.filter(p => p.enabled).length,
        todayPosts: todayPosts.length,
        weekPosts: weekPosts.length,
        totalPosts: config.history.length,
        isRunning: this.isRunning,
        nextScheduledPost: this.getNextScheduledPost()
      };
    } catch (error) {
      this.writeLog('ERROR', 'Lỗi lấy thống kê', error.message);
      return null;
    }
  }

  getNextScheduledPost() {
    const config = this.getAutoPostConfig();
    if (!config) return null;
    const enabledPosts = config.posts.filter(p => p.enabled);
    let nextPost = null;
    let nextTime = null;
    enabledPosts.forEach(post => {
      const cronExpression = this.timeToCron?.(post.scheduledTime, post.days);
    });
    return nextPost;
  }

  cleanOldHistory() {
    try {
      const config = this.getAutoPostConfig();
      if (!config) return;
      const now = new Date();
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      config.history = config.history.filter(entry => new Date(entry.timestamp) > oneWeekAgo);
      this.saveAutoPostConfig(config);
      this.writeLog('INFO', 'Đã dọn dẹp lịch sử cũ');
    } catch (error) {
      this.writeLog('ERROR', 'Lỗi dọn dẹp lịch sử', error.message);
    }
  }

  getCurrentVietnamTime() {
    return new Date().toLocaleString('vi-VN', { timeZone: this.timezone, hour12: false });
  }

  async sendNotificationToGroup(groupId, message) {
    try {
      await this.api.sendMessage(message, groupId);
      this.writeLog('INFO', `Đã gửi thông báo đến nhóm ${groupId}`);
    } catch (error) {
      this.writeLog('ERROR', `Lỗi gửi thông báo đến nhóm ${groupId}: ${error.message}`);
    }
  }

            formatPostNotification(postConfig, results, successCount, failCount) {
                const vietnamTime = new Date().toLocaleString('vi-VN', { timeZone: this.timezone });
                let message = `🤖 AUTOPOST REPORT - ${vietnamTime}\n`;
                message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
                message += `📝 Nội dung: ${postConfig.content.substring(0, 50)}${postConfig.content.length > 50 ? '...' : ''}\n`;
                message += `⏰ Thời gian lên lịch: ${postConfig.scheduledTime}\n`;
                message += `📊 Kết quả: ✅ ${successCount} thành công | ❌ ${failCount} thất bại\n\n`;
                if (results.length > 0) {
                  message += `📋 Chi tiết:\n`;
                  results.forEach((result, index) => {
                    if (result.success) {
                      if (result.type === 'timeline') {
                        message += `${index + 1}. ✅ Timeline - ${result.result.urlPost || 'Đã đăng'}\n`;
                      } else if (result.type === 'group') {
                        message += `${index + 1}. ✅ ${result.groupName} - ${result.result.urlPost || 'Đã đăng'}\n`;
                      }
                    } else {
                      if (result.type === 'timeline') {
                        message += `${index + 1}. ❌ Timeline - ${result.error}\n`;
                      } else if (result.type === 'group') {
                        message += `${index + 1}. ❌ ${result.groupName} - ${result.error}\n`;
                      }
                    }
                  });
                }
                message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
                return message;
              }

              async executePostManually(postId) {
                try {
                  const config = this.getAutoPostConfig();
                  if (!config) {
                    this.writeLog('ERROR', 'Không thể đọc config');
                    return false;
                  }
                  const post = config.posts.find(p => p.id === postId);
                  if (!post) {
                    this.writeLog('ERROR', `Không tìm thấy bài viết ID ${postId}`);
                    return false;
                  }
                  this.writeLog('INFO', `Thực hiện bài viết thủ công ID ${postId}`);
                  await this.executeScheduledPost(post);
                  return true;
                } catch (error) {
                  this.writeLog('ERROR', `Lỗi thực hiện bài viết thủ công: ${error.message}`);
                  return false;
                }
              }

              async checkAndRunMissedPosts() {
                try {
                  const config = this.getAutoPostConfig();
                  if (!config || !config.enabled) {
                    console.log('❌ AutoPost bị tắt hoặc không có config');
                    return;
                  }
                  const now = new Date();
                  const currentDay = now.toLocaleDateString('en-US', { weekday: 'long', timeZone: this.timezone }).toLowerCase();
                  const currentTime = now.toLocaleString('vi-VN', { timeZone: this.timezone });
                  const [currentHour, currentMinute] = currentTime.split(' ')[1].split(':').map(Number);
                  console.log(`🔍 Kiểm tra bài viết còn thiếu - Hiện tại: ${currentDay} ${currentHour}:${currentMinute.toString().padStart(2, '0')}`);
                  for (const post of config.posts) {
                    if (!post.enabled) continue;
                    const [scheduledHour, scheduledMinute] = post.scheduledTime.split(':').map(Number);
                    if (!post.days.includes(currentDay)) continue;
                    const scheduledTimeToday = new Date();
                    scheduledTimeToday.setHours(scheduledHour, scheduledMinute, 0, 0);
                    const timeDiff = now - scheduledTimeToday;
                    if (timeDiff >= 0 && timeDiff <= 10 * 60 * 1000) {
                      console.log(`🚀 Thực hiện bài viết còn thiếu ID ${post.id}: "${post.content.substring(0, 30)}..."`);
                      await this.executeScheduledPost(post);
                      await new Promise(resolve => setTimeout(resolve, 5000));
                    }
                  }
                } catch (error) {
                  console.log(`❌ Lỗi kiểm tra bài viết còn thiếu: ${error.message}`);
                }
              }

              getGUID() {
                let d = Date.now();
                return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
                  const r = Math.floor((d + Math.random() * 16) % 16);
                  d = Math.floor(d / 16);
                  const s = (c === 'x' ? r : (r & 0x7) | 0x8).toString(16);
                  return s;
                });
              }
            }

            module.exports = AutoPostScheduler;