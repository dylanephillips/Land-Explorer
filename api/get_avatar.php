<?php
/**********************************************************************
 * File Name: get_avatar.php
 * Description:
 *    Retrieves the most recently saved avatar from the database
 *    for the "Land Explorer" game. Returns the avatar details
 *    as a JSON response to be used by the frontend.
 *
 * Expected Inputs:
 *    - No specific inputs required.
 *    - Simply called via GET or fetch request from frontend.
 *
 * Expected Outputs / Results:
 *    - JSON response:
 *        On success: 
 *          {
 *              "status": "success",
 *              "avatar": {
 *                  "avatar_id": int,
 *                  "name": string,
 *                  "color": string
 *              }
 *          }
 *        On error:
 *          {
 *              "status": "error",
 *              "message": "<error details>"
 *          }
 *
 * Called By:
 *    - avatar.js or any frontend script needing the current avatar
 *
 * Will Call:
 *    - Database via PDO to select the latest avatar
 **********************************************************************/

/* ------------------- Set Response Header ------------------- */
header("Content-Type: application/json");

/* ------------------- Database Configuration ------------------- */
$dsn = 'mysql:host=localhost;dbname=land_explorer;charset=utf8';
$username = 'root';
$password = '';

try {
     // Connect to database using PDO
    $db = new PDO($dsn, $username, $password);
} catch (PDOException $e) {
    echo json_encode(["status" => "error", "message" => $e->getMessage()]);
    exit;
}

/* ------------------- Retrieve Most Recent Avatar ------------------- */
$stmt = $db->query("SELECT * FROM avatars ORDER BY avatar_id DESC LIMIT 1");
$avatar = $stmt->fetch(PDO::FETCH_ASSOC);

echo json_encode([
    "status" => "success",
    "avatar" => $avatar
]);
?>