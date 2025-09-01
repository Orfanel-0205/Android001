export const messageController = {
    // Get conversation between two users
    async getConversation(req, res) {
        try {
            const { userId1, userId2 } = req.params;

            if (req.user.userId !== parseInt(userId1) && req.user.userId !== parseInt(userId2)) {
                return res.status(403).json({ error: "Unauthorized" });
            }

            const messages = await sql`
                SELECT 
                    m.*,
                    sender.first_name || ' ' || sender.last_name as sender_name,
                    sender.profile_image as sender_image
                FROM messages m
                JOIN users sender ON m.sender_id = sender.id
                WHERE (m.sender_id = ${userId1} AND m.recipient_id = ${userId2}) OR
                      (m.sender_id = ${userId2} AND m.recipient_id = ${userId1})
                ORDER BY m.created_at ASC
            `;

            // Mark messages as read
            await sql`
                UPDATE messages 
                SET is_read = TRUE 
                WHERE recipient_id = ${req.user.userId} AND 
                      sender_id = ${req.user.userId === parseInt(userId1) ? userId2 : userId1}
            `;

            res.status(200).json(messages);
        } catch (error) {
            console.error("Error fetching conversation:", error);
            res.status(500).json({ error: "Internal server error" });
        }
    },

    // Get user's conversation list
    async getConversations(req, res) {
        try {
            const userId = req.user.userId;

            const conversations = await sql`
                WITH latest_messages AS (
                    SELECT 
                        CASE 
                            WHEN sender_id = ${userId} THEN recipient_id 
                            ELSE sender_id 
                        END as other_user_id,
                        MAX(created_at) as last_message_time,
                        COUNT(CASE WHEN recipient_id = ${userId} AND is_read = FALSE THEN 1 END) as unread_count
                    FROM messages
                    WHERE sender_id = ${userId} OR recipient_id = ${userId}
                    GROUP BY other_user_id
                )
                SELECT 
                    lm.*,
                    u.first_name || ' ' || u.last_name as other_user_name,
                    u.profile_image as other_user_image,
                    u.role as other_user_role,
                    recent.message as last_message,
                    recent.subject as last_subject
                FROM latest_messages lm
                JOIN users u ON lm.other_user_id = u.id
                JOIN LATERAL (
                    SELECT message, subject
                    FROM messages
                    WHERE (sender_id = ${userId} AND recipient_id = lm.other_user_id) OR
                          (sender_id = lm.other_user_id AND recipient_id = ${userId})
                    ORDER BY created_at DESC
                    LIMIT 1
                ) recent ON true
                ORDER BY lm.last_message_time DESC
            `;

            res.status(200).json(conversations);
        } catch (error) {
            console.error("Error fetching conversations:", error);
            res.status(500).json({ error: "Internal server error" });
        }
    }
};
