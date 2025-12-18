/******************************************************
 * Program Name: Land Explorer
 * Description:
 *   Sets up all game configuration values, loads assets,
 *   prepares audio, handles player input, and provides
 *   utility functions used throughout the game.
 * Expected Inputs:
 *   - User keyboard actions
 *   - Data loaded from database via fetch()
 * Expected Outputs:
 *   - Drawn game world on canvas
 *   - Updated player position and puzzle states
 * Called By:
 *   - index.html main script when the page loads
 * Will Call:
 *   - saveGame(), loadGame(), playSfx(), region functions, etc.
 ******************************************************/

/**************** CONFIGURATION CONSTANTS **************
 * Purpose:
 *   These values control the size of tiles, the world,
 *   the view window, and interaction keys.
 * Notes:
 *   Keeping these at the top makes the game easy to tune.
 ******************************************************/
const TILE = 32;
const COLS = 30; 
const ROWS = 18; 
const VIEW_W = 768; 
const VIEW_H = 576; 
const INTERACT_KEY = ' '; 

const SEED_REVEAL_RADIUS = 100; 
const VISION_RADIUS = 100; 

/**************** ASSET PATHS ***************************
 * Purpose:
 *   Stores where music and sound effects are located.
 ******************************************************/
const ASSETS = {
    music: [
        'assets/sounds/clearing.mp3', // region 0
        'assets/sounds/rivers.mp3', // region 1
        'assets/sounds/ruins.mp3', // region 2
        'assets/sounds/glade.mp3', // region 3
        'assets/sounds/monument.mp3' // region 4
    ],
    sfx: {
        seed: 'assets/sounds/seed.mp3',
        puzzleClear: 'assets/sounds/puzzleClear.mp3',
        win: 'assets/sounds/win.mp3',
    }
};

/**************** DOM ELEMENT ACCESS ********************
 * Purpose:
 *   Grabs all the HTML elements the game needs to control,
 *   like the canvas, compass, seed counter, and menus.
 * Why:
 *   Without these, we cannot draw or update UI elements.
 ******************************************************/
const canvas = document.getElementById('gameCanvas');
if (!canvas) throw new Error('Missing canvas#gameCanvas');
const ctx = canvas.getContext('2d');

const DEFAULT_PLAYER_NAME = "Explorer"; 

const compassCanvas = document.getElementById('compassCanvas');
const cctx = (compassCanvas && compassCanvas.getContext) ? compassCanvas.getContext('2d') : null;

const seedCounterEl = document.getElementById('seedCounter');
const timerDisplayEl = document.getElementById('timerDisplay');

const pauseButton = document.getElementById('pauseButton');
const pauseMenu = document.getElementById('pauseMenu');
const resumeBtn = document.getElementById('resumeBtn');
const quitBtn = document.getElementById('quitBtn');

const winMenu = document.getElementById('winMenu');
const restartWin = document.getElementById('restartWin');
const menuWinBtn = document.getElementById('menuWin');

/****************** SAFETY CHECK ***********************
 * Purpose:
 *   Makes sure drawing is possible. If not, stop the game.
 ******************************************************/
if (!ctx) throw new Error('2D context not available for #gameCanvas');

/**************** AUDIO SETUP ***************************
 * Purpose:
 *   Creates audio objects for all regions and sound effects.
 *   Music starts muted and will fade in after player input.
 ******************************************************/
let audioUnlocked = false;
const regionMusic = ASSETS.music.map(path => {
    const a = new Audio(path);
    a.loop = true;
    a.volume = 0; 
    return a;
});
const sfx = {
    seed: new Audio(ASSETS.sfx.seed),
    puzzleClear: new Audio(ASSETS.sfx.puzzleClear),
    win: new Audio(ASSETS.sfx.win),
    interact: new Audio(ASSETS.sfx.interact || ASSETS.sfx.puzzleClear), 
    reset: new Audio(ASSETS.sfx.reset || ASSETS.sfx.seed) 
};
sfx.seed.volume = 0.7;
sfx.puzzleClear.volume = 0.6;
sfx.win.volume = 0.9;
sfx.interact.volume = 0.5;
sfx.reset.volume = 0.8;

/********************************************************
 * Function Name: unlockAudio
 * Description:
 *   Enables game audio after the user interacts with the page.
 *   Browsers block auto-play audio, so this "unlocks" it.
 * Inputs:
 *   - No direct inputs; triggered by click or keydown event.
 * Outputs:
 *   - Music begins playing quietly.
 * Called By:
 *   - Window event listeners (first click or key press)
 * Will Call:
 *   - fadeToRegion()
 ********************************************************/
function unlockAudio() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    regionMusic.forEach(m => {
        try {
            if (m.paused) m.play().catch(()=>{});
        } catch(e){}
    });

    fadeToRegion(currentRegion, 700);
}
window.addEventListener('click', unlockAudio, { once: true });
window.addEventListener('keydown', unlockAudio, { once: true });

/**************** GAME STATE VARIABLES ******************
 * Purpose:
 *   Stores everything needed to run the game loop:
 *   timing, pause state, region, animations, etc.
 ******************************************************/
let lastTime = performance.now();
let paused = false;
let currentRegion = 0; 
let flashTimer = 0;
let waveTime = 0;
let gameTime = 0; 
let animationFrameId = null; 

/**************** PLAYER OBJECT **************************
 * Purpose:
 *   Holds the player's position, speed, and appearance.
 ******************************************************/
const player = {
    x: TILE * 3,
    y: TILE * 3,
    w: 24,
    h: 24,
    speed: 3,
    color: '#3b82f6',
    name: 'Lyra'
};

/********************************************************
 * Function Name: submitScore
 * Description:
 *   Sends the player's final score/time to the database.
 * Inputs:
 *   - playerName: string
 *   - time: number (milliseconds)
 * Outputs:
 *   - No direct output; score is stored server-side.
 * Called By:
 *   - Win condition logic
 * Will Call:
 *   - fetch() to submit data to backend PHP script.
 ********************************************************/
async function submitScore(playerName, time) {
    await fetch("api/submit_score.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            player_name: playerName,
            completion_time: time
        })
    });
}
/********************************************************
 * Function Name: loadGame
 * Description:
 *      Loads saved game data from the server for the current
 *      player (determined from player object or sessionStorage).
 *      Restores region, player position, game time, and complex
 *      components (seeds, crates, puzzles).
 * Inputs:
 * - none (uses global player, regions, and gameTime)
 * Outputs:
 * - returns true on successful load, false on failure
 * Called By:
 * - initGame during startup/resume
 * Will Call:
 * - fetch() -> api/load.php
 * - JSON.parse for decoding saved JSON strings
 ********************************************************/
async function loadGame() {
    // 1. Determine player name from player object or session storage fallback
    const playerName = player.name || sessionStorage.getItem("lastPlayerName") || DEFAULT_PLAYER_NAME;
    player.name = playerName; // Ensure global player object has the name
  
    console.log(`[LOAD] Attempting to load save for player: ${playerName}`);
  
    try {
        // Fetch request
        const url = `api/load.php?player_name=${encodeURIComponent(playerName)}`;
        const response = await fetch(url);
  
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
  
        const st = await response.json();
        console.log("[LOAD] Raw Server Response Object:", st);
  
        // 2. Check if data is valid (PHP returns null if no save is found)
        if (!st || st.player_name === undefined) {
            console.log("[LOAD FAILED] Server returned no valid save data (null/empty object).");
            return false;
        }
  
        // 3. Restore primary game state variables
        currentRegion = parseInt(st.region);
        player.x = parseFloat(st.pos_x);
        player.y = parseFloat(st.pos_y);
        gameTime = parseFloat(st.game_time);
  
        console.log(`[LOAD SUCCESS] Restoring game state for Region: ${currentRegion}, Time: ${gameTime}`);
  
        // 4. Restore complex game components from JSON strings
        try {
            // Check st.seeds type before parsing. It MUST be a string containing JSON.
            if (typeof st.seeds !== 'string') throw new Error("Seeds data is not a JSON string.");
            const loadedSeeds = JSON.parse(st.seeds);
            loadedSeeds.forEach((arr, ridx) => {
                arr.forEach((collected, sidx) => {
                    if (regions[ridx] && regions[ridx].seeds[sidx]) {
                        regions[ridx].seeds[sidx].collected = !!collected;
                    }
                });
            });
  
            if (typeof st.crates !== 'string') throw new Error("Crates data is not a JSON string.");
            const loadedCrates = JSON.parse(st.crates);
            loadedCrates.forEach((arr, ridx) => {
                arr.forEach((pos, cidx) => {
                    if (regions[ridx] && regions[ridx].crates[cidx]) {
                        regions[ridx].crates[cidx].x = pos.x;
                        regions[ridx].crates[cidx].y = pos.y;
                    }
                });
            });
  
            if (typeof st.puzzles !== 'string') throw new Error("Puzzles data is not a JSON string.");
            const loadedPuzzles = JSON.parse(st.puzzles);
            loadedPuzzles.forEach((pv, ridx) => {
                const r = regions[ridx];
                if (r && r.puzzle && typeof r.puzzle.setState === 'function') {
                    r.puzzle.setState(pv);
                } else if (r && r.puzzle) {
                    r.puzzle.solved = !!pv.solved;
                }
            });
  
            console.log("[LOAD SUCCESS] Complex components (Seeds, Crates, Puzzles) restored.");
            return true;
  
        } catch (jsonError) {
            console.error("[LOAD FAILED] Error parsing/restoring JSON components:", jsonError);
            return false;
        }
  
    } catch (e) {
        console.error("[LOAD FAILED] Fetch or network error during loadGame:", e);
        return false;
    }
  }

