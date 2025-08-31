export const analyticsController = {

    async getSkillEndorsements(req, res) {
        try {
            const { timeframe = '12 months'} = req.query;
            
            let interval = '12 months';
            if (timeframe === '1year') interval = '1year';
             if (timeframe === '3 months') interval = '3 months';     
             
             const endorsements = await sql`
                SELECT
                category,
                DATE_TRUNC('month', created_at) AS month,
                COUNT(*) AS skill_count
                FROM skillshowcase
                WHERE created_at >= NOW() - INTERVAL ${interval}
                GROUP BY category, month
                ORDER BY month, skill_count
                `;



                res.status(200).json({ endorsements });
        } catch (error) {
            console.error("Error fetching skill endorsements:", error);
            res.status(500).json({ error: "ERROR 500" });

        }

    },

    async getOpportunityStats(req, res) {
        try {
            const stats = await sql`

            SELECT

            o.type,
            COUNT(*) as total_opportunities,
            COUNT(a.id) as active_opportunities,
             ROUND(COUNT(a.id)::numeric / COUNT(*)::numeric, 2) as applications_per_opportunity,
                    COUNT(CASE WHEN a.status = 'accepted' THEN 1 END) as accepted_applications
                FROM opportunities o
                LEFT JOIN applications a ON o.id = a.opportunity_id
                WHERE o.is_active = TRUE
                GROUP BY o.type
            `;

            res.status(200).json(stats);
        } catch (error) {
            console.error("Error fetching opportunity stats:", error);
            res.status(500).json({ error: "Internal server error" });
        }
    },
    
    async getCourseAnalytics(req, res) {

        try{
            const analytics = await sql`
                SELECT 
                    c.category,
                    c.difficulty_level,
                    COUNT(e.id) as total_enrollments,
                    COUNT(CASE WHEN e.completed = TRUE THEN 1 END) as completions,
                    ROUND(AVG(e.progress_percentage), 2) as avg_progress,
                    ROUND(
                        COUNT(CASE WHEN e.completed = TRUE THEN 1 END)::numeric / 
                        NULLIF(COUNT(e.id), 0)::numeric * 100, 2
                    ) as completion_rate
                FROM courses c
                LEFT JOIN enrollments e ON c.id = e.course_id
                GROUP BY c.category, c.difficulty_level
                ORDER BY total_enrollments DESC
            `;

            res.status(200).json(analytics);
        } catch (error) {
            console.error("Error fetching course analytics:", error);
            res.status(500).json({ error: "Internal server error" });
        }
    }
};
        


        
            
