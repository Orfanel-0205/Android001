import {neon}  from "@neondatabase/serverless";

import "dotenv/config";


//creates a connection to the Neon database using the DATABASE_URL from the environment variables
export const sql = neon(process.env.DATABASE_URL)