/********************************************************
 * Function Name: saveGame
 * Description:
 * Serializes current game state and sends it to the server
 * to persist between sessions. Uses standard JSON POST.
 * Inputs:
 * - none (reads global game state & regions)
 * Outputs:
 * - none (attempts network save; logs result)
 * Called By:
 * - various UI actions (quit, auto-save, region switch)
 * Will Call:
 * - fetch() -> api/save.php
 ********************************************************/
async function saveGame() {
    if (!player.name) {
        player.name = sessionStorage.getItem("lastPlayerName") || DEFAULT_PLAYER_NAME;
    }
    sessionStorage.setItem("lastPlayerName", player.name);
  
    // 1. Serialize puzzle state data
    const puzzleStates = regions.map(r => {
        if (r.puzzle && typeof r.puzzle.getState === 'function') {
            return r.puzzle.getState();
        }
        return { solved: r.puzzle?.solved || false };
    });
  
    const savePayload = {
        player_name: player.name,
        region: currentRegion,
        pos_x: player.x,
        pos_y: player.y,
        game_time: gameTime,
        // The values here must be raw, non-JSON objects/arrays, as they will be
        // json_encoded by the fetch request before sending to PHP.
        seeds: regions.map(r => r.seeds.map(s => s.collected)),
        crates: regions.map(r => r.crates.map(c => ({ x: c.x, y: c.y }))),
        puzzles: puzzleStates
    };
  
    try {
        const response = await fetch("api/save.php", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(savePayload)
        });
        const result = await response.json();
        console.log("Game Saved:", result);
  
    } catch (error) {
        console.error("SAVE ERROR:", error);
    }
  }

/********************************************************
 * Function Name: loadAvatarData
 * Description:
 *   Fetches saved avatar metadata (name & color) from backend
 *   and applies it to the global `player` object.
 * Inputs:
 *   - none (uses api/get_avatar.php)
 * Outputs:
 *   - none (mutates global player)
 * Called By:
 *   - initGame (on startup)
 * Will Call:
 *   - fetch() -> api/get_avatar.php
 ********************************************************/
async function loadAvatarData() {
    try {
        let response = await fetch("api/get_avatar.php");
        let data = await response.json();

        if (data && data.status === "success") {
            player.name = data.avatar.name;
            player.color = data.avatar.color;
        }

    } catch (err) {
        console.error("Error loading avatar:", err);
    }
}

/********************************************************
 * Function Name: saveAvatar
 * Description:
 *   Persists avatar preferences (name & color) to server.
 * Inputs:
 *   - name: string
 *   - color: string (CSS color)
 * Outputs:
 *   - none (sends request to backend)
 * Called By:
 *   - avatar UI controls (not shown here)
 * Will Call:
 *   - fetch() -> api/avatar_save.php
 ********************************************************/
async function saveAvatar(name, color) {
    await fetch("api/avatar_save.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, color })
    });
}

/*******************************
 * INPUT HANDLING
 * Purpose:
 *   Keyboard listeners populate `keys` map and prevent default
 *   browser behaviour for movement/interaction keys.
 *******************************/
const keys = {};

// Keydown handler: records key state and prevents default page actions
window.addEventListener('keydown', e => {
    const key = e.key.toLowerCase();
    keys[key] = true;
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', ' ', 'enter'].includes(key)) {
        e.preventDefault();
    }
});

// Keyup handler: clears key state
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

let interactionPending = false;

/*** UTILS ***/
/********************************************************
 * Function Name: clamp
 * Description:
 *   Clamps a number between [a, b]
 * Inputs:
 *   - v: number
 *   - a: number (min)
 *   - b: number (max)
 * Outputs:
 *   - number clamped to [a,b]
 * Called By:
 *   - camera & region math throughout the code
 ********************************************************/
function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

/********************************************************
 * Function Name: rectOverlap
 * Description:
 *   AABB rectangle overlap test.
 * Inputs:
 *   - a: {x,y,w,h}
 *   - b: {x,y,w,h}
 * Outputs:
 *   - boolean (true if rectangles overlap)
 * Called By:
 *   - collision, puzzle, seed, and crate logic
 ********************************************************/
function rectOverlap(a, b){
    return !(a.x + a.w <= b.x || a.x >= b.x + b.w || a.y + a.h <= b.y || a.y >= b.y + b.h);
}

/********************************************************
 * Function Name: safeSetVolume
 * Description:
 *   Sets audio element volume with clamping [0..1].
 * Inputs:
 *   - audioEl: HTMLAudioElement
 *   - vol: number
 * Outputs:
 *   - none (mutates audioEl.volume)
 * Called By:
 *   - music fade helpers
 ********************************************************/
function safeSetVolume(audioEl, vol){
    audioEl.volume = Math.max(0, Math.min(1, vol));
}

/********************************************************
 * Function Name: formatTime
 * Description:
 *   Converts milliseconds to mm:ss.cc (centiseconds).
 * Inputs:
 *   - ms: number (milliseconds)
 * Outputs:
 *   - formatted string "MM:SS.CC"
 * Called By:
 *   - UI timer display updater
 ********************************************************/
function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const milliseconds = Math.floor((ms % 1000) / 10); // Display centiseconds
    const pad = (num, length = 2) => String(num).padStart(length, '0');
    return `${pad(minutes)}:${pad(seconds)}.${pad(milliseconds)}`;
}

/*** REGIONS: all same size (COLS x ROWS) ***
 * Purpose:
 *   Stores region meta: name, tile grid, seeds, obstacles,
 *   crates, puzzle objects, gates and region-specific music.
 ********************************************************/
const regions = [
    { id:0, name:'Entrance Clearing', cols:COLS, rows:ROWS, seeds:[], obstacles:[], crates:[], targets:[], puzzle:null, gate:null, music: regionMusic[0] },
    { id:1, name:'Riverside Path', cols:COLS, rows:ROWS, seeds:[], obstacles:[], crates:[], targets:[], puzzle:null, gate:null, music: regionMusic[1] },
    { id:2, name:'Ancient Ruins', cols:COLS, rows:ROWS, seeds:[], obstacles:[], crates:[], targets:[], puzzle:null, gate:null, music: regionMusic[2] },
    { id:3, name:'Spirit Glade', cols:COLS, rows:ROWS, seeds:[], obstacles:[], crates:[], targets:[], puzzle:null, gate:null, music: regionMusic[3] },
    { id:4, name:'Monument Grounds', cols:COLS, rows:ROWS, seeds:[], obstacles:[], crates:[], targets:[], puzzle:null, gate:null, music: regionMusic[4] }
];

// linear chain left-right connections
const regionEdges = [
    [null, 1, null, null],
    [null, 2, null, 0],
    [null, 3, null, 1],
    [null, 4, null, 2],
    [null, null, null, 3]
];

/*** MONUMENT (world coordinates inside region 4) ***/
const monument = { x: Math.floor(COLS/2) * TILE, y: Math.floor(ROWS/2) * TILE, w: TILE, h: TILE };

