/************************************************************
 * Program Name: avatar.js
 * Description:
 *    Handles the player avatar editor interface. Allows the
 *    player to set their name and color, save the avatar to
 *    the server, or cancel and return to the main menu.
 ************************************************************/
/****************************************************
 * Utility Function: alertPlaceholder
 * Description:
 *    Displays a custom alert panel in the center of the page.
 *    Removes any existing alert before creating a new one.
 *
 * Inputs:
 *    title   - string, title of the alert
 *    message - string, body message of the alert
 *
 * Outputs:
 *    Dynamically appends a div to the body with the alert contents.
 *    User can dismiss it by clicking "OK".
 ****************************************************/
function alertPlaceholder(title, message) {
  const existingAlert = document.getElementById('simple-alert');
  if (existingAlert) existingAlert.remove();

  const alertDiv = document.createElement('div');
  alertDiv.id = 'simple-alert';
  alertDiv.className = 'avatarPanel';
  alertDiv.style.zIndex = 1000;
  alertDiv.innerHTML = `
    <h2 style="font-size: 1.5rem; color: #1a4731;">${title}</h2>
    <p style="margin-bottom: 20px;">${message}</p>
    <button onclick="document.getElementById('simple-alert').remove()">OK</button>
  `;
  document.body.appendChild(alertDiv);
}

/****************************************************
 * Event Listener: Save Avatar
 * Description:
 *    Captures player avatar details (name and color)
 *    and submits them to the server via a POST request.
 *
 * Behavior:
 *    - Trims and defaults name to "Explorer"
 *    - Defaults color if none selected
 *    - Sends JSON payload to "api/avatar_save.php"
 *    - Displays success or error alert
 *    - Redirects to index.html after successful save
 ****************************************************/
document.getElementById("saveAvatar").addEventListener("click", async () => {
  const name = document.getElementById("playerName").value.trim() || "Explorer";
  const color = document.getElementById("playerColor").value || "#3b82f6";

  const avatar = { name, color };

  try {
    const response = await fetch("api/avatar_save.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(avatar)
    });

    const result = await response.json();

    if (result.status === "success") {
      alertPlaceholder("Success!", "Your avatar has been saved! Returning to menu...");

      setTimeout(() => {
        window.location.href = "index.html";
      }, 1500);
    } 
    else {
      alertPlaceholder("Error", "Avatar could not be saved.");
    }
  } catch (error) {
    alertPlaceholder("Error", "Could not connect to server.");
  }
});

/****************************************************
 * Event Listener: Cancel Avatar
 * Description:
 *    Redirects the user back to the main menu without
 *    saving any changes.
 ****************************************************/
document.getElementById("cancelAvatar").addEventListener("click", () => {
  window.location.href = "index.html";
});