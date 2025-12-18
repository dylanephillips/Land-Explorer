CREATE TABLE scores (
    score_id INT AUTO_INCREMENT PRIMARY KEY,
    player_name VARCHAR(50),
    completion_time INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