/*** RENDER & PERFORMANCE CACHE ***
 * Purpose:
 *   Cache for pre-rendered static region backgrounds to avoid
 *   re-drawing tiles/obstacles every frame.
 ********************************************************/
const regionBackgrounds = {};

/********************************************************
 * Function Name: prerenderRegionBackground
 * Description:
 *   Draws static elements for a region (tiles, static
 *   obstacles, targets, monument) to an offscreen canvas
 *   and caches it for fast blitting during the game loop.
 * Inputs:
 *   - region: region object (from regions array)
 * Outputs:
 *   - offscreen canvas element containing static render
 * Called By:
 *   - generateContent / initGame to precompute backgrounds
 ********************************************************/
function prerenderRegionBackground(region) {
    if (regionBackgrounds[region.id]) return regionBackgrounds[region.id];

    const offCanvas = document.createElement('canvas');
    offCanvas.width = region.cols * TILE;
    offCanvas.height = region.rows * TILE;
    const offCtx = offCanvas.getContext('2d');

    const colors = ['#8DB360','#6ec0ff','#b7a69e','#a7e7b8','#95d5b2'];
    const base = colors[region.id % colors.length];

    // Draw Tiles 
    for (let r=0;r<region.rows;r++){
        for (let c=0;c<region.cols;c++){
            const x = c * TILE, y = r * TILE;
            offCtx.fillStyle = base;
            offCtx.fillRect(x, y, TILE, TILE);
            offCtx.strokeStyle = 'rgba(0,0,0,0.04)';
            offCtx.strokeRect(x,y,TILE,TILE);
        }
    }

    // Draw Static Obstacles
    const obs = region.obstacles;
    offCtx.fillStyle = '#6b4f3d';
    for (const o of obs) offCtx.fillRect(o.x, o.y, o.w, o.h);

    // Draw Puzzle Targets 
    if (region.id === 2) {
        offCtx.fillStyle = 'rgba(255,100,100,0.3)';
        for (const t of region.targets) {
            offCtx.fillRect(t.x + 4, t.y + 4, TILE-8, TILE-8);
        }
    }

    // Draw Monument 
    if (region.id === 4) {
        offCtx.fillStyle = '#9a4df2';
        offCtx.fillRect(monument.x, monument.y, monument.w, monument.h);
        offCtx.strokeStyle = 'rgba(255,255,255,0.16)'; offCtx.strokeRect(monument.x+2, monument.y+2, monument.w-4, monument.h-4);
    }

    regionBackgrounds[region.id] = offCanvas;
    return offCanvas;
}

/*** AUDIO / SFX HELPERS ***/
/********************************************************
 * Function Name: playSfx
 * Description:
 *   Safely plays a given Audio element if audio has been
 *   unlocked by a user gesture.
 * Inputs:
 *   - audioEl: HTMLAudioElement
 * Outputs:
 *   - none
 * Called By:
 *   - multiple puzzle & UI sound triggers
 ********************************************************/

function playSfx(audioEl) {
    if (!audioUnlocked) return;
    try { audioEl.currentTime = 0; audioEl.play().catch(()=>{}); } catch(e){}
}
function playPuzzleClear(){ playSfx(sfx.puzzleClear); }
function playInteract(){ playSfx(sfx.interact); }
function playReset(){ playSfx(sfx.reset); }


/*** PUZZLE FACTORIES ***
 * Each factory returns an object with:
 *   - solved (boolean)
 *   - update(), draw(ctx), blocksExit(), getState(), setState()
 * so they integrate with the rest of the system.
 ********************************************/

/********************************************************
 * Function Name: createDynamicPlatePuzzle
 * Description:
 *   Creates a puzzle where multiple plates must be held down
 *   simultaneously by player or crates. Plates are dynamic so
 *   only solved state is serialized.
 * Inputs:
 *   - region: region object (used to check crates)
 *   - plates: array of plate descriptors {x,y}
 * Outputs:
 *   - puzzle object with update/draw/getState/setState
 * Called By:
 *   - generateContent to attach puzzle to region
 ********************************************************/
function createDynamicPlatePuzzle(region, plates) {
    const platesData = plates.map(p => ({ ...p, isPressed: false }));

    return {
        solved: false,
        platesData: platesData,

        checkPressed(p) {
            // Check if the player is pressing the plate
            if (rectOverlap(player, { x: p.x, y: p.y, w: TILE, h: TILE })) return true;

            // Check if any crate in the current region is pressing the plate
            return region.crates.some(c => rectOverlap(c, { x: p.x, y: p.y, w: TILE, h: TILE }));
        },

        update() {
            if (this.solved) return;
            let allPressed = true;
            platesData.forEach(p => {
                p.isPressed = this.checkPressed(p);
                if (!p.isPressed) allPressed = false;
            });

            if (allPressed) {
                this.solved = true;
                playPuzzleClear();
            }
        },

        blocksExit() { return !this.solved; },

        draw(ctx) {
            ctx.save();
            platesData.forEach(p => {
                ctx.fillStyle = p.isPressed ? "#77ff77" : "#ffaa55";
                ctx.fillRect(p.x + 8, p.y + 8, TILE-16, TILE-16);
            });
            ctx.restore();
        },
        getState() {
            return { solved: this.solved };
        },
        setState(state) {
            this.solved = !!state.solved;
        }
    };
}

/********************************************************
 * Function Name: createStrictSequencePuzzle
 * Description:
 *   Creates a sequence puzzle in which stepping on an
 *   incorrect pad resets progress. Progress advances when
 *   player steps ON the current pad then steps OFF it.
 * Inputs:
 *   - pads: array of pad descriptors {x,y}
 *   - id: unique id for internal state tracking
 * Outputs:
 *   - puzzle object with update/draw/getState/setState
 * Called By:
 *   - generateContent to attach puzzle to region
 ********************************************************/
let puzzlePadInteraction = {};

//PUZZLE (Region 1) - Strict Sequence Puzzle: Resets if wrong pad/tile is stepped on.
function createStrictSequencePuzzle(pads, id) {
    const padKey = `strict_sequence_${id}`;
    if (puzzlePadInteraction[padKey] === undefined) {
        puzzlePadInteraction[padKey] = {
            enteredCorrectPad: false, 
            lastHitIndex: -1 
        };
    }

    return {
        solved: false,
        index: 0, 
        id: id,
        
        isOverPadOrTarget(pX, pY, region) {
            return pads.some(p => rectOverlap(player, { x: p.x, y: p.y, w: TILE, h: TILE }));
        },

        update() {
            if (this.solved) return;
            const interactionState = puzzlePadInteraction[padKey];
            const playerRect = { x: player.x, y: player.y, w: TILE, h: TILE };
            const touchedPadIndex = pads.findIndex(p => rectOverlap(playerRect, { x: p.x, y: p.y, w: TILE, h: TILE }));
            const isTouchingAPad = touchedPadIndex !== -1;
            const isTouchingCurrentTarget = touchedPadIndex === this.index; // The pad they need to hit now.

            // Reset Check (Failure) 
            // If the player is touching a pad, but it is not the current target, then reset.
            if (isTouchingAPad && !isTouchingCurrentTarget) {
                if (this.index > 0 || touchedPadIndex !== -1) { 
                    this.index = 0;
                    interactionState.enteredCorrectPad = false; 
                    interactionState.lastHitIndex = -1; 
                    playReset();
                    return;
                }
            }
            
            // Set flag if player steps ON the correct pad
            if (isTouchingCurrentTarget) {
                interactionState.enteredCorrectPad = true;
                interactionState.lastHitIndex = this.index; 
                return; 
            }          
            // Advance index if player steps OFF the pad that set the flag.
            
            const padToExit = pads[interactionState.lastHitIndex];
            const isStillTouchingLastHitPad = padToExit && rectOverlap(playerRect, padToExit);

            if (interactionState.enteredCorrectPad && !isStillTouchingLastHitPad) {
                
                // Player has successfully completed the step by exiting the correct pad area.
                // This will trigger even if they immediately step onto the next pad.
                this.index++;
                playInteract(); 
                interactionState.enteredCorrectPad = false; 
                interactionState.lastHitIndex = -1; 

                if (this.index >= pads.length) {
                    this.solved = true;
                    playPuzzleClear();
                }
            }
        },
        
        blocksExit() { return !this.solved; },

        draw(ctx) {
            pads.forEach((p, i) => {
                let fillStyle;
                if (i < this.index) {
                    // Completed Pads: Stays green permanently
                    fillStyle = "#5cb85c"; 
                } else if (i === this.index) {
                    // Current Target Pad: Yellowish hint
                    fillStyle = "#f0ad4e"; 
                } else {
                    // Future Pads: Neutral orange
                    fillStyle = "#f57e5e"; 
                }
                const playerRect = { x: player.x, y: player.y, w: TILE, h: TILE };
                const currentPadRect = { x: p.x, y: p.y, w: TILE, h: TILE };

                if (i === this.index && rectOverlap(playerRect, currentPadRect)) {
                    fillStyle = "#ffe082"; 
                }

                ctx.fillStyle = fillStyle;
                ctx.fillRect(p.x + 6, p.y + 6, TILE - 12, TILE - 12);
                
                ctx.fillStyle = "#333";
                ctx.font = 'bold 12px Inter';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle'; 
                ctx.fillText(i + 1, p.x + TILE/2, p.y + TILE/2); 
                ctx.textBaseline = 'alphabetic';
            });
        },
        
        getState() {
            return { 
                solved: this.solved, 
                index: this.index,
                enteredCorrectPad: puzzlePadInteraction[padKey] ? puzzlePadInteraction[padKey].enteredCorrectPad : false,
                lastHitIndex: puzzlePadInteraction[padKey] ? puzzlePadInteraction[padKey].lastHitIndex : -1
            };
        },
        setState(state) {
            this.solved = !!state.solved;
            this.index = state.index !== undefined ? state.index : 0;
            if (puzzlePadInteraction[padKey]) {
                puzzlePadInteraction[padKey].enteredCorrectPad = !!state.enteredCorrectPad;
                puzzlePadInteraction[padKey].lastHitIndex = state.lastHitIndex !== undefined ? state.lastHitIndex : -1;
            }
        }
    };
}


