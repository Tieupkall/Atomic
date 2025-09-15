
"use strict";

var utils = require("../utils");

module.exports = function(defaultFuncs, api, ctx) {
  return function getThemeID(threadID, callback) {
    var resolveFunc = function(){};
    var rejectFunc = function(){};
    var returnPromise = new Promise(function (resolve, reject) {
      resolveFunc = resolve;
      rejectFunc = reject;
    });

    if (utils.getType(callback) != "Function" && utils.getType(callback) != "AsyncFunction") {
      callback = function (err, data) {
        if (err) {
          return rejectFunc(err);
        }
        resolveFunc(data);
      };
    }

    console.log("🎯 [GET_THEME_ID] Starting to get theme ID for:", threadID);

    // GraphQL query để lấy theme info chi tiết
    var form = {
      "o0": {
        doc_id: "3449967031715030", // Same as getThreadInfo but we'll extract theme differently
        query_params: { 
          id: threadID, 
          message_limit: 0, 
          load_messages: false, 
          load_read_receipts: false, 
          before: null 
        }
      }
    };

    var Submit = { 
      queries: JSON.stringify(form), 
      batch_name: "MessengerGraphQLThreadFetcher" 
    };

    defaultFuncs.post("https://www.facebook.com/api/graphqlbatch/", ctx.jar, Submit)
      .then(utils.parseAndCheckLogin(ctx, defaultFuncs))
      .then(function(resData) {
        if (resData.error || resData[resData.length - 1].error_results !== 0) {
          throw new Error("GraphQL Error: " + JSON.stringify(resData.error));
        }

        var cleanData = resData.slice(0, -1);
        console.log("🔍 [GET_THEME_ID] Raw response:", JSON.stringify(cleanData, null, 2));

        if (cleanData[0] && cleanData[0]["o0"] && cleanData[0]["o0"].data) {
          var messageThread = cleanData[0]["o0"].data.message_thread;
          
          console.log("🎨 [GET_THEME_ID] Thread theme data:");
          console.log("- thread_theme:", messageThread.thread_theme);
          console.log("- customization_info:", JSON.stringify(messageThread.customization_info, null, 2));

          var result = {
            threadID: threadID,
            threadTheme: messageThread.thread_theme,
            customizationInfo: messageThread.customization_info,
            color: null,
            themeID: null,
            source: "unknown"
          };

          // Extract color from customization_info
          if (messageThread.customization_info && messageThread.customization_info.outgoing_bubble_color) {
            result.color = messageThread.customization_info.outgoing_bubble_color.slice(2); // Remove "0x" prefix
          }

          // Try to extract theme ID from various sources
          if (messageThread.thread_theme && messageThread.thread_theme !== null) {
            result.themeID = messageThread.thread_theme;
            result.source = "thread_theme";
          } else if (messageThread.customization_info && messageThread.customization_info.theme_fbid) {
            result.themeID = messageThread.customization_info.theme_fbid;
            result.source = "customization_theme_fbid";
          } else if (result.color) {
            result.themeID = result.color;
            result.source = "color_fallback";
          }

          console.log("✅ [GET_THEME_ID] Result:", JSON.stringify(result, null, 2));
          return callback(null, result);

        } else {
          throw new Error("No thread data found in response");
        }
      })
      .catch(function(error) {
        console.error("❌ [GET_THEME_ID] Error:", error);
        return callback(error);
      });

    return returnPromise;
  };
};
