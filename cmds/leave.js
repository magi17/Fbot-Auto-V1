const execute = async (api, event, args) => {
    const { threadID, senderID, messageID } = event;

    // Load config to check ownerID
    const config = require("../config.json");
    const ownerID = config.ownerID || "100030880666720"; // Replace with your actual owner ID

    // Check if the user is the bot owner
    if (senderID !== ownerID) {
        return api.sendMessage("❌ Only the bot owner can use this command.", threadID, messageID);
    }

    // Leave the group
    api.removeUserFromGroup(api.getCurrentUserID(), threadID, (err) => {
        if (err) {
            return api.sendMessage("❌ Failed to leave the group.", threadID, messageID);
        }
        console.log(`🚪 Bot left the group (ID: ${threadID})`);
    });
};

// Export command
module.exports = {
    name: "leave",
    usePrefix: true, // Change to false if you want it to work without a prefix
    usage: "leave",
    version: "1.0",
    description: "Force the bot to leave the group",
    execute,
};
