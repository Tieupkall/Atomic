/* eslint-disable linebreak-style */
"use strict";

const utils = require("../utils");

/**
 * Format event reminders data
 * @param {Object} reminder - Raw reminder data
 * @returns {Object} Formatted reminder object
 */
function formatEventReminders(reminder) {
  if (!reminder) return null;
  
  return {
    reminderID: reminder.id,
    eventCreatorID: reminder.lightweight_event_creator?.id,
    time: reminder.time,
    eventType: reminder.lightweight_event_type?.toLowerCase(),
    locationName: reminder.location_name,
    locationCoordinates: reminder.location_coordinates,
    locationPage: reminder.location_page,
    eventStatus: reminder.lightweight_event_status?.toLowerCase(),
    note: reminder.note,
    repeatMode: reminder.repeat_mode?.toLowerCase(),
    eventTitle: reminder.event_title,
    triggerMessage: reminder.trigger_message,
    secondsToNotifyBefore: reminder.seconds_to_notify_before,
    allowsRsvp: reminder.allows_rsvp,
    relatedEvent: reminder.related_event,
    members: reminder.event_reminder_members?.edges?.map(member => ({
      memberID: member.node?.id,
      state: member.guest_list_state?.toLowerCase()
    })) || []
  };
}

/**
 * Extract theme information from thread data
 * @param {Object} messageThread - Thread data from GraphQL
 * @returns {Object} Theme information
 */
function extractThemeInfo(messageThread) {
  const themeInfo = {
    threadTheme: null,
    themeID: null,
    themeName: null,
    themeColor: null,
    customTheme: null
  };

  // Check thread_theme property
  if (messageThread.thread_theme) {
    themeInfo.threadTheme = messageThread.thread_theme;
    
    // Extract theme ID from thread_theme
    if (messageThread.thread_theme.id) {
      themeInfo.themeID = messageThread.thread_theme.id;
    }
    
    // Extract theme name
    if (messageThread.thread_theme.name) {
      themeInfo.themeName = messageThread.thread_theme.name;
    }
    
    // Extract theme color
    if (messageThread.thread_theme.theme_color) {
      themeInfo.themeColor = messageThread.thread_theme.theme_color;
    }
    
    // Check for custom theme data
    if (messageThread.thread_theme.custom_theme) {
      themeInfo.customTheme = messageThread.thread_theme.custom_theme;
    }
  }

  // Also check customization_info for theme data
  if (messageThread.customization_info) {
    const customInfo = messageThread.customization_info;
    
    // Check for theme-related properties in customization_info
    if (customInfo.theme_id) {
      themeInfo.themeID = customInfo.theme_id;
    }
    
    if (customInfo.theme_color) {
      themeInfo.themeColor = customInfo.theme_color;
    }
  }

  return themeInfo;
}

/**
 * Format thread GraphQL response
 * @param {Object} data - Raw GraphQL data
 * @returns {Object} Formatted thread info
 */
