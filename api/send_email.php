<?php
/**********************************************************************
 * File Name: send_email.php
 * Description:
 *    Handles the submission of the customer service / feedback form.
 *    Saves the submitted form data to the database and sends an email
 *    notification to the game developer (or admin).
 *
 * Expected Inputs:
 *    - Form POST data:
 *        - name (string): Name of the user submitting the form
 *        - email (string): Email of the user
 *        - subject (string): Subject of the message
 *        - message (string): Message content
 *
 * Expected Outputs / Results:
 *    - Stores the data in the "questions" table in the database
 *    - Sends an email to the admin/developer with the form content
 *    - Redirects the user back to the index page with a "sent" query parameter
 *
 * Called By:
 *    - customer_service.html form via POST request
 *
 * Will Call:
 *    - MySQL database via PDO
 *    - PHP mail() function
**********************************************************************/

/* ------------------- Database Connection ------------------- */
$dsn = 'mysql:host=localhost;dbname=land_explorer;charset=utf8';
$username = 'root';
$password = '';

try {
    $db = new PDO($dsn, $username, $password);
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch (PDOException $e) {
    die("DB Error: " . $e->getMessage());
}


/* ------------------- Collect Form Data ------------------- */
$name = $_POST["name"] ?? "";
$email = $_POST["email"] ?? "";
$subject = $_POST["subject"] ?? "";
$message = $_POST["message"] ?? "";


/* ------------------- Save Form Data in Database ------------------- */
$stmt = $db->prepare("
    INSERT INTO questions (name, email, subject, message)
    VALUES (?, ?, ?, ?)
");
$stmt->execute([$name, $email, $subject, $message]);

/* ------------------- Send Email Notification ------------------- */
$headers = "From: $email\r\n";
$headers .= "Reply-To: $email\r\n";
$headers .= "Content-Type: text/plain; charset=utf-8\r\n";

mail(
    "dylanep@hotmail.com",          // your email
    "New Game Feedback: $subject",  // email subject
    "From: $name ($email)\n\nMessage:\n$message",
    $headers
);

/* ------------------- Redirect Back to Main Menu ------------------- */
 header("Location: ../index.html?sent=1");
 exit();
?>