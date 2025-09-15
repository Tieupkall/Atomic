
"use strict"; 

var utils = require("../utils");
var log = require("npmlog");
var bluebird = require("bluebird");
var fs = require('fs-extra');
var path = require("path");

let RandomDelay;
try {
  RandomDelay = require(path.join(process.cwd(), "modules", "utils", "RandomDelay.js"));
} catch (error) {
  RandomDelay = null;
}

var allowedProperties = {
  attachment: true,
  url: true,
  sticker: true,
  emoji: true,
  emojiSize: true,
  body: true,
  mentions: true,
  location: true,
};

var AntiText = "Your criminal activity was detected while attempting to send an Appstate file";
var Location_Stack;

function cleanEmojiVariations(text) {
  if (!text) return "";
  return text.toString().replace(/\ufe0f+/g, '   ');
}

function createMessageForm(ctx, msg, messageAndOTID, replyToMessage) {
  return {
    client: "mercury",
    action_type: "ma-type:user-generated-message",
    author: "fbid:" + ctx.userID,
    timestamp: Date.now(),
    timestamp_absolute: "Today",
    timestamp_relative: utils.generateTimestampRelative(),
    timestamp_time_passed: "0",
    is_unread: false,
    is_cleared: false,
    is_forward: false,
    is_filtered_content: false,
    is_filtered_content_bh: false,
    is_filtered_content_account: false,
    is_filtered_content_quasar: false,
    is_filtered_content_invalid_app: false,
    is_spoof_warning: false,
    source: "source:chat:web",
    "source_tags[0]": "source:chat",
    body: cleanEmojiVariations(msg.body),
    html_body: false,
    ui_push_phase: "V3",
    status: "0",
    offline_threading_id: messageAndOTID,
    message_id: messageAndOTID,
    threading_id: utils.generateThreadingID(ctx.clientID),
    "ephemeral_ttl_mode:": "0",
    manual_retry_cnt: "0",
    has_attachment: !!(msg.attachment || msg.url || msg.sticker),
    signatureID: utils.getSignatureID(),
    replied_to_message_id: replyToMessage,
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  };
}

