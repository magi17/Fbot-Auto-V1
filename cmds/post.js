const fs = require("fs");
const axios = require("axios");
const path = require("path");

module.exports = {
    name: "post",
    usePrefix: false,
    usage: "post <message> (or reply with an image attachment)",
    version: "1.4",
    description: "Creates a Facebook post with a message and optional attachment.",

    async execute(api, event, args) {
        const { threadID, messageID, messageReply } = event;
        let postMessage = args.join(" ");
        let attachments = [];

        try {
            // Check if the user replied to a message with attachments
            if (messageReply && messageReply.attachments.length > 0) {
                attachments = messageReply.attachments;
            } else if (event.attachments.length > 0) {
                attachments = event.attachments;
            }

            // Download attachments if available
            const files = [];
            for (const attachment of attachments) {
                const filePath = path.join(__dirname, attachment.filename);

                const fileResponse = await axios({
                    url: attachment.url,
                    method: "GET",
                    responseType: "stream",
                    headers: { "User-Agent": "Mozilla/5.0" }
                });

                const writer = fs.createWriteStream(filePath);
                fileResponse.data.pipe(writer);

                await new Promise((resolve, reject) => {
                    writer.on("finish", resolve);
                    writer.on("error", reject);
                });

                files.push(fs.createReadStream(filePath));
            }

            // Create post with message and attachments
            const postData = { body: postMessage };
            if (files.length > 0) postData.attachment = files;

            api.createPost(postData)
                .then((url) => {
                    if (url) {
                        api.sendMessage(`✅ Post created successfully!\n🔗 ${url}`, threadID, messageID);
                    } else {
                        api.sendMessage("✅ Post created, but no URL was returned.", threadID, messageID);
                    }
                })
                .catch((error) => {
                    if (error?.data?.story_create?.story?.url) {
                        return api.sendMessage(
                            `✅ Post created successfully!\n🔗 ${error.data.story_create.story.url}\n⚠️ (Note: Post created with server warnings)`,
                            threadID,
                            messageID
                        );
                    }

                    let errorMessage = "❌ An unknown error occurred.";
                    if (error?.errors?.length > 0) {
                        errorMessage = error.errors.map((e) => e.message).join("\n");
                    } else if (error.message) {
                        errorMessage = error.message;
                    }

                    api.sendMessage(`❌ Error creating post:\n${errorMessage}`, threadID, messageID);
                })
                .finally(() => {
                    // Delete temporary files
                    files.forEach((file) => fs.unlink(file.path, (err) => {
                        if (err) console.error("❌ Error deleting file:", err);
                    }));
                });

        } catch (error) {
            console.error("❌ Error processing post:", error);
            api.sendMessage("❌ An error occurred while creating the post.", threadID, messageID);
        }
    }
};
