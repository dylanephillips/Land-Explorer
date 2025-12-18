<?php
/**********************************************************************
 * File Name: submit_score.php
 * Description:
 *    Receives a player's game completion data via JSON POST request
 *    and saves the player's name and completion time into the database.
 *
 * Expected Inputs:
 *    - JSON POST data:
 *        - player_name (string): Name of the player
 *        - completion_time (int or string): Time taken to complete the game
 *
 * Expected Outputs / Results:
 *    - Inserts a new record into the "scores" table in the database
 *    - Returns a JSON response indicating success or failure
 *
 * Called By:
 *    - Game client (JavaScript) after completing the game
 *
 * Will Call:
 *    - MySQL database via PDO
 **********************************************************************/
header("Content-Type: application/json");

/* ------------------- Database Configuration ------------------- */
$dsn = 'mysql:host=localhost;dbname=land_explorer;charset=utf8';
$username = 'root';
$password = '';

try {
    $db = new PDO($dsn, $username, $password);
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch (PDOException $e) {
    die(json_encode(["status" => "error", "message" => $e->getMessage()]));
}

/* ------------------- Read JSON Input ------------------- */
$data = json_decode(file_get_contents("php://input"), true);

/* ------------------- Insert Score into Database ------------------- */
$stmt = $db->prepare("
    INSERT INTO scores (player_name, completion_time)
    VALUES (?, ?)
");
$stmt->execute([
    $data["player_name"],
    $data["completion_time"]
]);

/* ------------------- Return JSON Response ------------------- */
echo json_encode(["status" => "score saved"]);
?>