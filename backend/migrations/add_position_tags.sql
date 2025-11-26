-- Migration: Add Position Tagging System
-- Date: 2025-11-26
-- Description: Creates tables for position tags and tag assignments

-- Create position_tags table
CREATE TABLE IF NOT EXISTS position_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#1976d2',
    user_id INTEGER NOT NULL,
    CONSTRAINT unique_user_tag UNIQUE (user_id, name),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create position_tag_assignment table
CREATE TABLE IF NOT EXISTS position_tag_assignment (
    position_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (position_id, tag_id),
    FOREIGN KEY (position_id) REFERENCES trading_positions(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES position_tags(id) ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_position_tags_user ON position_tags(user_id);
CREATE INDEX IF NOT EXISTS idx_assignment_position ON position_tag_assignment(position_id);
CREATE INDEX IF NOT EXISTS idx_assignment_tag ON position_tag_assignment(tag_id);