function formatThreadGraphQLResponse(data) {
  if (!data || !data.message_thread) {
    throw new Error("Invalid thread data received");
  }

  try {
    const messageThread = data.message_thread;
    
    // Extract theme information
    const themeInfo = extractThemeInfo(messageThread);
    
    // Multiple ways to extract thread ID with fallbacks
    let threadID = null;
    
    if (messageThread.thread_key) {
      threadID = messageThread.thread_key.thread_fbid || 
                messageThread.thread_key.other_user_id ||
                messageThread.thread_key.id;
    }
    
    // Additional fallbacks
    if (!threadID && messageThread.id) {
      threadID = messageThread.id;
    }
    
    if (!threadID && messageThread.thread_id) {
      threadID = messageThread.thread_id;
    }
    
    // Convert to string to ensure consistency
    if (threadID) {
      threadID = String(threadID);
    }
    
    if (!threadID) {
      console.error("❌ Thread ID extraction failed for:", {
        thread_key: messageThread.thread_key,
        id: messageThread.id,
        thread_id: messageThread.thread_id,
        available_keys: Object.keys(messageThread)
      });
      throw new Error("Thread ID not found in response - check console for details");
    }

    // Process last message
    const lastM = messageThread.last_message;
    const snippetID = lastM?.nodes?.[0]?.message_sender?.messaging_actor?.id || null;
    const snippetText = lastM?.nodes?.[0]?.snippet || null;
    
    // Process last read receipt
    const lastR = messageThread.last_read_receipt;
    const lastReadTimestamp = lastR?.nodes?.[0]?.timestamp_precise || null;

    // Process participants
    const participants = messageThread.all_participants?.edges || [];
    const participantIDs = participants.map(d => d.node?.messaging_actor?.id).filter(Boolean);
    const userInfo = participants.map(d => {
      const actor = d.node?.messaging_actor;
      if (!actor) return null;
      
      return {
        id: actor.id,
        name: actor.name,
        firstName: actor.short_name,
        vanity: actor.username,
        thumbSrc: actor.big_image_src?.uri,
        profileUrl: actor.big_image_src?.uri,
        gender: actor.gender,
        type: actor.__typename,
        isFriend: actor.is_viewer_friend,
        isBirthday: Boolean(actor.is_birthday)
      };
    }).filter(Boolean);

    // Process nicknames
    const nicknames = {};
    if (messageThread.customization_info?.participant_customizations) {
      messageThread.customization_info.participant_customizations.forEach(val => {
        if (val.nickname && val.participant_id) {
          nicknames[val.participant_id] = val.nickname;
        }
      });
    }

    // Process approval queue
    const approvalQueue = messageThread.group_approval_queue?.nodes?.map(a => ({
      inviterID: a.inviter?.id,
      requesterID: a.requester?.id,
      timestamp: a.request_timestamp,
      request_source: a.request_source
    })) || [];

    return {
      threadID,
      threadName: messageThread.name,
      participantIDs,
      userInfo,
      unreadCount: messageThread.unread_count || 0,
      messageCount: messageThread.messages_count || 0,
      timestamp: messageThread.updated_time_precise,
      muteUntil: messageThread.mute_until,
      isGroup: messageThread.thread_type === "GROUP",
      isSubscribed: messageThread.is_viewer_subscribed,
      isArchived: messageThread.has_viewer_archived,
      folder: messageThread.folder,
      cannotReplyReason: messageThread.cannot_reply_reason,
      eventReminders: messageThread.event_reminders?.nodes?.map(formatEventReminders).filter(Boolean) || [],
      
      // Theme information - THIS IS WHERE YOU GET THEME DATA
      ...themeInfo,
      
      // Customization
      emoji: messageThread.customization_info?.emoji || null,
      color: messageThread.customization_info?.outgoing_bubble_color?.slice(2) || null,
      nicknames,
      
      // Admin and approval
      adminIDs: messageThread.thread_admins || [],
      approvalMode: Boolean(messageThread.approval_mode),
      approvalQueue,
      
      // Additional properties
      reactionsMuteMode: messageThread.reactions_mute_mode?.toLowerCase() || 'none',
      mentionsMuteMode: messageThread.mentions_mute_mode?.toLowerCase() || 'none',
      isPinProtected: messageThread.is_pin_protected,
      relatedPageThread: messageThread.related_page_thread,
      
      // Legacy properties
      name: messageThread.name,
      snippet: snippetText,
      snippetSender: snippetID,
      snippetAttachments: [],
      serverTimestamp: messageThread.updated_time_precise,
      imageSrc: messageThread.image?.uri || null,
      isCanonicalUser: messageThread.is_canonical_neo_user,
      isCanonical: messageThread.thread_type !== "GROUP",
      recipientsLoadable: true,
      hasEmailParticipant: false,
      readOnly: false,
      canReply: messageThread.cannot_reply_reason === null,
      lastMessageTimestamp: messageThread.last_message?.timestamp_precise || null,
      lastMessageType: "message",
      lastReadTimestamp,
      threadType: messageThread.thread_type === "GROUP" ? 2 : 1,
      TimeCreate: Date.now(),
      TimeUpdate: Date.now()
    };
  } catch (error) {
    console.error("Error formatting thread GraphQL response:", error);
    throw new Error(`Failed to format thread data: ${error.message}`);
  }
}

const MAX_ARRAY_LENGTH = 6;
let Request_Update_Time = 0;
let updateInterval = null;
let updateTimeout = null;
let Queues = [];

/**
 * Add thread to update queue
 * @param {Object} threadData - Thread data with threadID
 */
function addToQueues(threadData) {
  if (!threadData || !threadData.threadID) return;
  
  const existingArray = Queues.some(subArr => 
    subArr.some(obj => obj.threadID === threadData.threadID)
  );

  if (!existingArray) {
    if (Queues.length > 0 && Queues[Queues.length - 1].length >= MAX_ARRAY_LENGTH) {
      Queues.push([threadData]);
    } else {
      if (Queues.length === 0) {
        Queues.push([threadData]);
      } else {
        Queues[Queues.length - 1].push(threadData);
      }
    }
  }
}

