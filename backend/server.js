import express from "express";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import multer from "multer";
import { sql } from "./config/db.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(express.json());
app.use(express.static('uploads'));

// File upload configuration
const upload = multer({
    dest: 'uploads/',
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|pdf|doc|docx/;
        const extname = allowedTypes.test(file.originalname.toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Invalid file type'));
        }
    }
});

// JWT Authentication middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid token' });
        }
        req.user = user;
        next();
    });
};

// Database initialization
async function initDB() {
    try {
        // Users table
        await sql`CREATE TABLE IF NOT EXISTS users(
            id SERIAL PRIMARY KEY,
            email VARCHAR(255) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            first_name VARCHAR(255) NOT NULL,
            last_name VARCHAR(255) NOT NULL,
            role VARCHAR(50) NOT NULL DEFAULT 'student',
            bio TEXT,
            education TEXT,
            experience TEXT,
            phone VARCHAR(20),
            location VARCHAR(255),
            profile_image VARCHAR(255),
            is_verified BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`;

        // Skills showcase table (updated from your original)
        await sql`CREATE TABLE IF NOT EXISTS skillshowcase(
            id SERIAL PRIMARY KEY, 
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            title VARCHAR(255) NOT NULL,
            description TEXT,
            category VARCHAR(255) NOT NULL,
            skill_level VARCHAR(50) DEFAULT 'beginner',
            portfolio_url VARCHAR(500),
            file_path VARCHAR(500),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`;

        // Skill endorsements
        await sql`CREATE TABLE IF NOT EXISTS skill_endorsements(
            id SERIAL PRIMARY KEY,
            skill_id INTEGER REFERENCES skillshowcase(id) ON DELETE CASCADE,
            endorser_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            rating INTEGER CHECK (rating >= 1 AND rating <= 5),
            comment TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(skill_id, endorser_id)
        )`;

        // Courses table
        await sql`CREATE TABLE IF NOT EXISTS courses(
            id SERIAL PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            description TEXT,
            instructor_id INTEGER REFERENCES users(id),
            category VARCHAR(255) NOT NULL,
            difficulty_level VARCHAR(50) DEFAULT 'beginner',
            duration_hours INTEGER,
            price DECIMAL(10,2) DEFAULT 0,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`;

        // User course enrollments
        await sql`CREATE TABLE IF NOT EXISTS enrollments(
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
            progress_percentage INTEGER DEFAULT 0,
            completed BOOLEAN DEFAULT FALSE,
            enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            completed_at TIMESTAMP,
            UNIQUE(user_id, course_id)
        )`;

        // Job/Internship opportunities
        await sql`CREATE TABLE IF NOT EXISTS opportunities(
            id SERIAL PRIMARY KEY,
            employer_id INTEGER REFERENCES users(id),
            title VARCHAR(255) NOT NULL,
            description TEXT NOT NULL,
            type VARCHAR(50) NOT NULL, -- 'job', 'internship', 'project'
            location VARCHAR(255),
            salary_min DECIMAL(10,2),
            salary_max DECIMAL(10,2),
            required_skills TEXT[],
            experience_level VARCHAR(50),
            is_remote BOOLEAN DEFAULT FALSE,
            is_active BOOLEAN DEFAULT TRUE,
            application_deadline DATE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`;

        // Applications
        await sql`CREATE TABLE IF NOT EXISTS applications(
            id SERIAL PRIMARY KEY,
            opportunity_id INTEGER REFERENCES opportunities(id) ON DELETE CASCADE,
            applicant_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            cover_letter TEXT,
            resume_path VARCHAR(500),
            status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'reviewed', 'accepted', 'rejected'
            applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(opportunity_id, applicant_id)
        )`;

        // Mentorship relationships
        await sql`CREATE TABLE IF NOT EXISTS mentorships(
            id SERIAL PRIMARY KEY,
            mentor_id INTEGER REFERENCES users(id),
            mentee_id INTEGER REFERENCES users(id),
            status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'active', 'completed', 'cancelled'
            focus_area VARCHAR(255),
            started_at TIMESTAMP,
            ended_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(mentor_id, mentee_id)
        )`;

        // Messages
        await sql`CREATE TABLE IF NOT EXISTS messages(
            id SERIAL PRIMARY KEY,
            sender_id INTEGER REFERENCES users(id),
            recipient_id INTEGER REFERENCES users(id),
            subject VARCHAR(255),
            message TEXT NOT NULL,
            is_read BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`;

        // Notifications
        await sql`CREATE TABLE IF NOT EXISTS notifications(
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            title VARCHAR(255) NOT NULL,
            message TEXT NOT NULL,
            type VARCHAR(50) NOT NULL, -- 'application', 'message', 'endorsement', etc.
            is_read BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`;

        console.log("Database initialized successfully");
    } catch (error) {
        console.log("Error initializing database:", error);
        process.exit(1);
    }
}

