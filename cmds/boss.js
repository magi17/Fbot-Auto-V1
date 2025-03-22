const fs = require("fs");
const path = require("path");

module.exports = {
    name: "boss",
    usePrefix: false,
    usage: "Trigger: 'boss' or 'bossing' (anywhere in the message)",
    version: "1.1",
    description: "Sends a video response when the message contains 'boss' or 'bossing'.",

    execute(api, event, args) {
        const { threadID, messageID, body } = event;
        const lowerCaseBody = body.toLowerCase();

        if (lowerCaseBody.includes("boss") || lowerCaseBody.includes("bossing")) {
            const videoPath = path.join(__dirname, "boss.mp4");

            if (!fs.existsSync(videoPath)) {
                return api.sendMessage("⚠️ Video file not found.", threadID, messageID);
            }

            const msg = {
                body: "Bosss ",
                attachment: fs.createReadStream(videoPath),
            };

            api.sendMessage(msg, threadID, messageID);
            api.setMessageReaction("☕", messageID, (err) => {
                if (err) console.error("Error setting reaction:", err);
            });
        }
    },
};
