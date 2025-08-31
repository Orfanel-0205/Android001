export const adminController = {
    
    async getAllUsers(req, res) {
        try {
            if (req.user.role !== 'admin') {
                return res.status(403).json({ message: 'It requires access from the admin' });
            }
            
            const userGrowth= await sql`
            SELECT DATE_TRUNC('month', created_at) as month, 
            COUNT(*) AS new_users, 
            role
            FROM users
            WHERE created_at >= NOW() - INTERVAL '12 months'
            GROUP BY month, role
            ORDER BY month
            `;
            const platformStats = await sql`
                SELECT 
                    (SELECT COUNT(*) FROM users) as total_users,
                    (SELECT COUNT(*) FROM users WHERE role = 'student') as students,
                    (SELECT COUNT(*) FROM users WHERE role = 'employer') as employers,
                    (SELECT COUNT(*) FROM users WHERE role = 'mentor') as mentors,
                    (SELECT COUNT(*) FROM skillshowcase) as total_skills,
                    (SELECT COUNT(*) FROM courses) as total_courses,
                    (SELECT COUNT(*) FROM opportunities WHERE is_active = TRUE) as active_opportunities,
                    (SELECT COUNT(*) FROM applications) as total_applications
            `;

            // Most popular skills
            const popularSkills = await sql`
                SELECT 
                    category,
                    COUNT(*) as count,
                    AVG(COALESCE(avg_rating, 0)) as avg_rating
                FROM (
                    SELECT s.category, AVG(e.rating) as avg_rating
                    FROM skillshowcase s
                    LEFT JOIN skill_endorsements e ON s.id = e.skill_id
                    GROUP BY s.id, s.category
                ) subquery
                GROUP BY category
                ORDER BY count DESC
                LIMIT 10
            `;

            res.status(200).json({
                userGrowth,
                platformStats: platformStats[0],
                popularSkills
            });
        } catch (error) {
            console.error("Error fetching platform analytics:", error);
            res.status(500).json({ error: "Internal server error" });
        }
    },

    // Update user verification status
    async updateUserVerification(req, res) {
        try {
            if (req.user.role !== 'admin') {
                return res.status(403).json({ error: "Admin access required" });
            }

            const { userId } = req.params;
            const { is_verified } = req.body;

            await sql`
                UPDATE users 
                SET is_verified = ${is_verified}, updated_at = CURRENT_TIMESTAMP
                WHERE id = ${userId}
            `;

            // Create notification
            await sql`
                INSERT INTO notifications (user_id, title, message, type)
                VALUES (${userId}, 'Verification Update', 
                       ${is_verified ? 'Your account has been verified!' : 'Your account verification has been revoked.'}, 
                       'verification')
            `;

            res.status(200).json({ message: "User verification updated" });
        } catch (error) {
            console.error("Error updating verification:", error);
            res.status(500).json({ error: "Internal server error" });
        }
    },

    // Moderate content
    async moderateSkill(req, res) {
        try {
            if (req.user.role !== 'admin') {
                return res.status(403).json({ error: "Admin access required" });
            }

            const { skillId } = req.params;
            const { action, reason } = req.body; // action: 'approve', 'reject', 'flag'

            if (action === 'reject') {
                await sql`DELETE FROM skillshowcase WHERE id = ${skillId}`;
                
                // Notify user
                const skill = await sql`SELECT user_id, title FROM skillshowcase WHERE id = ${skillId}`;
                if (skill.length > 0) {
                    await sql`
                        INSERT INTO notifications (user_id, title, message, type)
                        VALUES (${skill[0].user_id}, 'Content Moderated', 
                               ${'Your skill "' + skill[0].title + '" has been removed. Reason: ' + reason}, 
                               'moderation')
                    `;
                }
            }

            res.status(200).json({ message: `Skill ${action}ed successfully` });
        } catch (error) {
            console.error("Error moderating content:", error);
            res.status(500).json({ error: "Internal server error" });
        }
    }
};

