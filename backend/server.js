import express from "express";
import dotenv from "dotenv";
import { sql } from "./config/db.js";

dotenv.config();

const app = express();


// app.use(express.json());
// app.use((req, res, next) => {
//     console.log("This is okay", req.method)
//     next();
// });

const PORT = process.env.PORT || 5001;

async function initDB() {
    try {
        await sql`CREATE TABLE IF NOT EXISTS skillshowcase(
            id SERIAL PRIMARY KEY, 
            user_id VARCHAR(255) NOT NULL,
            title VARCHAR(255) NOT NULL,
            amount DECIMAL(10, 2) NOT NULL,
            category VARCHAR(255) NOT NULL,
            created_at DATE NOT NULL DEFAULT CURRENT_DATE
        )`;

        console.log("Database initialized successfully");
    } catch (error) {
        console.log("Error initializing database:", error);
        process.exit(1);
    }
}
//MIDDLEWAREv
 app.use(express.json());

 app.get("/api/skillshowcase/:userId", async (req, res) => {
    try {

        const {userId} = req.params;
       const skillshowcase =await sql`
       SELECT * FROM skillshowcase WHERE user_id = ${userId} ORDER BY created_at DESC
       `
       res.status(200).json(skillshowcase);

        if (!userId) {
            return res.status(400).json({ error: "User ID is required" });
        }

        // Fetch all skills belonging to this user
        const skills = await sql`
            SELECT * FROM skillshowcase WHERE user_id = ${userId}
        `;

        if (skills.length === 0) {
            return res.status(404).json({ message: "No skills found for this user" });
        }

        res.status(200).json(skills);
    } catch (error) {
        console.error("Error fetching skills:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});


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
        console.log("skillshowcase");


        res.status(201).json(skills[0]);
    } catch (error) {
        console.error("Error in recording your skills", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

app.delete("/api/skillshowcase/:id", async (req, res) => {
    try {
        const {id} =req.params;

        const result = await sql`
        DELETE FROM skillshowcase WHERE id = ${id} RETURNING *
        `; 

        if(result.length === 0){
            return res.status(404).json({message: "Skill not found"});
        }

        res.status(200).json({message: "Skill deleted successfully"});
    }catch (error) {
        console.error("Error deleting skill:", error);
        res.status(500).json({ message: "Internal server error" });
    }

});




initDB().then(() => {
    app.listen(PORT, () => {
        console.log("Server is running on PORT:" ,PORT);
    });
});