/*******************************************************
 * Function Name: createCratePuzzle
 * Description:
 *      Creates and returns a Sokoban-style crate puzzle object that checks if crates are pushed onto their correct target
 *      ocations. Prevents the player from leaving the region until solved and supports save/load through serialization.
 * Expected Inputs:
 *      region (object) – contains arrays of crates and targets.
 * Expected Outputs/Results:
 *      Returns a puzzle object with methods for updating state, checking completion, drawing visual indicators, and saving/loading.
 * Called By:
 *      generateContent() during region initialization.
 * Will Call:
 *      rectOverlap(), playPuzzleClear().
****************************************************/
function createCratePuzzle(region) {
    return {
        solved: false,
        isSolved() {
            if (region.crates.length !== region.targets.length) return false;
            return region.crates.every(c => {
                return region.targets.some(t => rectOverlap(c, t));
            });
        },

        update() {
            if (this.solved) return;
            const nowSolved = this.isSolved();
            if (nowSolved) {
                this.solved = true;
                playPuzzleClear();
            }
        },

        blocksExit() { return !this.solved; },

        draw(ctx) {
            region.crates.forEach(c => {
                const onTarget = region.targets.some(t => rectOverlap(c, t));
                c.color = onTarget ? '#a7f3d0' : '#d1d5db';
            });
        },
        getState() {
            return { solved: this.solved };
        },
        setState(state) {
            this.solved = !!state.solved;
        }
    };
}


