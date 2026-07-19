-- Runs once on first container start (empty volume). Creates the database
-- used by integration tests so they never touch familytree_dev data.
CREATE DATABASE familytree_test OWNER familytree;
