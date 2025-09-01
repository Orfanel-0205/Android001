export const userController = {
    // Get user's complete profile with stats
    async getCompleteProfile(req, res) {
        try {
            const { userId } = req.params;

            // Get user basic info
            const user = await sql`
                SELECT id, email, first_name, last_name, role, bio, education, 
                       experience, phone, location, profile_image, is_verified, created_at
                FROM users WHERE id = ${userId}
            `;

            if (user.length === 0) {
                return res.status(404).json({ error: "User not found" });
            }

            // Get user's skills with ratings
            const skills = await sql`
                SELECT s.*, 
                       COALESCE(AVG(e.rating), 0) as avg_rating,
                       COUNT(e.id) as endorsement_count
                FROM skillshowcase s
                LEFT JOIN skill_endorsements e ON s.id = e.skill_id
                WHERE s.user_id = ${userId}
                GROUP BY s.id
                ORDER BY avg_rating DESC, endorsement_count DESC
            `;

            // Get user's course stats
            const courseStats = await sql`
                SELECT 
                    COUNT(*) as total_enrollments,
                    COUNT(CASE WHEN completed = TRUE THEN 1 END) as completed_courses,
                    COALESCE(AVG(progress_percentage), 0) as avg_progress
                FROM enrollments
                WHERE user_id = ${userId}
            `;

            // Get mentorship info
            const mentorshipStats = await sql`
                SELECT 
                    COUNT(CASE WHEN mentor_id = ${userId} THEN 1 END) as mentoring_count,
                    COUNT(CASE WHEN mentee_id = ${userId} THEN 1 END) as being_mentored_count
                FROM mentorships
                WHERE (mentor_id = ${userId} OR mentee_id = ${userId}) AND status = 'active'
            `;

            res.status(200).json({
                user: user[0],
                skills,
                courseStats: courseStats[0],
                mentorshipStats: mentorshipStats[0]
            });
        } catch (error) {
            console.error("Error fetching complete profile:", error);
            res.status(500).json({ error: "Internal server error" });
        }
    },

    // Upload profile image
    async uploadProfileImage(req, res) {
        try {
            const { userId } = req.params;

            if (req.user.userId !== parseInt(userId)) {
                return res.status(403).json({ error: "Unauthorized" });
            }

            if (!req.file) {
                return res.status(400).json({ error: "No file uploaded" });
            }

            await sql`
                UPDATE users 
                SET profile_image = ${req.file.path}
                WHERE id = ${userId}
            `;

            res.status(200).json({ 
                message: "Profile image updated",
                image_path: req.file.path 
            });
        } catch (error) {
            console.error("Error uploading profile image:", error);
            res.status(500).json({ error: "Internal server error" });
        }
    },

    // Get user recommendations
    async getUserRecommendations(req, res) {
        try {
            const userId = req.user.userId;

            // Get recommended courses based on user's skills
            const recommendedCourses = await sql`
                WITH user_skill_categories AS (
                    SELECT DISTINCT category 
                    FROM skillshowcase 
                    WHERE user_id = ${userId}
                )
                SELECT DISTINCT c.*, 
                       u.first_name || ' ' || u.last_name as instructor_name
                FROM courses c
                JOIN users u ON c.instructor_id = u.id
                JOIN user_skill_categories usc ON c.category = usc.category
                WHERE c.is_active = TRUE
                AND c.id NOT IN (
                    SELECT course_id FROM enrollments WHERE user_id = ${userId}
                )
                ORDER BY c.created_at DESC
                LIMIT 5
            `;

            // Get recommended mentors based on user's skill gaps
            const recommendedMentors = await sql`
                SELECT DISTINCT
                    u.id, u.first_name, u.last_name, u.bio, u.profile_image,
                    STRING_AGG(DISTINCT s.category, ', ') as expertise_areas
                FROM users u
                JOIN skillshowcase s ON u.id = s.user_id
                WHERE u.role IN ('mentor', 'instructor')
                AND u.id NOT IN (
                    SELECT mentor_id FROM mentorships 
                    WHERE mentee_id = ${userId} AND status IN ('pending', 'active')
                )
                GROUP BY u.id, u.first_name, u.last_name, u.bio, u.profile_image
                LIMIT 5
            `;

            // Get recommended opportunities
            const recommendedOpportunities = await sql`
                WITH user_skills AS (
                    SELECT ARRAY_AGG(category) as categories
                    FROM skillshowcase 
                    WHERE user_id = ${userId}
                )
                SELECT o.*, 
                       u.first_name || ' ' || u.last_name as employer_name
                FROM opportunities o
                JOIN users u ON o.employer_id = u.id
                CROSS JOIN user_skills us
                WHERE o.is_active = TRUE
                AND (o.required_skills && us.categories OR us.categories IS NULL)
                AND o.id NOT IN (
                    SELECT opportunity_id FROM applications WHERE applicant_id = ${userId}
                )
                ORDER BY o.created_at DESC
                LIMIT 5
            `;

            res.status(200).json({
                courses: recommendedCourses,
                mentors: recommendedMentors,
                opportunities: recommendedOpportunities
            });
        } catch (error) {
            console.error("Error fetching recommendations:", error);
            res.status(500).json({ error: "Internal server error" });
        }
    }
};