/*********************************************************
 * Function Name: createTeleporterPuzzle
 * Description:
 *      Builds a puzzle that requires the player to activate two or more teleporters. When all teleporters are toggled ON by the
 *      interaction key, the puzzle is marked solved. Supports game save/load via serialization.
 * Expected Inputs:
 *      teleporters (array) – list of teleporter coordinates.
 * Expected Outputs/Results:
 *      Returns a puzzle object containing update logic, drawing logic, and save/load support.
 * Called By:
 *      generateContent() while creating Region 3.
 * Will Call:
 *      rectOverlap(), playInteract(), playPuzzleClear().
*******************************************************/
function createTeleporterPuzzle(teleporters) {
    const teleporterData = teleporters.map(t => ({...t, active: false}));
    return {
        solved: false,
        teleporterData: teleporterData,

        update(player, interactionKey) {
            if (this.solved) return;
            if (interactionKey) {
                let interacted = false;
                teleporterData.forEach(t => {
                    if (rectOverlap(player, {x: t.x, y: t.y, w: TILE, h: TILE})) {
                        t.active = !t.active;
                        interacted = true;
                    }
                });
                if (interacted) playInteract();
            }

            if (teleporterData.every(t => t.active)) {
                this.solved = true;
                playPuzzleClear();
            }
        },
        blocksExit() { return !this.solved; },
        draw(ctx) {
            ctx.save();
            teleporterData.forEach(t => {
                const color = t.active ? '#34d399' : '#a78bfa';
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.arc(t.x + TILE/2, t.y + TILE/2, TILE/2 - 4, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#1f2937';
                ctx.font = 'bold 16px Inter';
                ctx.textAlign = 'center';
                ctx.fillText(t.active ? 'ON' : 'OFF', t.x + TILE/2, t.y + TILE/2 + 5);
            });
            ctx.restore();
        },
        getState() {
            return { solved: this.solved, activeStates: this.teleporterData.map(t => t.active) };
        },
        setState(state) {
            this.solved = state.solved;
            if (Array.isArray(state.activeStates)) {
                state.activeStates.forEach((a, i) => {
                    if (this.teleporterData[i]) this.teleporterData[i].active = !!a;
                });
            }
        }
    };
}

/******************************************************
 * Function Name: generateContent
 * Description:
 *      Resets and regenerates all region data, including seeds, obstacles, crates, gates, and puzzle objects. This function
 *      builds all puzzles, spawns objects, and pre-renders static background layers for the world map.
 * Expected Inputs:
 *      None.
 * Expected Outputs/Results:
 *      Populates the global "regions" array with fully initialized gameplay objects and puzzle logic.
 * Called By:
 *      initGame() at startup or on world reset.
 * Will Call:
 *      createDynamicPlatePuzzle(), createStrictSequencePuzzle(), createCratePuzzle(), createTeleporterPuzzle(),
 *      prerenderRegionBackground().
******************************************************/
function generateContent(){
    regions.forEach(r => {
        r.seeds = []; r.obstacles = []; r.crates = []; r.targets = []; r.puzzle = null;
    });

    // Region 0: Entrance Clearing 
    regions[0].seeds = [{ x: 10*TILE, y: 6*TILE, collected:false, pulse:0 }];
    regions[0].obstacles = [
        { x: 12*TILE, y: 7*TILE, w:TILE, h:TILE }, 
    ];
    regions[0].crates = [
        { x: 6*TILE, y: 6*TILE, w: TILE, h: TILE, color: '#d1d5db' } // Crate to hold plate
    ];
    regions[0].puzzle = createDynamicPlatePuzzle(regions[0], [
        { x: 4*TILE, y: 5*TILE }, // Plate 1
        { x: 8*TILE, y: 5*TILE } // Plate 2
    ]);

    // Region 1: Riverside Path 
    regions[1].seeds = [{ x: 24*TILE, y: 9*TILE, collected:false, pulse:0 }];
    regions[1].obstacles = [
        { x: 22*TILE, y:5*TILE, w:TILE*2, h:TILE },
        { x: 27*TILE, y:12*TILE, w:TILE*2, h:TILE }
    ];
    regions[1].puzzle = createStrictSequencePuzzle([
        { x: 25*TILE, y:8*TILE },
        { x: 26*TILE, y:8*TILE },
        { x: 27*TILE, y:8*TILE }
    ]);

    // Region 2: Ancient Ruins 
    regions[2].seeds = [
        { x: 8*TILE, y:4*TILE, collected:false, pulse:0 }
    ];
    regions[2].obstacles = [
        { x: 15*TILE, y:6*TILE, w:TILE*2, h:TILE*2 }, // Central rock
        { x: 20*TILE, y:3*TILE, w:TILE*3, h:TILE }, // Top wall
        { x: 20*TILE, y:14*TILE, w:TILE*3, h:TILE } // Bottom wall
    ];
    regions[2].targets = [
        { x: 6*TILE, y: 6*TILE, w: TILE, h: TILE },
        { x: 24*TILE, y: 12*TILE, w: TILE, h: TILE }
    ];
    regions[2].crates = [
        { x: 12*TILE, y: 4*TILE, w: TILE, h: TILE, color: '#d1d5db' },
        { x: 12*TILE, y: 12*TILE, w: TILE, h: TILE, color: '#d1d5db' }
    ];
    regions[2].puzzle = createCratePuzzle(regions[2]);

    // Region 3: Spirit Glade 
    regions[3].seeds = [
        { x: 12*TILE, y:8*TILE, collected:false, pulse:0 },
        { x: 18*TILE, y:10*TILE, collected:false, pulse:0 }
    ];
    regions[3].obstacles = [
        { x: 26*TILE, y:7*TILE, w:TILE*3, h:TILE },
        { x: 5*TILE, y:10*TILE, w:TILE*2, h:TILE*2 }
    ];
    regions[3].puzzle = createTeleporterPuzzle([
        { x: 22*TILE, y: 4*TILE }, // Teleporter 1 (Top Right)
        { x: 8*TILE, y: 14*TILE } // Teleporter 2 (Bottom Left)
    ]);

    // Region 4: Monument region
    regions[4].seeds = [];
    regions[4].obstacles = [{ x: 8*TILE, y:10*TILE, w:TILE*2, h:TILE*2 }];

    for (let i=0;i<=3;i++){
        const r = regions[i];
        r.gate = { x: r.cols*TILE - 8, y: 0, w: 16, h: r.rows * TILE, closed: (r.puzzle && r.puzzle.blocksExit() ) };
    }
    regions.forEach(prerenderRegionBackground);
}

/***************************************************
 * Function Name: fadeToRegion
 * Description:
 *      Crossfades between background music tracks when entering a new region. Smoothly fades out all other tracks while
 *      fading in the target region track.
 * Expected Inputs:
 *      targetIdx (number) – index of the region track to fade into. duration – fade duration.
 * Expected Outputs/Results:
 *      Smooth audio transition between region themes.
 * Called By:
 *      Region transition logic.
 * Will Call:

 *      safeSetVolume(), regionMusic[i].play(), requestAnimationFrame().
***************************************************/
function fadeToRegion(targetIdx, duration = 800) {
    if (!audioUnlocked) return;
    const startTime = performance.now();
    const fromVolumes = regionMusic.map(m => m.volume || 0);

    try {
        if (regionMusic[targetIdx].paused) regionMusic[targetIdx].play().catch(()=>{});
    } catch(e){}

    function stepFade(now){
        const t = Math.min(1, (now - startTime) / duration);
        for (let i=0;i<regionMusic.length;i++){
            if (i === targetIdx) {
                safeSetVolume(regionMusic[i], 0.35 * t);
            } else {
                safeSetVolume(regionMusic[i], fromVolumes[i] * (1 - t));
                if (t === 1) {
                    try { regionMusic[i].pause(); regionMusic[i].currentTime = 0; regionMusic[i].volume = 0; } catch(e){}
                }
            }
        }
        if (t < 1) requestAnimationFrame(stepFade);
    }
    requestAnimationFrame(stepFade);
}

/****************************************************
 * Function: updateSeeds
 * Description:
 *    Handles seed animations, collision detection, and
 *    automatic collection when the player overlaps a seed.
 *    Updates seed state, triggers SFX, UI updates, and saves
 *    the game whenever a seed is collected.
 *
 * Expected Inputs:
 *    dt (number) – delta time used for seed pulsing animation.
 *
 * Expected Outputs/Results:
 *    - Updates each seed's "pulse" animation.
 *    - Marks seeds as collected when overlapped.
 *    - Triggers flash effects and sound effects (if enabled).
 *    - Saves game data and updates the HUD seed counter.
 *
 * Called By:
 *    Main game loop.
 *
 * Will Call:
 *    - rectOverlap()
 *    - playSfx()
 *    - saveGame()
 *    - updateSeedCounter()
 ****************************************************/
function updateSeeds(dt){
    const seeds = regions[currentRegion].seeds;
    for (const s of seeds){
        s.pulse += dt * 0.006;
        if (s.collected) continue;
        if (rectOverlap(player, { x: s.x, y: s.y, w: TILE, h: TILE })) {
            s.collected = true;
            flashTimer = 18;
            if (audioUnlocked) playSfx(sfx.seed);
            saveGame();
            updateSeedCounter();
        }
    }
}

/****************************************************
 * Function: updatePuzzle
 * Description:
 *    Provides a unified handler for region-based puzzle
 *    interactions. Detects interaction key presses, forwards
 *    them to the active puzzle's update function, and keeps the
 *    region gate synced with puzzle completion state.
 *
 * Expected Inputs:
 *    dt (number) – delta time for puzzle timing (if needed).
 *
 * Expected Outputs/Results:
 *    - Detects "interaction" events (Space/Enter).
 *    - Calls puzzle.update() if available.
 *    - Updates gate.closed based on puzzle progress.
 *
 * Called By:
 *    Main game loop.
 *
 * Will Call:
 *    - p.update()
 *    - p.blocksExit()
 ****************************************************/
function updatePuzzle(dt){
    const p = regions[currentRegion].puzzle;
    if (!p) return;
    let interaction = false;
    if (keys[INTERACT_KEY] || keys['enter']) {
        if (!interactionPending) {
            interaction = true;
            interactionPending = true; 
        }
    } else {
        interactionPending = false; 
    }
    if (typeof p.update === 'function') {
        p.update(player, interaction);
    }
    if (regions[currentRegion].gate) regions[currentRegion].gate.closed = p.blocksExit();
}

/****************************************************
 * Function: updateSeedCounter
 * Description:
 *    Updates the on-screen HUD element displaying the
 *    player's total collected seeds out of the global total.
 *
 * Expected Inputs:
 *    None.
 *
 * Expected Outputs/Results:
 *    - Updates seedCounterEl.textContent with "X/Y".
 *
 * Called By:
 *    - updateSeeds()
 *    - UI refresh logic
 *    - save/load routines
 *
 * Will Call:
 *    None.
 ****************************************************/
function updateSeedCounter(){
    if (!seedCounterEl) return;
    const total = regions.reduce((sum,r) => sum + r.seeds.length, 0);
    const collected = regions.reduce((sum,r) => sum + r.seeds.filter(s => s.collected).length, 0);
    seedCounterEl.textContent = `Seeds: ${collected}/${total}`;
}

/****************************************************
 * Function: updateTimerDisplay
 * Description:
 *    Updates the HUD timer element with the current
 *    formatted playtime stored in gameTime.
 *
 * Expected Inputs:
 *    None.
 *
 * Expected Outputs/Results:
 *    - Updates timerDisplayEl.textContent.
 *
 * Called By:
 *    Main draw/update loop.
 *
 * Will Call:
 *    - formatTime()
 ****************************************************/
function updateTimerDisplay() {
    if (!timerDisplayEl) return;
    timerDisplayEl.textContent = `Time: ${formatTime(gameTime)}`;
}

/****************************************************
 * Function: canRectMoveTo
 * Description:
 *    Performs general-purpose collision detection for any
 *    rectangular entity. Ensures the rectangle does not cross
 *    region boundaries, static obstacles, or crates.
 *
 * Expected Inputs:
 *    rect (object) – rectangle with {x, y, w, h}
 *    currentRegion (object) – region to check collisions in
 *    excludeCrate (object | null) – crate to skip when moving
 *
 * Expected Outputs/Results:
 *    Returns:
 *       true  – movement allowed
 *       false – blocked by bounds, obstacles, or crates
 *
 * Called By:
 *    - crate movement logic
 *    - general collision systems
 *
 * Will Call:
 *    - rectOverlap()
 ****************************************************/
function canRectMoveTo(rect, currentRegion, excludeCrate = null) {
    const r = currentRegion;
    // Check world bounds
    if (rect.x < 0 || rect.y < 0 || rect.x + rect.w > r.cols * TILE || rect.y + rect.h > r.rows * TILE) {
        return false;
    }

    // Check static obstacles
    for (const o of r.obstacles) {
        if (rectOverlap(rect, o)) return false;
    }
    // Check other crates (if the rect is a crate itself, exclude the crate being moved)
    for (const c of r.crates) {
        if (c !== excludeCrate && rectOverlap(rect, c)) return false;
    }

    return true;
}


/****************************************************
 * Function: canPlayerMoveTo
 * Description:
 *    Validates whether the player can move to the given
 *    position. Checks world boundaries, obstacles, and dynamic
 *    gate states (blocking right exits for regions 0–3).
 *
 * Expected Inputs:
 *    nx (number) – proposed new x position
 *    ny (number) – proposed new y position
 *
 * Expected Outputs/Results:
 *    Returns:
 *       true  – movement allowed
 *       false – movement blocked
 *
 * Called By:
 *    Player movement logic.
 *
 * Will Call:
 *    - rectOverlap()
 ****************************************************/
function canPlayerMoveTo(nx, ny){
    const rect = { x: nx, y: ny, w: player.w, h: player.h };
    const r = regions[currentRegion];

    // Check static obstacles
    for (const o of r.obstacles) {
        if (rectOverlap(rect, o)) return false;
    }
    // Check current region's gate blocking right-exit
    const gate = r.gate;
    // Gate check is only relevant for regions 0-3 (which have a right-exit gate)
    if (gate && gate.closed) {
        // Check if player's new position overlaps the closed gate
        if (rectOverlap(rect, gate)) {
            return false;
        }
    }

    // World bounds check (with allowance for switching - need to check the exact bounds here)
    if (nx < -TILE || ny < -TILE || nx + player.w > r.cols * TILE + TILE || ny + player.h > r.rows * TILE + TILE) return false;
    return true;
}

/****************************************************
 * Function: movePlayer
 * Description:
 *    Handles all player movement, including collision
 *    detection, crate pushing, and resolving movement
 *    separately along horizontal and vertical axes.
 *
 * Expected Inputs:
 *    dx (number) – horizontal movement (-speed → left, +speed → right)
 *    dy (number) – vertical movement   (-speed → up,   +speed → down)
 *
 * Expected Outputs/Results:
 *    - Updates player.x and player.y.
 *    - If the player walks into a crate, attempts to push it.
 *    - Crate can only move if its destination is valid
 *      (no overlaps, inside bounds, not inside obstacles).
 *
 * Called By:
 *    Player input handler / main update loop.
 *
 * Will Call:
 *    - rectOverlap()
 *    - canRectMoveTo()
 *    - canPlayerMoveTo()
 ****************************************************/
function movePlayer(dx, dy){
    const r = regions[currentRegion];
    let newPlayerX = player.x, newPlayerY = player.y;

    // Attempt to move horizontally
    if (dx !== 0) {
        const nx = player.x + dx;
        const attemptedRect = { x: nx, y: player.y, w: player.w, h: player.h };
        let collidedCrate = r.crates.find(c => rectOverlap(attemptedRect, c));
        if (collidedCrate) {
            // Crate collision. Try to push the crate.
            const ncx = collidedCrate.x + dx;
            const ncy = collidedCrate.y;
            const nextCrateRect = { x: ncx, y: ncy, w: collidedCrate.w, h: collidedCrate.h };
            // Crate must not overlap static objects, boundaries, or other crates
            if (canRectMoveTo(nextCrateRect, r, collidedCrate)) {
                collidedCrate.x = ncx; // Push successful! Move crate
                newPlayerX = nx; 
            }
        } else if (canPlayerMoveTo(nx, player.y)) {
            // No crate collision, check for static obstacles/gates
            newPlayerX = nx;
        }
    }

    // Attempt to move vertically 
    if (dy !== 0) {
        const ny = player.y + dy;
        const attemptedRect = { x: newPlayerX, y: ny, w: player.w, h: player.h };
        let collidedCrate = r.crates.find(c => rectOverlap(attemptedRect, c));

        if (collidedCrate) {
            // Crate collision. Try to push the crate.
            const ncx = collidedCrate.x;
            const ncy = collidedCrate.y + dy;
            const nextCrateRect = { x: ncx, y: ncy, w: collidedCrate.w, h: collidedCrate.h };
            if (canRectMoveTo(nextCrateRect, r, collidedCrate)) {
                collidedCrate.y = ncy; // Push successful! Move crate
                newPlayerY = ny; 
            }
        } else if (canPlayerMoveTo(newPlayerX, ny)) {
            // No crate collision, check for static obstacles/gates
            newPlayerY = ny;
        }
    }
    player.x = newPlayerX;
    player.y = newPlayerY;
}

/****************************************************
 * Function: checkRegionSwitch
 * Description:
 *    Handles seamless region transitions when the player
 *    crosses the boundaries of the current region.
 *    Moves the player into the adjacent region if defined,
 *    clamps them to edges if not, and triggers screen fades.
 *
 * Expected Inputs:
 *    None.
 *
 * Expected Outputs/Results:
 *    - Updates currentRegion when transitions occur.
 *    - Repositions player slightly inside the new region.
 *    - Calls fadeToRegion(), saveGame(), and updateSeedCounter().
 *
 * Called By:
 *    Main update loop (after movement is applied).
 *
 * Will Call:
 *    - fadeToRegion()
 *    - saveGame()
 *    - updateSeedCounter()
 *    - clamp()
 ****************************************************/
function checkRegionSwitch(){
    const region = regions[currentRegion];
    let moved = false;

    // RIGHT edge
    if (player.x + player.w > region.cols * TILE) {
        const next = regionEdges[currentRegion][1];
        if (next != null && next !== undefined) {
            const relY = player.y / (region.rows * TILE);
            currentRegion = next;
            player.x = 2;
            player.y = clamp(Math.round(relY * regions[currentRegion].rows * TILE), 2, regions[currentRegion].rows * TILE - player.h - 2);
            moved = true;
        } else {
            player.x = region.cols * TILE - player.w;
        }
    }
 
    // LEFT edge
    if (player.x < 0) {
        const next = regionEdges[currentRegion][3];
        if (next != null && next !== undefined) {
            const relY = player.y / (region.rows * TILE);
            currentRegion = next;
            player.x = regions[currentRegion].cols * TILE - player.w - 2;
            player.y = clamp(Math.round(relY * regions[currentRegion].rows * TILE), 2, regions[currentRegion].rows * TILE - player.h - 2);
            moved = true;
        } else player.x = 0; 
    }

    // TOP edge
    if (player.y < 0) {
        const next = regionEdges[currentRegion][0];
        if (next != null && next !== undefined) {
            const relX = player.x / (region.cols * TILE);
            currentRegion = next;
            player.y = regions[currentRegion].rows * TILE - player.h - 2;
            player.x = clamp(Math.round(relX * regions[currentRegion].cols * TILE), 2, regions[currentRegion].cols * TILE - player.w - 2);
            moved = true;
        } else player.y = 0; 
    }

    // BOTTOM edge
    if (player.y + player.h > region.rows * TILE) {
        const next = regionEdges[currentRegion][2];
        if (next != null && next !== undefined) {
            const relX = player.x / (region.cols * TILE);
            currentRegion = next;
            player.y = 2;
            player.x = clamp(Math.round(relX * regions[currentRegion].cols * TILE), 2, regions[currentRegion].cols * TILE - player.w - 2);
            moved = true;
        } else player.y = region.rows * TILE - player.h; 
    }

    if (moved) {
        fadeToRegion(currentRegion, 700);
        saveGame();
        updateSeedCounter();
    }
}


/****************************************************
 * Function: drawStaticBackground
 * Description:
 *    Draws the pre-rendered background for the current
 *    region. Camera transformations are already applied
 *    in the main rendering loop.
 *
 * Expected Inputs:
 *    camX, camY (numbers) – camera offsets (not used here,
 *                           included for consistency).
 *
 * Expected Outputs/Results:
 *    - Renders the cached region background to the screen.
 *
 * Called By:
 *    Main draw routine.
 *
 * Will Call:
 *    ctx.drawImage()
 ****************************************************/
function drawStaticBackground(camX, camY){
    const offCanvas = regionBackgrounds[currentRegion];
    if (offCanvas) {
        ctx.drawImage(offCanvas, 0, 0);
    }
}

/****************************************************
 * Function: drawCrates
 * Description:
 *    Renders all crates in the current region, including
 *    drop shadows, colored bodies, and borders.
 *
 * Expected Inputs:
 *    camX, camY – camera offset values (handled externally).
 *
 * Expected Outputs/Results:
 *    - Draws each crate using the active canvas context.
 *
 * Called By:
 *    Main draw loop.
 *
 * Will Call:
 *    - ctx.fillRect()
 *    - ctx.strokeRect()
 ****************************************************/
function drawCrates(camX, camY) {
    const crates = regions[currentRegion].crates;
    ctx.save();
    crates.forEach(c => {
        // Shadow
        ctx.beginPath();
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(c.x + 4, c.y + 4, c.w, c.h);
        // Body
        ctx.fillStyle = c.color;
        ctx.fillRect(c.x, c.y, c.w, c.h);
        // Highlight/Border
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.strokeRect(c.x, c.y, c.w, c.h);
    });
    ctx.restore();
}

/****************************************************
 * Function: drawSeeds
 * Description:
 *    Draws glowing collectible seeds that become visible
 *    when the player is within reveal radius. Includes
 *    pulse animation and layered glow effects.
 *
 * Expected Inputs:
 *    camX, camY – camera coordinates (handled outside).
 *
 * Expected Outputs/Results:
 *    - Renders each uncollected seed with a pulsing glow.
 *
 * Called By:
 *    Main draw loop.
 *
 * Will Call:
 *    - ctx.arc()
 *    - ctx.createRadialGradient()
 ****************************************************/
function drawSeeds(camX, camY){
    const seeds = regions[currentRegion].seeds;
    const px = player.x + player.w/2, py = player.y + player.h/2;
    for (const s of seeds){
        if (s.collected) continue;
        const sx = s.x + TILE/2, sy = s.y + TILE/2;
        const dist = Math.hypot(sx - px, sy - py);
        if (dist <= SEED_REVEAL_RADIUS) {
            const pulse = 1 + Math.sin(s.pulse) * 0.18;
            ctx.save();
            ctx.globalAlpha = 0.95;
            ctx.fillStyle = `rgba(255,230,120,${0.25 * pulse})`;
            ctx.beginPath(); ctx.arc(sx, sy, 18 * pulse, 0, Math.PI*2); ctx.fill();
            const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 12);
            g.addColorStop(0, '#fff7b2'); g.addColorStop(0.6, '#ffd35c'); g.addColorStop(1, 'rgba(255,180,60,0)');
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, 10 * pulse, 0, Math.PI*2); ctx.fill();
            ctx.restore();
        }
    }
}