/**
 * Cleanup function to prevent memory leaks
 */
function cleanup() {
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }
  if (updateTimeout) {
    clearTimeout(updateTimeout);
    updateTimeout = null;
  }
}

/**
 * Get theme ID from thread info
 * @param {Object} threadInfo - Thread information object
 * @returns {string|null} Theme ID
 */
function getThemeIDFromThreadInfo(threadInfo) {
  if (!threadInfo) return null;
  
  // Primary source: themeID from extracted theme info
  if (threadInfo.themeID) {
    return threadInfo.themeID;
  }
  
  // Secondary source: from threadTheme object
  if (threadInfo.threadTheme?.id) {
    return threadInfo.threadTheme.id;
  }
  
  // Fallback: check for theme-related properties
  if (threadInfo.threadTheme?.theme_id) {
    return threadInfo.threadTheme.theme_id;
  }
  
  return null;
}

/**
 * Get theme name from thread info
 * @param {Object} threadInfo - Thread information object
 * @returns {string|null} Theme name
 */
function getThemeNameFromThreadInfo(threadInfo) {
  if (!threadInfo) return null;
  
  if (threadInfo.themeName) {
    return threadInfo.themeName;
  }
  
  if (threadInfo.threadTheme?.name) {
    return threadInfo.threadTheme.name;
  }
  
  return null;
}

