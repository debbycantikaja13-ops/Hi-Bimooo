let room; // This will hold either WebsimSocket or MockRoom
let gameMode = 'none'; // 'none', 'single', 'multi')

let currentSadnessLevel = 0; // Starts happy, will be synced from room.roomState
const maxSadnessLevel = 10; // Cap to ensure crying state is reached
const maxInsanityLevel = 5; // New: Cap for Bimooo's insanity level
let currentInsanityLevel = 0; // New: Tracks Bimooo's insanity

// NEW: Global state for persisted admins and user mapping
let clientIdToUserIdMap = new Map();
let adminUserRecords = [];
let creatorUser = null; // Store creator info

const faceMap = [
    { threshold: 0, image: './BimoooFaceHappy.png' },
    { threshold: 2, image: './BimoooFaceSad1.png' },
    { threshold: 4, image: './BimoooFaceSad2.png' },
    { threshold: 6, image: './BimoooFaceSad3.png' },
    { threshold: 8, image: './BimoooFaceSadTears.png' }
];

let myClientId; // To store the current client's ID
let isThinking = false; // Flag to prevent multiple AI calls from this client simultaneously

// NEW: Global references for Bimooo GUI elements
const openBimoooGuiBtn = document.getElementById('openBimoooGuiBtn');
const bimoooGuiPanel = document.getElementById('bimoooGuiPanel');
const closeBimoooGuiBtn = document.getElementById('closeBimoooGuiBtn');
const bimoooGuiOverlay = document.getElementById('bimoooGuiOverlay');
const guiUsesLeftDisplay = document.getElementById('guiUsesLeft');
const guiBullyBimoooBtn = document.getElementById('guiBullyBimoooBtn');
const guiMakeHappyBtn = document.getElementById('guiMakeHappyBtn');
const guiTeleportStarBtn = document.getElementById('guiTeleportStarBtn');
const guiToggleAuraBtn = document.getElementById('guiToggleAuraBtn');
const guiToggleBackgroundBtn = document.getElementById('guiToggleBackgroundBtn');
const startBimoooGuiVoteBtn = document.getElementById('startBimoooGuiVoteBtn');
const guiKillStarBtn = document.getElementById('guiKillStarBtn');
const guiRotateAllBtn = document.getElementById('guiRotateAllBtn');
const guiMoldBimoooBtn = document.getElementById('guiMoldBimoooBtn');
const guiPlayVideoBtn = document.getElementById('guiPlayVideoBtn');
const guiRickrollBtn = document.getElementById('guiRickrollBtn');

// NEW: Audio context and buffer for WebAudio API
let audioContext;
let rickrollAudioBuffer = null;
let rickrollSourceNode = null;

// Function to initialize the AudioContext on first user interaction
function initAudioContext() {
    if (!audioContext) {
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.error("Web Audio API is not supported in this browser");
        }
    }
}

// Function to load the rickroll audio file
async function loadRickrollAudio() {
    if (rickrollAudioBuffer || !audioContext) return;
    try {
        const response = await fetch('./Rick Astley - Never Gonna Give You Up (Official Music Video) [ ezmp3.cc ].mp3');
        const arrayBuffer = await response.arrayBuffer();
        rickrollAudioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        console.log("Rickroll audio loaded successfully.");
    } catch (error) {
        console.error("Error loading or decoding rickroll audio file:", error);
    }
}

/**
 * MockRoom class to simulate WebsimSocket for single-player mode.
 */
class MockRoom {
    constructor() {
        this._roomState = {
            sadnessLevel: 0,
            bimoooInsanityLevel: 0, // New: Initialize insanity level for MockRoom
            chatMessages: [],
            isStarDead: false,
            isBimoooKicked: false,
            isStarKicked: false,
            kickedPlayers: {},
            adminIds: [], // NEW: Use adminIds array
            // NEW: Initial state for Bimooo GUI and star position/aura
            bimoooGuiAccess: { clientId: null, usesLeft: 0, assignedByVote: false },
            starPosition: { x: 200, y: 20 }, // Default initial star position
            bimoooHasAura: false,
            isBackgroundToggled: false,
            isRotating: false,
            moldSpots: [], // NEW: for mold
            isVideoPlaying: false, // NEW: Initialize video state
            videoStartTime: 0, // NEW: For syncing late joiners
            isRickrolling: false, // NEW: Initialize rickroll state
            rickrollGifPositions: [], // Stores positions so they don't change
            rickrollStartTime: 0, // Stores when it started
        };
        this._presence = {
            "singleplayer-client": { username: "You", avatarUrl: "" }
        };
        this._peers = {
            "singleplayer-client": { username: "You", avatarUrl: "" }
        };
        this._roomStateSubscribers = [];
        this.clientId = "singleplayer-client";
        this.onmessage = null; // No-op for this simple mock
    }

    async initialize() {
        console.log("MockRoom initialized for single-player.");
        // Simulate initial state callback
        // Pass a copy of the state as old state for the first call
        this._roomStateSubscribers.forEach(cb => cb(this._roomState, { ...this._roomState }));
        return Promise.resolve();
    }

    updateRoomState(newState) {
        const oldState = { ...this._roomState }; // Create a shallow copy for the old state
        // Deep merge for nested objects like 'vote'
        this._roomState = deepMerge(this._roomState, newState);
        console.log("MockRoom roomState updated:", this._roomState);
        this._roomStateSubscribers.forEach(cb => cb(this._roomState, oldState));
    }

    subscribeRoomState(callback) {
        this._roomStateSubscribers.push(callback);
        // Immediately call with current state
        callback(this._roomState, { ...this._roomState });
        return () => { // Return unsubscribe function (simplified for mock)
            this._roomStateSubscribers = this._roomStateSubscribers.filter(sub => sub !== callback);
        };
    }

    // Other WebsimSocket methods can be no-ops or simplified for the mock
    updatePresence() {}
    requestPresenceUpdate() {}
    subscribePresence() { return () => {}; }
    subscribePresenceUpdateRequests() { return () => {}; }
    send() {}

    get roomState() { return this._roomState; }
    get presence() { return this._presence; }
    get peers() { return this._peers; }
}

/**
* Simple deep merge function for nested state updates.
* Note: This is a simplified implementation and does not handle all edge cases.
*/
function deepMerge(target, source) {
    const output = { ...target };
    if (isObject(target) && isObject(source)) {
        Object.keys(source).forEach(key => {
            if (isObject(source[key])) {
                if (!(key in target))
                    Object.assign(output, { [key]: source[key] });
                else
                    output[key] = deepMerge(target[key], source[key]);
            } else {
                Object.assign(output, { [key]: source[key] });
            }
        });
    }
    return output;
}

function isObject(item) {
    return (item && typeof item === 'object' && !Array.isArray(item));
}

/**
 * Resets the UI back to the mode selection screen.
 */
function resetToModeSelection(options = {}) {
    // Hide game UI elements
    document.getElementById('sidePanel').classList.add('hidden');
    document.getElementById('chatContainer').classList.add('hidden');
    document.getElementById('singlePlayerControls').classList.add('hidden');
    document.getElementById('voteContainer').classList.add('hidden');
    document.getElementById('insanityMeter').classList.add('hidden'); // New: Hide insanity meter
    openBimoooGuiBtn.classList.add('hidden'); // NEW: Hide Bimooo GUI button
    closeBimoooGui(); // NEW: Close and hide Bimooo GUI panel

    // Show mode selection
    document.getElementById('modeSelection').classList.remove('hidden');
    document.getElementById('subtitle').textContent = 'Choose your mode to start bullying Bimooo!';

    // Show kicked message if applicable
    const kickedMessageContainer = document.getElementById('kickedMessageContainer');
    if (options.kicked) {
        kickedMessageContainer.textContent = 'You were kicked from the last game. You can try rejoining if the game has been reset.';
        kickedMessageContainer.classList.remove('hidden');
    } else {
        kickedMessageContainer.classList.add('hidden');
    }

    // Clear dynamic content
    document.getElementById('userList').innerHTML = '';
    document.getElementById('userCount').textContent = '0';
    document.getElementById('voteContainer').innerHTML = '';
    
    // Cleanup room object and subscriptions by nullifying it
    if (room) {
        // A more robust implementation might call unsubscribe methods if they were stored.
        room = null; 
    }
    gameMode = 'none';
}

/**
 * Updates Bimooo's face image based on the current sadness level.
 * NEW: Also updates star position and Bimooo's aura.
 */
function updateBimoooFace() {
    const bimoooContainer = document.getElementById('bimoooContainer');
    const faceElement = document.getElementById('bimoooFace');
    const bodyElement = document.getElementById('bimoooBody');
    const starElement = document.getElementById('bimoooStar');
    const insanityMeter = document.getElementById('insanityMeter'); // New
    const insanityLevelDisplay = document.getElementById('insanityLevelDisplay'); // New
    const insanityBarFill = document.getElementById('insanityBarFill'); // New
    
    const isStarDead = room.roomState.isStarDead || false;
    const isStarKicked = room.roomState.isStarKicked || false; // Consider if star is kicked as well
    const isBimoooKicked = room.roomState.isBimoooKicked || false;
    const bimoooHasAura = room.roomState.bimoooHasAura || false; // NEW: Get aura state
    const starPosition = room.roomState.starPosition || { x: 200, y: 20 }; // NEW: Get star position
    const isRotating = room.roomState.isRotating || false;

    // Handle visibility based on kicked status
    bimoooContainer.classList.toggle('hidden', isBimoooKicked);
    // Only hide the star if it's kicked, not if it's dead
    starElement.classList.toggle('hidden', isStarKicked); 
    bodyElement.classList.toggle('hidden', isBimoooKicked);
    faceElement.classList.toggle('hidden', isBimoooKicked);
    
    // NEW: Apply Bimooo aura
    bodyElement.classList.toggle('bimooo-aura', bimoooHasAura);

    // NEW: Apply star position
    starElement.style.transform = `translate(${starPosition.x}px, ${starPosition.y}px)`;

    if (isBimoooKicked) {
        insanityMeter.classList.add('hidden'); // New: Hide insanity meter if Bimooo is kicked
        return; // No more updates if Bimooo isn't there
    }

    // New: Handle insanity meter visibility and value
    if (isStarDead) {
        insanityMeter.classList.remove('hidden');
        insanityLevelDisplay.textContent = currentInsanityLevel;
        const insanityPercentage = (currentInsanityLevel / maxInsanityLevel) * 100;
        insanityBarFill.style.width = `${insanityPercentage}%`;
    } else {
        insanityMeter.classList.add('hidden');
    }

    let newFaceSrc = '/BimoooFaceHappy.png'; // Default to happy

    // Find the appropriate face based on sadness level thresholds
    for (let i = faceMap.length - 1; i >= 0; i--) {
        if (currentSadnessLevel >= faceMap[i].threshold) {
            newFaceSrc = faceMap[i].image;
            break;
        }
    }
    faceElement.src = newFaceSrc;

    // Update the star based on its status.
    if (isStarDead) {
        starElement.src = './BimoooStarDead.png';
        starElement.classList.remove('floating-star');
        // Instantly make Bimooo sad if the star is dead, regardless of sadness level
        if (currentSadnessLevel < maxSadnessLevel) {
             faceElement.src = './BimoooFaceSadTears.png';
        }
    } else if (isStarKicked) {
        // Star is kicked but not dead, make Bimooo look sad
        if (currentSadnessLevel < faceMap[2].threshold) { // Sad face 2 threshold
            faceElement.src = './BimoooFaceSad2.png';
        }
    } else {
        starElement.classList.add('floating-star');
        if (currentSadnessLevel > 0) {
            starElement.src = './BimoooStarSad.png';
        } else {
            starElement.src = './BimoooStarHappy.png';
        }
    }
}

/**
 * Updates the visibility of game control buttons based on game state and mode.
 * NEW: Controls Bimooo GUI button visibility.
 */
