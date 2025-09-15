'use strict';
/* eslint-disable linebreak-style */

const chalk = require('chalk');
var isHexcolor = require('is-hexcolor');

// Hàm chuyển đổi màu hex sang RGB
function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

// Hàm tạo gradient giữa hai màu
function interpolateColor(color1, color2, factor) {
    const rgb1 = hexToRgb(color1);
    const rgb2 = hexToRgb(color2);

    if (!rgb1 || !rgb2) return '#000000';

    const r = Math.round(rgb1.r + factor * (rgb2.r - rgb1.r));
    const g = Math.round(rgb1.g + factor * (rgb2.g - rgb1.g));
    const b = Math.round(rgb1.b + factor * (rgb2.b - rgb1.b));

    return `#${(1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1)}`;
}

// Mảng màu cho gradient
const gradientColors = [
    '#FF0000', // Đỏ
    '#FF00FF', // Hồng
    '#0000FF', // Xanh dương
    '#00FFFF', // Xanh cyan
    '#00FF00'  // Xanh lá
];

function createGradientText(text, startColor, endColor) {
    const chars = text.split('');
    const gradient = chars.map((char, i) => {
        const factor = i / (chars.length - 1);
        const color = interpolateColor(startColor, endColor, factor);
        return chalk.hex(color)(char);
    });
    return gradient.join('');
}

function createMultiGradientText(text) {
    const chars = text.split('');
    const totalColors = gradientColors.length;
    const charsPerSection = Math.ceil(chars.length / (totalColors - 1));

    return chars.map((char, i) => {
        const section = Math.floor(i / charsPerSection);
        const colorIndex = Math.min(section, totalColors - 2);
        const factor = (i % charsPerSection) / charsPerSection;
        const color = interpolateColor(
            gradientColors[colorIndex],
            gradientColors[colorIndex + 1],
            factor
        );
        return chalk.hex(color)(char);
    }).join('');
}

var getText = function(/** @type {string[]} */ ...Data) {
    var Main = (Data.splice(0,1)).toString();
    for (let i = 0; i < Data.length; i++) Main = Main.replace(RegExp(`%${i + 1}`, 'g'), Data[i]);
    return Main;
};

/**
 * @param {any} obj
 */
function getType(obj) {
    return Object.prototype.toString.call(obj).slice(8, -1);
}

const importantMessages = [
    'Mã Hoá AppState Thành Công',
    'Giải Hóa AppState Thành Công',
    'DecryptSuccess',
    'EncryptSuccess',
    'AppState Success',
    'AppState Failed',
    'Decrypt Failed',
    'Invalid AppState',
    'Login Success',
    'Login Failed',
    'TYP',
    'typing',
    'sendTypingIndicator',
    'MQTT publish'
];

function shouldShowMessage(message) {
    return importantMessages.some(important => 
        message.includes(important) || 
        message.includes('AppState') ||
        message.includes('Login') ||
        message.includes('Decrypt') ||
        message.includes('Encrypt') ||
        message.includes('TYP') ||
        message.includes('typing') ||
        message.includes('sendTypingIndicator') ||
        message.includes('MQTT publish')
    );
}

module.exports = {
    Normal: function(LogLevel, message) {
        if (isHexcolor(global.Fca.Require.FastConfig.MainColor) != true) {
            this.Warning(getText(global.Fca.Require.Language.Index.InvaildMainColor, global.Fca.Require.FastConfig.MainColor), process.exit(0));
        }
        else {
            const prefix = chalk.hex(global.Fca.Require.FastConfig.MainColor).bold(`${global.Fca.Require.FastConfig.MainName || '『 𝗔𝘁𝗼𝗺𝗶𝗰 』'} > `);
            const gradientMessage = createMultiGradientText(LogLevel);
            if (shouldShowMessage(LogLevel)) {
                console.log(prefix + gradientMessage);
            }
        }
        if (getType(message) == 'Function' || getType(message) == 'AsyncFunction') {
            return message();
        }
        if (message) {
            return message;
        }
       
        return LogLevel;
    },

    Warning: function(str, callback) {
        // Không làm gì cả, ẩn tất cả các log cảnh báo
    },

    Error: function(str, callback) {
        // Không làm gì cả, ẩn tất cả các log lỗi
    },

    Success: function(str, callback) {
        const gradientMessage = createGradientText(String(str), '#00FF00', '#006400'); // Gradient từ xanh lá sáng sang xanh lá đậm
        if (shouldShowMessage(str)) {
            console.log(chalk.hex('#9900FF').bold(`${global.Fca.Require.FastConfig.MainName || '『 𝗔𝘁𝗼𝗺𝗶𝗰 』'} → `) + gradientMessage);
        }
        if (getType(callback) == 'Function' || getType(callback) == 'AsyncFunction') {
            callback();
        }
        else return callback;
    },

    Info: function(str, callback) {
    }
};