// ============= USER MANAGEMENT =============

// Register new user
app.post("/api/auth/register", async (req, res) => {
    try {
        const { email, password, first_name, last_name, role = 'student' } = req.body;

        if (!email || !password || !first_name || !last_name) {
            return res.status(400).json({ error: "All fields are required" });
        }

        // Check if user already exists
        const existingUser = await sql`SELECT * FROM users WHERE email = ${email}`;
        if (existingUser.length > 0) {
            return res.status(400).json({ error: "User already exists" });
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, 10);

        // Create user
        const newUser = await sql`
            INSERT INTO users (email, password_hash, first_name, last_name, role)
            VALUES (${email}, ${passwordHash}, ${first_name}, ${last_name}, ${role})
            RETURNING id, email, first_name, last_name, role, created_at
        `;

        res.status(201).json({ user: newUser[0] });
    } catch (error) {
        console.error("Registration error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// User login
app.post("/api/auth/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: "Email and password required" });
        }

        const user = await sql`SELECT * FROM users WHERE email = ${email}`;
        if (user.length === 0) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const validPassword = await bcrypt.compare(password, user[0].password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const token = jwt.sign(
            { userId: user[0].id, email: user[0].email, role: user[0].role },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        const { password_hash, ...userWithoutPassword } = user[0];
        res.status(200).json({ token, user: userWithoutPassword });
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// Get user profile
app.get("/api/users/:userId", authenticateToken, async (req, res) => {
    try {
        const { userId } = req.params;
        
        const user = await sql`
            SELECT id, email, first_name, last_name, role, bio, education, 
                   experience, phone, location, profile_image, is_verified, created_at
            FROM users WHERE id = ${userId}
        `;

        if (user.length === 0) {
            return res.status(404).json({ error: "User not found" });
        }

        res.status(200).json(user[0]);
    } catch (error) {
        console.error("Error fetching user:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// Update user profile
app.put("/api/users/:userId", authenticateToken, async (req, res) => {
    try {
        const { userId } = req.params;
        const { bio, education, experience, phone, location } = req.body;

        // Verify user is updating their own profile or is admin
        if (req.user.userId !== parseInt(userId) && req.user.role !== 'admin') {
            return res.status(403).json({ error: "Unauthorized" });
        }

        const updatedUser = await sql`
            UPDATE users 
            SET bio = ${bio}, education = ${education}, experience = ${experience}, 
                phone = ${phone}, location = ${location}, updated_at = CURRENT_TIMESTAMP
            WHERE id = ${userId}
            RETURNING id, email, first_name, last_name, role, bio, education, 
                     experience, phone, location, profile_image, is_verified
        `;

        res.status(200).json(updatedUser[0]);
    } catch (error) {
        console.error("Error updating user:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// ============= SKILL SHOWCASE =============

// Get user skills (fixed your original endpoint)
app.get("/api/skillshowcase/:userId", async (req, res) => {
    try {
        const { userId } = req.params;

        if (!userId) {
            return res.status(400).json({ error: "User ID is required" });
        }

        const skills = await sql`
            SELECT s.*, 
                   COALESCE(AVG(e.rating), 0) as avg_rating,
                   COUNT(e.id) as endorsement_count
            FROM skillshowcase s
            LEFT JOIN skill_endorsements e ON s.id = e.skill_id
            WHERE s.user_id = ${userId}
            GROUP BY s.id
            ORDER BY s.created_at DESC
        `;

        res.status(200).json(skills);
    } catch (error) {
        console.error("Error fetching skills:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// Create new skill showcase
app.post("/api/skillshowcase", authenticateToken, upload.single('portfolio_file'), async (req, res) => {
    try {
        const { title, description, category, skill_level, portfolio_url } = req.body;
        const user_id = req.user.userId;

        if (!title || !category) {
            return res.status(400).json({ error: "Title and category are required" });
        }

        const file_path = req.file ? req.file.path : null;

        const newSkill = await sql`
            INSERT INTO skillshowcase (user_id, title, description, category, skill_level, portfolio_url, file_path)
            VALUES (${user_id}, ${title}, ${description}, ${category}, ${skill_level}, ${portfolio_url}, ${file_path})
            RETURNING *
        `;

        res.status(201).json(newSkill[0]);
    } catch (error) {
        console.error("Error creating skill:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// Delete skill
app.delete("/api/skillshowcase/:id", authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.userId;

        if (isNaN(parseInt(id))) {
            return res.status(400).json({ error: "Invalid ID" });
        }

        const result = await sql`
            DELETE FROM skillshowcase 
            WHERE id = ${id} AND user_id = ${userId}
            RETURNING *
        `;

        if (result.length === 0) {
            return res.status(404).json({ error: "Skill not found or unauthorized" });
        }

        res.status(200).json({ message: "Skill deleted successfully" });
    } catch (error) {
        console.error("Error deleting skill:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// Endorse a skill
app.post("/api/skillshowcase/:skillId/endorse", authenticateToken, async (req, res) => {
    try {
        const { skillId } = req.params;
        const { rating, comment } = req.body;
        const endorser_id = req.user.userId;

        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({ error: "Rating must be between 1 and 5" });
        }

        const endorsement = await sql`
            INSERT INTO skill_endorsements (skill_id, endorser_id, rating, comment)
            VALUES (${skillId}, ${endorser_id}, ${rating}, ${comment})
            RETURNING *
        `;

        res.status(201).json(endorsement[0]);
    } catch (error) {
        if (error.code === '23505') { // Unique constraint violation
            return res.status(400).json({ error: "You have already endorsed this skill" });
        }
        console.error("Error creating endorsement:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// ============= COURSES & LEARNING =============

// Get all courses
app.get("/api/courses", async (req, res) => {
    try {
        const { category, difficulty, search } = req.query;
        let query = sql`
            SELECT c.*, 
                   u.first_name || ' ' || u.last_name as instructor_name,
                   COUNT(e.id) as enrollment_count
            FROM courses c
            LEFT JOIN users u ON c.instructor_id = u.id
            LEFT JOIN enrollments e ON c.id = e.course_id
            WHERE c.is_active = TRUE
        `;

        if (category) {
            query = sql`${query} AND c.category = ${category}`;
        }
        if (difficulty) {
            query = sql`${query} AND c.difficulty_level = ${difficulty}`;
        }
        if (search) {
            query = sql`${query} AND (c.title ILIKE ${'%' + search + '%'} OR c.description ILIKE ${'%' + search + '%'})`;
        }

        query = sql`${query} GROUP BY c.id, u.first_name, u.last_name ORDER BY c.created_at DESC`;
        
        const courses = await query;
        res.status(200).json(courses);
    } catch (error) {
        console.error("Error fetching courses:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// Enroll in a course
app.post("/api/courses/:courseId/enroll", authenticateToken, async (req, res) => {
    try {
        const { courseId } = req.params;
        const user_id = req.user.userId;

        const enrollment = await sql`
            INSERT INTO enrollments (user_id, course_id)
            VALUES (${user_id}, ${courseId})
            RETURNING *
        `;

        res.status(201).json(enrollment[0]);
    } catch (error) {
        if (error.code === '23505') {
            return res.status(400).json({ error: "Already enrolled in this course" });
        }
        console.error("Error enrolling in course:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// Get user's enrollments
app.get("/api/users/:userId/enrollments", authenticateToken, async (req, res) => {
    try {
        const { userId } = req.params;

        const enrollments = await sql`
            SELECT e.*, c.title, c.description, c.category, c.difficulty_level
            FROM enrollments e
            JOIN courses c ON e.course_id = c.id
            WHERE e.user_id = ${userId}
            ORDER BY e.enrolled_at DESC
        `;

        res.status(200).json(enrollments);
    } catch (error) {
        console.error("Error fetching enrollments:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// ============= OPPORTUNITIES =============

// Get all opportunities
app.get("/api/opportunities", async (req, res) => {
    try {
        const { type, location, remote, search } = req.query;
        let query = sql`
            SELECT o.*, 
                   u.first_name || ' ' || u.last_name as employer_name,
                   COUNT(a.id) as application_count
            FROM opportunities o
            LEFT JOIN users u ON o.employer_id = u.id
            LEFT JOIN applications a ON o.id = a.opportunity_id
            WHERE o.is_active = TRUE
        `;

        if (type) {
            query = sql`${query} AND o.type = ${type}`;
        }
        if (location) {
            query = sql`${query} AND o.location ILIKE ${'%' + location + '%'}`;
        }
        if (remote === 'true') {
            query = sql`${query} AND o.is_remote = TRUE`;
        }
        if (search) {
            query = sql`${query} AND (o.title ILIKE ${'%' + search + '%'} OR o.description ILIKE ${'%' + search + '%'})`;
        }

        query = sql`${query} GROUP BY o.id, u.first_name, u.last_name ORDER BY o.created_at DESC`;
        
        const opportunities = await query;
        res.status(200).json(opportunities);
    } catch (error) {
        console.error("Error fetching opportunities:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// Create new opportunity (employers only)
app.post("/api/opportunities", authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'employer' && req.user.role !== 'admin') {
            return res.status(403).json({ error: "Only employers can create opportunities" });
        }

        const { 
            title, description, type, location, salary_min, salary_max,
            required_skills, experience_level, is_remote, application_deadline 
        } = req.body;

        if (!title || !description || !type) {
            return res.status(400).json({ error: "Title, description, and type are required" });
        }

        const opportunity = await sql`
            INSERT INTO opportunities (
                employer_id, title, description, type, location, salary_min, 
                salary_max, required_skills, experience_level, is_remote, application_deadline
            )
            VALUES (
                ${req.user.userId}, ${title}, ${description}, ${type}, ${location}, 
                ${salary_min}, ${salary_max}, ${required_skills}, ${experience_level}, 
                ${is_remote}, ${application_deadline}
            )
            RETURNING *
        `;

        res.status(201).json(opportunity[0]);
    } catch (error) {
        console.error("Error creating opportunity:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// Apply to opportunity
app.post("/api/opportunities/:opportunityId/apply", authenticateToken, upload.single('resume'), async (req, res) => {
    try {
        const { opportunityId } = req.params;
        const { cover_letter } = req.body;
        const applicant_id = req.user.userId;

        if (req.user.role !== 'student') {
            return res.status(403).json({ error: "Only students can apply to opportunities" });
        }

        const resume_path = req.file ? req.file.path : null;

        const application = await sql`
            INSERT INTO applications (opportunity_id, applicant_id, cover_letter, resume_path)
            VALUES (${opportunityId}, ${applicant_id}, ${cover_letter}, ${resume_path})
            RETURNING *
        `;

        res.status(201).json(application[0]);
    } catch (error) {
        if (error.code === '23505') {
            return res.status(400).json({ error: "You have already applied to this opportunity" });
        }
        console.error("Error applying to opportunity:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// ============= MENTORSHIP =============

// Request mentorship
app.post("/api/mentorship/request", authenticateToken, async (req, res) => {
    try {
        const { mentor_id, focus_area } = req.body;
        const mentee_id = req.user.userId;

        if (req.user.role !== 'student') {
            return res.status(403).json({ error: "Only students can request mentorship" });
        }

        const mentorship = await sql`
            INSERT INTO mentorships (mentor_id, mentee_id, focus_area)
            VALUES (${mentor_id}, ${mentee_id}, ${focus_area})
            RETURNING *
        `;

        res.status(201).json(mentorship[0]);
    } catch (error) {
        if (error.code === '23505') {
            return res.status(400).json({ error: "Mentorship request already exists" });
        }
        console.error("Error creating mentorship request:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// Get mentorship relationships
app.get("/api/mentorships/:userId", authenticateToken, async (req, res) => {
    try {
        const { userId } = req.params;

        const mentorships = await sql`
            SELECT m.*, 
                   mentor.first_name || ' ' || mentor.last_name as mentor_name,
                   mentee.first_name || ' ' || mentee.last_name as mentee_name
            FROM mentorships m
            JOIN users mentor ON m.mentor_id = mentor.id
            JOIN users mentee ON m.mentee_id = mentee.id
            WHERE m.mentor_id = ${userId} OR m.mentee_id = ${userId}
            ORDER BY m.created_at DESC
        `;

        res.status(200).json(mentorships);
    } catch (error) {
        console.error("Error fetching mentorships:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// ============= COMMUNICATION =============

// Send message
app.post("/api/messages", authenticateToken, async (req, res) => {
    try {
        const { recipient_id, subject, message } = req.body;
        const sender_id = req.user.userId;

        if (!recipient_id || !message) {
            return res.status(400).json({ error: "Recipient and message are required" });
        }

        const newMessage = await sql`
            INSERT INTO messages (sender_id, recipient_id, subject, message)
            VALUES (${sender_id}, ${recipient_id}, ${subject}, ${message})
            RETURNING *
        `;

        // Create notification for recipient
        await sql`
            INSERT INTO notifications (user_id, title, message, type)
            VALUES (${recipient_id}, 'New Message', ${'You have a new message from ' + req.user.email}, 'message')
        `;

        res.status(201).json(newMessage[0]);
    } catch (error) {
        console.error("Error sending message:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// Get user messages
app.get("/api/messages/:userId", authenticateToken, async (req, res) => {
    try {
        const { userId } = req.params;

        if (req.user.userId !== parseInt(userId)) {
            return res.status(403).json({ error: "Unauthorized" });
        }

        const messages = await sql`
            SELECT m.*, 
                   sender.first_name || ' ' || sender.last_name as sender_name,
                   sender.email as sender_email
            FROM messages m
            JOIN users sender ON m.sender_id = sender.id
            WHERE m.recipient_id = ${userId}
            ORDER BY m.created_at DESC
        `;

        res.status(200).json(messages);
    } catch (error) {
        console.error("Error fetching messages:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// #########NOTIFICATIONS##########

// Get user notifications
app.get("/api/notifications/:userId", authenticateToken, async (req, res) => {
    try {
        const { userId } = req.params;

        if (req.user.userId !== parseInt(userId)) {
            return res.status(403).json({ error: "Unauthorized" });
        }

        const notifications = await sql`
            SELECT * FROM notifications 
            WHERE user_id = ${userId}
            ORDER BY created_at DESC
            LIMIT 50
        `;

        res.status(200).json(notifications);
    } catch (error) {
        console.error("Error fetching notifications:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// Mark notification as read
app.put("/api/notifications/:notificationId/read", authenticateToken, async (req, res) => {
    try {
        const { notificationId } = req.params;

        await sql`
            UPDATE notifications 
            SET is_read = TRUE 
            WHERE id = ${notificationId} AND user_id = ${req.user.userId}
        `;

        res.status(200).json({ message: "Notification marked as read" });
    } catch (error) {
        console.error("Error updating notification:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// ============= ANALYTICS & DASHBOARD =============

// Get user dashboard data
app.get("/api/dashboard/:userId", authenticateToken, async (req, res) => {
    try {
        const { userId } = req.params;

        if (req.user.userId !== parseInt(userId) && req.user.role !== 'admin') {
            return res.status(403).json({ error: "Unauthorized" });
        }

        // Get skills count and average rating
        const skillsStats = await sql`
            SELECT 
                COUNT(s.id) as skills_count,
                COALESCE(AVG(e.rating), 0) as avg_rating
            FROM skillshowcase s
            LEFT JOIN skill_endorsements e ON s.id = e.skill_id
            WHERE s.user_id = ${userId}
        `;

        // Get enrollment stats
        const enrollmentStats = await sql`
            SELECT 
                COUNT(*) as total_enrollments,
                COUNT(CASE WHEN completed = TRUE THEN 1 END) as completed_courses,
                COALESCE(AVG(progress_percentage), 0) as avg_progress
            FROM enrollments
            WHERE user_id = ${userId}
        `;

        // Get application stats (for students)
        const applicationStats = await sql`
            SELECT 
                COUNT(*) as total_applications,
                COUNT(CASE WHEN status = 'accepted' THEN 1 END) as accepted_applications
            FROM applications
            WHERE applicant_id = ${userId}
        `;

        res.status(200).json({
            skills: skillsStats[0],
            enrollments: enrollmentStats[0],
            applications: applicationStats[0]
        });
    } catch (error) {
        console.error("Error fetching dashboard data:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// Get skill categories summary
app.get("/api/analytics/skills/categories", async (req, res) => {
    try {
        const categoryStats = await sql`
            SELECT 
                category,
                COUNT(*) as skill_count,
                COALESCE(AVG(e.rating), 0) as avg_rating
            FROM skillshowcase s
            LEFT JOIN skill_endorsements e ON s.id = e.skill_id
            GROUP BY category
            ORDER BY skill_count DESC
        `;

        res.status(200).json(categoryStats);
    } catch (error) {
        console.error("Error fetching category stats:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});


app.get("/api/admin/users", authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: "Admin access required" });
        }

        const users = await sql`
            SELECT id, email, first_name, last_name, role, is_verified, created_at
            FROM users
            ORDER BY created_at DESC
        `;

        res.status(200).json(users);
    } catch (error) {
        console.error("Error fetching users:", error);
                res.status(500).json({ error: "Internal server error" });
            }
        });