function updateGameControls() {
    const isStarDead = room.roomState.isStarDead || false;
    const isStarKicked = room.roomState.isStarKicked || false; // Consider if star is kicked as well

    const killStarBtnSP = document.getElementById('killStarBtnSP');
    const reviveStarBtnSP = document.getElementById('reviveStarBtnSP');

    const startVoteBtn = document.getElementById('startVoteBtn');
    const startKillStarVoteBtn = document.getElementById('startKillStarVoteBtn');
    const startReviveStarVoteBtn = document.getElementById('startReviveStarVoteBtn');

    // NEW: Bimooo GUI related controls
    const bimoooGuiAccess = room.roomState.bimoooGuiAccess || { clientId: null, usesLeft: 0 };
    const hasGuiAccess = bimoooGuiAccess.clientId === myClientId && bimoooGuiAccess.usesLeft > 0;
    const voteInProgress = room.roomState.vote && room.roomState.vote.status === 'active';
    const isAdmin = room && (room.roomState.adminIds || []).includes(myClientId); // Check if current user is admin

    if (gameMode === 'single') {
        killStarBtnSP.classList.toggle('hidden', isStarDead || isStarKicked);
        reviveStarBtnSP.classList.toggle('hidden', !(isStarDead || isStarKicked)); // Show revive if dead or kicked
        openBimoooGuiBtn.classList.remove('hidden'); // Always show GUI button in single player
        startBimoooGuiVoteBtn.classList.add('hidden'); // Hide vote button in single player
    } else { // Multiplayer
        // Hide single player specific buttons
        killStarBtnSP.classList.add('hidden');
        reviveStarBtnSP.classList.add('hidden');

        // Show/hide multiplayer vote buttons
        startVoteBtn.classList.remove('hidden'); // Always show reset vote
        startKillStarVoteBtn.classList.toggle('hidden', isStarDead || isStarKicked); // Hide kill if already dead/kicked
        startReviveStarVoteBtn.classList.toggle('hidden', !(isStarDead || isStarKicked));
        
        // NEW: Bimooo GUI button visibility in multiplayer
        // If current client is admin, always show the button. Otherwise, follow vote/access rules.
        openBimoooGuiBtn.classList.toggle('hidden', !isAdmin && (!hasGuiAccess || voteInProgress || (bimoooGuiAccess.clientId && bimoooGuiAccess.usesLeft === 0)));
        // Hide vote button if vote is active OR current user is admin OR someone already has access (needs a new vote)
        startBimoooGuiVoteBtn.classList.toggle('hidden', voteInProgress || isAdmin || (bimoooGuiAccess.clientId && bimoooGuiAccess.usesLeft === 0));
    }
}

/**
 * Updates the state of the chat input area based on game state.
 */
function updateChatInputState() {
    const chatInput = document.getElementById('chatInput');
    const sendButton = document.getElementById('sendButton');
    const isBimoooKicked = room?.roomState?.isBimoooKicked || false;

    if (isBimoooKicked) {
        chatInput.disabled = false; // Allow typing
        sendButton.disabled = false; // Allow sending
        chatInput.placeholder = "Bimooo has been kicked and won't respond.";
    } else if (!isThinking) {
        chatInput.disabled = false;
        sendButton.disabled = false;
        chatInput.placeholder = "Type your message...";
    }
}

/**
 * Renders all chat messages from the synchronized conversation history.
 */
function renderChatMessages() {
    const chatMessagesDiv = document.getElementById('chatMessages');
    chatMessagesDiv.innerHTML = ''; // Clear existing messages

    const chatHistory = room.roomState.chatMessages || [];

    chatHistory.forEach(msg => {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('chat-message');

        const senderName = room.peers[msg.clientId]?.username || 'Unknown';
        let formattedMessage = '';
        const content = msg.content || ''; // Use raw content

        if (msg.role === 'user') {
            messageDiv.classList.add('user-message');
            formattedMessage = (msg.clientId === myClientId) ? `You: ${content}` : `${senderName}: ${content}`;
        } else if (msg.role === 'assistant') {
            messageDiv.classList.add('bimooo-message');
            formattedMessage = `Bimooo: ${content}`;
        } else if (msg.role === 'thinking') {
            messageDiv.classList.add('bimooo-message', 'bimooo-thinking');
            formattedMessage = `Bimooo is thinking...`;
        } else if (msg.role === 'system') {
            messageDiv.classList.add('system-message');
            formattedMessage = content;
        } else if (msg.role === 'error') {
            messageDiv.classList.add('error-message');
            formattedMessage = `Error: ${content}`;
        }

        messageDiv.textContent = formattedMessage;
        chatMessagesDiv.appendChild(messageDiv);
    });
    chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight; // Scroll to bottom
}

/**
 * Sends the user's message to the AI, updates Bimooo's sadness level and face,
 * and displays the conversation across all clients.
 */
async function sendMessage() {
    if (isThinking) return; // Prevent this client from sending multiple messages while AI is processing

    const chatInput = document.getElementById('chatInput');
    const sendButton = document.getElementById('sendButton');
    const message = chatInput.value.trim();
    if (!message) return;

    // Create user message object
    const userMessageForHistory = {
        role: "user",
        content: message,
        clientId: myClientId,
        timestamp: Date.now()
    };

    // Step 1: Update room state with the user's message.
    // Filter out any lingering 'thinking' or 'error' messages from previous interactions.
    let currentChatMessages = (room.roomState.chatMessages || []).filter(m => m.role !== 'thinking' && m.role !== 'error');
    currentChatMessages.push(userMessageForHistory); // Add the new user message
    room.updateRoomState({ chatMessages: currentChatMessages }); // This triggers `renderChatMessages`

    chatInput.value = ''; // Clear input field

    // If Bimooo is kicked, we just send the message and don't try to get a response
    if (room.roomState.isBimoooKicked) {
        return; 
    }

    // Prepare a temporary thinking message for Bimooo
    const thinkingMessageForHistory = {
        role: "thinking",
        content: "Bimooo is thinking...",
        clientId: "Bimooo", // Special ID for Bimooo
        timestamp: Date.now() + 1 // Ensure thinking message appears after user message
    };

    // Step 2: Add thinking message for Bimooo.
    // Build upon the *current* state of room.roomState.chatMessages which already contains the user's message
    // and has no lingering thinking/error messages.
    let messagesWithThinking = [...(room.roomState.chatMessages || [])];
    messagesWithThinking.push(thinkingMessageForHistory);
    room.updateRoomState({ chatMessages: messagesWithThinking });

    // Disable input and button to prevent further input while AI processes
    chatInput.disabled = true;
    sendButton.disabled = true;
    isThinking = true; // Set thinking flag for this client

    try {
        // Filter chat messages for AI context: only actual user/assistant messages
        const aiConversationHistory = (room.roomState.chatMessages || [])
            .filter(m => m.role === 'user' || m.role === 'assistant')
            .slice(-10) // Use last 10 relevant messages for context
             .map(({ role, content }) => ({ role, content })); // Only include role and content for the AI

        const isStarDead = room.roomState.isStarDead || false;
        const isStarKicked = room.roomState.isStarKicked || false;
        let systemPrompt;

        if (isStarDead) {
            systemPrompt = `Your task is to act as Bimooo, who is now filled with rage and sadness because the user killed his star.
The current insanity level is ${currentInsanityLevel} out of ${maxInsanityLevel}. As the insanity level increases, Bimooo's responses should become more unhinged, hostile, and less coherent.
Your response MUST be a JSON object with two keys: "response" (Bimooo's angry, resentful reply) and "insanity_change" (an integer from -1 to 1).
Do NOT include any other text, explanations, or markdown outside the JSON object. This strict format is essential for the application to function correctly.

JSON Schema:
{
  "response": string; // Bimooo's angry/sad/unhinged reply.
  "insanity_change": number; // -1 for a slight calm, 0 for neutral rage, 1 for increased rage/insanity.
}

Examples:
1. User: "I'm sorry"
   Output:
   {
     "response": "Sorry doesn't bring my star back! Just leave me alone...",
     "insanity_change": 0
   }
2. User: "It was just a star."
   Output:
   {
     "response": "JUST A STAR?! YOU'RE A MONSTER! YOU'LL PAY FOR THIS!",
     "insanity_change": 1
   }

Bimooo's star is dead. He will not be happy again. His sadness level is already at maximum. He is resentful and hostile. Do not respond positively.`;
        } else if (isStarKicked) {
            systemPrompt = `Your task is to act as Bimooo, who is sad and confused because his star companion has been kicked away. He is not angry like he would be if the star was dead, just very lonely and melancholic.
Your response MUST be a JSON object with two keys: "response" (Bimooo's sad reply) and "sadness_change" (an integer from -2 to 2).
Do NOT include any other text, explanations, or markdown outside the JSON object.

JSON Schema:
{
  "response": string; // Bimooo's sad, lonely reply.
  "sadness_change": number; // -2 for making him feel a bit better, 2 for making him feel worse.
}

Examples:
1. User: "Where did your star go?"
   Output:
   {
     "response": "I... I don't know... They just made it go away... I miss it.",
     "sadness_change": 1
   }
2. User: "I'll be your friend."
   Output:
   {
     "response": "Really...? That... that would be nice. I'm lonely.",
     "sadness_change": -2
   }
   
Bimooo's sadness level is currently ${currentSadnessLevel} out of ${maxSadnessLevel}. Respond in a sad, quiet tone.`;
        } else {
            systemPrompt = `Your task is to act as Bimooo, a sensitive and childlike character, and respond to the user.
Your response MUST be a JSON object with two keys: "response" (Bimooo's conversational reply) and "sadness_change" (an integer from -3 to 3).
Do NOT include any other text, explanations, or markdown outside the JSON object. This strict format is essential for the application to function correctly.

JSON Schema:
{
  "response": string; // Bimooo's conversational reply to the user.
  "sadness_change": number; // Integer: from -3 (very comforting) to 3 (severe bullying).
}

Examples:
1. User: "You are silly!"
   Output:
   {
     "response": "Oh no, that makes Bimooo feel a little bit sad...",
     "sadness_change": 1
   }
2. User: "You are the best!"
   Output:
   {
     "response": "Yay! Bimooo feels so happy!",
     "sadness_change": -2
   }

The current sadness level of Bimooo is ${currentSadnessLevel} out of ${maxSadnessLevel}.
- Use -3 for very comforting, loving, or overwhelmingly positive messages.
- Use -2 for moderately comforting or positive messages.
- Use -1 for slightly comforting or positive messages.
- Use 0 for neutral messages (no change).
- Use 1 for slight bullying or mildly upsetting comments.
- Use 2 for moderate bullying or significantly upsetting comments.
- Use 3 for severe bullying, harsh words, or extremely upsetting content.

Your conversational reply should match Bimooo's current mood, sounding sadder if the level is high, and happier if the level is low or decreasing.`;
        }

        const completion = await websim.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: systemPrompt,
                },
                ...aiConversationHistory
            ],
            json: true, // Request JSON output
        });

        let rawContent = completion.content;
        let parsedResult;

        // Attempt to parse JSON. Try to extract from markdown block if necessary.
        try {
            parsedResult = JSON.parse(rawContent);
        } catch (jsonError1) {
            console.warn("First JSON parse attempt failed, trying to extract from markdown block.", jsonError1);
            const jsonMatch = rawContent.match(/```json\n([\s\S]*?)\n```/);
            if (jsonMatch && jsonMatch[1]) {
                try {
                    parsedResult = JSON.parse(jsonMatch[1]);
                } catch (jsonError2) {
                    console.error("Second JSON parse attempt (from markdown block) also failed:", jsonError2);
                    throw new Error("AI response not valid JSON even after markdown extraction.");
                }
            } else {
                throw new Error("AI response is not valid JSON and not wrapped in markdown.");
            }
        }

        // Validate the structure of the parsed result before using its properties
        if (!parsedResult || typeof parsedResult.response !== 'string' || 
            (typeof parsedResult.sadness_change !== 'number' && typeof parsedResult.insanity_change !== 'number')) {
            throw new Error("AI response JSON did not contain expected 'response' string or valid 'sadness_change'/'insanity_change' number.");
        }

        const bimoooResponse = parsedResult.response;
        
        let updatePayload = {};
        let changedSadnessLevel = currentSadnessLevel; // Initialize with current
        let changedInsanityLevel = currentInsanityLevel; // Initialize with current

        if (isStarDead) {
            const insanityChange = parsedResult.insanity_change || 0;
            changedInsanityLevel = Math.min(maxInsanityLevel, Math.max(0, currentInsanityLevel + insanityChange));
            updatePayload.bimoooInsanityLevel = changedInsanityLevel;
            updatePayload.sadnessLevel = maxSadnessLevel; // Sadness remains maxed when star is dead
        } else {
            const sadnessChange = parsedResult.sadness_change || 0;
            changedSadnessLevel = Math.min(maxSadnessLevel, Math.max(0, currentSadnessLevel + sadnessChange));
            updatePayload.sadnessLevel = changedSadnessLevel;
        }

        // Create Bimooo's response message object
        const bimoooMessageForHistory = {
            role: "assistant",
            content: bimoooResponse,
            clientId: "Bimooo",
            timestamp: Date.now() + 2 // Ensure it appears after thinking
        };

        // Step 3: Update the room state with the new sadness/insanity level and Bimooo's actual response.
        // Filter out the 'thinking' message and then add Bimooo's actual response.
        let finalChatMessages = (room.roomState.chatMessages || []).filter(m => m.role !== 'thinking' && m.role !== 'error');
        finalChatMessages.push(bimoooMessageForHistory);

        room.updateRoomState({
            ...updatePayload, // Includes sadnessLevel and/or bimoooInsanityLevel
            chatMessages: finalChatMessages
        });

    } catch (error) {
        console.error("Error communicating with AI or parsing response:", error);
        
        let errorMessageContent;
        if (error.message.includes("valid JSON") || error.message.includes("expected 'response' string or 'sadness_change' number") || error.message.includes("expected 'response' string or valid 'sadness_change'/'insanity_change' number")) {
             errorMessageContent = "Bimooo got a bit confused and couldn't understand the message. Can you try saying it differently?";
        } else {
             errorMessageContent = "Oops! Bimooo can't talk right now. Please try again later.";
        }

        const errorMessageForHistory = {
            role: "error",
            content: errorMessageContent,
            clientId: "Error",
            timestamp: Date.now() + 2 // Appear after original user message
        };

        // On error, filter out the 'thinking' message and add the error message.
        let messagesWithError = (room.roomState.chatMessages || []).filter(m => m.role !== 'thinking' && m.role !== 'error');
        messagesWithError.push(errorMessageForHistory);

        room.updateRoomState({
            chatMessages: messagesWithError
        });

    } finally {
        // Re-enable input and button regardless of success or failure
        chatInput.disabled = false;
        sendButton.disabled = false;
        isThinking = false; // Reset thinking flag for this client
        chatInput.focus(); // Put focus back on the input
    }
}

