<?php
/**********************************************************************
 * File Name: load.php
 * Description:
 *    Loads the most recent saved game state for a given player
 *    from the "Land Explorer" game's database and returns it as JSON.
 *
 * Expected Inputs:
 *    - GET parameter: player_name (string)
 *      Example: load.php?player_name=Lyra
 *
 * Expected Outputs / Results:
 *    - On success (save exists):
 *        Returns the most recent save as a JSON object containing fields
 *        like save_id, player_name, region, pos_x, pos_y, game_time, seeds, puzzles, crates, created_at.
 *    - On success (no save found or invalid player name):
 *        Returns JSON null.
 *    - On error:
 *        Returns JSON object with status="error", message, and details.
 *
 * Called By:
 *    - game.js or any frontend script needing to load a player's save.
 *
 * Will Call:
 *    - Database via PDO to retrieve the latest save for the given player.
 **********************************************************************/

/* ------------------- Set Response Header ------------------- */
header("Content-Type: application/json");

/* ------------------- Database Configuration ------------------- */
$dsn = 'mysql:host=localhost;dbname=land_explorer;charset=utf8';
$username = 'root';
$password = '';

try {
    $db = new PDO($dsn, $username, $password);
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch (PDOException $e) {
    echo json_encode([
        "status" => "error",
        "message" => "Database connection failed",
        "details" => $e->getMessage()
    ]);
    exit;
}

/* ------------------- Retrieve Player Name ------------------- */
$playerName = isset($_GET['player_name']) ? $_GET['player_name'] : null;

// If player name is missing, return null save state immediately
if (!$playerName || $playerName === 'null' || $playerName === 'undefined') {
    echo json_encode(null);
    exit;
}

// --- Fetch latest save for this player ---
$stmt = $db->prepare("SELECT * FROM game_saves WHERE player_name = :player_name ORDER BY save_id DESC LIMIT 1");
$stmt->execute([":player_name" => $playerName]);
$save = $stmt->fetch(PDO::FETCH_ASSOC);

// --- If no save exists ---
if (!$save) {
    echo json_encode(null);
    exit;
}

echo json_encode($save);
?>