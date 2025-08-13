import express from "express";
import dotenv from "dotenv";

dotenv.config();

const app = express();

const PORT = process.env.PORT || 5001;

app.get("/", (req, res) => {
    res.send("Hello from the server Clifford ");
});

console.log("My port", process.env.PORT);

app.listen(5001, () => {
    console.log("Server is running on PORT:", PORT);
});
