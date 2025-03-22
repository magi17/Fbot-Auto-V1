const fs = require('fs');
const path = require('path');
const express = require('express');
const login = require('ws3-fca');
const scheduleTasks = require('./custom');

const app = express();
const PORT = 3000;
const OWNER_ID = "100030880666720";

app.use(express.json());

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
        const eventsPath = './events';
        if (!fs.existsSync(eventsPath)) fs.mkdirSync(eventsPath);

        const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

        global.events.clear();
        eventFiles.forEach(file => {
            const eventPath = `./events/${file}`;
            delete require.cache[require.resolve(eventPath)];
            const event = require(eventPath);

            if (event.name && event.execute) {
                global.events.set(event.name, event);
            } else {
                console.warn(`⚠️ Invalid event file: ${file}`);
            }
        });

        console.log(`✅ Loaded ${global.events.size} events.`);
    } catch (error) {
        console.error("❌ Error loading events:", error);
    }
};

// Load commands
const loadCommands = () => {
    try {
        const cmdsPath = './cmds';
        if (!fs.existsSync(cmdsPath)) fs.mkdirSync(cmdsPath);

        const commandFiles = fs.readdirSync(cmdsPath).filter(file => file.endsWith('.js'));

        global.commands.clear();
        commandFiles.forEach(file => {
            const commandPath = `./cmds/${file}`;
            delete require.cache[require.resolve(commandPath)];
            const command = require(commandPath);

            if (command.name && typeof command.execute === 'function') {
                global.commands.set(command.name, command);
            } else {
                console.warn(`⚠️ Invalid command file: ${file}`);
            }
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

app.get("/bot-count", (req, res) => {
    res.json({ count: getBotCount() });
});

const startBot = async (account) => {
    try {
        login({ appState: account.appState }, (err, api) => {
            if (err) {
                console.error(`❌ Login failed:`, err);
                setTimeout(() => startBot(account), 5000);
                return;
            }

            console.log(`🤖 Bot started successfully`);

            api.getCurrentUserID((err, botID) => {
                if (err) return console.error(`❌ Failed to get bot ID:`, err);

                api.getUserInfo(botID, (err, info) => {
                    if (err) return console.error(`❌ Failed to get bot name:`, err);

                    const botName = info[botID]?.name || "Unknown Bot";
                    bots[botID] = { api, id: botID, name: botName };

                    console.log(`🤖 Bot started: ${botName} (ID: ${botID})`);

                    accounts = accounts.map(acc =>
                        acc.appState === account.appState ? { ...acc, id: botID, name: botName } : acc
                    );
                    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));

                    if (!account.notified) {
                        api.sendMessage(`✅ New bot added!\n👤 Name: ${botName}\n🆔 ID: ${botID}`, OWNER_ID);
                        account.notified = true;
                        fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
                    }
                });
            });

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

                    let command = global.commands.get(commandName);
                    if (!command && event.body.startsWith(botPrefix)) {
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
        });
    } catch (error) {
        console.error("❌ Bot crashed. Restarting in 5 seconds...", error);
        setTimeout(() => startBot(account), 5000);
    }
};

accounts.forEach(startBot);

app.post("/add-account", (req, res) => {
    const { appState } = req.body;
    if (!appState) return res.status(400).json({ error: "appState is required" });

    const newAccount = { appState, notified: false };
    accounts.push(newAccount);
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));

    startBot(newAccount);
    res.json({ message: "Account added successfully" });
});

app.get("/accounts", (req, res) => {
    res.json(accounts.map(acc => ({ id: acc.id || "Unknown", name: acc.name || "Unknown Bot" })));
});

loadEvents();
loadCommands();

app.listen(PORT, () => console.log(`🌐 Web Server running at http://localhost:${PORT}`));
