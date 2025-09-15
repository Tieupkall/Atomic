
"use strict";

const utils = require("../utils");
// @NethWs3Dev

module.exports = function (defaultFuncs, api, ctx) {
  return async function changeThreadEmoji(emoji, threadID, callback = () => {}) {
    try {
      const form = {
        emoji_choice: emoji,
        thread_or_other_fbid: threadID,
      };

      const response = await defaultFuncs
        .post(
          "https://www.facebook.com/messaging/save_thread_emoji/?source=thread_settings&__pc=EXP1%3Amessengerdotcom_pkg",
          ctx.jar,
          form,
        )
        .then(utils.parseAndCheckLogin(ctx, defaultFuncs));

      if (response.error === 1357031) {
        const error = {
          error: "Trying to change emoji of a chat that doesn't exist. Have at least one message in the thread before trying to change the emoji.",
        };
        utils.error("changeThreadEmoji", error);
        return callback(error, null);
      }
      
      if (response.error) {
        utils.error("changeThreadEmoji", response);
        return callback(response, null);
      }

      // Thành công
      return callback(null, { success: true, emoji: emoji, threadID: threadID });

    } catch (err) {
      utils.error("changeThreadEmoji", err);
      return callback(err, null);
    }
  };
};