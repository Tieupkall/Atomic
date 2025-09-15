/* eslint-disable linebreak-style */
"use strict";

const utils = require("../utils");

function debugThemeExtraction(data) {
  const messageThread = data.message_thread;
  if (!messageThread) return null;

  const themeData = {};

  Object.keys(messageThread).forEach(key => {
    if (key.toLowerCase().includes('theme')) {
      themeData[key] = messageThread[key];
    }
  });

  Object.keys(messageThread).forEach(key => {
    if (key.toLowerCase().includes('color')) {
      themeData[key] = messageThread[key];
    }
  });

  if (messageThread.customization_info) {
    Object.keys(messageThread.customization_info).forEach(key => {
      if (key.toLowerCase().includes('theme') || key.toLowerCase().includes('color')) {
        themeData[`customization_${key}`] = messageThread.customization_info[key];
      }
    });
  }

  if (messageThread.thread_theme && typeof messageThread.thread_theme === 'object') {
    themeData.thread_theme_full = messageThread.thread_theme;
  }

  const deepSearch = (obj, path = '') => {
    if (!obj || typeof obj !== 'object') return;

    Object.keys(obj).forEach(key => {
      const currentPath = path ? `${path}.${key}` : key;
      const value = obj[key];

      if (key.toLowerCase().includes('theme') || key.toLowerCase().includes('color')) {
        themeData[`deep_${currentPath}`] = value;
      }

      if (typeof value === 'object' && value !== null) {
        deepSearch(value, currentPath);
      }
    });
  };

  deepSearch(messageThread);

  const possibleThemeProps = [
    'thread_theme',
    'customization_info',
    'thread_customization',
    'appearance',
    'style',
    'visual_customization',
    'thread_settings',
    'thread_style'
  ];

  possibleThemeProps.forEach(prop => {
    if (messageThread[prop]) {
      themeData[prop] = messageThread[prop];
    }
  });

  return themeData;
}

function extractThemeInfoAdvanced(messageThread) {
  const themeInfo = {
    themeID: null,
    themeName: null,
    themeColor: null,
    themeEmoji: null,
    customTheme: null,
    rawThemeData: null
  };

  if (messageThread.thread_theme) {
    themeInfo.rawThemeData = messageThread.thread_theme;
    if (messageThread.thread_theme.id) {
      themeInfo.themeID = messageThread.thread_theme.id;
    }
    if (messageThread.thread_theme.name) {
      themeInfo.themeName = messageThread.thread_theme.name;
    }
  }

  if (messageThread.customization_info) {
    const customInfo = messageThread.customization_info;
    const possibleThemeIdFields = [
      'theme_id',
      'themeId',
      'thread_theme_id',
      'theme',
      'appearance_theme_id',
      'visual_theme_id'
    ];

    possibleThemeIdFields.forEach(field => {
      if (customInfo[field]) {
        themeInfo.themeID = customInfo[field];
      }
    });

    if (customInfo.outgoing_bubble_color) {
      themeInfo.themeColor = customInfo.outgoing_bubble_color;
    }

    if (customInfo.emoji) {
      themeInfo.themeEmoji = customInfo.emoji;
    }
  }

  const otherPossibleLocations = [
    'thread_customization',
    'appearance_settings',
    'visual_customization',
    'thread_appearance'
  ];

  otherPossibleLocations.forEach(location => {
    if (messageThread[location] && messageThread[location].theme_id) {
      themeInfo.themeID = messageThread[location].theme_id;
    }
  });

  if (messageThread.image && messageThread.image.uri) {
    const imageUrl = messageThread.image.uri;
    const themeIdMatch = imageUrl.match(/theme[_-]?id[=:]([0-9]+)/i);
    if (themeIdMatch) {
      themeInfo.themeID = themeIdMatch[1];
    }
  }

  return themeInfo;
}

async function testThemeExtraction(threadID, defaultFuncs, ctx) {
  try {
    const form = {
      "o0": {
        doc_id: "3449967031715030",
        query_params: {
          id: threadID,
          message_limit: 0,
          load_messages: false,
          load_read_receipts: false,
          before: null
        }
      }
    };

    const Submit = {
      queries: JSON.stringify(form),
      batch_name: "MessengerGraphQLThreadFetcher"
    };

    const response = await defaultFuncs.post("https://www.facebook.com/api/graphqlbatch/", ctx.jar, Submit);
    const resData = await utils.parseAndCheckLogin(ctx, defaultFuncs)(response);

    if (resData.error || resData[resData.length - 1].error_results !== 0) {
      return null;
    }

    const cleanData = resData.slice(0, -1);

    if (cleanData[0] && cleanData[0]["o0"]) {
      const themeData = debugThemeExtraction(cleanData[0]["o0"].data);
      const advancedThemeInfo = extractThemeInfoAdvanced(cleanData[0]["o0"].data.message_thread);

      return {
        debugData: themeData,
        advancedInfo: advancedThemeInfo,
        rawData: cleanData[0]["o0"].data
      };
    } else {
      return null;
    }

  } catch (error) {
    return null;
  }
}

async function checkAllThreadThemes(defaultFuncs, ctx) {
  try {
    await defaultFuncs.get("https://www.facebook.com/ajax/mercury/thread_list.php", ctx.jar, {
      limit: 10,
      timestamp: Date.now()
    });
  } catch (error) {}
}

module.exports = function(defaultFuncs, api, ctx) {
  global.debugThemeExtraction = (data) => debugThemeExtraction(data);
  global.testThemeExtraction = (threadID) => testThemeExtraction(threadID, defaultFuncs, ctx);
  global.checkAllThreadThemes = () => checkAllThreadThemes(defaultFuncs, ctx);

  return {
    debugThemeExtraction,
    extractThemeInfoAdvanced,
    testThemeExtraction: (threadID) => testThemeExtraction(threadID, defaultFuncs, ctx)
  };
};