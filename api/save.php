<?php
/**********************************************************************
 * File Name: save.php
 * Description:
 *    Saves the current game state for a player in the "Land Explorer" game.
 *    Receives game data via JSON in the request body and inserts it into
 *    the "game_saves" table in the database.
 *
 * Expected Inputs:
 *    JSON object in the request body with the following keys:
 *      - player_name (string)
 *      - region (int)
 *      - pos_x (int)
 *      - pos_y (int)
 *      - game_time (int)
 *      - seeds (array)
 *      - puzzles (array)
 *      - crates (array)
 *
 * Expected Outputs / Results:
 *    - On success: Returns JSON object {"status": "success"}
 *    - On error (DB connection or insert failure): Returns JSON object
 *      with "status": "error", "message", and optionally "details".
 *
 * Called By:
 *    - game.js or frontend scripts when saving player progress.
 *
 * Will Call:
 *    - Database via PDO to insert a new save record.
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

/* ------------------- Read Raw JSON Body ------------------- */
$raw = file_get_contents("php://input");
$data = json_decode($raw, true);

/* ------------------- Validation Check ------------------- */
if (!$data) {
    echo json_encode([
        "status" => "error",
        "message" => "Invalid JSON received"
    ]);
    exit;
}


/* ------------------- Prepare SQL Insert ------------------- */
$stmt = $db->prepare("
    INSERT INTO game_saves (player_name, region, pos_x, pos_y, game_time, seeds, puzzles, crates)
    VALUES (:player_name, :region, :pos_x, :pos_y, :game_time, :seeds, :puzzles, :crates)
");

/* ------------------- Execute Insert ------------------- */
try {
    $stmt->execute([
        ":player_name" => $data["player_name"],
        ":region"      => $data["region"],
        ":pos_x"       => $data["pos_x"],
        ":pos_y"       => $data["pos_y"],
        ":game_time"   => $data["game_time"],
        ":seeds"       => json_encode($data["seeds"]),
        ":puzzles"     => json_encode($data["puzzles"]),
        ":crates"      => json_encode($data["crates"])
    ]);

    echo json_encode(["status" => "success"]);

} catch (PDOException $e) {
    echo json_encode([
        "status" => "error",
        "message" => "Database insert failed",
        "details" => $e->getMessage()
    ]);
}
?>