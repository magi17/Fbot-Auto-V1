const os = require('os');
const pidusage = require('pidusage');

function byte2mb(bytes) {
    return (bytes / 1024 / 1024).toFixed(2) + " MB";
}

module.exports = {
    name: "monitor",
    usePrefix: true, // Requires prefix
    usage: "monitor",
    version: "1.0.2",
    execute: async (api, event, args) => {
        const uptime = process.uptime();
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = Math.floor(uptime % 60);

        const usage = await pidusage(process.pid);

        const result = 
`💻 *Bot Monitor*
⏳ Uptime: ${hours}h ${minutes}m ${seconds}s
🔥 CPU: ${usage.cpu.toFixed(1)}%
📌 RAM: ${byte2mb(usage.memory)}
⚙️ OS: ${os.platform()} | Arch: ${os.arch()}
🚀 Ping: ${Date.now() - event.timestamp}ms`;

        return api.sendMessage(result, event.threadID, event.messageID);
    }
};
