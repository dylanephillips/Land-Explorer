<?php
/**********************************************************************
 * File Name: avatar_save.php
 * Description:
 *    Handles saving a new avatar to the database for the "Land Explorer" game.
 *    Receives avatar data via JSON from JavaScript, inserts into the database,
 *    and returns a JSON response indicating success or failure.
 *
 * Expected Inputs:
 *    - JSON object via POST containing:
 *        {
 *          "name": string (avatar name),
 *          "color": string (hex color code)
 *        }
 *    - If missing, defaults used: name = "Explorer", color = "#000000"
 *
 * Expected Outputs / Results:
 *    - JSON response:
 *        On success: {"status": "success"}
 *        On error: {"status": "error", "message": "<error details>"}
 *
 * Called By:
 *    - avatar.js (frontend) when user saves a new avatar
 *
 * Will Call:
 *    - Database via PDO to insert a new avatar
 **********************************************************************/


/* ------------------- Database Configuration ------------------- */
$dsn = 'mysql:host=localhost;dbname=land_explorer;charset=utf8';
$username = 'root';
$password = '';

try {
    // Connect to database using PDO
    $db = new PDO($dsn, $username, $password);
    // Set error mode to exception for better error handling
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} 
catch (PDOException $e) {
    echo json_encode(["status" => "error", "message" => $e->getMessage()]);
    exit;
}

/* ------------------- Read Input Data ------------------- */
$data = json_decode(file_get_contents("php://input"), true);

// Extract avatar name and color from input, with defaults
$name = $data["name"] ?? "Explorer";
$color = $data["color"] ?? "#000000";

// Insert the avatar
$stmt = $db->prepare("INSERT INTO avatars (name, color) VALUES (?, ?)");
$stmt->execute([$name, $color]);

echo json_encode(["status" => "success"]);
?>