/****************************************************
 * Function: drawPlayer
 * Description:
 *    Draws the player character at its current position.
 *    Includes shadow, body with glow, and radial highlight.
 *
 * Expected Inputs:
 *    camX, camY – camera offsets (not used directly, included for consistency)
 *
 * Expected Outputs/Results:
 *    - Renders player with layered visual effects.
 *
 * Called By:
 *    Main draw loop.
 *
 * Will Call:
 *    - ctx.arc(), ctx.ellipse(), ctx.fill(), ctx.stroke()
 ****************************************************/
function drawPlayer(camX, camY){
    const cx = player.x + player.w/2, cy = player.y + player.h/2;
    // shadow
    ctx.beginPath(); ctx.fillStyle='rgba(0,0,0,0.25)';
    ctx.ellipse(cx, cy + 8, player.w*0.9, player.h*0.45, 0, 0, Math.PI*2); ctx.fill();
    // body
    ctx.save(); ctx.shadowColor = player.color; ctx.shadowBlur = 8; ctx.fillStyle = player.color;
    ctx.beginPath(); ctx.arc(cx, cy, player.w*0.6, 0, Math.PI*2); ctx.fill(); ctx.restore();
    // highlight
    const grad = ctx.createRadialGradient(cx - 4, cy - 6, 2, cx, cy, player.w*0.7);
    grad.addColorStop(0,'rgba(255,255,255,0.7)'); grad.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(cx - 3, cy - 4, player.w*0.28, 0, Math.PI*2); ctx.fill();
}

