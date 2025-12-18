/************************************************************
 * Program Name: menu.js
 * Description: Handles the main menu of the game, including
 *              starting a new game, resuming a saved game,
 *              opening the avatar editor, accessing the
 *              tutorial, and playing menu music. This version
 *              interacts with the server to check for existing
 *              saves. 
 ************************************************************/

/************************************************************
 * Global DOM Elements
 * These variables store references to key buttons and audio
 * elements in the main menu HTML. Used to bind event
 * listeners and control menu behaviors.
 ************************************************************/
const resumeBtn = document.getElementById('resumeBtn');
const startBtn = document.getElementById('startBtn');
const avatarBtn = document.getElementById('avatarBtn');
const tutorialBtn = document.getElementById('tutorialBtn');
const menuMusic = document.getElementById('menuMusic');

/************************************************************
 * Function: stopMenuMusic
 * Description: Stops and resets the menu music playback.
 *              Useful when transitioning from the menu to the
 *              game or other screens.
 * Inputs: None
 * Outputs: None
 * Called By: Various event listeners (start, resume, avatar, tutorial)
 ************************************************************/
function stopMenuMusic() {
    if (menuMusic) {
        try {
            menuMusic.pause();
            menuMusic.currentTime = 0;
        } catch (e) {
            console.warn("Could not stop menu music:", e);
        }
    }
}
/************************************************************
 * Function: checkServerSave
 * Description: Checks the server for an existing saved game
 *              for the last known player. If a save exists,
 *              enables the "Resume" button.
 * Inputs: None
 * Outputs: Updates resumeBtn.disabled based on save existence
 * Called By: Automatically on script load
 ************************************************************/
async function checkServerSave() {
    // Get the last known player name 
    const lastPlayerName = sessionStorage.getItem("lastPlayerName");

    if (!lastPlayerName) {
        resumeBtn.disabled = true;
        console.log("No known player name for server check.");
        return;
    }

    try {
        // Call load.php, passing the player name to check if a save exists 
        const response = await fetch(`api/load.php?player_name=${encodeURIComponent(lastPlayerName)}`);
        const data = await response.json();

        // Check if data is null or has an error
        if (!data || !data.save_id) {
            resumeBtn.disabled = true;
            console.log(`No server save found for player: ${lastPlayerName}`);
            return;
        }

        // Save exists — enable resume
        resumeBtn.disabled = false;
        console.log(`Existing save found for: ${data.player_name}`);

    } catch (error) {
        console.error("Error checking save:", error);
        resumeBtn.disabled = true;
    }
}

checkServerSave();

/************************************************************
 * Event Listeners for Menu Buttons
 * These listeners handle user interactions with the menu.
 ************************************************************/

// Start new game
startBtn.addEventListener('click', () => {
    stopMenuMusic();

    sessionStorage.setItem("startMode", "new");

    window.location.href = 'game.html';
});

// Resume game
resumeBtn.addEventListener('click', () => {
    stopMenuMusic();

    sessionStorage.setItem("startMode", "resume");

    window.location.href = 'game.html';
});

// Avatar editor
avatarBtn.addEventListener('click', () => {
    stopMenuMusic();
    window.location.href = 'avatar.html';
});

// Tutorial
tutorialBtn.addEventListener('click', () => {
    stopMenuMusic();
    window.location.href = 'tutorial.html';
});

/************************************************************
 * Event Listener: Play Menu Music
 * Description: Plays menu background music after the first
 *              user click, due to browser autoplay policies.
 ************************************************************/
window.addEventListener("click", () => {
    if (menuMusic && menuMusic.paused) {
        menuMusic.volume = 0.35;
        menuMusic.play().catch(e => {
            console.log("Music playback blocked:", e);
        });
    }
}, { once: true });