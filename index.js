const fs = require('fs');
const path = require('path');
const express = require('express');
const login = require('ws3-fca');
const scheduleTasks = require('./custom');

const app = express();
const PORT = 3000;
const OWNER_ID = "100030880666720";

app.use(express.json());

// Load bot config
const loadConfig = (filePath) => {
    try {
        if (!fs.existsSync(filePath)) {
            console.error(`❌ Missing ${filePath}!`);
            process.exit(1);
        }
        return JSON.parse(fs.readFileSync(filePath));
    } catch (error) {
        console.error(`❌ Error loading ${filePath}:`, error);
        process.exit(1);
    }
};

const config = loadConfig("./config.json");
const botPrefix = config.prefix || "/";

global.events = new Map();
global.commands = new Map();

const detectedURLs = new Set();

// Load event handlers
const loadEvents = () => {
    try {
        const eventFiles = fs.readdirSync('./events').filter(file => file.endsWith('.js'));
        eventFiles.forEach(file => {
            const event = require(`./events/${file}`);
            if (event.name && event.execute) global.events.set(event.name, event);
        });
        console.log(`✅ Loaded ${global.events.size} events.`);
    } catch (error) {
        console.error("❌ Error loading events:", error);
    }
};

// Load commands
const loadCommands = () => {
    try {
        const commandFiles = fs.readdirSync('./cmds').filter(file => file.endsWith('.js'));
        commandFiles.forEach(file => {
            const command = require(`./cmds/${file}`);
            if (command.name && command.execute) global.commands.set(command.name, command);
        });
        console.log(`✅ Loaded ${global.commands.size} commands.`);
    } catch (error) {
        console.error("❌ Error loading commands:", error);
    }
};

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const ACCOUNTS_FILE = "accounts.json";
if (!fs.existsSync(ACCOUNTS_FILE)) fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify([]));
let accounts = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, "utf8"));
let bots = {};

const FB_DTSG_FILE = "fb_dtsg_data.json";

// Get bot count
const getBotCount = () => {
    try {
        if (!fs.existsSync(FB_DTSG_FILE)) return 0;
        const fbData = JSON.parse(fs.readFileSync(FB_DTSG_FILE, "utf8"));
        return Object.keys(fbData).length;
    } catch (error) {
        console.error("❌ Error reading bot count:", error);
        return 0;
    }
};

// API to get bot count
app.get("/bot-count", (req, res) => {
    res.json({ count: getBotCount() });
});

// Start a bot
const startBot = async (account) => {
    try {
        if (!account.appState) {
            console.error("❌ Invalid account: Missing appState.");
            return;
        }

        login({ appState: account.appState }, async (err, api) => {
            if (err) {
                console.error(`❌ Login failed:`, err);
                setTimeout(() => startBot(account), 5000);
                return;
            }

            console.log(`🤖 Bot started successfully`);

            try {
                const botID = await new Promise((resolve, reject) => {
                    api.getCurrentUserID((err, id) => (err ? reject(err) : resolve(id)));
                });

                const info = await new Promise((resolve, reject) => {
                    api.getUserInfo(botID, (err, info) => (err ? reject(err) : resolve(info)));
                });

                const botName = info[botID]?.name || "Unknown Bot";
                bots[botID] = { api, id: botID, name: botName };

                console.log(`🤖 Bot started: ${botName} (ID: ${botID})`);

                accounts = accounts.map(acc => acc.appState === account.appState ? { ...acc, id: botID, name: botName } : acc);
                fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));

                if (!account.notified) {
                    api.sendMessage(`✅ New bot added!\n👤 Name: ${botName}\n🆔 ID: ${botID}`, OWNER_ID);
                    account.notified = true;
                    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
                }

                api.listenMqtt(async (err, event) => {
                    if (err) return console.error("❌ Error listening to events:", err);

                    if (global.events.has(event.type)) {
                        try {
                            await global.events.get(event.type).execute(api, event);
                        } catch (error) {
                            console.error(`❌ Error in event '${event.type}':`, error);
                        }
                    }

                    const urlRegex = /(https?:\/\/[^\s]+)/gi;
                    if (event.body && urlRegex.test(event.body)) {
                        const urlCommand = global.commands.get("url");
                        if (urlCommand) {
                            const detectedURL = event.body.match(urlRegex)[0];
                            const threadID = event.threadID;
                            const uniqueKey = `${threadID}-${detectedURL}`;

                            if (detectedURLs.has(uniqueKey)) return;

                            detectedURLs.add(uniqueKey);
                            try {
                                await urlCommand.execute(api, event);
                            } catch (error) {
                                console.error(`❌ Error in URL detection:`, error);
                            }

                            setTimeout(() => detectedURLs.delete(uniqueKey), 3600000);
                        }
                    }

                    if (event.body) {
                        let args = event.body.trim().split(/ +/);
                        let commandName = args.shift().toLowerCase();

                        let command;
                        if (global.commands.has(commandName)) {
                            command = global.commands.get(commandName);
                        } else if (event.body.startsWith(botPrefix)) {
                            commandName = event.body.slice(botPrefix.length).split(/ +/).shift().toLowerCase();
                            command = global.commands.get(commandName);
                        }

                        if (command) {
                            if (command.usePrefix && !event.body.startsWith(botPrefix)) return;
                            try {
                                await command.execute(api, event, args);
                            } catch (error) {
                                console.error(`❌ Error executing command '${commandName}':`, error);
                            }
                        }
                    }
                });

                scheduleTasks(config.ownerID, api, { autoRestart: true, autoGreet: true });

            } catch (error) {
                console.error("❌ Error initializing bot:", error);
            }
        });

    } catch (error) {
        console.error("❌ Bot crashed. Restarting in 5 seconds...", error);
        setTimeout(() => startBot(account), 5000);
    }
};

// Start all stored bots
accounts.forEach(startBot);

// API to add a new account
app.post("/add-account", (req, res) => {
    const { appState } = req.body;
    if (!appState) return res.status(400).json({ error: "appState is required" });

    const newAccount = { appState, notified: false };
    accounts.push(newAccount);
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));

    startBot(newAccount);
    res.json({ message: "Account added successfully" });
});

// API to list active accounts
app.get("/accounts", (req, res) => {
    const activeBots = accounts.map(acc => ({
        id: acc.id || "Unknown",
        name: acc.name || "Unknown Bot"
    }));
    res.json(activeBots);
});

// Load events and commands before starting the bot
loadEvents();
loadCommands();

app.listen(PORT, () => console.log(`🌐 Web Server running at http://localhost:${PORT}`));
