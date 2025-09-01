export const opportunityController = {
    // Get opportunity applications (employer only)
    async getOpportunityApplications(req, res) {
        try {
            const { opportunityId } = req.params;

            // Verify opportunity ownership
            const opportunity = await sql`
                SELECT employer_id FROM opportunities WHERE id = ${opportunityId}
            `;

            if (opportunity.length === 0) {
                return res.status(404).json({ error: "Opportunity not found" });
            }

            if (opportunity[0].employer_id !== req.user.userId && req.user.role !== 'admin') {
                return res.status(403).json({ error: "Unauthorized" });
            }

            const applications = await sql`
                SELECT 
                    a.*,
                    u.first_name || ' ' || u.last_name as applicant_name,
                    u.email as applicant_email,
                    u.profile_image,
                    u.bio,
                    u.education,
                    u.experience
                FROM applications a
                JOIN users u ON a.applicant_id = u.id
                WHERE a.opportunity_id = ${opportunityId}
                ORDER BY a.applied_at DESC
            `;

            res.status(200).json(applications);
        } catch (error) {
            console.error("Error fetching applications:", error);
            res.status(500).json({ error: "Internal server error" });
        }
    },

    // Update application status
    async updateApplicationStatus(req, res) {
        try {
            const { applicationId } = req.params;
            const { status } = req.body; // 'reviewed', 'accepted', 'rejected'

            // Get application and verify ownership
            const application = await sql`
                SELECT a.*, o.employer_id, o.title as opportunity_title
                FROM applications a
                JOIN opportunities o ON a.opportunity_id = o.id
                WHERE a.id = ${applicationId}
            `;

            if (application.length === 0) {
                return res.status(404).json({ error: "Application not found" });
            }

            if (application[0].employer_id !== req.user.userId && req.user.role !== 'admin') {
                return res.status(403).json({ error: "Unauthorized" });
            }

            const updatedApplication = await sql`
                UPDATE applications 
                SET status = ${status}
                WHERE id = ${applicationId}
                RETURNING *
            `;

            // Notify applicant
            await sql`
                INSERT INTO notifications (user_id, title, message, type)
                VALUES (${application[0].applicant_id}, 'Application Update', 
                       ${'Your application for "' + application[0].opportunity_title + '" has been ' + status}, 
                       'application')
            `;

            res.status(200).json(updatedApplication[0]);
        } catch (error) {
            console.error("Error updating application status:", error);
            res.status(500).json({ error: "Internal server error" });
        }
    },

    // Get user's applications
    async getUserApplications(req, res) {
        try {
            const { userId } = req.params;

            if (req.user.userId !== parseInt(userId)) {
                return res.status(403).json({ error: "Unauthorized" });
            }

            const applications = await sql`
                SELECT 
                    a.*,
                    o.title as opportunity_title,
                    o.type as opportunity_type,
                    o.location,
                    u.first_name || ' ' || u.last_name as employer_name
                FROM applications a
                JOIN opportunities o ON a.opportunity_id = o.id
                JOIN users u ON o.employer_id = u.id
                WHERE a.applicant_id = ${userId}
                ORDER BY a.applied_at DESC
            `;

            res.status(200).json(applications);
        } catch (error) {
            console.error("Error fetching user applications:", error);
            res.status(500).json({ error: "Internal server error" });
        }
    },

    // Update opportunity
    async updateOpportunity(req, res) {
        try {
            const { opportunityId } = req.params;
            const updateData = req.body;

            // Verify ownership
            const opportunity = await sql`
                SELECT employer_id FROM opportunities WHERE id = ${opportunityId}
            `;

            if (opportunity.length === 0) {
                return res.status(404).json({ error: "Opportunity not found" });
            }

            if (opportunity[0].employer_id !== req.user.userId && req.user.role !== 'admin') {
                return res.status(403).json({ error: "Unauthorized" });
            }

            const updatedOpportunity = await sql`
                UPDATE opportunities 
                SET title = ${updateData.title},
                    description = ${updateData.description},
                    location = ${updateData.location},
                    salary_min = ${updateData.salary_min},
                    salary_max = ${updateData.salary_max},
                    required_skills = ${updateData.required_skills},
                    experience_level = ${updateData.experience_level},
                    is_remote = ${updateData.is_remote},
                    application_deadline = ${updateData.application_deadline},
                    is_active = ${updateData.is_active}
                WHERE id = ${opportunityId}
                RETURNING *
            `;

            res.status(200).json(updatedOpportunity[0]);
        } catch (error) {
            console.error("Error updating opportunity:", error);
            res.status(500).json({ error: "Internal server error" });
        }
    }
};