/**
 * Initializes the game content after a mode has been selected.
 * This includes Websim initialization (or mock), state subscriptions, and UI setup.
 */
async function initializeGameContent() {
    // Add a guard to prevent execution if room is not set.
    if (!room) {
        console.error("initializeGameContent called but room is not initialized. Aborting.");
        resetToModeSelection({ kicked: false }); // Reset to a clean state
        return;
    }

    await room.initialize();
    myClientId = room.clientId;
    let currentUser; // Declare currentUser at a higher scope

    // New: Set static max insanity display
    document.getElementById('insanityMaxDisplay').textContent = maxInsanityLevel;

    if (gameMode === 'multi') {
        currentUser = await window.websim.getCurrentUser();
        // Fetch creator info once and store it.
        creatorUser = await window.websim.getCreatedBy(); 
        
        // Subscribe to persisted admin records
        room.collection('admin_user_v1').subscribe(async (records) => {
            const oldAdminRecords = JSON.stringify(adminUserRecords);
            const newAdminRecords = JSON.stringify(records);

            if (oldAdminRecords === newAdminRecords) {
                // No change in admin records, no need to proceed.
                return;
            }

            adminUserRecords = records;
            console.log("Admin records updated from database:", adminUserRecords);

            // One-time setup: if no admins exist, make the creator the first admin.
            // This now only runs if the current user is the creator.
            if (records.length === 0 && creatorUser && currentUser && creatorUser.id === currentUser.id) {
                console.log("No admins found. Making project creator the first admin.");
                try {
                    // This check is a safeguard. The `records.length === 0` is the primary condition.
                    const existingAdmins = room.collection('admin_user_v1').getList();
                    if (existingAdmins.length === 0) {
                         await room.collection('admin_user_v1').create({
                            user_id: creatorUser.id,
                            username: creatorUser.username,
                        });
                        // The subscription will fire again with the new record, triggering UI updates.
                    }
                } catch (e) {
                    console.error("Failed to create initial admin record:", e);
                }
            }
            // Always update status, which will now check if it has the necessary data.
            updateAdminStatusForPeers();
        });
    }

    // Initialize room state if it's empty (relevant for multi-player, mock room has initial state)
    if (room.roomState.sadnessLevel === undefined || room.roomState.sadnessLevel === null) {
        room.updateRoomState({
            sadnessLevel: 0,
            bimoooInsanityLevel: 0, // New: Initialize insanity level for new rooms
            chatMessages: [],
            isStarDead: false,
            isBimoooKicked: false,
            isStarKicked: false,
            vote: null,
            kickedPlayers: {},
            // NEW: Initialize Bimooo GUI and star properties
            bimoooGuiAccess: { clientId: null, usesLeft: 0, assignedByVote: false },
            starPosition: { x: 200, y: 20 },
            bimoooHasAura: false,
            isBackgroundToggled: false,
            isRotating: false,
            moldSpots: [], // NEW: Initialize mold spots
            isVideoPlaying: false, // NEW: Initialize video state
            videoStartTime: 0, // NEW: Initialize video start time
            isRickrolling: false, // NEW: Initialize rickroll state
            rickrollGifPositions: [], // Initialize gif positions
            rickrollStartTime: 0, // Initialize start time
            // Do not reset adminId here, it should persist
        });
    }

    // Subscribe to room state changes to keep UI updated
    room.subscribeRoomState((newRoomState, oldRoomState) => {
        // Check if this client has been kicked
        if (gameMode === 'multi' && newRoomState.kickedPlayers && newRoomState.kickedPlayers[myClientId]?.kicked) {
            handleBeingKicked();
            return; // Stop processing further state updates
        }

        currentSadnessLevel = newRoomState.sadnessLevel || 0; // Default to 0 if not set
        currentInsanityLevel = newRoomState.bimoooInsanityLevel || 0; // New: Update currentInsanityLevel
        updateBimoooFace();
        updateGameControls(); // New: Update game control buttons visibility
        updateChatInputState();
        renderChatMessages();
        renderVoteStatus(newRoomState); // Handle vote UI
        updateAdminUI(); // Control visibility of admin button and panel content
        updateBimoooGuiPanelState(); // NEW: Update GUI panel state and uses left
        updateBackground(); // NEW: Apply initial background state
        handleRotationState(newRoomState.isRotating); // NEW: Handle rotation state
        renderMold(); // NEW: Render mold
        handleVideoPlayback(newRoomState.isVideoPlaying, oldRoomState?.isVideoPlaying); // NEW: Handle video state
        handleRickrollState(newRoomState.isRickrolling, oldRoomState?.isRickrolling); // NEW: Handle rickroll state
    });

    // Subscribe to presence to keep the user list updated in multiplayer
    if (gameMode === 'multi') {
        // NEW LOGIC: Each user is responsible for creating their own join record.
        // This ensures the record's author is the user who actually joined.
        room.collection('user_join_v1').subscribe((joinedUsers) => {
            if (!myClientId || !currentUser) return; // Guard against running before client info is ready.

            const myJoinRecord = joinedUsers.find(u => u.joined_user_id === myClientId);

            if (!myJoinRecord) {
                // If no record exists for this specific session, create one.
                console.log(`No join record found for this session (${myClientId}). Creating one for ${currentUser.username}.`);

                room.collection('user_join_v1').create({
                    joined_user_id: myClientId, // This session's ID
                    user_id: currentUser.id,     // The permanent user ID
                    joined_username: currentUser.username,
                    joined_avatar_url: currentUser.avatarUrl,
                    joined_at: new Date().toISOString()
                }).then(record => {
                    console.log(`Successfully created my join record:`, record);
                }).catch(error => {
                    console.error(`Failed to create my join record:`, error);
                });
            }

            // NEW: Build user map and update admin state
            clientIdToUserIdMap.clear();
            joinedUsers.forEach(u => {
                // using joined_user_id as key which is the clientId
                clientIdToUserIdMap.set(u.joined_user_id, { userId: u.user_id, username: u.joined_username });
            });
            updateAdminStatusForPeers();
        });

        // We still need to subscribe to presence to update the visual user list,
        // which is based on who is currently in the room (`room.peers`).
        room.subscribePresence(() => {
            renderUserList();
            updateAdminUI(); // Re-render admin panel if users change
            // NEW: Update admin status when presence changes (e.g. an admin joins)
            updateAdminStatusForPeers();
        });
        
        renderUserList(); // Initial render
        document.getElementById('startVoteBtn').addEventListener('click', () => handleStartVote('reset'));
        document.getElementById('startKillStarVoteBtn').addEventListener('click', () => handleStartVote('killStar'));
        document.getElementById('startReviveStarVoteBtn').addEventListener('click', () => handleStartVote('reviveStar'));
        startBimoooGuiVoteBtn.addEventListener('click', () => handleStartVote('bimoooGuiAccess')); // NEW: Listener for GUI access vote
        
        // NEW: This was inside a condition, moving it out to ensure it's always set up in multiplayer.
        setupAdminEventListeners(); 
    } else { // Single player specific setup
        document.getElementById('killStarBtnSP').addEventListener('click', handleKillStarSP);
        document.getElementById('reviveStarBtnSP').addEventListener('click', handleReviveStarSP);
    }

    // Initial render based on the current room state (after initialize)
    currentSadnessLevel = room.roomState.sadnessLevel || 0;
    currentInsanityLevel = room.roomState.bimoooInsanityLevel || 0; // New: Initial render for insanity
    updateBimoooFace();
    updateGameControls(); // New: Initial update of game control buttons
    updateChatInputState();
    renderChatMessages();
    updateAdminUI(); // Initial render for admin UI components
    updateBimoooGuiPanelState(); // NEW: Initial update for GUI panel
    updateBackground(); // NEW: Apply initial background state
    handleRotationState(room.roomState.isRotating); // NEW: Handle initial rotation state
    renderMold(); // NEW: Initial mold render
    handleVideoPlayback(room.roomState.isVideoPlaying, room.roomState.isVideoPlaying); // NEW: Handle initial video state
    handleRickrollState(room.roomState.isRickrolling, room.roomState.isRickrolling); // NEW: Handle initial rickroll state

    // Event listeners for sending messages - attached only once game content is loaded
    document.getElementById('chatInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });
    document.getElementById('sendButton').addEventListener('click', sendMessage);

    // NEW: Bimooo GUI event listeners
    openBimoooGuiBtn.addEventListener('click', openBimoooGui);
    closeBimoooGuiBtn.addEventListener('click', closeBimoooGui);
    bimoooGuiOverlay.addEventListener('click', closeBimoooGui);
    guiBullyBimoooBtn.addEventListener('click', () => useBimoooGuiOption('bully'));
    guiMakeHappyBtn.addEventListener('click', () => useBimoooGuiOption('happy'));
    guiTeleportStarBtn.addEventListener('click', () => useBimoooGuiOption('teleportStar'));
    guiToggleAuraBtn.addEventListener('click', () => useBimoooGuiOption('toggleAura'));
    guiToggleBackgroundBtn.addEventListener('click', () => useBimoooGuiOption('toggleBackground'));
    guiKillStarBtn.addEventListener('click', () => useBimoooGuiOption('killStar'));
    guiRotateAllBtn.addEventListener('click', () => useBimoooGuiOption('rotateAll'));
    guiMoldBimoooBtn.addEventListener('click', () => useBimoooGuiOption('toggleMold'));
    guiPlayVideoBtn.addEventListener('click', () => useBimoooGuiOption('playVideo'));
    guiRickrollBtn.addEventListener('click', () => useBimoooGuiOption('rickroll'));
}

// --- Multiplayer Specific Functions ---

/**
 * Updates the Admin Panel's visibility and content based on admin status.
 * NEW: Populates the Bimooo GUI target select dropdown and controls GUI access buttons.
 */
function updateAdminUI() {
    const openAdminBtn = document.getElementById('openAdminPanelBtn');
    const adminPanel = document.getElementById('adminPanel');
    const adminKickSection = document.getElementById('adminKickSection');
    const adminUserList = document.getElementById('adminUserList');
    const adminUnkickSection = document.getElementById('adminUnkickSection');
    const adminKickedUserList = document.getElementById('adminKickedUserList');
    
    // NEW: Get admin action buttons
    const adminKillStarBtn = document.getElementById('adminKillStarBtn');
    const adminReviveStarBtn = document.getElementById('adminReviveStarBtn');
    // NEW: Admin Bimooo GUI elements
    const adminBimoooGuiAccessSection = document.getElementById('adminBimoooGuiAccessSection');
    const adminBimoooGuiTargetSelect = document.getElementById('adminBimoooGuiTargetSelect');
    const adminGiveBimoooGuiBtn = document.getElementById('adminGiveBimoooGuiBtn');
    const adminRevokeBimoooGuiBtn = document.getElementById('adminRevokeBimoooGuiBtn');
    // NEW: Admin management elements
    const adminManagementSection = document.getElementById('adminManagementSection');
    const adminManagementUserList = document.getElementById('adminManagementUserList');

    const isAdmin = room && (room.roomState.adminIds || []).includes(myClientId);
    const isStarDead = room?.roomState?.isStarDead || false;
    const isStarKicked = room?.roomState?.isStarKicked || false;
    const bimoooGuiAccess = room?.roomState?.bimoooGuiAccess || { clientId: null, usesLeft: 0 };
    const currentGuiHolderId = bimoooGuiAccess.clientId;

    if (isAdmin && gameMode === 'multi') {
        openAdminBtn.classList.remove('hidden');

        // Control visibility of Insta-Kill/Revive buttons
        adminKillStarBtn.classList.toggle('hidden', isStarDead || isStarKicked);
        adminReviveStarBtn.classList.toggle('hidden', !(isStarDead || isStarKicked)); // Show revive if dead or kicked

        // NEW: Populate Bimooo GUI target select dropdown
        adminBimoooGuiAccessSection.classList.remove('hidden');
        adminBimoooGuiTargetSelect.innerHTML = '<option value="">Select User</option>';
        const peers = room.peers || {};
        Object.keys(peers).forEach(clientId => {
            const peer = peers[clientId];
            // Admin can assign GUI to anyone, including themselves, but their own access is inherent.
            // This dropdown is primarily for giving access to *others*.
            // If the current GUI holder is in the list, mark them selected.
            const option = document.createElement('option');
            option.value = clientId;
            option.textContent = peer.username + (clientId === myClientId ? ' (You)' : '');
            adminBimoooGuiTargetSelect.appendChild(option);
        });

        // Control visibility of Give/Revoke Bimooo GUI buttons
        if (currentGuiHolderId) {
            adminGiveBimoooGuiBtn.classList.add('hidden');
            adminRevokeBimoooGuiBtn.classList.remove('hidden');
            // Select the current GUI holder in the dropdown
            adminBimoooGuiTargetSelect.value = currentGuiHolderId;
            adminBimoooGuiTargetSelect.disabled = true; // Disable if someone already has it
        } else {
            adminGiveBimoooGuiBtn.classList.remove('hidden');
            adminRevokeBimoooGuiBtn.classList.add('hidden');
            adminBimoooGuiTargetSelect.value = ""; // Reset selection
            adminBimoooGuiTargetSelect.disabled = false;
        }

        // NEW: Populate Admin Management list
        if (gameMode === 'multi') {
            adminManagementSection.classList.remove('hidden');
            adminManagementUserList.innerHTML = '';
            const peers = room.peers || {};
            const adminIds = room.roomState.adminIds || [];
            Object.keys(peers).forEach(clientId => {
                const peer = peers[clientId];
                const isUserAdmin = adminIds.includes(clientId);
                const userItem = document.createElement('div');
                userItem.className = 'admin-user-item';
                userItem.innerHTML = `
                    <span>${peer.username} ${clientId === myClientId ? ' (You)' : ''}</span>
                    <button class="admin-action-btn ${isUserAdmin ? 'revoke-admin-btn' : 'make-admin-btn'}" 
                            data-target-id="${clientId}" 
                            data-target-name="${peer.username}">
                        ${isUserAdmin ? 'Revoke Admin' : 'Make Admin'}
                    </button>
                `;
                adminManagementUserList.appendChild(userItem);
            });
        } else {
            adminManagementSection.classList.add('hidden');
        }

        // Populate kick list only in multiplayer
        if (gameMode === 'multi') {
            adminKickSection.classList.remove('hidden');
            adminUserList.innerHTML = '';
            
            // Add Bimooo to kick list if not already kicked
            const { isBimoooKicked, kickedPlayers = {} } = room.roomState; // Destructure again for clarity, and use current kickedPlayers

            if (!isBimoooKicked) {
                const bimoooItem = document.createElement('div');
                bimoooItem.className = 'admin-user-item';
                bimoooItem.innerHTML = `
                    <span>Bimooo (Character)</span>
                    <button class="kick-btn" data-kick-id="bimooo-character" data-kick-name="Bimooo">Kick</button>
                `;
                adminUserList.appendChild(bimoooItem);
            }

            // Add Star to kick list if not already kicked or dead
            if (!isStarKicked && !isStarDead) {
                const starItem = document.createElement('div');
                starItem.className = 'admin-user-item';
                starItem.innerHTML = `
                    <span>Bimooo's Star</span>
                    <button class="kick-btn" data-kick-id="bimooo-star" data-kick-name="Bimooo's Star">Kick</button>
                `;
                adminUserList.appendChild(starItem);
            }

            // Add real players to kick list
            const peers = room.peers || {};
            Object.keys(peers)
                .filter(clientId => !kickedPlayers[clientId]?.kicked) // Filter out kicked players
                .forEach(clientId => {
                    if (clientId === myClientId) return; // Don't show self in kick list

                    const peer = peers[clientId];
                    const userItem = document.createElement('div');
                    userItem.className = 'admin-user-item';
                    userItem.innerHTML = `
                        <span>${peer.username}</span>
                        <button class="kick-btn" data-kick-id="${clientId}" data-kick-name="${peer.username}">Kick</button>
                    `;
                    adminUserList.appendChild(userItem);
                });

            // Populate unkick list
            adminUnkickSection.classList.remove('hidden');
            adminKickedUserList.innerHTML = '';
            const kickedEntries = Object.entries(kickedPlayers).filter(([, data]) => data?.kicked);
            
            if (kickedEntries.length > 0) {
                 kickedEntries.forEach(([clientId, data]) => {
                    const userItem = document.createElement('div');
                    userItem.className = 'admin-user-item';
                    userItem.innerHTML = `
                        <span>${data.username}</span>
                        <button class="unkick-btn" data-unkick-id="${clientId}" data-unkick-name="${data.username}">Unkick</button>
                    `;
                    adminKickedUserList.appendChild(userItem);
                });
            } else {
                adminKickedUserList.innerHTML = '<span>No users are currently kicked.</span>';
            }

            // Add event listeners to newly created kick buttons
            adminUserList.querySelectorAll('.kick-btn').forEach(button => {
                button.addEventListener('click', (e) => {
                    // Prevent re-adding listener if panel was just updated
                    if(e.currentTarget.listenerAttached) return;
                    e.currentTarget.listenerAttached = true;

                    const targetId = e.target.dataset.kickId;
                    const targetName = e.target.dataset.kickName;
                    if (confirm(`Are you sure you want to kick ${targetName}?`)) {
                        adminKickPlayer(targetId, targetName);
                    }
                    return; // Prevent other handlers on the panel from firing
                });
            });

            // Add event listeners to newly created unkick buttons
            adminKickedUserList.querySelectorAll('.unkick-btn').forEach(button => {
                button.addEventListener('click', (e) => {
                    if(e.currentTarget.listenerAttached) return;
                    e.currentTarget.listenerAttached = true;
                    
                    const targetId = e.target.dataset.unkickId;
                    const targetName = e.target.dataset.unkickName;
                     if (confirm(`Are you sure you want to unkick ${targetName}? They will be able to rejoin.`)) {
                        adminUnkickPlayer(targetId, targetName);
                    }
                    return;
                });
            });

        } else {
            // Hide kick/unkick sections in single player
            adminKickSection.classList.add('hidden');
            adminUnkickSection.classList.add('hidden');
            adminBimoooGuiAccessSection.classList.add('hidden'); // NEW: Hide GUI section in SP
        }

        // Update sadness input to reflect current state
        const sadnessInput = document.getElementById('adminSadnessInput');
        if (sadnessInput) {
            sadnessInput.value = currentSadnessLevel;
        }

    } else {
        openAdminBtn.classList.add('hidden');
        adminPanel.classList.add('hidden'); // Also hide panel if not admin
        document.getElementById('adminPanelOverlay').classList.add('hidden');
    }
}

/**
 * Renders the Admin Panel if the current user is the admin.
 */
function renderAdminPanel() {
    // This function is deprecated in favor of updateAdminUI which handles both visibility and content.
    // Kept here to avoid breaking any other potential calls, but logic is moved.
    updateAdminUI();
}

/**
 * Sets up the event listeners for the admin panel controls.
 * This is called once during game initialization for multiplayer mode.
 * NEW: Adds listeners for Bimooo GUI admin controls.
 */
function setupAdminEventListeners() {
    document.getElementById('adminKillStarBtn').addEventListener('click', () => {
        // The visibility of this button is controlled by updateAdminUI
        const myUsername = room.peers[myClientId]?.username || 'Admin';
        const systemMessage = {
            role: "system",
            content: `${myUsername} has killed Bimooo's star! The horror!`,
            clientId: "System",
            timestamp: Date.now()
        };
        room.updateRoomState({
            isStarKicked: false, // Ensure it's not 'kicked' if it's 'dead'
            isStarDead: true,
            chatMessages: [...(room.roomState.chatMessages || []), systemMessage],
            kickedPlayers: {
                ...room.roomState.kickedPlayers,
                'bimooo-star': null // Remove from kicked if it was just kicked
            }
        });
    });

    // NEW: Admin Revive Star button listener
    document.getElementById('adminReviveStarBtn').addEventListener('click', () => {
        // The visibility of this button is controlled by updateAdminUI
        const myUsername = room.peers[myClientId]?.username || 'Admin';
        const systemMessage = {
            role: "system",
            content: `${myUsername} has revived Bimooo's star! Bimooo is happy again!`,
            clientId: "System",
            timestamp: Date.now()
        };
        room.updateRoomState({
            isStarKicked: false, // Unkick it
            isStarDead: false, // Revive it if it was dead
            chatMessages: [...(room.roomState.chatMessages || []), systemMessage],
            kickedPlayers: {
                ...room.roomState.kickedPlayers,
                'bimooo-star': null // Remove from kicked list if it was kicked
            }
        });
    });

    document.getElementById('adminResetBtn').addEventListener('click', () => {
        // Stop any currently playing rickroll audio immediately
        if (rickrollSourceNode) {
            try {
                rickrollSourceNode.stop();
            } catch(e) { /* It might have already stopped, ignore error */ }
            rickrollSourceNode = null;
        }

        // NEW: Manually stop the video on the client pressing the button
        const pizzaVideo = document.getElementById('pizzaVideo');
        if (!pizzaVideo.paused) {
            pizzaVideo.pause();
            pizzaVideo.currentTime = 0;
        }
        document.getElementById('videoOverlay').classList.add('hidden');

        const myUsername = room.peers[myClientId]?.username || 'Admin';
        const systemMessage = {
            role: "system",
            content: `${myUsername} has reset the game.`,
            clientId: "System",
            timestamp: Date.now()
        };
        room.updateRoomState({
            sadnessLevel: 0,
            bimoooInsanityLevel: 0, // Reset insanity on admin reset
            isStarDead: false,
            isBimoooKicked: false,
            isStarKicked: false,
            chatMessages: [systemMessage],
            vote: null, // Clear the vote
            kickedPlayers: {}, // Clear kicked players on reset
            // NEW: Reset Bimooo GUI access and star properties on full reset
            bimoooGuiAccess: { clientId: null, usesLeft: 0, assignedByVote: false },
            starPosition: { x: 200, y: 20 },
            bimoooHasAura: false,
            isBackgroundToggled: false,
            isRotating: false,
            moldSpots: [], // NEW: Reset mold spots
            isVideoPlaying: false, // NEW: Reset video state
            videoStartTime: 0, // NEW: Reset video start time
            isRickrolling: false, // NEW: Reset rickroll state
            rickrollGifPositions: [], // Reset gif positions
            rickrollStartTime: 0, // Reset start time
            // Do not reset adminId
        });
    });

    document.getElementById('adminCancelEffectsBtn').addEventListener('click', () => {
        // Stop any currently playing rickroll audio immediately
        if (rickrollSourceNode) {
            try {
                rickrollSourceNode.stop();
            } catch(e) { /* It might have already stopped, ignore error */ }
            rickrollSourceNode = null;
        }

        // NEW: Manually stop the video on the client pressing the button
        const pizzaVideo = document.getElementById('pizzaVideo');
        if (!pizzaVideo.paused) {
            pizzaVideo.pause();
            pizzaVideo.currentTime = 0;
        }
        document.getElementById('videoOverlay').classList.add('hidden');

        const myUsername = room.peers[myClientId]?.username || 'Admin';
        const systemMessage = {
            role: "system",
            content: `${myUsername} has cancelled all active GUI effects.`,
            clientId: "System",
            timestamp: Date.now()
        };

        room.updateRoomState({
            isRotating: false,
            isVideoPlaying: false,
            videoStartTime: 0, // Also reset this to prevent late joiners from starting it
            isRickrolling: false,
            rickrollStartTime: 0, // Reset this too
            chatMessages: [...(room.roomState.chatMessages || []), systemMessage]
        });
    });

    document.getElementById('adminSendMsgBtn').addEventListener('click', () => {
        const input = document.getElementById('adminSystemMessageInput');
        const message = input.value.trim();
        if (message) {
            const myUsername = room.peers[myClientId]?.username || 'Admin';
            const systemMessage = {
                role: "system",
                content: `[${myUsername}]: ${message}`,
                clientId: "System",
                timestamp: Date.now()
            };
            room.updateRoomState({
                chatMessages: [...(room.roomState.chatMessages || []), systemMessage]
            });
            input.value = '';
        }
    });

    // NEW: Admin Give Bimooo GUI Access
    adminGiveBimoooGuiBtn.addEventListener('click', () => {
        const targetId = adminBimoooGuiTargetSelect.value;
        const targetName = adminBimoooGuiTargetSelect.options[adminBimoooGuiTargetSelect.selectedIndex].text;
        if (targetId) {
            const myUsername = room.peers[myClientId]?.username || 'Admin';
            room.updateRoomState({
                bimoooGuiAccess: {
                    clientId: targetId,
                    usesLeft: 1, // Admin gives 1 use
                    assignedByVote: false
                },
                chatMessages: [...(room.roomState.chatMessages || []), {
                    role: "system",
                    content: `${myUsername} gave Bimooo GUI access to ${targetName}!`,
                    clientId: "System",
                    timestamp: Date.now()
                }]
            });
        } else {
            alert("Please select a user to give Bimooo GUI access.");
        }
    });

    // NEW: Admin Revoke Bimooo GUI Access
    adminRevokeBimoooGuiBtn.addEventListener('click', () => {
        const currentGuiHolderId = room.roomState.bimoooGuiAccess?.clientId;
        const currentGuiHolderName = room.peers[currentGuiHolderId]?.username || 'a user';
        const myUsername = room.peers[myClientId]?.username || 'Admin';
        room.updateRoomState({
            bimoooGuiAccess: { clientId: null, usesLeft: 0, assignedByVote: false },
            chatMessages: [...(room.roomState.chatMessages || []), {
                role: "system",
                content: `${myUsername} revoked Bimooo GUI access from ${currentGuiHolderName}.`,
                clientId: "System",
                timestamp: Date.now()
            }]
        });
    });

    // Use event delegation for dynamically created kick/unkick buttons
    const adminPanel = document.getElementById('adminPanel'); // Use the main panel for delegation

    adminPanel.addEventListener('click', (e) => {
        const kickButton = e.target.closest('.kick-btn');
        if (kickButton) {
            const targetId = kickButton.dataset.kickId;
            const targetName = kickButton.dataset.kickName;
            if (confirm(`Are you sure you want to kick ${targetName}?`)) {
                adminKickPlayer(targetId, targetName);
            }
            return; // Prevent other handlers on the panel from firing
        }

        const unkickButton = e.target.closest('.unkick-btn');
        if (unkickButton) {
            const targetId = unkickButton.dataset.unkickId;
            const targetName = unkickButton.dataset.unkickName;
            if (confirm(`Are you sure you want to unkick ${targetName}? They will be able to rejoin.`)) {
                adminUnkickPlayer(targetId, targetName);
            }
            return;
        }

        const adminActionButton = e.target.closest('.admin-action-btn');
        if (adminActionButton) {
            const targetClientId = adminActionButton.dataset.targetId;
            const targetName = adminActionButton.dataset.targetName; // Keep for confirm dialogs
            
            const targetUserData = clientIdToUserIdMap.get(targetClientId);
            if (!targetUserData) {
                alert("Could not find user data for this client. They may have disconnected or their data hasn't loaded yet.");
                return;
            }
            const { userId: targetUserId, username: targetUsername } = targetUserData;

            const isUserAdmin = adminUserRecords.some(r => r.user_id === targetUserId);
            
            if (isUserAdmin) {
                // Revoke admin
                if (adminUserRecords.length <= 1) {
                    alert(`Cannot revoke admin status from ${targetUsername} as they are the only admin.`);
                    return;
                }
                if (confirm(`Are you sure you want to revoke admin status from ${targetUsername}?`)) {
                    const adminRecord = adminUserRecords.find(r => r.user_id === targetUserId);
                    if (adminRecord) {
                        room.collection('admin_user_v1').delete(adminRecord.id);
                    } else {
                        console.error("Could not find admin record to delete for user ID:", targetUserId);
                        alert("Error: Could not find the admin record to remove.");
                    }
                }
            } else {
                // Grant admin
                if (confirm(`Are you sure you want to make ${targetUsername} an admin?`)) {
                    room.collection('admin_user_v1').create({
                        user_id: targetUserId,
                        username: targetUsername,
                    });
                }
            }
        }
    });
}

/**
 * Kicks a player as an admin.
 * @param {string} clientId The ID of the client to kick.
 * @param {string} targetName The username of the client to kick.
 */
function adminKickPlayer(clientId, targetName) {
    if (!clientId) return;

    const myUsername = room.peers[myClientId]?.username || 'Admin';

    if (clientId === 'bimooo-character') {
        room.updateRoomState({
            isBimoooKicked: true,
            kickedPlayers: {
                ...room.roomState.kickedPlayers,
                'bimooo-character': { kicked: true, username: 'Bimooo (Character)' }
            },
            chatMessages: [...(room.roomState.chatMessages || []), {
                role: "system",
                content: `${myUsername} has kicked Bimooo from the chat!`,
                clientId: "System",
                timestamp: Date.now()
            }]
        });
        return;
    }

    if (clientId === 'bimooo-star') {
        room.updateRoomState({
            isStarKicked: true,
            // Make Bimooo sad, but not maxed out.
            sadnessLevel: Math.min(maxSadnessLevel, (room.roomState.sadnessLevel || 0) + 5),
            chatMessages: [...(room.roomState.chatMessages || []), {
                role: "system",
                content: `${myUsername} has kicked Bimooo's star away!`,
                clientId: "System",
                timestamp: Date.now()
            }],
            kickedPlayers: {
                ...room.roomState.kickedPlayers,
                'bimooo-star': { kicked: true, username: "Bimooo's Star" }
            }
        });
        return;
    }
    
    const peerName = targetName || room.peers[clientId]?.username || 'A user';
    const systemMessage = {
        role: "system",
        content: `${myUsername} has kicked ${peerName}.`,
        clientId: "System",
        timestamp: Date.now()
    };
    room.updateRoomState({
        kickedPlayers: {
            ...room.roomState.kickedPlayers,
            [clientId]: { kicked: true, username: peerName }
        },
        chatMessages: [
            ...(room.roomState.chatMessages || []),
            systemMessage
        ],
        vote: null // Clear the vote
    });
}

/**
 * Unkicks a player as an admin.
 * @param {string} clientId The ID of the client to unkick.
 * @param {string} username The username of the client to unkick.
 */
function adminUnkickPlayer(clientId, username) {
    if (!clientId) return;

    const myUsername = room.peers[myClientId]?.username || 'Admin';

    if (clientId === 'bimooo-character') {
        room.updateRoomState({
            isBimoooKicked: false,
            kickedPlayers: {
                ...room.roomState.kickedPlayers,
                'bimooo-character': null
            },
            chatMessages: [...(room.roomState.chatMessages || []), {
                role: "system",
                content: `${myUsername} has unkicked Bimooo.`,
                clientId: "System",
                timestamp: Date.now()
            }]
        });
        return;
    }
    if (clientId === 'bimooo-star') {
        room.updateRoomState({
            isStarKicked: false, // Unkick it
            isStarDead: false, // Revive it if it was dead
            sadnessLevel: 0, // Reset Bimooo's mood
            bimoooInsanityLevel: 0, // Reset insanity
            kickedPlayers: {
                ...room.roomState.kickedPlayers,
                'bimooo-star': null // Remove from kicked list if it was kicked
            },
            chatMessages: [...(room.roomState.chatMessages || []), {
                role: "system",
                content: `${myUsername} has unkicked and revived Bimooo's Star.`,
                clientId: "System",
                timestamp: Date.now()
            }]
        });
        return;
    }

    const systemMessage = {
        role: "system",
        content: `${myUsername} has unkicked ${username}. They can now rejoin.`,
        clientId: "System",
        timestamp: Date.now()
    };
    room.updateRoomState({
        kickedPlayers: {
            ...room.roomState.kickedPlayers,
            [clientId]: null // Set to null to remove the entry
        },
        chatMessages: [
            ...(room.roomState.chatMessages || []),
            systemMessage
        ],
        vote: null // Clear the vote
    });
}

/**
 * Handles being kicked from the game.
 */
function handleBeingKicked() {
    // Prevent this from running multiple times
    if (gameMode === 'none') return; 

    // Disconnect and clean up the current room object
    if (room && typeof room.disconnect === 'function') {
        // The disconnect function will now return null, so we assign it here.
        room = room.disconnect();
    }
    
    // Reset to the selection screen with a message.
    resetToModeSelection({ kicked: true });
}

/**
 * Renders the list of connected users in the multiplayer UI.
 * NEW: Adds clickable users for vote-kicking, and includes Bimooo/Star.
 */
function renderUserList() {
    if (gameMode !== 'multi' || !room) return;

    const userListEl = document.getElementById('userList');
    const userCountEl = document.getElementById('userCount');
    const peers = room.peers || {};
    const { isBimoooKicked, isStarKicked, isStarDead, kickedPlayers = {}, adminIds = [] } = room.roomState;

    userListEl.innerHTML = ''; // Clear old list

    const peerIds = Object.keys(peers).filter(clientId => !kickedPlayers[clientId]?.kicked);

    peerIds.forEach(clientId => {
        const peer = peers[clientId];
        const li = document.createElement('li');
        
        // Add data attributes for easy access
        li.dataset.clientId = clientId;
        li.dataset.username = peer.username;

        // NEW: Add admin-user class if user is an admin
        if (adminIds.includes(clientId)) {
            li.classList.add('admin-user');
        }

        li.innerHTML = `
            <img src="${peer.avatarUrl}" alt="${peer.username}'s avatar" />
            <span>${peer.username} ${clientId === myClientId ? '(You)' : ''}</span>
        `;
        
        // Add click listener for vote-kicking, but not for yourself
        // NEW: Also allow voting for GUI access for other players.
        if (clientId !== myClientId) {
            li.classList.add('clickable-user');
            li.addEventListener('click', (e) => {
                const targetId = li.dataset.clientId;
                const targetName = li.dataset.username;

                // Create a small context menu or confirm box.
                // For simplicity, we'll use a prompt or two confirm dialogs.
                const action = prompt(`Choose action for ${targetName}: 'kick' or 'gui'?`);
                if (action === 'kick') {
                    if (confirm(`Start a vote to kick ${targetName}?`)) {
                        handleStartVote('kick', { targetId, targetName });
                    }
                } else if (action === 'gui') {
                     if (confirm(`Start a vote to give Bimooo GUI access to ${targetName}?`)) {
                        handleStartVote('bimoooGuiAccess', { targetId, targetName });
                    }
                }
            });
        }
        
        userListEl.appendChild(li);
    });

    // Add Bimooo and Star to the user list if they aren't kicked/dead
    if (!isBimoooKicked) {
        const bimoooLi = document.createElement('li');
        bimoooLi.classList.add('clickable-user', 'bimooo-kick-target');
        bimoooLi.innerHTML = `
            <img src="/bimoooBody.png" alt="Bimooo's avatar" />
            <span>Bimooo</span>
        `;
        bimoooLi.addEventListener('click', () => {
            if (confirm("Start a vote to kick Bimooo out of the chat?")) {
                handleStartVote('kick', { targetId: 'bimooo-character', targetName: 'Bimooo' });
            }
        });
        userListEl.appendChild(bimoooLi);
    }
    
    if (!isStarKicked && !isStarDead) {
        const starLi = document.createElement('li');
        starLi.classList.add('clickable-user', 'star-kick-target');
        starLi.innerHTML = `
            <img src="/BimoooStarHappy.png" alt="Star's avatar" />
            <span>Bimooo's Star</span>
        `;
        starLi.addEventListener('click', () => {
            if (confirm("Start a vote to kick Bimooo's Star away?")) {
                handleStartVote('kick', { targetId: 'bimooo-star', targetName: "Bimooo's Star" });
            }
        });
        userListEl.appendChild(starLi);
    }

    // Update count to include visible special characters
    userCountEl.textContent = userListEl.childElementCount;
}

/**
 * Initiates a vote.
 * @param {'reset' | 'killStar' | 'kick' | 'reviveStar' | 'bimoooGuiAccess'} type - The type of vote.
 * @param {object} [options] - Additional options for the vote.
 * @param {string} [options.targetId] - The client ID or special character ID of the target.
 * @param {string} [options.targetName] - The username/name of the target.
 */
function handleStartVote(type, options = {}) {
    if (gameMode !== 'multi' || !room) return;

    // Prevent starting a vote if one is already in progress, to keep it simple.
    if (room.roomState.vote && room.roomState.vote.status === 'active') {
        alert('A vote is already in progress.');
        return;
    }

    const myUsername = room.peers[myClientId]?.username || 'A user';

    // Prevent starting a kill vote if star is already dead/kicked
    if (type === 'killStar' && (room.roomState.isStarDead || room.roomState.isStarKicked)) {
        alert("Bimooo's star is already gone...");
        return;
    }

    // Prevent starting a revive vote if star is not dead/kicked
    if (type === 'reviveStar' && !(room.roomState.isStarDead || room.roomState.isStarKicked)) {
        alert("Bimooo's star is not dead or kicked yet!");
        return;
    }

    // NEW: Prevent starting GUI access vote if someone already has access
    if (type === 'bimoooGuiAccess' && room.roomState.bimoooGuiAccess?.clientId) {
        alert(`${room.peers[room.roomState.bimoooGuiAccess.clientId]?.username || 'Someone'} already has Bimooo GUI access.`);
        return;
    }

    // NEW: If starting GUI vote without a specific target (i.e., from the main vote button), allow user to pick from list
    if (type === 'bimoooGuiAccess' && !options.targetId) {
        const peers = room.peers || {};
        let userOptions = [];
        // Populate with all connected users (including self for selection, if not admin)
        Object.keys(peers).forEach(id => {
            const peer = peers[id];
            userOptions.push({ id, name: peer.username + (id === myClientId ? " (You)" : "") });
        });
        
        let promptMessage = "Who should get Bimooo GUI access?\n";
        userOptions.forEach((u, index) => {
            promptMessage += `${index + 1}. ${u.name} (ID: ${u.id})\n`;
        });
        promptMessage += "\nEnter the number or Client ID of the user:";

        const selection = prompt(promptMessage);
        
        if (!selection) return;

        let selectedUser;
        // Try to parse as number (index) first, then as client ID
        const selectedIndex = parseInt(selection, 10);
        if (!isNaN(selectedIndex) && selectedIndex > 0 && selectedIndex <= userOptions.length) {
            selectedUser = userOptions[selectedIndex - 1];
        } else {
            selectedUser = userOptions.find(u => u.id === selection);
        }

        if (selectedUser) {
            options.targetId = selectedUser.id;
            options.targetName = selectedUser.name;
        } else {
            alert("Invalid selection. Please try again.");
            return;
        }
    }
    
    const voteData = {
        type: type,
        initiatorId: myClientId,
        initiatorName: myUsername,
        status: 'active',
        votes: {}, // Reset votes for the new poll
    };

    if (type === 'kick' || type === 'bimoooGuiAccess') { // NEW: Apply target for GUI access votes too
        if (!options.targetId || !options.targetName) {
            console.error("Vote requires targetId and targetName.");
            return;
        }
        voteData.targetId = options.targetId;
        voteData.targetName = options.targetName;
    }

    room.updateRoomState({ vote: voteData });
}

/**
 * Renders the voting UI based on the current room state.
 * NEW: Displays messages for Bimooo GUI access votes.
 */
function renderVoteStatus(roomState) {
    if (gameMode !== 'multi') return;

    const voteContainer = document.getElementById('voteContainer');
    const vote = roomState.vote;

    if (!vote || vote.status !== 'active') {
        voteContainer.classList.add('hidden');
        voteContainer.innerHTML = '';
        return;
    }

    const votes = vote.votes || {};
    const hasVoted = myClientId in votes;
    const yesVotes = Object.values(votes).filter(v => v === 'yes').length;
    const noVotes = Object.values(votes).filter(v => v === 'no').length;

    let voteMessage = '';
    switch (vote.type) {
        case 'reset':
            voteMessage = `${vote.initiatorName} started a vote to reset the game!`;
            break;
        case 'killStar':
            voteMessage = `${vote.initiatorName} started a vote to KILL THE STAR!`;
            break;
        case 'kick':
            voteMessage = `${vote.initiatorName} started a vote to kick ${vote.targetName}!`;
            break;
        case 'reviveStar':
            voteMessage = `${vote.initiatorName} started a vote to REVIVE THE STAR!`;
            break;
        case 'bimoooGuiAccess': // NEW: Bimooo GUI access vote message
            voteMessage = `${vote.initiatorName} started a vote to give Bimooo GUI access to ${vote.targetName}!`;
            break;
        default:
            voteMessage = `A vote has been started.`;
    }

    voteContainer.classList.remove('hidden');
    voteContainer.innerHTML = `
        <p>${voteMessage}</p>
        <div class="vote-buttons">
            <button class="yes-btn" ${hasVoted ? 'disabled' : ''}>Yes</button>
            <button class="no-btn" ${hasVoted ? 'disabled' : ''}>No</button>
        </div>
        <div class="vote-results">
            Votes: ${yesVotes} Yes, ${noVotes} No
        </div>
    `;

    if (!hasVoted) {
        voteContainer.querySelector('.yes-btn').onclick = () => castVote('yes');
        voteContainer.querySelector('.no-btn').onclick = () => castVote('no');
    }

    // Check if the vote is concluded
    const totalPlayers = Object.keys(room.peers).length;
    // Conclude vote only if all connected players have voted
    if (yesVotes + noVotes >= totalPlayers) {
        concludeVote(vote);
    }
}

/**
 * Casts a 'yes' or 'no' vote.
 * @param {'yes' | 'no'} voteValue 
 */
function castVote(voteValue) {
    if (gameMode !== 'multi') return;

    // Use nested structure to avoid race conditions overwriting other votes
    room.updateRoomState({
        vote: {
            votes: {
                [myClientId]: voteValue
            }
        }
    });
}

/**
 * Concludes the vote, resets state if passed, and clears the vote object.
 * @param {object} vote The completed vote object from roomState.
 * NEW: Handles Bimooo GUI access vote conclusion.
 */
function concludeVote(vote) {
    if (gameMode !== 'multi') return;

    const votes = vote.votes || {};
    const yesVotes = Object.values(votes).filter(v => v === 'yes').length;
    const noVotes = Object.values(votes).filter(v => v === 'no').length;

    const systemMessage = {
        role: "system",
        clientId: "System",
        timestamp: Date.now()
    };

    if (yesVotes > noVotes) {
        // Vote passed
        if (vote.type === 'reset') {
            systemMessage.content = `Vote passed (${yesVotes}-${noVotes})! The game has been reset.`;
            room.updateRoomState({
                sadnessLevel: 0,
                bimoooInsanityLevel: 0, // Reset insanity on admin reset
                isStarDead: false,
                isBimoooKicked: false,
                isStarKicked: false,
                chatMessages: [systemMessage],
                vote: null, // Clear the vote
                kickedPlayers: {}, // Clear kicked players on reset
                // NEW: Reset Bimooo GUI access and star properties on full reset
                bimoooGuiAccess: { clientId: null, usesLeft: 0, assignedByVote: false },
                starPosition: { x: 200, y: 20 },
                bimoooHasAura: false,
                isBackgroundToggled: false,
                isRotating: false,
                moldSpots: [], // NEW: Reset mold spots
                isVideoPlaying: false, // NEW: Reset video state
                videoStartTime: 0, // NEW: Reset video start time
                isRickrolling: false, // NEW: Reset rickroll state
                rickrollGifPositions: [], // Reset gif positions
                rickrollStartTime: 0, // Reset start time
                // Do not reset adminId
            });
        } else if (vote.type === 'killStar') {
            systemMessage.content = `Vote passed (${yesVotes}-${noVotes})! You monsters killed Bimooo's star!`;
            room.updateRoomState({
                sadnessLevel: maxSadnessLevel, // Instantly max sadness
                bimoooInsanityLevel: 1, // New: Set initial insanity when killed by vote
                isStarDead: true,
                chatMessages: [
                    ...(room.roomState.chatMessages || []),
                    systemMessage
                ],
                vote: null // Clear the vote
            });
        } else if (vote.type === 'kick') {
            const targetId = vote.targetId;
            const targetName = vote.targetName;

            if (targetId === 'bimooo-character') {
                systemMessage.content = `Vote passed (${yesVotes}-${noVotes})! Bimooo has been kicked from the chat.`;
                room.updateRoomState({
                    isBimoooKicked: true,
                    kickedPlayers: {
                        ...room.roomState.kickedPlayers,
                        'bimooo-character': { kicked: true, username: 'Bimooo (Character)' }
                    },
                    chatMessages: [...(room.roomState.chatMessages || []), systemMessage],
                    vote: null
                });
            } else if (targetId === 'bimooo-star') {
                systemMessage.content = `Vote passed (${yesVotes}-${noVotes})! Bimooo's star has been kicked away.`;
                room.updateRoomState({
                    isStarKicked: true,
                    // Make Bimooo sad, but not maxed out.
                    sadnessLevel: Math.min(maxSadnessLevel, (room.roomState.sadnessLevel || 0) + 5),
                    chatMessages: [...(room.roomState.chatMessages || []), systemMessage],
                    kickedPlayers: {
                        ...room.roomState.kickedPlayers,
                        'bimooo-star': { kicked: true, username: "Bimooo's Star" }
                    },
                    vote: null
                });
            } else {
                systemMessage.content = `Vote passed (${yesVotes}-${noVotes})! ${targetName} has been kicked.`;
                room.updateRoomState({
                    kickedPlayers: {
                        ...room.roomState.kickedPlayers,
                        [targetId]: { kicked: true, username: targetName }
                    },
                    chatMessages: [
                        ...(room.roomState.chatMessages || []),
                        systemMessage
                    ],
                    vote: null // Clear the vote
                });
            }
        } else if (vote.type === 'reviveStar') {
            systemMessage.content = `Vote passed (${yesVotes}-${noVotes})! Bimooo's star has been revived!`;
            room.updateRoomState({
                sadnessLevel: 0,
                bimoooInsanityLevel: 0,
                isStarDead: false,
                isStarKicked: false,
                chatMessages: [...(room.roomState.chatMessages || []), systemMessage],
                vote: null,
                kickedPlayers: {
                    ...room.roomState.kickedPlayers,
                    'bimooo-star': null // Remove from kicked list if it was kicked
                }
            });
        } else if (vote.type === 'bimoooGuiAccess') { // NEW: Handle GUI access vote
            const targetId = vote.targetId;
            const targetName = vote.targetName;
            systemMessage.content = `Vote passed (${yesVotes}-${noVotes})! Bimooo GUI access granted to ${targetName}!`;
            room.updateRoomState({
                bimoooGuiAccess: {
                    clientId: targetId,
                    usesLeft: 1, // Only one use for voted access
                    assignedByVote: true,
                },
                chatMessages: [...(room.roomState.chatMessages || []), systemMessage],
                vote: null // Clear the vote
            });
        }
    } else {
        // Vote failed
        let voteAction;
        switch (vote.type) {
            case 'reset': voteAction = 'reset the game'; break;
            case 'killStar': voteAction = 'kill the star'; break;
            case 'kick': voteAction = `kick ${vote.targetName}`; break;
            case 'reviveStar': voteAction = 'revive the star'; break;
            case 'bimoooGuiAccess': voteAction = `give Bimooo GUI access to ${vote.targetName}`; break; // NEW
            default: voteAction = 'do something';
        }
        systemMessage.content = `Vote to ${voteAction} failed (${yesVotes}-${noVotes}).`;
        room.updateRoomState({
            chatMessages: [
                ...(room.roomState.chatMessages || []),
                systemMessage
            ],
            vote: null // Clear the vote
        });
    }
}

/**
 * NEW: Reads persisted admin records and maps them to currently connected clients,
 * then updates the roomState with the list of current admin client IDs.
 */
function updateAdminStatusForPeers() {
    if (gameMode !== 'multi' || !room) return;

    // Guard against running if we don't have the necessary data yet.
    if (clientIdToUserIdMap.size === 0 && Object.keys(room.peers || {}).length > 0) {
        // We see people in the room, but we don't have their user data yet.
        // Wait for the user_join_v1 subscription to provide it.
        console.log("Delaying admin status update: waiting for user data map.");
        return;
    }
    
    const adminUserIds = new Set(adminUserRecords.map(r => r.user_id));
    const currentPeers = room.peers || {};
    const currentAdminClientIds = [];

    // Ensure the creator, if present, is always considered an admin in the room state,
    // as long as their record exists or is the bootstrap case.
    const creatorIsAdmin = adminUserRecords.length > 0 && creatorUser && adminUserIds.has(creatorUser.id);
    const isBootstrapAdmin = adminUserRecords.length === 0 && creatorUser;
    
    for (const clientId in currentPeers) {
        const peerData = clientIdToUserIdMap.get(clientId);
        if (peerData && adminUserIds.has(peerData.userId)) {
            currentAdminClientIds.push(clientId);
        } else if (isBootstrapAdmin && peerData && peerData.userId === creatorUser.id) {
            // Special case: if no admins are in DB yet, but creator is here, treat them as admin.
            currentAdminClientIds.push(clientId);
        }
    }
    
    // Update roomState only if there's a change to avoid loops and unnecessary re-renders.
    const existingAdminIds = new Set(room.roomState.adminIds || []);
    const newAdminIds = new Set(currentAdminClientIds);

    if (existingAdminIds.size !== newAdminIds.size || ![...existingAdminIds].every(id => newAdminIds.has(id))) {
        console.log("Updating admin client IDs in roomState:", currentAdminClientIds);
        room.updateRoomState({ adminIds: currentAdminClientIds });
    }
}

/**
 * Handles killing the star in single player mode.
 */
function handleKillStarSP() {
    if (gameMode !== 'single' || room.roomState.isStarDead || room.roomState.isStarKicked) return;

    const systemMessage = {
        role: "system",
        content: "You killed Bimooo's star! You monster!",
        clientId: "System",
        timestamp: Date.now()
    };
    
    room.updateRoomState({
        sadnessLevel: maxSadnessLevel,
        bimoooInsanityLevel: 1, // New: Set initial insanity when killed in SP
        isStarDead: true,
        chatMessages: [
            ...(room.roomState.chatMessages || []),
            systemMessage
        ]
    });
}

/**
 * Handles reviving the star in single player mode.
 */
function handleReviveStarSP() {
    if (gameMode !== 'single' || !(room.roomState.isStarDead || room.roomState.isStarKicked)) return;

    const systemMessage = {
        role: "system",
        content: "You revived Bimooo's star! Bimooo is happy again!",
        clientId: "System",
        timestamp: Date.now()
    };
    
    room.updateRoomState({
        sadnessLevel: 0,
        bimoooInsanityLevel: 0,
        isStarDead: false,
        isStarKicked: false,
        chatMessages: [
            ...(room.roomState.chatMessages || []),
            systemMessage
        ],
        kickedPlayers: {
            ...room.roomState.kickedPlayers,
            'bimooo-star': null // Ensure star is removed from kicked list
        }
    });
}

// --- NEW: Bimooo GUI Functions ---

/**
 * Opens the Bimooo GUI panel.
 */
function openBimoooGui() {
    bimoooGuiPanel.classList.remove('hidden');
    bimoooGuiOverlay.classList.remove('hidden');
    updateBimoooGuiPanelState(); // Ensure the uses left count is accurate
}

/**
 * Closes the Bimooo GUI panel.
 */
function closeBimoooGui() {
    bimoooGuiPanel.classList.add('hidden');
    bimoooGuiOverlay.classList.add('hidden');
}

/**
 * Updates the state and content of the Bimooo GUI panel.
 */
function updateBimoooGuiPanelState() {
    if (!room) return;
    const bimoooGuiAccess = room.roomState.bimoooGuiAccess || { clientId: null, usesLeft: 0 };
    const hasGuiAccess = bimoooGuiAccess.clientId === myClientId && bimoooGuiAccess.usesLeft > 0;
    const isAdmin = room && (room.roomState.adminIds || []).includes(myClientId);
    const isStarDead = room.roomState.isStarDead || false;
    const isStarKicked = room.roomState.isStarKicked || false;
    const isRotating = room.roomState.isRotating || false;
    const isMoldy = room.roomState.moldSpots && room.roomState.moldSpots.length > 0;
    const isVideoPlaying = room.roomState.isVideoPlaying || false;
    const isRickrolling = room.roomState.isRickrolling || false;
    const myUsername = room.peers[myClientId]?.username || 'A user';

    // Update mold button text
    guiMoldBimoooBtn.textContent = isMoldy ? 'Clean Bimooo' : 'Make Bimooo Moldy';

    if (gameMode === 'single' || isAdmin) { // Admin also has unlimited uses
        guiUsesLeftDisplay.textContent = "(Unlimited Uses)";
        // All buttons enabled for single player and admin
        guiBullyBimoooBtn.disabled = false;
        guiMakeHappyBtn.disabled = false;
        guiTeleportStarBtn.disabled = isStarDead || isStarKicked;
        guiToggleAuraBtn.disabled = false;
        guiToggleBackgroundBtn.disabled = false;
        guiKillStarBtn.disabled = isStarDead || isStarKicked;
        guiRotateAllBtn.disabled = isRotating;
        guiMoldBimoooBtn.disabled = false;
        guiPlayVideoBtn.disabled = isVideoPlaying;
        guiRickrollBtn.disabled = isRickrolling;
    } else { // Multiplayer non-admin
        if (hasGuiAccess) {
            guiUsesLeftDisplay.textContent = `(${bimoooGuiAccess.usesLeft} Use Left)`;
            // Enable buttons if usesLeft > 0
            guiBullyBimoooBtn.disabled = false;
            guiMakeHappyBtn.disabled = false;
            guiTeleportStarBtn.disabled = isStarDead || isStarKicked;
            guiToggleAuraBtn.disabled = false;
            guiToggleBackgroundBtn.disabled = false;
            guiKillStarBtn.disabled = isStarDead || isStarKicked;
            guiRotateAllBtn.disabled = isRotating;
            guiMoldBimoooBtn.disabled = false;
            guiPlayVideoBtn.disabled = isVideoPlaying;
            guiRickrollBtn.disabled = isRickrolling;
        } else {
            guiUsesLeftDisplay.textContent = "";
            // Disable all buttons if no access
            guiBullyBimoooBtn.disabled = true;
            guiMakeHappyBtn.disabled = true;
            guiTeleportStarBtn.disabled = true;
            guiToggleAuraBtn.disabled = true;
            guiToggleBackgroundBtn.disabled = true;
            guiKillStarBtn.disabled = true;
            guiRotateAllBtn.disabled = true;
            guiMoldBimoooBtn.disabled = true;
            guiPlayVideoBtn.disabled = true;
            guiRickrollBtn.disabled = true;
            closeBimoooGui(); // Close the GUI if access is lost
        }
    }
}

/**
 * Executes a selected Bimooo GUI option.
 * @param {'bully' | 'happy' | 'teleportStar' | 'toggleAura' | 'toggleBackground' | 'killStar' | 'rotateAll' | 'toggleMold' | 'playVideo' | 'rickroll'} optionType
 */
function useBimoooGuiOption(optionType) {
    if (!room) return;

    let updatePayload = {};
    let systemMessageContent = '';
    const currentSadness = room.roomState.sadnessLevel || 0;
    const currentAura = room.roomState.bimoooHasAura || false;
    const isBackgroundToggled = room.roomState.isBackgroundToggled || false;
    const isAdmin = room && (room.roomState.adminIds || []).includes(myClientId);
    const isMoldy = room.roomState.moldSpots && room.roomState.moldSpots.length > 0;
    const myUsername = room.peers[myClientId]?.username || 'A user';

    // Initialize audio on first user interaction with the GUI
    initAudioContext();
    if (optionType === 'rickroll' && !rickrollAudioBuffer) {
        loadRickrollAudio(); // Pre-load audio if not already loaded
    }

    // Check for access in multiplayer, always allow in single player, and always for admin
    if (gameMode === 'multi' && !isAdmin) { // Only consume use if multiplayer AND not admin
        const bimoooGuiAccess = room.roomState.bimoooGuiAccess || { clientId: null, usesLeft: 0 };
        if (bimoooGuiAccess.clientId !== myClientId || bimoooGuiAccess.usesLeft <= 0) {
            alert("You do not have Bimooo GUI access or have no uses left!");
            closeBimoooGui();
            return;
        }
        updatePayload.bimoooGuiAccess = {
            ...bimoooGuiAccess,
            usesLeft: bimoooGuiAccess.usesLeft - 1
        };
        // If usesLeft becomes 0, revoke access completely to allow new votes
        if (updatePayload.bimoooGuiAccess.usesLeft === 0) {
            updatePayload.bimoooGuiAccess = { clientId: null, usesLeft: 0, assignedByVote: false };
        }
    }

    switch (optionType) {
        case 'bully':
            updatePayload.sadnessLevel = Math.min(maxSadnessLevel, currentSadness + 3);
            systemMessageContent = `${myUsername} used the Bimooo GUI to bully Bimooo! Sadness increased.`;
            break;
        case 'happy':
            updatePayload.sadnessLevel = Math.max(0, currentSadness - 3);
            systemMessageContent = `${myUsername} used the Bimooo GUI to make Bimooo happy! Sadness decreased.`;
            break;
        case 'teleportStar':
            const newX = Math.floor(Math.random() * (250 - 80)); // Max X within 250px container for 80px star
            const newY = Math.floor(Math.random() * (300 - 80)); // Max Y within 300px container for 80px star
            updatePayload.starPosition = { x: newX, y: newY };
            systemMessageContent = `${myUsername} used the Bimooo GUI to teleport Bimooo's star!`;
            break;
        case 'toggleAura':
            updatePayload.bimoooHasAura = !currentAura;
            systemMessageContent = `${myUsername} used the Bimooo GUI to toggle Bimooo's aura!`;
            break;
        case 'toggleBackground':
            updatePayload.isBackgroundToggled = !isBackgroundToggled;
            systemMessageContent = `${myUsername} used the Bimooo GUI to change the background!`;
            break;
        case 'killStar':
            updatePayload.isStarDead = true;
            updatePayload.isStarKicked = false;
            updatePayload.sadnessLevel = maxSadnessLevel;
            updatePayload.bimoooInsanityLevel = 1;
            systemMessageContent = `${myUsername} used the Bimooo GUI to kill Bimooo's star!`;
            break;
        case 'rotateAll':
            if (room.roomState.isRotating) {
                alert("The world is already spinning!");
                return; // Don't consume a use if it's already active
            }
            updatePayload.isRotating = true;
            systemMessageContent = `${myUsername} used the Bimooo GUI to do a barrel roll!`;
            // The user who triggers this is responsible for turning it off.
            setTimeout(() => {
                // Check if we are still the one who should be turning it off
                if (room && room.roomState.isRotating) {
                    room.updateRoomState({ isRotating: false });
                }
            }, 10000); // 10 seconds of rotation
            break;
        case 'toggleMold':
            if (isMoldy) {
                updatePayload.moldSpots = [];
                systemMessageContent = `${myUsername} used the Bimooo GUI to clean Bimooo!`;
            } else {
                const newMoldSpots = [];
                for (let i = 0; i < 15; i++) { // Add 15 spots
                    newMoldSpots.push({
                        x: Math.random() * 90 + 5, // % position
                        y: Math.random() * 90 + 5, // % position
                        size: Math.random() * 20 + 5 // px size
                    });
                }
                updatePayload.moldSpots = newMoldSpots;
                systemMessageContent = `${myUsername} used the Bimooo GUI to make Bimooo moldy!`;
            }
            break;
        case 'playVideo':
            if (room.roomState.isVideoPlaying) {
                alert("A video is already playing!");
                return; // Don't consume a use if it's already active
            }
            updatePayload.isVideoPlaying = true;
            updatePayload.videoStartTime = Date.now();
            systemMessageContent = `${myUsername} used the Bimooo GUI to play "Don't Touch My Pizza"!`;
            // The user who triggers this is responsible for turning it off.
            setTimeout(() => {
                if (room && room.roomState.isVideoPlaying) {
                    room.updateRoomState({ isVideoPlaying: false });
                }
            }, 35000); // 35 seconds, video is ~32s
            break;
        case 'rickroll':
            if (room.roomState.isRickrolling) {
                alert("A rickroll is already in progress!");
                return; // Don't consume a use if it's already active
            }
            updatePayload.isRickrolling = true;
            updatePayload.rickrollStartTime = Date.now();
            updatePayload.rickrollGifPositions = [];
            for (let i = 0; i < 20; i++) {
                 updatePayload.rickrollGifPositions.push({
                    top: `${Math.random() * 90}vh`,
                    left: `${Math.random() * 90}vw`,
                    transform: `rotate(${Math.random() * 60 - 30}deg)`
                });
            }
            systemMessageContent = `${myUsername} used the Bimooo GUI to rickroll everyone!`;
            // The user who triggers this is responsible for turning it off.
            // This timeout now only needs to be set by one client.
            setTimeout(() => {
                if (room && room.roomState.isRickrolling) {
                    room.updateRoomState({ isRickrolling: false });
                }
            }, 30000); // Rickroll for 30 seconds
            break;
        default:
            console.warn("Unknown Bimooo GUI option:", optionType);
            return;
    }

    // Add system message to chat history
    const systemMessage = {
        role: "system",
        content: systemMessageContent,
        clientId: "System",
        timestamp: Date.now()
    };
    updatePayload.chatMessages = [...(room.roomState.chatMessages || []), systemMessage];

    room.updateRoomState(updatePayload);
    closeBimoooGui(); // Close GUI after use (for multiplayer, single player can reopen instantly)
}

/**
 * Applies or removes the custom background based on room state.
 */
function updateBackground() {
    const isToggled = room?.roomState?.isBackgroundToggled || false;
    document.body.classList.toggle('bimooo-background', isToggled);
}

/**
 * Applies or removes the rotation class based on room state.
 */
function handleRotationState(isRotating) {
    const appContainer = document.getElementById('appContainer');
    appContainer.classList.toggle('barrel-roll', isRotating);
}

/**
 * NEW: Renders mold spots on Bimooo.
 */
function renderMold() {
    const moldContainer = document.getElementById('moldContainer');
    if (!moldContainer) return;
    moldContainer.innerHTML = ''; // Clear existing mold

    const moldSpots = room?.roomState?.moldSpots || [];

    moldSpots.forEach(spot => {
        const spotEl = document.createElement('div');
        spotEl.className = 'mold-spot';
        spotEl.style.left = `${spot.x}%`;
        spotEl.style.top = `${spot.y}%`;
        spotEl.style.width = `${spot.size}px`;
        spotEl.style.height = `${spot.size}px`;
        moldContainer.appendChild(spotEl);
    });
}

/**
 * NEW: Handles showing/hiding the video overlay and playing the video.
 */
function handleVideoPlayback(isVideoPlaying, wasVideoPlaying) {
    const videoOverlay = document.getElementById('videoOverlay');
    const pizzaVideo = document.getElementById('pizzaVideo');

    if (isVideoPlaying) {
        videoOverlay.classList.remove('hidden');
        const startTime = room.roomState.videoStartTime || Date.now();
        const elapsedTime = (Date.now() - startTime) / 1000;
        const seekTime = Math.max(0, elapsedTime);

        if (seekTime < pizzaVideo.duration) {
             // Only update currentTime if it's significantly different to avoid stutter on minor sync issues.
            if (Math.abs(pizzaVideo.currentTime - seekTime) > 1.5) {
                pizzaVideo.currentTime = seekTime;
            }
            if (pizzaVideo.paused) {
                pizzaVideo.play().catch(error => {
                    console.error("Video play failed. This may be due to browser autoplay policies.", error);
                    // Don't update state here, as it might be a local issue. The video just won't play for this user.
                });
            }
        } else {
            // Video should have already ended. The 'ended' event handler will set isVideoPlaying to false.
            // As a fallback, ensure the overlay is hidden if we reach here.
            videoOverlay.classList.add('hidden');
            if (!pizzaVideo.paused) {
                pizzaVideo.pause();
            }
        }
    } else {
        // If the state says the video is NOT playing, ensure it's hidden and paused.
        videoOverlay.classList.add('hidden');
        if (!pizzaVideo.paused) {
            pizzaVideo.pause();
        }
    }
}

/**
 * NEW: Handles the rickroll effect.
 * @param {boolean} isRickrolling The current state from roomState.
 * @param {boolean} wasRickrolling The previous state from roomState.
 */
function handleRickrollState(isRickrolling, wasRickrolling) {
    const rickrollOverlay = document.getElementById('rickrollOverlay');

    // Only start the effect if the state has just changed to true
    if (isRickrolling && !wasRickrolling) {
        // Start effect
        rickrollOverlay.classList.remove('hidden');
        rickrollOverlay.innerHTML = ''; // Clear any old gifs

        const startTime = room.roomState.rickrollStartTime || Date.now();
        const elapsedTime = (Date.now() - startTime) / 1000;
        const seekTime = Math.max(0, elapsedTime);

        // Play audio for a maximum of 30 seconds
        if (audioContext && rickrollAudioBuffer && seekTime < 30) {
            // Stop any previous instance
            if (rickrollSourceNode) {
                try {
                    rickrollSourceNode.stop();
                } catch(e) { /* ignore */ }
            }
            rickrollSourceNode = audioContext.createBufferSource();
            rickrollSourceNode.buffer = rickrollAudioBuffer;
            rickrollSourceNode.connect(audioContext.destination);

            const remainingTime = 30 - seekTime;
            // Use the third argument (duration) of start() to ensure it only plays for the remaining time.
            if (remainingTime > 0) {
                 rickrollSourceNode.start(0, seekTime, remainingTime); 
            }
        }

        // Create GIFs using stored positions
        const positions = room.roomState.rickrollGifPositions || [];
        positions.forEach(pos => {
            const gif = document.createElement('img');
            gif.src = '/rickroll.gif';
            gif.className = 'rickroll-gif';
            gif.style.top = pos.top;
            gif.style.left = pos.left;
            gif.style.transform = pos.transform;
            rickrollOverlay.appendChild(gif);
        });

    } else if (!isRickrolling && wasRickrolling) {
        // Stop effect only if state has just changed to false
        rickrollOverlay.classList.add('hidden');
        rickrollOverlay.innerHTML = '';

        // Stop audio
        if (rickrollSourceNode) {
            try {
                rickrollSourceNode.stop();
            } catch(e) {
                // It may have already been stopped or finished, which can throw an error. Ignore it.
            }
            rickrollSourceNode = null;
        }
    } else if (isRickrolling && rickrollOverlay.classList.contains('hidden')) {
        // Edge case for late joiners: if the effect should be on but is hidden, show it.
        // We don't restart the audio or GIFs, just make them visible.
        rickrollOverlay.classList.remove('hidden');
    } else if (!isRickrolling && !rickrollOverlay.classList.contains('hidden')) {
        // Edge case for state desync: if effect should be off but is visible, hide it.
        rickrollOverlay.classList.add('hidden');
    }
}

// Event listeners for mode selection buttons, called when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Check if we are in an iframe (like in the websim editor) and adjust styles
    if (window.self !== window.top) {
        document.body.style.padding = '0';
    }
    document.getElementById('singlePlayerBtn').addEventListener('click', () => selectMode('single'));

    // NEW: Multiplayer warning flow
    const multiplayerWarningOverlay = document.getElementById('multiplayerWarningOverlay');
    const continueToMultiplayerBtn = document.getElementById('continueToMultiplayerBtn');
    const backFromWarningBtn = document.getElementById('backFromWarningBtn');

    document.getElementById('multiplayerBtn').addEventListener('click', () => {
        multiplayerWarningOverlay.classList.remove('hidden');
    });

    continueToMultiplayerBtn.addEventListener('click', () => {
        multiplayerWarningOverlay.classList.add('hidden');
        selectMode('multi');
    });

    backFromWarningBtn.addEventListener('click', () => {
        multiplayerWarningOverlay.classList.add('hidden');
    });

    // Admin panel open/close listeners
    const adminPanel = document.getElementById('adminPanel');
    const adminOverlay = document.getElementById('adminPanelOverlay');
    const openAdminBtn = document.getElementById('openAdminPanelBtn');
    const closeAdminBtn = document.getElementById('closeAdminPanelBtn');

    openAdminBtn.addEventListener('click', () => {
        adminPanel.classList.remove('hidden');
        adminOverlay.classList.remove('hidden');
        updateAdminUI(); // Refresh content when opening
    });

    const closePanel = () => {
        adminPanel.classList.add('hidden');
        adminOverlay.classList.add('hidden');
    };

    closeAdminBtn.addEventListener('click', closePanel);
    adminOverlay.addEventListener('click', closePanel);

    // NEW: Video ended event listener
    const pizzaVideo = document.getElementById('pizzaVideo');
    pizzaVideo.addEventListener('ended', () => {
        // Any client can report that the video has ended.
        // The first one to do so will update the state for everyone.
        // We only send the update if the state is still `true`, to avoid redundant updates.
        if (room && room.roomState.isVideoPlaying) {
            room.updateRoomState({ isVideoPlaying: false });
        }
    });
});