/****************************************************
 * Function: drawWaves
 * Description:
 *    Draws animated water waves for region 1.
 *    Wave movement is sinusoidal and offset by time.
 *
 * Expected Inputs:
 *    camX, camY – camera offsets
 *    now – timestamp from requestAnimationFrame
 *
 * Expected Outputs/Results:
 *    - Renders semi-transparent waves on the screen.
 *
 * Called By:
 *    Main draw loop.
 ****************************************************/
function drawWaves(camX, camY, now){
    if (currentRegion !== 1) return;
    const baseY = 9.5 * TILE;
    const waveCount = 4;
    ctx.save();
    for (let i=0;i<waveCount;i++){
        const offset = Math.sin((now * 0.002) + i) * 6;
        ctx.beginPath();
        const y = (baseY + i*10) - offset;
        ctx.moveTo(camX - 100, y);
        for (let x = camX - 100; x < camX + VIEW_W + 100; x += 16) {
            const yy = y + Math.sin((x * 0.02) + now * 0.003 + i) * 6;
            ctx.lineTo(x, yy);
        }
        ctx.lineTo(camX + VIEW_W + 100, y + 40);
        ctx.lineTo(camX - 100, y + 40);
        ctx.closePath();
        ctx.fillStyle = 'rgba(120,170,200,0.22)';
        ctx.fill();
    }
    ctx.restore();
}

/****************************************************
 * Function: drawPuzzleVisuals
 * Description:
 *    Delegates drawing of the current region's puzzle
 *    to the puzzle object if it has a draw() function.
 *
 * Expected Inputs:
 *    camX, camY – camera offsets
 *
 * Expected Outputs/Results:
 *    - Calls puzzle.draw() to render puzzle elements.
 *
 * Called By:
 *    Main draw loop.
 ****************************************************/
function drawPuzzleVisuals(camX, camY){
    const puzzle = regions[currentRegion].puzzle;
    if (!puzzle || typeof puzzle.draw !== 'function') return;
    puzzle.draw(ctx, camX, camY);
}

/****************************************************
 * Function: drawCompassHUD
 * Description:
 *    Draws the compass HUD in the corner of the screen.
 *    Points to the nearest uncollected seed.
 *
 * Expected Inputs:
 *    None (uses global cctx and compassCanvas)
 *
 * Expected Outputs/Results:
 *    - Draws outer ring and directional arrow to seed.
 *
 * Called By:
 *    Main loop.
 ****************************************************/
function drawCompassHUD(){
    if (!cctx || !compassCanvas) return;
    cctx.clearRect(0,0,compassCanvas.width, compassCanvas.height);
    const nearest = regions[currentRegion].seeds.find(s => !s.collected);
    const cx = compassCanvas.width/2, cy = compassCanvas.height/2;
    // Outer ring
    cctx.lineWidth = 4;
    cctx.strokeStyle = 'rgba(255,255,255,0.12)';
    cctx.beginPath(); cctx.arc(cx, cy, Math.min(cx,cy)-8, 0, Math.PI*2); cctx.stroke();
    if (!nearest) return;
    // Calculate angle to seed
    const dx = (nearest.x + TILE/2) - (player.x + player.w/2);
    const dy = (nearest.y + TILE/2) - (player.y + player.h/2);
    const angle = Math.atan2(dy, dx);
    // Draw indicator arrow
    cctx.save();
    cctx.translate(cx, cy);
    cctx.rotate(angle);
    cctx.strokeStyle = '#ffed75'; cctx.lineWidth = 3;
    cctx.beginPath();
    cctx.moveTo(0, -6);
    cctx.lineTo(30, 0);
    cctx.lineTo(0, 6);
    cctx.stroke();
    cctx.fillStyle = '#ffd166';
    cctx.beginPath();
    cctx.moveTo(32, 0);
    cctx.lineTo(24, -6);
    cctx.lineTo(24, 6);
    cctx.closePath();
    cctx.fill();
    cctx.restore();
}

/****************************************************
 * Function: drawFog
 * Description:
 *    Draws darkness overlay with a circular vision radius
 *    around the player. Supports dynamic lighting effect.
 *
 * Expected Inputs:
 *    camX, camY – camera offsets
 *    now – current timestamp for animation
 *
 * Expected Outputs/Results:
 *    - Darkens the screen outside of player's vision radius.
 *
 * Called By:
 *    Main draw loop.
 ****************************************************/
let fogOffset = 0;
function drawFog(camX, camY, now){
    fogOffset += (now - lastTime) * 0.00013;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0,0,VIEW_W, VIEW_H);

    const screenX = (player.x - camX) + player.w/2;
    const screenY = (player.y - camY) + player.h/2;
    const radius = VISION_RADIUS;
    const grad = ctx.createRadialGradient(screenX, screenY, radius*0.2, screenX, screenY, radius);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.95)');
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(screenX, screenY, radius, 0, Math.PI*2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
}

