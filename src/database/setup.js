const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function setupDatabase() {
  try {
    console.log("Starting database setup...");

    // Run schema.sql
    console.log("Creating schema...");
    const schemaSQL = fs.readFileSync(
      path.join(__dirname, "schema.sql"),
      "utf8"
    );
    await pool.query(schemaSQL);
    console.log("Schema created successfully.");

    // Run functions.sql
    console.log("Creating functions...");
    const functionsSQL = fs.readFileSync(
      path.join(__dirname, "functions.sql"),
      "utf8"
    );
    await pool.query(functionsSQL);
    console.log("Functions created successfully.");

    // Run triggers.sql
    console.log("Creating triggers...");
    const triggersSQL = fs.readFileSync(
      path.join(__dirname, "triggers.sql"),
      "utf8"
    );
    await pool.query(triggersSQL);
    console.log("Triggers created successfully.");

    // Run seed.sql
    console.log("Seeding data...");
    const seedSQL = fs.readFileSync(
      path.join(__dirname, "seed.sql"),
      "utf8"
    );
    await pool.query(seedSQL);
    console.log("Seed data inserted.");

    // Hash admin password
    console.log("Updating admin password...");
    const hashedPassword = await bcrypt.hash("Admin@123", 10);
    await pool.query(
      "UPDATE users SET password = $1 WHERE email = $2",
      [hashedPassword, "admin@liveclasscode.com"]
    );
    console.log("Admin password set.");

    console.log("\nDatabase setup completed successfully!");
    console.log("Admin Login: admin@liveclasscode.com / Admin@123");

  } catch (error) {
    console.error("Database setup failed:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

setupDatabase();