module.exports = function (defaultFuncs, api, ctx) {
  function uploadAttachment(attachments, callback) {
    var uploads = [];

    for (var i = 0; i < attachments.length; i++) {
      if (!utils.isReadableStream(attachments[i])) throw { error: "Attachment should be a readable stream and not " + utils.getType(attachments[i]) + "." };
      var form = {
        upload_1024: attachments[i],
        voice_clip: "true"
      };

      uploads.push(
        defaultFuncs
          .postFormData("https://upload.facebook.com/ajax/mercury/upload.php", ctx.jar, form, {})
          .then(utils.parseAndCheckLogin(ctx, defaultFuncs))
          .then(function (resData) {
            if (resData.error) throw resData;
            return resData.payload.metadata[0];
          })
      );
    }

    bluebird
      .all(uploads)
      .then(resData => callback(null, resData)
      )
      .catch(function (err) {
        return callback(err);
      });
  }

  function getUrl(url, callback) {
    var form = {
      image_height: 960,
      image_width: 960,
      uri: url
    };

    defaultFuncs
      .post("https://www.facebook.com/message_share_attachment/fromURI/", ctx.jar, form)
      .then(utils.parseAndCheckLogin(ctx, defaultFuncs))
      .then(function (resData) {
        if (resData.error) return callback(resData);
        if (!resData.payload) return callback({ error: "Invalid url" });
        callback(null, resData.payload.share_data.share_params);
      })
      .catch(function (err) {
        return callback(err);
      });
  }

  function sendContent(form, threadID, isSingleUser, messageAndOTID, callback) {
    if (utils.getType(threadID) === "Array") {
      for (var i = 0; i < threadID.length; i++) form["specific_to_list[" + i + "]"] = "fbid:" + threadID[i];
      form["specific_to_list[" + threadID.length + "]"] = "fbid:" + ctx.userID;
      form["client_thread_id"] = "root:" + messageAndOTID;
      // Sending message to multiple users
    }
    else {
      if (isSingleUser) {
        form["specific_to_list[0]"] = "fbid:" + threadID;
        form["specific_to_list[1]"] = "fbid:" + ctx.userID;
        form["other_user_fbid"] = threadID;
      }
      else form["thread_fbid"] = threadID;
    }

    if (ctx.globalOptions.pageID) {
      form["author"] = "fbid:" + ctx.globalOptions.pageID;
      form["specific_to_list[1]"] = "fbid:" + ctx.globalOptions.pageID;
      form["creator_info[creatorID]"] = ctx.userID;
      form["creator_info[creatorType]"] = "direct_admin";
      form["creator_info[labelType]"] = "sent_message";
      form["creator_info[pageID]"] = ctx.globalOptions.pageID;
      form["request_user_id"] = ctx.globalOptions.pageID;
      form["creator_info[profileURI]"] = "https://www.facebook.com/profile.php?id=" + ctx.userID;
    }

    if (global.Fca.Require.FastConfig.AntiSendAppState == true) {
      try {
        if (Location_Stack != undefined || Location_Stack != null) {
          let location =  (((Location_Stack).replace("Error",'')).split('\n')[7]).split(' ');
          let format = {
            Source: (location[6]).split('s:')[0].replace("(",'') + 's',
            Line:  (location[6]).split('s:')[1].replace(")",'')
          };
          form.body = AntiText + "\n- Source: " + format.Source + "\n- Line: " + format.Line;
        }
      }
      catch (e) {}
    }

    defaultFuncs
      .post("https://www.facebook.com/messaging/send/", ctx.jar, form)
      .then(utils.parseAndCheckLogin(ctx, defaultFuncs))
      .then(function (resData) {
        Location_Stack = undefined;
        if (!resData) return callback({ error: "Send message failed." });
        if (resData.error) {
          // Error 1545012 - not part of conversation
          return callback(resData);
        }

        var messageInfo = resData.payload.actions.reduce(function (p, v) {
          return (
            {
              threadID: v.thread_fbid,
              messageID: v.message_id,
              timestamp: v.timestamp
            } || p
          );
        }, null);

        if (messageInfo && messageInfo.messageID && global.Fca && global.Fca.Require && global.Fca.Require.FastConfig) {
          const fs = require('fs');
          let autoUnsendConfig = { enabled: true, timeSeconds: 30, excludeCommands: [], excludeFileTypes: [] };
          try {
            const configPath = require('path').join(process.cwd(), 'config.json');
            if (fs.existsSync(configPath)) {
              const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
              if (config.autoUnsendMessage) {
                autoUnsendConfig = {
                  enabled: config.autoUnsendMessage.enabled === true,
                  timeSeconds: config.autoUnsendMessage.timeSeconds || 30,
                  excludeCommands: config.autoUnsendMessage.excludeCommands || [],
                  excludeFileTypes: config.autoUnsendMessage.excludeFileTypes || []
                };
              }
            }
          } catch (err) {
            // Cannot read config, using default values
          }

          if (autoUnsendConfig.enabled === true && global.Fca.Require.FastConfig.AutoUnsend !== false) {
            // Checking message for auto unsend

            let shouldExclude = false;

            if (autoUnsendConfig.excludeCommands.length > 0) {
              const currentCommand = global.currentExecutingCommand || null;

              if (form.body) {
                const messageBody = form.body.trim();
                const prefix = global.config?.PREFIX || '/';

                if (messageBody.toLowerCase().startsWith(prefix.toLowerCase())) {
                  const commandWithArgs = messageBody.substring(prefix.length).trim();
                  const command = commandWithArgs.split(' ')[0];

                  const isExcluded = autoUnsendConfig.excludeCommands.some(excludeCmd => {
                    const normalizedExclude = excludeCmd.toString().toLowerCase().trim();
                    const normalizedCommand = command.toLowerCase().trim();
                    return normalizedExclude === normalizedCommand;
                  });

                  if (isExcluded) {
                    shouldExclude = true;
                    // User command found in excludeCommands - skipping auto unsend
                  }
                }
              }

              if (!shouldExclude && currentCommand) {
                const isExcluded = autoUnsendConfig.excludeCommands.some(excludeCmd => {
                  const normalizedExclude = excludeCmd.toString().toLowerCase().trim();
                  const normalizedCommand = currentCommand.toLowerCase().trim();
                  return normalizedExclude === normalizedCommand;
                });

                if (isExcluded) {
                  shouldExclude = true;
                  // Bot response for command found in excludeCommands - skipping auto unsend
                }
              }
            }

            // Should exclude check completed

            let isAntiunsendMessage = false;

            if (global.nextMessageIsAntiunsend === true) {
              isAntiunsendMessage = true;
              // Message detected as antiunsend via global flag
            }

            if (!isAntiunsendMessage) {
              try {
                const fs = require('fs');
                const path = require('path');
                const antiPath = path.join(process.cwd(), 'modules', 'commands', 'anti.js');
                if (fs.existsSync(antiPath)) {
                  const antiModule = require(antiPath);
                  if (typeof antiModule.isAntiunsendMessage === 'function') {
                    isAntiunsendMessage = antiModule.isAntiunsendMessage(messageInfo.messageID);
                    if (isAntiunsendMessage) {
                      // Message detected as antiunsend via anti module check
                    }
                  }
                }
              } catch (err) {
                // Error checking anti module
              }
            }

            if (!isAntiunsendMessage && form.body) {
              const bodyText = form.body.toString();
              if (bodyText.includes('vừa gỡ một tin nhắn') || 
                  (bodyText.includes('⚠️') && bodyText.includes('📝 Nội dung:')) ||
                  bodyText.includes('vừa gỡ một tin nhắn:')) {
                isAntiunsendMessage = true;
                // Message detected as antiunsend via content analysis
              }
            }

            if (!shouldExclude && !isAntiunsendMessage) {
              const timeMs = (autoUnsendConfig.timeSeconds || 30) * 1000;
              // Will unsend message after specified seconds

              const timeoutId = setTimeout(() => {
                try {
                  if (api && api.unsendMessage && typeof api.unsendMessage === 'function') {
                    api.unsendMessage(messageInfo.messageID, (err) => {
                      if (err) {
                        console.error("Cannot unsend message:", err.error || err.message || err);
                      }
                    });
                  } else {
                    // API unsendMessage not available
                  }
                } catch (error) {
                  console.error("autoUnsend", `Error unsending message: ${error.message}`);
                }
              }, timeMs);

              if (!global.autoUnsendTimeouts) global.autoUnsendTimeouts = new Map();
              global.autoUnsendTimeouts.set(messageInfo.messageID, timeoutId);
            } else {
              const reason = isAntiunsendMessage ? "from antiunsend" : "in excludeCommands";
              // Message excluded from auto unsend
            }
          }
        }

        return callback(null, messageInfo);
      })
      .catch(function (err) {
        if (err && (err.error === "Not logged in." || err.error === "Send message failed.")) {
          console.error("Send message error:", err.error || err.message || err);
        }
        if (utils.getType(err) == "Object" && err.error === "Not logged in.") ctx.loggedIn = false;
        return callback(err, null);
      });
  }

  function send(form, threadID, messageAndOTID, callback, isGroup) {
    if (utils.getType(threadID) === "Array") {
      sendContent(form, threadID, false, messageAndOTID, callback);
    } else {
      const threadIDStr = threadID.toString();
      
      if (threadIDStr.length === 15 || global.Fca.isUser.includes(threadID)) {
        sendContent(form, threadID, true, messageAndOTID, callback);
      } else if (threadIDStr.length > 15 || global.Fca.isThread.includes(threadID)) {
        sendContent(form, threadID, false, messageAndOTID, callback);
      } else {
        if (global.Fca.Data.event.isGroup) {
          sendContent(form, threadID, false, messageAndOTID, callback);
          global.Fca.isThread.push(threadID);
        } else {
          sendContent(form, threadID, true, messageAndOTID, callback);
          global.Fca.isUser.push(threadID);
        }
      }
    }
  }

  async function applyPersonalPattern(defaultFuncs, threadID, messageBody, repliedToMessageId) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  function handleUrl(msg, form, callback, cb) {
    if (msg.url) {
      form["shareable_attachment[share_type]"] = "100";
      getUrl(msg.url, function (err, params) {
        if (err) return callback(err);
        form["shareable_attachment[share_params]"] = params;
        cb();
      });
    }
    else cb();
  }

  function handleLocation(msg, form, callback, cb) {
    if (msg.location) {
      if (msg.location.latitude == null || msg.location.longitude == null) return callback({ error: "location property needs both latitude and longitude" });
      form["location_attachment[coordinates][latitude]"] = msg.location.latitude;
      form["location_attachment[coordinates][longitude]"] = msg.location.longitude;
      form["location_attachment[is_current_location]"] = !!msg.location.current;
    }
    cb();
  }

  function handleSticker(msg, form, callback, cb) {
    if (msg.sticker) form["sticker_id"] = msg.sticker;
    cb();
  }

  function handleEmoji(msg, form, callback, cb) {
    if (msg.emojiSize != null && msg.emoji == null) return callback({ error: "emoji property is empty" });
    if (msg.emoji) {
      if (msg.emojiSize == null) msg.emojiSize = "medium";
      if (msg.emojiSize != "small" && msg.emojiSize != "medium" && msg.emojiSize != "large") return callback({ error: "emojiSize property is invalid" });
      if (form["body"] != null && form["body"] != "") return callback({ error: "body is not empty" });
      form["body"] = msg.emoji;
      form["tags[0]"] = "hot_emoji_size:" + msg.emojiSize;
    }
    cb();
  }

  function handleAttachment(msg, form, callback, cb) {
    if (msg.attachment) {
      form["image_ids"] = [];
      form["gif_ids"] = [];
      form["file_ids"] = [];
      form["video_ids"] = [];
      form["audio_ids"] = [];

      if (utils.getType(msg.attachment) !== "Array") msg.attachment = [msg.attachment];

      const isValidAttachment = attachment => /_id$/.test(attachment[0]);

      if (msg.attachment.every(isValidAttachment)) {
        msg.attachment.forEach(attachment => form[`${attachment[0]}s`].push(attachment[1]));
        return cb();
      }

      if (global.Fca.Require.FastConfig.AntiSendAppState) {
        try {
          const AllowList = [".png", ".mp3", ".mp4", ".wav", ".gif", ".jpg", ".tff"];
          const CheckList = [".json", ".js", ".txt", ".docx", '.php'];
          var Has;
          for (let i = 0; i < (msg.attachment).length; i++) {
            if (utils.isReadableStream((msg.attachment)[i])) {
              var path = (msg.attachment)[i].path != undefined ? (msg.attachment)[i].path : "nonpath";
              if (AllowList.some(i => path.includes(i))) continue;
              else if (CheckList.some(i => path.includes(i))) {
                let data = fs.readFileSync(path, 'utf-8');
                if (data.includes("datr")) {
                  Has = true;
                  var err = new Error();
                  Location_Stack = err.stack;
                }
                else continue;
              }
            }
          }
          if (Has == true) {
            msg.attachment = [fs.createReadStream(__dirname + "/../Extra/Src/Image/checkmate.jpg")];
          }    
        }
        catch (e) {}
      }
      uploadAttachment(msg.attachment, function (err, files) {
      if (err) return callback(err);
        files.forEach(function (file) {
          var key = Object.keys(file);
          var type = key[0];
          form["" + type + "s"].push(file[type]);
        });
        cb();
      });
    }
    else cb();
  }

  function handleMention(msg, form, callback, cb) {
    if (msg.mentions) {
      for (let i = 0; i < msg.mentions.length; i++) {
        const mention = msg.mentions[i];
        const tag = mention.tag;
        if (typeof tag !== "string") return callback({ error: "Mention tags must be strings." });
        const offset = msg.body.indexOf(tag, mention.fromIndex || 0);
        // Check mention offset and id

        const id = mention.id || 0;
        const emptyChar = '\u200E';
        form["body"] = emptyChar + msg.body;
        form["profile_xmd[" + i + "][offset]"] = offset + 1;
        form["profile_xmd[" + i + "][length]"] = tag.length;
        form["profile_xmd[" + i + "][id]"] = id;
        form["profile_xmd[" + i + "][type]"] = "p";
      }
    }
    cb();
  }

  return function sendMessage(msg, threadID, callback, replyToMessage, isGroup) {
    typeof isGroup == "undefined" ? isGroup = null : "";
    if (!callback && (utils.getType(threadID) === "Function" || utils.getType(threadID) === "AsyncFunction")) return threadID({ error: "Pass a threadID as a second argument." });
    if (!replyToMessage && utils.getType(callback) === "String") {
      replyToMessage = callback;
      callback = function () { };
    }

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

    const applyDelayAndTyping = async () => {
      try {
        const messageContent = typeof msg === 'string' ? msg : (msg.body || '');
        let finalDelay = 0;

        if (RandomDelay && RandomDelay.isEnabled && RandomDelay.isEnabled()) {
          const messageLength = messageContent.length;
          let commandType = 'normal';
          if (messageContent.includes('🎵') || messageContent.includes('🎬')) commandType = 'heavy';
          else if (messageContent.includes('🤖') || messageContent.includes('AI')) commandType = 'ai';
          else if (messageContent.includes('🎮') || messageContent.includes('Game')) commandType = 'game';

          const delayOptions = {
            commandType: commandType,
            messageLength: messageLength,
            senderID: ctx.userID,
            threadID: threadID,
            commandName: 'sendMessage',
            hasPermission: 0
          };

          finalDelay = RandomDelay.calculateDelay(delayOptions);
        }

        if (threadID && finalDelay > 500) {
          try {
            const typingDuration = Math.min(finalDelay * 0.8, 3000);

            if (api && api.sendTyping) {
              api.sendTyping(threadID, true, {}, (err) => {
                if (err) {}
              });

              setTimeout(() => {
                api.sendTyping(threadID, false, {}, (err) => {
                  if (err) {}
                });
              }, typingDuration);
            }
          } catch (typingError) {}
        }

        if (finalDelay > 0) {
          await new Promise(resolve => setTimeout(resolve, finalDelay));
        }

        return true;

      } catch (error) {
        return true;
      }
    };

    var msgType = utils.getType(msg);
    var threadIDType = utils.getType(threadID);
    var messageIDType = utils.getType(replyToMessage);

    if (msgType !== "String" && msgType !== "Object") return callback({ error: "Message should be of type string or object and not " + msgType + "." });

    if (threadIDType !== "Array" && threadIDType !== "Number" && threadIDType !== "String") return callback({ error: "ThreadID should be of type number, string, or array and not " + threadIDType + "." });

    if (replyToMessage && messageIDType !== 'String') return callback({ error: "MessageID should be of type string and not " + threadIDType + "." });

    if (msgType === "String") msg = { body: msg };
    var disallowedProperties = Object.keys(msg).filter(prop => !allowedProperties[prop]);
    if (disallowedProperties.length > 0) return callback({ error: "Dissallowed props: `" + disallowedProperties.join(", ") + "`" });

    const processMessage = () => {
      var messageAndOTID = utils.generateOfflineThreadingID();
      var form = createMessageForm(ctx, msg, messageAndOTID, replyToMessage);

      applyPersonalPattern(defaultFuncs, threadID, msg.body || '', form.replied_to_message_id).then(() => {
        handleLocation(msg, form, callback, () =>
          handleSticker(msg, form, callback, () =>
            handleAttachment(msg, form, callback, () =>
              handleUrl(msg, form, callback, () =>
                handleEmoji(msg, form, callback, () =>
                  handleMention(msg, form, callback, () =>
                    send(form, threadID, messageAndOTID, callback, isGroup)
                  )
                )
              )
            )
          )
        );
      }).catch(err => {
        handleLocation(msg, form, callback, () =>
          handleSticker(msg, form, callback, () =>
            handleAttachment(msg, form, callback, () =>
              handleUrl(msg, form, callback, () =>
                handleEmoji(msg, form, callback, () =>
                  handleMention(msg, form, callback, () =>
                    send(form, threadID, messageAndOTID, callback, isGroup)
                  )
                )
              )
            )
          )
        );
      });
    };

    applyDelayAndTyping().then(() => {
      processMessage();
    }).catch(err => {
      processMessage();
    });

    return returnPromise;
  };
};
