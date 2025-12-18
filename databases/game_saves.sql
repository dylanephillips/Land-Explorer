CREATE TABLE game_saves (
    save_id INT AUTO_INCREMENT PRIMARY KEY,
    player_name VARCHAR(50),
    region INT,
    pos_x INT,
    pos_y INT,
    game_time INT,
    seeds JSON,
    puzzles JSON,
    crates JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);