module.exports = function(defaultFuncs, api, ctx) {
  const { createData, getData, hasData, updateData, getAll } = require('../Extra/ExtraGetThread');
  const Database = require('../Extra/Database');
  
  // Load debug theme extraction module
  const debugThemeModule = require('./debugThemeExtraction')(defaultFuncs, api, ctx);
  
  console.log("🔧 [INFO] getThreadInfo.js loaded successfully");
  console.log("🔧 [INFO] Debug theme extraction module loaded");

  /**
   * Get multiple thread info
   * @param {Array} threadIDs - Array of thread IDs
   * @returns {Promise<Object>} Thread information
   */
  const getMultiInfo = async function(threadIDs) {
    if (!Array.isArray(threadIDs) || threadIDs.length === 0) {
      throw new Error("ThreadIDs must be a non-empty array");
    }
    
    
    
    // Validate and convert thread IDs
    threadIDs = threadIDs.map(id => {
      const stringId = String(id);
      if (!stringId || stringId === 'undefined' || stringId === 'null') {
        console.error(`❌ Invalid thread ID detected: ${id}`);
        return null;
      }
      return stringId;
    }).filter(Boolean);
    
    if (threadIDs.length === 0) {
      throw new Error("No valid thread IDs provided");
    }

    const form = {};
    threadIDs.forEach((threadID, index) => {
      form[`o${index}`] = {
        doc_id: "3449967031715030",
        query_params: { 
          id: threadID, 
          message_limit: 0, 
          load_messages: false, 
          load_read_receipts: false, 
          before: null 
        }
      };
    });

    const Submit = { 
      queries: JSON.stringify(form), 
      batch_name: "MessengerGraphQLThreadFetcher" 
    };

    try {
      const response = await defaultFuncs.post("https://www.facebook.com/api/graphqlbatch/", ctx.jar, Submit);
      const resData = await utils.parseAndCheckLogin(ctx, defaultFuncs)(response);
      
      if (resData.error) {
        console.error("❌ GraphQL Response Error:", resData.error);
        throw new Error(`GraphQL request failed: ${resData.error}`);
      }
      
      if (resData[resData.length - 1].error_results !== 0) {
        console.error("❌ GraphQL Batch Error:", resData[resData.length - 1]);
        throw new Error("GraphQL request failed - possibly rate limited or invalid thread IDs");
      }

      const cleanData = resData.slice(0, -1).sort((a, b) => 
        Object.keys(a)[0].localeCompare(Object.keys(b)[0])
      );
      
      const threadInfo = cleanData.map((data, index) => {
        const responseData = data[`o${index}`];
        
        // Debug logging for problematic thread ID
        if (threadIDs[index] === '24131386026449809') {
          console.log(`🔧 [DEBUG] Raw response for thread ${threadIDs[index]}:`, 
            JSON.stringify(responseData, null, 2));
        }
        
        if (!responseData || !responseData.data) {
          console.error(`❌ No data in response for thread ${threadIDs[index]}`);
          throw new Error(`No data returned for thread ${threadIDs[index]}`);
        }
        
        return formatThreadGraphQLResponse(responseData.data);
      });

      return {
        Success: true,
        Data: threadInfo
      };
    } catch (error) {
      console.error("Error in getMultiInfo:", error);
      return {
        Success: false,
        Error: error.message,
        Data: []
      };
    }
  };

  /**
   * Update user info in global cache
   * @param {Array} threadInfoArray - Array of thread info objects
   */
  const updateUserInfo = (threadInfoArray) => {
    if (!global.Fca) {
      global.Fca = { Data: {} };
    }
    
    if (!global.Fca.Data.Userinfo) {
      global.Fca.Data.Userinfo = new Map();
    }

    threadInfoArray.forEach(thread => {
      if (Array.isArray(thread.userInfo)) {
        thread.userInfo.forEach(user => {
          if (user && user.id) {
            global.Fca.Data.Userinfo.set(user.id, user);
          }
        });
      }
    });
  };

  /**
   * Check if timestamp needs update
   * @param {number} avgTimeStamp - Average timestamp
   * @returns {Object} Check result
   */
  const checkAverageStaticTimestamp = function(avgTimeStamp) {
    const DEFAULT_UPDATE_TIME = 900 * 1000; // 15 minutes
    const MAXIMUM_ERROR_TIME = 10 * 1000; // 10 seconds
    
    const updateTime = parseInt(avgTimeStamp) + parseInt(DEFAULT_UPDATE_TIME) + parseInt(MAXIMUM_ERROR_TIME);
    
    return {
      Check: updateTime >= Date.now(),
      timeLeft: updateTime - Date.now()
    };
  };

  /**
   * Auto update thread data
   */
  const autoUpdateData = async function() {
    const doUpdate = [];
    
    Queues.forEach((queueArray, index) => {
      const averageTimestamp = Math.round(
        queueArray.reduce((acc, obj) => acc + obj.TimeCreate, 0) / queueArray.length
      );
      
      const DataAvg = checkAverageStaticTimestamp(averageTimestamp);
      if (!DataAvg.Check) {
        doUpdate.push(queueArray);
        Queues.splice(index, 1);
      }
    });

    if (doUpdate.length > 0) {
      const allIds = doUpdate.flat().map(item => item.threadID);
      const uniqueIds = [...new Set(allIds)];
      
      // Process in chunks of 5
      const chunkSize = 5;
      for (let i = 0; i < uniqueIds.length; i += chunkSize) {
        const chunk = uniqueIds.slice(i, i + chunkSize);
        
        try {
          const dataResp = await getMultiInfo(chunk);
          if (dataResp.Success) {
            dataResp.Data.forEach(threadInfo => {
              updateData(threadInfo.threadID, threadInfo);
            });
            updateUserInfo(dataResp.Data);
          }
        } catch (error) {
          console.error("Error updating thread data:", error);
        }
      }
    }
  };

  /**
   * Auto check and update with recall time
   */
  const autoCheckAndUpdateRecallTime = () => {
    let needsUpdate = false;
    
    Queues.forEach(queueArray => {
      const averageTimestamp = Math.round(
        queueArray.reduce((acc, obj) => acc + obj.TimeCreate, 0) / queueArray.length
      );
      const DataAvg = checkAverageStaticTimestamp(averageTimestamp);
      
      if (!DataAvg.Check) {
        needsUpdate = true;
      }
    });

    if (needsUpdate) {
      autoUpdateData();
    }

    // Schedule next check
    const MAXIMUM_RECALL_TIME = 30 * 1000; // 30 seconds
    updateTimeout = setTimeout(autoCheckAndUpdateRecallTime, MAXIMUM_RECALL_TIME);
  };

  /**
   * Create or get data from database
   * @param {Array} threadIDs - Array of thread IDs
   * @returns {Promise<Array>} Thread info array
   */
  const createOrTakeDataFromDatabase = async (threadIDs) => {
    const inDb = [];
    const createNow = [];
    let cbThreadInfos = [];

    // Separate existing and new threads
    threadIDs.forEach(id => {
      if (hasData(id)) {
        inDb.push(id);
      } else {
        createNow.push(id);
      }
    });

    // Get existing data
    if (inDb.length > 0) {
      const threadInfos = inDb.map(id => getData(id)).filter(Boolean);
      
      // Add helper methods to cached data
      threadInfos.forEach(threadInfo => {
        if (threadInfo) {
          threadInfo.getThemeID = function() {
            return getThemeIDFromThreadInfo(this);
          };
          threadInfo.getThemeName = function() {
            return getThemeNameFromThreadInfo(this);
          };
        }
      });
      
      cbThreadInfos = cbThreadInfos.concat(threadInfos);
      updateUserInfo(threadInfos);
      
      // Add to update queue
      threadInfos.forEach(threadInfo => {
        addToQueues({ threadID: threadInfo.threadID, TimeCreate: Date.now() });
      });
    }

    // Create new data
    if (createNow.length > 0) {
      const chunkSize = 5;
      for (let i = 0; i < createNow.length; i += chunkSize) {
        const chunk = createNow.slice(i, i + chunkSize);
        
        try {
          const newThreadInf = await getMultiInfo(chunk);
          if (newThreadInf.Success) {
            const MultiThread = newThreadInf.Data;
            
            // Add helper methods to new thread info
            MultiThread.forEach(threadInfo => {
              if (threadInfo) {
                threadInfo.getThemeID = function() {
                  return getThemeIDFromThreadInfo(this);
                };
                threadInfo.getThemeName = function() {
                  return getThemeNameFromThreadInfo(this);
                };
              }
            });
            
            // Store in database
            MultiThread.forEach(threadInfo => {
              createData(threadInfo.threadID, threadInfo);
            });
            
            cbThreadInfos = cbThreadInfos.concat(MultiThread);
            updateUserInfo(MultiThread);
            
            // Add to update queue
            MultiThread.forEach(threadInfo => {
              addToQueues({ threadID: threadInfo.threadID, TimeCreate: Date.now() });
            });
          }
        } catch (error) {
          console.error("Error creating thread data:", error);
        }
      }
    }

    return cbThreadInfos;
  };

  /**
   * Main function to get thread info
   * @param {string|Array} threadID - Thread ID or array of thread IDs
   * @param {Function} callback - Callback function
   * @returns {Promise} Promise resolving to thread info
   */
  return async function getThreadInfoGraphQL(threadID, callback) {
    // Input validation
    if (!threadID) {
      const error = new Error("ThreadID is required");
      if (callback) callback(error);
      return Promise.reject(error);
    }

    let resolveFunc = () => {};
    let rejectFunc = () => {};
    const returnPromise = new Promise((resolve, reject) => {
      resolveFunc = resolve;
      rejectFunc = reject;
    });

    // Setup callback
    if (typeof callback !== "function") {
      callback = function(err, data) {
        if (err) {
          return rejectFunc(err);
        }
        resolveFunc(data);
      };
    }

    try {
      // Convert to array if needed
      const threadIDs = Array.isArray(threadID) ? threadID : [threadID];
      
      // Initialize global data if needed
      if (!global.Fca) {
        global.Fca = { Data: {} };
      }
      
      if (!global.Fca.Data.Userinfo) {
        global.Fca.Data.Userinfo = new Map();
      }

      // Start auto-update if not already started
      if (!global.Fca.Data.Already) {
        global.Fca.Data.Already = true;
        autoCheckAndUpdateRecallTime();
        
        // Save user info periodically
        setInterval(() => {
          try {
            const MapToArray = Array.from(global.Fca.Data.Userinfo, ([name, value]) => value);
            Database(true).set('UserInfo', MapToArray);
          } catch (error) {
            console.error("Error saving user info:", error);
          }
        }, 420 * 1000);
      }

      // Get thread info
      const result = await createOrTakeDataFromDatabase(threadIDs);
      
      // Return single object if single thread requested
      const finalResult = threadIDs.length === 1 ? result[0] : result;
      
      // Add helper methods to extract theme info
      if (Array.isArray(finalResult)) {
        finalResult.forEach(threadInfo => {
          if (threadInfo) {
            // Add helper methods as properties
            threadInfo.getThemeID = function() {
              return getThemeIDFromThreadInfo(this);
            };
            threadInfo.getThemeName = function() {
              return getThemeNameFromThreadInfo(this);
            };
            
            console.log(`🔧 Helper methods added to thread ${threadInfo.threadID}`);
          }
        });
      } else if (finalResult) {
        // Add helper methods as properties
        finalResult.getThemeID = function() {
          return getThemeIDFromThreadInfo(this);
        };
        finalResult.getThemeName = function() {
          return getThemeNameFromThreadInfo(this);
        };
        
        console.log(`🔧 Helper methods added to thread ${finalResult.threadID}`);
      }
      
      callback(null, finalResult);
      return finalResult;
      
    } catch (error) {
      console.error("Error in getThreadInfoGraphQL:", error);
      callback(error);
      return rejectFunc(error);
    }
  };

  // Cleanup on process exit
  process.on('exit', cleanup);
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
};