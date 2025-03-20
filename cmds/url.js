const fs = require("fs");  
const axios = require("axios");  
const path = require("path");  

// File to store URL detection status
const statusFile = path.join(__dirname, "url_status.json");

// Function to check if URL detection is enabled
function isUrlEnabled() {
    if (!fs.existsSync(statusFile)) return true; // Default: ON
    const statusData = JSON.parse(fs.readFileSync(statusFile, "utf8"));
    return statusData.enabled;
}

// Function to update URL detection status
function setUrlStatus(enabled) {
    fs.writeFileSync(statusFile, JSON.stringify({ enabled }));
}

module.exports = {  
    name: "url",  
    usePrefix: true,  
    usage: "!url on/off | Detects and downloads videos from TikTok, Instagram, and Facebook",  
    version: "1.7",  

    async execute(api, event, args) {  
        const { threadID, messageID, body } = event;  

        // Handle turning URL detection on/off
        if (args.length > 0) {
            const cmd = args[0].toLowerCase();
            if (cmd === "on") {
                setUrlStatus(true);
                return api.sendMessage("✅ URL detection is now **ON**.", threadID, messageID);
            }
            if (cmd === "off") {
                setUrlStatus(false);
                return api.sendMessage("❌ URL detection is now **OFF**.", threadID, messageID);
            }
        }

        // Check if URL detection is enabled
        if (!isUrlEnabled()) return;

        const urlRegex = /(https?:\/\/[^\s]+)/gi;  
        const foundUrls = body.match(urlRegex);  
        if (!foundUrls) return;  

        const videoUrl = foundUrls[0];  

        // Check if the URL is from a supported platform  
        let platform = "";  
        if (videoUrl.includes("tiktok.com")) {  
            platform = "🎶 TikTok";  
        } else if (videoUrl.includes("instagram.com")) {  
            platform = "📷 Instagram";  
        } else if (videoUrl.includes("facebook.com")) {  
            platform = "📘 Facebook";  
        } else {  
            return; // Ignore unsupported URLs  
        }  

        // Send detected URL message  
        api.sendMessage(`🔍 **Detected URL:** ${videoUrl}\n👉 Platform: **${platform}**`, threadID, async () => {  
            api.setMessageReaction("⏳", messageID, () => {}, true);  

            const apiUrl = `https://apis-i26b.onrender.com/download?url=${encodeURIComponent(videoUrl)}`;  

            try {  
                const response = await axios.get(apiUrl, {  
                    headers: { "User-Agent": "Mozilla/5.0" },  
                });  

                if (!response.data.success || !response.data.data.url) {  
                    api.setMessageReaction("❌", messageID, () => {}, true);  
                    return api.sendMessage("⚠️ Failed to fetch video.", threadID, messageID);  
                }  

                const videoDownloadUrl = response.data.data.url;  
                const filePath = path.join(__dirname, "downloaded_video.mp4");  

                const writer = fs.createWriteStream(filePath);  
                const videoResponse = await axios({  
                    url: videoDownloadUrl,  
                    method: "GET",  
                    responseType: "stream",  
                    headers: { "User-Agent": "Mozilla/5.0" },  
                });  

                videoResponse.data.pipe(writer);  

                writer.on("finish", async () => {  
                    api.setMessageReaction("✅", messageID, () => {}, true);  

                    const msg = {  
                        body: `🎥 Here is your video from **${platform}**!`,  
                        attachment: fs.createReadStream(filePath),  
                    };  

                    api.sendMessage(msg, threadID, (err) => {  
                        if (err) {  
                            console.error("❌ Error sending video:", err);  
                            return api.sendMessage("⚠️ Failed to send video.", threadID);  
                        }  

                        fs.unlink(filePath, (unlinkErr) => {  
                            if (unlinkErr) console.error("❌ Error deleting file:", unlinkErr);  
                        });  
                    });  
                });  

                writer.on("error", (err) => {  
                    console.error("❌ Error downloading video:", err);  
                    api.setMessageReaction("❌", messageID, () => {}, true);  
                    api.sendMessage("⚠️ Failed to download video.", threadID, messageID);  
                });  

            } catch (error) {  
                console.error("❌ Error fetching video:", error);  
                api.setMessageReaction("❌", messageID, () => {}, true);  
                api.sendMessage(`⚠️ Could not fetch the video. Error: ${error.message}`, threadID, messageID);  
            }  
        });  
    },  
};
