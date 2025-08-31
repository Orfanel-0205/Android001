export const courseController = {
    // Create course (instructors/admins only)
    async createCourse(req, res) {
        try {
            if (req.user.role !== 'instructor' && req.user.role !== 'admin') {
                return res.status(403).json({ error: "Only instructors can create courses" });
            }

            const { 
                title, description, category, difficulty_level, 
                duration_hours, price = 0 
            } = req.body;

            if (!title || !description || !category) {
                return res.status(400).json({ error: "Title, description, and category are required" });
            }

            const course = await sql`
                INSERT INTO courses (
                    instructor_id, title, description, category, 
                    difficulty_level, duration_hours, price
                )
                VALUES (
                    ${req.user.userId}, ${title}, ${description}, ${category},
                    ${difficulty_level}, ${duration_hours}, ${price}
                )
                RETURNING *
            `;

            res.status(201).json(course[0]);
        } catch (error) {
            console.error("Error creating course:", error);
            res.status(500).json({ error: "Internal server error" });
        }
    },

    // Update course progress
    async updateProgress(req, res) {
        try {
            const { courseId } = req.params;
            const { progress_percentage } = req.body;
            const userId = req.user.userId;

            if (progress_percentage < 0 || progress_percentage > 100) {
                return res.status(400).json({ error: "Progress must be between 0 and 100" });
            }

            const completed = progress_percentage === 100;

            const enrollment = await sql`
                UPDATE enrollments 
                SET progress_percentage = ${progress_percentage},
                    completed = ${completed},
                    completed_at = ${completed ? 'CURRENT_TIMESTAMP' : null}
                WHERE user_id = ${userId} AND course_id = ${courseId}
                RETURNING *
            `;

            if (enrollment.length === 0) {
                return res.status(404).json({ error: "Enrollment not found" });
            }

            // Create notification for completion
            if (completed) {
                const course = await sql`SELECT title FROM courses WHERE id = ${courseId}`;
                await sql`
                    INSERT INTO notifications (user_id, title, message, type)
                    VALUES (${userId}, 'Course Completed!', 
                           ${'Congratulations! You completed: ' + course[0].title}, 
                           'completion')
                `;
            }

            res.status(200).json(enrollment[0]);
        } catch (error) {
            console.error("Error updating progress:", error);
            res.status(500).json({ error: "Internal server error" });
        }
    },

    // Get course details with instructor info
    async getCourseDetails(req, res) {
        try {
            const { courseId } = req.params;

            const course = await sql`
                SELECT 
                    c.*,
                    u.first_name || ' ' || u.last_name as instructor_name,
                    u.bio as instructor_bio,
                    u.profile_image as instructor_image,
                    COUNT(e.id) as enrollment_count,
                    ROUND(AVG(e.progress_percentage), 2) as avg_progress
                FROM courses c
                LEFT JOIN users u ON c.instructor_id = u.id
                LEFT JOIN enrollments e ON c.id = e.course_id
                WHERE c.id = ${courseId}
                GROUP BY c.id, u.first_name, u.last_name, u.bio, u.profile_image
            `;

            if (course.length === 0) {
                return res.status(404).json({ error: "Course not found" });
            }

            res.status(200).json(course[0]);
        } catch (error) {
            console.error("Error fetching course details:", error);
            res.status(500).json({ error: "Internal server error" });
        }
    }
};
