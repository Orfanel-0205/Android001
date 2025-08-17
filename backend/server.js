import express from "express";
import dotenv from "dotenv";
import { sql } from "./config/db.js";

dotenv.config();

const app = express();


app.use(express.json());
app.use((req, res, next) => {
    console.log("This is okay", req.method)
    next();
});

const PORT = process.env.PORT || 5001;

async function initDB() {
    try {
        await sql`CREATE TABLE IF NOT EXISTS skillshowcase(
            id SERIAL PRIMARY KEY, 
            user_id VARCHAR(255) NOT NULL,
            title VARCHAR(255) NOT NULL,
            amount DECIMAL(10, 2) NOT NULL,
            category VARCHAR(255) NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )`;

        console.log("Database initialized successfully");
    } catch (error) {
        console.log("Error initializing database:", error);
        process.exit(1);
    }
}

//POST route to insert new data
app.post("/api/skillshowcase", async (req, res) => {
    try {
        const { title, amount, category, user_id } = req.body;

        if (!title ||  amount === undefined || !category || !user_id) {
            return res.status(400).json({ error: "All fields are required" });
        }

        const skills = await sql`
            INSERT INTO skillshowcase (title, amount, category, user_id)
            VALUES (${title}, ${amount}, ${category}, ${user_id})
            RETURNING *
        `;
        console.log("Skills added:", skills);


        res.status(201).json(skills[0]);
    } catch (error) {
        console.error("Error in recording your skills", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// Test route
app.get("/", (req, res) => {
    res.send("Hello from the server Clifford");
});

console.log("My port:", process.env.PORT);

initDB().then(() => {
    app.listen(PORT, () => {
        console.log(`Server is running on PORT: ${PORT}`);
    });
});
