CREATE TABLE questions (
    question_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100), 
    email VARCHAR(100),
    subject VARCHAR(255), 
    message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