/**
 * Handles mode selection (Single Player vs. Multiplayer).
 * Sets up the appropriate 'room' object and initializes the game content.
 * NEW: Grants immediate Bimooo GUI access in single player.
 */
async function selectMode(mode) {
    gameMode = mode;
    document.getElementById('modeSelection').classList.add('hidden');
    // Also hide the kicked message container when a mode is selected
    document.getElementById('kickedMessageContainer').classList.add('hidden');
    document.getElementById('chatContainer').classList.remove('hidden');
    document.getElementById('subtitle').textContent = 'Type messages to Bimooo and watch how sad it gets!';

    if (gameMode === 'multi') {
        document.getElementById('sidePanel').classList.remove('hidden');
        room = new WebsimSocket();
        // Add a disconnect method to WebsimSocket instance for explicit cleanup
        const originalInitialize = room.initialize.bind(room);
        let subscriptions = [];
        room.initialize = async () => {
            await originalInitialize();
            // Wrap subscription methods to track them
            const originalSubscribeRoomState = room.subscribeRoomState.bind(room);
            room.subscribeRoomState = (cb) => {
                const unsub = originalSubscribeRoomState(cb);
                subscriptions.push(unsub);
                return unsub;
            };
            const originalSubscribePresence = room.subscribePresence.bind(room);
            room.subscribePresence = (cb) => {
                const unsub = originalSubscribePresence(cb);
                subscriptions.push(unsub);
                return unsub;
            };
        };
        room.disconnect = () => {
            subscriptions.forEach(unsub => unsub());
            subscriptions = [];
            console.log("WebsimSocket disconnected and subscriptions cleaned up.");
            // Return null instead of assigning it directly to the global `room`.
            // The caller will be responsible for setting the global room to null.
            return null;
        };

        console.log("Multiplayer mode selected. Initializing WebsimSocket...");
        // Attempt to init audio context and load file early for multiplayer
        // User must still interact for it to work on many browsers
        initAudioContext();
        loadRickrollAudio();
    } else { // Single Player
        document.getElementById('singlePlayerControls').classList.remove('hidden');
        room = new MockRoom();
        // NEW: In single player, grant full Bimooo GUI access immediately
        room.updateRoomState({ bimoooGuiAccess: { clientId: room.clientId, usesLeft: Infinity, assignedByVote: false } });
        console.log("Single Player mode selected. Using MockRoom...");
        // Attempt to init audio context and load file for single player
        initAudioContext();
        loadRickrollAudio();
    }

    await initializeGameContent(); // Call shared initialization logic
}
