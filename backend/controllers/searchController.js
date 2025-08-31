export const searchController = {
    // Global search across platform
    async globalSearch(req, res) {
        try {
            const { query, type, limit = 20 } = req.query;

            if (!query) {
                return res.status(400).json({ error: "Search query required" });
            }

            const searchResults = {};

            // Search users (if type is 'users' or 'all')
            if (!type || type === 'users' || type === 'all') {
                searchResults.users = await sql`
                    SELECT 
                        id, first_name, last_name, role, bio, location, is_verified
                    FROM users 
                    WHERE (first_name ILIKE ${'%' + query + '%'} OR 
                           last_name ILIKE ${'%' + query + '%'} OR 
                           bio ILIKE ${'%' + query + '%'})
                    LIMIT ${limit}
                `;
            }

            // Search skills (if type is 'skills' or 'all')
            if (!type || type === 'skills' || type === 'all') {
                searchResults.skills = await sql`
                    SELECT 
                        s.*, 
                        u.first_name || ' ' || u.last_name as user_name,
                        COALESCE(AVG(e.rating), 0) as avg_rating
                    FROM skillshowcase s
                    JOIN users u ON s.user_id = u.id
                    LEFT JOIN skill_endorsements e ON s.id = e.skill_id
                    WHERE (s.title ILIKE ${'%' + query + '%'} OR 
                           s.description ILIKE ${'%' + query + '%'} OR 
                           s.category ILIKE ${'%' + query + '%'})
                    GROUP BY s.id, u.first_name, u.last_name
                    LIMIT ${limit}
                `;
            }

            // Search courses (if type is 'courses' or 'all')
            if (!type || type === 'courses' || type === 'all') {
                searchResults.courses = await sql`
                    SELECT 
                        c.*, 
                        u.first_name || ' ' || u.last_name as instructor_name
                    FROM courses c
                    LEFT JOIN users u ON c.instructor_id = u.id
                    WHERE c.is_active = TRUE AND 
                          (c.title ILIKE ${'%' + query + '%'} OR 
                           c.description ILIKE ${'%' + query + '%'} OR 
                           c.category ILIKE ${'%' + query + '%'})
                    LIMIT ${limit}
                `;
            }

            // Search opportunities (if type is 'opportunities' or 'all')
            if (!type || type === 'opportunities' || type === 'all') {
                searchResults.opportunities = await sql`
                    SELECT 
                        o.*, 
                        u.first_name || ' ' || u.last_name as employer_name
                    FROM opportunities o
                    LEFT JOIN users u ON o.employer_id = u.id
                    WHERE o.is_active = TRUE AND 
                          (o.title ILIKE ${'%' + query + '%'} OR 
                           o.description ILIKE ${'%' + query + '%'} OR 
                           ${query} = ANY(o.required_skills))
                    LIMIT ${limit}
                `;
            }

            res.status(200).json(searchResults);
        } catch (error) {
            console.error("Error performing search:", error);
            res.status(500).json({ error: "Internal server error" });
        }
    },

    // Get search suggestions
    async getSearchSuggestions(req, res) {
        try {
            const { query } = req.query;

            if (!query || query.length < 2) {
                return res.status(200).json([]);
            }

            const suggestions = await sql`
                (SELECT DISTINCT category as suggestion, 'skill' as type 
                 FROM skillshowcase 
                 WHERE category ILIKE ${'%' + query + '%'} 
                 LIMIT 3)
                UNION
                (SELECT DISTINCT category as suggestion, 'course' as type 
                 FROM courses 
                 WHERE category ILIKE ${'%' + query + '%'} 
                 LIMIT 3)
                UNION
                (SELECT DISTINCT type as suggestion, 'opportunity' as type 
                 FROM opportunities 
                 WHERE type ILIKE ${'%' + query + '%'} 
                 LIMIT 3)
            `;

            res.status(200).json(suggestions);
        } catch (error) {
            console.error("Error fetching suggestions:", error);
            res.status(500).json({ error: "Internal server error" });
        }
    }
};