/****************************************************
 * Function: checkWinCondition
 * Description:
 *    Checks if all seeds are collected and the player
 *    is overlapping the monument in region 4.
 *    Triggers win menu and submits score if conditions met.
 *
 * Expected Inputs:
 *    None
 *
 * Expected Outputs/Results:
 *    - Pauses the game.
 *    - Plays win sound.
 *    - Displays win menu, hides pause menu.
 *    - Submits score to server.
 *
 * Called By:
 *    Main update loop.
 ****************************************************/
function checkWinCondition(){
    const allCollected = regions.every(r => r.seeds.every(s => s.collected));
    if (!allCollected) return;
    if (currentRegion !== 4) return;
    if (rectOverlap(player, monument)) {
        paused = true;
        if (audioUnlocked) playSfx(sfx.win);

        // Submit score 
        submitScore(player.name, gameTime);
        
        if (winMenu) winMenu.style.display = 'block';
        if (pauseMenu) pauseMenu.style.display = 'none';
    }
}

/****************************************************
 * Function: loop
 * Description:
 *    Main game loop driven by requestAnimationFrame.
 *    Handles input, movement, puzzle updates, timer,
 *    camera, drawing all elements, HUD, and fog effects.
 *
 * Expected Inputs:
 *    now – timestamp from requestAnimationFrame
 *
 * Expected Outputs/Results:
 *    - Updates player, crates, puzzles, seeds, timer.
 *    - Handles region transitions.
 *    - Draws world, player, HUD, fog, compass, timer.
 *
 * Called By:
 *    Initial game start (e.g., requestAnimationFrame(loop))
 *
 * Will Call:
 *    - movePlayer()
 *    - updateSeeds()
 *    - updatePuzzle()
 *    - checkRegionSwitch()
 *    - checkWinCondition()
 *    - drawStaticBackground(), drawWaves(), drawPuzzleVisuals(), drawCrates(), drawSeeds(), drawPlayer()
 *    - drawFog(), drawCompassHUD()
 *    - updateSeedCounter(), updateTimerDisplay()
 ****************************************************/
function loop(now){
    animationFrameId = requestAnimationFrame(loop);
    const dt = now - lastTime;
    lastTime = now;

    if (!paused){
        let dx = 0, dy = 0;
        if (keys['arrowup'] || keys['w']) dy -= player.speed;
        if (keys['arrowdown'] || keys['s']) dy += player.speed;
        if (keys['arrowleft'] || keys['a']) dx -= player.speed;
        if (keys['arrowright'] || keys['d']) dx += player.speed;
        if (dx !== 0 && dy !== 0) { dx *= 0.7071; dy *= 0.7071; }

        movePlayer(dx, dy);
        gameTime += dt;

        updateSeeds(dt);
        updatePuzzle(dt); 

        checkRegionSwitch();

        waveTime += dt * 0.002;

        checkWinCondition();
    }

    // camera
    const region = regions[currentRegion];
    const camX = clamp(Math.round(player.x - VIEW_W/2 + player.w/2), 0, Math.max(0, region.cols * TILE - VIEW_W));
    const camY = clamp(Math.round(player.y - VIEW_H/2 + player.h/2), 0, Math.max(0, region.rows * TILE - VIEW_H));

    // clear and draw world
    ctx.clearRect(0,0,VIEW_W,VIEW_H);
    ctx.save();
    ctx.translate(-camX, -camY);

    drawStaticBackground(camX, camY);
    // Animated and movable elements
    drawWaves(camX, camY, now);
    drawPuzzleVisuals(camX, camY); 
    drawCrates(camX, camY); 
    drawSeeds(camX, camY);
    drawPlayer(camX, camY);

    // Player collection flash effect
    if (flashTimer > 0){
        flashTimer--;
        ctx.fillStyle = `rgba(255,230,120,${0.5 * (flashTimer / 18)})`;
        ctx.fillRect(player.x - 8, player.y - 8, player.w + 16, player.h + 16);
    }

    ctx.restore();

    // Draw HUD elements 
    drawFog(camX, camY, now);
    drawCompassHUD();
    updateSeedCounter();
    updateTimerDisplay(); 


}

/****************************************************
 * Function: togglePause
 * Description:
 *    Toggles the game's paused state.
 *    Shows or hides the pause menu accordingly.
 *    Resets lastTime to avoid large dt spikes on resume.
 *
 * Expected Inputs:
 *    None (uses global paused and pauseMenu)
 *
 * Expected Outputs/Results:
 *    - paused state toggled
 *    - pauseMenu shown or hidden
 *
 * Called By:
 *    pauseButton click, possibly other UI triggers
 ****************************************************/
function togglePause() {
  paused = !paused;
  if (pauseMenu) pauseMenu.style.display = paused ? 'flex' : 'none';
  if (!paused) lastTime = performance.now(); // Avoid huge dt spike
}

if (pauseButton) pauseButton.addEventListener('click', togglePause);


/****************************************************
 * UI Button: Resume from pause menu
 ****************************************************/
if (resumeBtn) {
  resumeBtn.addEventListener('click', () => {
      paused = false;
      if (pauseMenu) pauseMenu.style.display = 'none';
  });
}

/****************************************************
 * UI Button: Quit to main menu
 * Description:
 *    Saves game state before quitting.
 ****************************************************/
if (quitBtn) {
  quitBtn.addEventListener('click', async () => {
      paused = true; 
      try {
          await saveGame(); 
          console.log("Game successfully saved before quitting");
      } catch (err) {
          console.error("Failed to save game before quitting:", err);
      }
      window.location.href = '/land_explorer/index.html';
  });
}

/****************************************************
 * UI Button: Restart from win menu
 * Description:
 *    Starts a fresh game state when player clicks restart.
 ****************************************************/
if (restartWin) {
  restartWin.addEventListener('click', async () => {
      paused = true;
      initGame(true); 
  });
}

/****************************************************
 * UI Button: Return to menu from win menu
 * Description:
 *    Saves the game state and returns to main menu.
 ****************************************************/
if (menuWinBtn) {
  menuWinBtn.addEventListener('click', async () => {
      paused = true;
      await saveGame(); 
      initGame(true); 
      window.location.href = '/land_explorer/index.html';
  });
}

/****************************************************
 * Function: initGame
 * Description:
 *    Initializes the game state. Can load previous
 *    save or start a new game.
 *
 * Inputs:
 *    newGame (boolean) – true to force new game
 *
 * Expected Outputs/Results:
 *    - Loads avatar/player data
 *    - Generates regions, seeds, puzzles
 *    - Loads saved game or sets new game state
 *    - Syncs gate states
 *    - Initializes UI elements and timers
 *    - Starts the main loop
 *
 * Called By:
 *    autoStart() or other game startup triggers
 ****************************************************/
async function initGame(newGame = false) {
  if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
  }

  await loadAvatarData(); 

  if (!player.name) {
      player.name = sessionStorage.getItem("lastPlayerName") || DEFAULT_PLAYER_NAME;
  }
  sessionStorage.setItem("lastPlayerName", player.name);

  generateContent();

  let loaded = false;
  if (!newGame) {
      loaded = await loadGame(); 
  }

  if (!loaded) {
      console.log("[INIT] Starting new game state setup.");
      currentRegion = 0;
      player.x = TILE * 3;
      player.y = TILE * 3;
      gameTime = 0;
      await saveGame(); 
  } else {
      console.log("[INIT] Successfully resumed game state.");
  }

  if (audioUnlocked) {
    fadeToRegion(currentRegion, 700); 
}

  // Sync gates
  for (let i = 0; i <= 3; i++) {
      if (regions[i].gate) regions[i].gate.closed = regions[i].puzzle && regions[i].puzzle.blocksExit();
  }

  // Update UI
  if (pauseMenu) pauseMenu.style.display = 'none';
  if (winMenu) winMenu.style.display = 'none';
  paused = false;
  updateSeedCounter();
  updateTimerDisplay();
  lastTime = performance.now();

  if (!animationFrameId) loop(lastTime);
}

window.initGame = initGame;

/****************************************************
 * AUTO START LOGIC
 * Description:
 *    Automatically starts or resumes the game on page load
 ****************************************************/
(function autoStart() {
const gameCanvas = document.getElementById('gameCanvas');
if (!gameCanvas) return;

const startMode = sessionStorage.getItem("startMode") || "new";

if (startMode === "resume") {
    initGame(false); 
} else {
    initGame(true); 
}
})();