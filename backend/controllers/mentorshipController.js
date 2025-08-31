export const mentorshipController = {
    // Get available mentors
    async getAvailableMentors(req, res) {
        try {
            const { skill_category, experience_level } = req.query;

            let query = sql`
                SELECT 
                    u.id, u.first_name, u.last_name, u.bio, u.experience, 
                    u.profile_image, u.location, u.is_verified,
                    COUNT(m.id) as mentee_count,
                    STRING_AGG(DISTINCT s.category, ', ') as skill_categories,
                    ROUND(AVG(e.rating), 2) as avg_skill_rating
                FROM users u
                LEFT JOIN skillshowcase s ON u.id = s.user_id
                LEFT JOIN skill_endorsements e ON s.id = e.skill_id
                LEFT JOIN mentorships m ON u.id = m.mentor_id AND m.status = 'active'
                WHERE u.role IN ('mentor', 'instructor', 'employer')
            `;

            if (skill_category) {
                query = sql`${query} AND s.category = ${skill_category}`;
            }

            query = sql`
                ${query}
                GROUP BY u.id
                HAVING COUNT(m.id) < 5  -- Limit active mentees per mentor
                ORDER BY avg_skill_rating DESC NULLS LAST, mentee_count ASC
            `;

            const mentors = await query;
            res.status(200).json(mentors);
        } catch (error) {
            console.error("Error fetching mentors:", error);
            res.status(500).json({ error: "Internal server error" });
        }
    },

    // Update mentorship status (mentor only)
    async updateMentorshipStatus(req, res) {
        try {
            const { mentorshipId } = req.params;
            const { status } = req.body; // 'active', 'completed', 'cancelled'

            const mentorship = await sql`
                SELECT * FROM mentorships WHERE id = ${mentorshipId}
            `;

            if (mentorship.length === 0) {
                return res.status(404).json({ error: "Mentorship not found" });
            }

            if (req.user.userId !== mentorship[0].mentor_id && req.user.role !== 'admin') {
                return res.status(403).json({ error: "Only mentors can update mentorship status" });
            }

            const updatedMentorship = await sql`
                UPDATE mentorships 
                SET status = ${status},
                    started_at = ${status === 'active' ? 'CURRENT_TIMESTAMP' : mentorship[0].started_at},
                    ended_at = ${status === 'completed' || status === 'cancelled' ? 'CURRENT_TIMESTAMP' : null}
                WHERE id = ${mentorshipId}
                RETURNING *
            `;

            // Notify mentee
            await sql`
                INSERT INTO notifications (user_id, title, message, type)
                VALUES (${mentorship[0].mentee_id}, 'Mentorship Update', 
                       ${'Your mentorship status has been updated to: ' + status}, 
                       'mentorship')
            `;

            res.status(200).json(updatedMentorship[0]);
        } catch (error) {
            console.error("Error updating mentorship:", error);
            res.status(500).json({ error: "Internal server error" });
        }
    },

    // Get mentorship sessions/meetings
    async getMentorshipSessions(req, res) {
        try {
            const { mentorshipId } = req.params;

            // First verify user has access to this mentorship
            const mentorship = await sql`
                SELECT * FROM mentorships 
                WHERE id = ${mentorshipId} AND 
                      (mentor_id = ${req.user.userId} OR mentee_id = ${req.user.userId})
            `;

            if (mentorship.length === 0) {
                return res.status(403).json({ error: "Access denied" });
            }

            // For now, return mentorship details - you could extend this to track actual sessions
            res.status(200).json(mentorship[0]);
        } catch (error) {
            console.error("Error fetching mentorship sessions:", error);
            res.status(500).json({ error: "Internal server error" });
        }
    }
};
