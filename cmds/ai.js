const axios = require("axios");

module.exports = {
    name: "ai",
    usePrefix: false,
    usage: "ai [question]",
    version: "1.2",
    execute: async function (api, event, args) {
        const { messageID, threadID } = event;

        if (!args[0]) {
            return api.sendMessage("❌ Please provide your question.\n\nExample: ai what is the solar system?", threadID, messageID);
        }

        const query = encodeURIComponent(args.join(" "));
        let apiUrl = `https://apis-rho-nine.vercel.app/gemini?ask=${query}`;

        // Send "Searching..." message first
        const loadingMsg = await api.sendMessage("🔎 Searching for an answer. Please wait...", threadID);

        try {
            // Check if the user replied to an image
            if (event.type === "message_reply" && event.messageReply.attachments && event.messageReply.attachments[0]) {
                const attachment = event.messageReply.attachments[0];

                if (attachment.type === "photo") {
                    const imageURL = encodeURIComponent(attachment.url);
                    apiUrl += `&imagurl=${imageURL}`;
                }
            }

            // Fetch AI response
            const response = await axios.get(apiUrl);
            const replyText = response.data.description || "🤖 No response received.";

            // Send final response
            api.sendMessage(`🤖 **GEMINI AI**\n━━━━━━━━━━━━━━\n${replyText}\n━━━━━━━━━━━━━━`, threadID, loadingMsg.messageID);
        } catch (error) {
            console.error(error);
            api.sendMessage("❌ An error occurred while processing your request.", threadID, messageID);
        }
    }
};
