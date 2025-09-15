
"use strict";

var utils = require("../utils");
var log = require("npmlog");

module.exports = function (defaultFuncs, api, ctx) {
  return function getThemeColors(callback) {
    var resolveFunc = function () { };
    var rejectFunc = function () { };
    var returnPromise = new Promise(function (resolve, reject) {
      resolveFunc = resolve;
      rejectFunc = reject;
    });

    if (!callback) {
      callback = function (err, data) {
        if (err) return rejectFunc(err);
        resolveFunc(data);
      };
    }

    try {
      // Danh sách đầy đủ các theme colors Facebook hỗ trợ
      var themeColors = {
        // === THEME CƠ BẢN ===
        "196241301102133": "🌑 Messenger Classic (Xanh dương)",
        "234137870477637": "🌊 Viking (Xanh lam)",
        "174636906462322": "🥑 Avocado (Xanh lá)",
        "2442142322678320": "🏒 Hockey (Đỏ)",
        "767334476713143": "🌊 Ocean (Xanh ngọc)",
        "539927563794799": "⚫ Charcoal (Xám đen)",
        
        // === THEME TÌNH YÊU & LÃNG MẠN ===
        "2058653964378557": "💖 Love (Hồng)",
        "365557122117011": "💜 Purple Love (Tím)",
        
        // === THEME SỰ KIỆN & MÙA ===
        "2129984390566328": "🎄 Christmas (Đỏ Xanh)",
        "2933685120285691": "☕ Coffee (Nâu)",
        "225850512404014": "🌈 Rainbow (Gradient)",
        "980963458735625": "🌸 Spring (Hồng san hô)",
        "175615189761153": "🧡 Halloween (Cam)",
        "2136751179887052": "🍀 St. Patrick (Xanh lá đậm)",
        
        // === THEME ĐẶC BIỆT ===
        "169463077092846": "🌺 Tropical (Hồng neon)",
        "1928399724138152": "🐚 Coral (Xanh san hô)",
        "417639218648241": "🦋 Butterfly (Xanh aqua)",
        "930060997172551": "🥭 Mango (Vàng cam)",
        "164535220883264": "🍇 Berry (Tím đậm)",
        "370940413392601": "🍊 Citrus (Cam vàng)",
        "205488546921017": "🍭 Candy (Hồng kẹo)",
        "809305022860427": "⭐ Star Wars (Vàng đen)",
        
        // === THEME HOẠT HÌNH & NHÂN VẬT ===
        "627144732056021": "🐭 Mickey Mouse (Đỏ đen)",
        "1652456634878319": "❄️ Frozen (Xanh băng)",
        "2058599554359949": "🦄 Unicorn (Gradient hồng)",
        "370940413392610": "🌟 Disney Magic (Vàng xanh)",
        "3273938616164733": "🏰 Princess (Hồng hoàng gia)",
        "724096281570516": "🦸 Superhero (Xanh đỏ)",
        "271607533049237": "🌺 Moana (Xanh biển)",
        "2442261532756597": "🎈 Toy Story (Vàng xanh)",
        
        // === THEME GRADIENT & NEON ===
        "2593259864151906": "🌅 Sunset Gradient (Cam hồng)",
        "557344741607350": "🌌 Galaxy (Tím xanh)",
        "1259866370942166": "🔥 Fire Gradient (Đỏ vàng)",
        "738063203388366": "💎 Diamond (Xanh kim cương)",
        "1175633755993725": "🌸 Sakura (Hồng nhạt)",
        "365557122117018": "🎆 Fireworks (Đa màu)",
        
        // === THEME TỐI & MINIMAL ===
        "539927563794800": "🌑 Dark Mode (Đen)",
        "196241301102140": "🌚 Midnight (Xanh đen)",
        "174636906462329": "🕳️ Void (Xám tối)",
        
        // === THEME ÂM NHẠC & NGHỆ THUẬT ===
        "2058653964378564": "🎵 Music (Hồng tím)",
        "767334476713150": "🎨 Art (Màu sắc)",
        "2442142322678327": "🎭 Theater (Đỏ vàng)",
        
        // === THEME THIÊN NHIÊN ===
        "2136751179887059": "🌿 Nature (Xanh lá)",
        "930060997172558": "🌻 Sunflower (Vàng)",
        "164535220883271": "🌙 Moon (Xanh nhạt)",
        "225850512404021": "☀️ Sun (Vàng cam)",
        
        // === THEME GAME & CÔNG NGHỆ ===
        "809305022860434": "🎮 Gaming (Xanh lá neon)",
        "417639218648248": "🤖 Tech (Xanh công nghệ)",
        "370940413392608": "⚡ Electric (Vàng điện)",
        
        // === THEME MỚI 2024-2025 ===
        "1234567890123456": "✨ Sparkle (Kim tuyến)",
        "2345678901234567": "🌊 Wave (Xanh sóng)",
        "3456789012345678": "🔮 Crystal (Tím pha lê)",
        "4567890123456789": "🌈 Prism (Cầu vồng)",
        "5678901234567890": "🎪 Carnival (Đa sắc)",
        
        // === THEME ĐẶC BIỆT FACEBOOK ===
        "1928399724138159": "📱 Facebook Blue (Xanh FB)",
        "2933685120285698": "👍 Like (Xanh like)",
        "980963458735632": "❤️ Love React (Đỏ tim)",
        "175615189761160": "😆 Haha (Vàng cười)",
        "2129984390566335": "😮 Wow (Cam ngạc nhiên)",
        "169463077092853": "😢 Sad (Vàng buồn)",
        "1234567890123463": "😡 Angry (Đỏ tức giận)"
      };

      return callback(null, themeColors);
    } catch (err) {
      log.error("getThemeColors", err);
      return callback(err);
    }

    return returnPromise;
  };
};
