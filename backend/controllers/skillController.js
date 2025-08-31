/**
 * SkillController
 *
 * This version keeps the original behaviour but:
 * - Uses clear variable names and small helper steps
 * - Parses and validates query params (page, limit, sort, order)
 * - Builds parameterized queries to avoid SQL injection
 * - Returns clear pagination metadata
 *
 * Note: This file assumes there is a DB client exported from ../db
 * that exposes a `query(text, params)` method (like `pg` Pool or Client).
 */

import db from '../database/'; 

export const skillController = {
  // Get all skills with filtering, sorting and pagination
  async getAllSkills(req, res) {
    try {
      // Extract and normalize query parameters
      const {
        category,
        skill_level,
        min_rating,
        search,
        sort_by = 'created_at',
        order = 'DESC',
        page = '1',
        limit = '20'
      } = req.query;

      // Parse numeric inputs and ensure sane defaults
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20)); // cap limit to 100
      const offset = (pageNum - 1) * limitNum;

      // Sanitize sorting inputs: only allow a fixed set of sortable columns
      const ALLOWED_SORT_FIELDS = new Set(['created_at', 'title', 'category', 'skill_level', 'rating']);
      const ALLOWED_ORDER = new Set(['ASC', 'DESC']);
      const sortField = ALLOWED_SORT_FIELDS.has(sort_by) ? sort_by : 'created_at';
      const sortOrder = ALLOWED_ORDER.has(String(order).toUpperCase()) ? String(order).toUpperCase() : 'DESC';

      // Build WHERE clause and parameters for the main query in a safe, parameterized way
      const whereParts = [];
      const params = [];

      if (category) {
        params.push(category);
        whereParts.push(`s.category = $${params.length}`);
      }

      if (skill_level) {
        params.push(skill_level);
        whereParts.push(`s.skill_level = $${params.length}`);
      }

      if (search) {
        // Add two parameters, one for title and one for description
        params.push(`%${search}%`);
        params.push(`%${search}%`);
        whereParts.push(`(s.title ILIKE $${params.length - 1} OR s.description ILIKE $${params.length})`);
      }

      // Build HAVING clause for minimum average rating (if provided)
      let havingClause = '';
      if (min_rating !== undefined && min_rating !== null && min_rating !== '') {
        const minRatingNum = Number(min_rating);
        if (!Number.isNaN(minRatingNum)) {
          params.push(minRatingNum);
          havingClause = `HAVING AVG(e.rating) >= $${params.length}`;
        }
      }

      const whereClause = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

      // Determine actual ORDER BY column: 'rating' is computed as avg_rating
      const orderByExpression = sortField === 'rating' ? 'avg_rating' : `s.${sortField}`;

      // Append limit and offset as parameters (so they are safely parameterized)
      params.push(limitNum);
      const limitParamPosition = params.length;
      params.push(offset);
      const offsetParamPosition = params.length;

      // Main query: select skill rows along with user info, average rating and endorsement count
      const skillsQuery = `
        SELECT
          s.*,
          u.first_name || ' ' || u.last_name AS user_name,
          u.profile_image AS user_image,
          COALESCE(AVG(e.rating), 0) AS avg_rating,
          COUNT(e.id) AS endorsement_count
        FROM skillshowcase s
        JOIN users u ON s.user_id = u.id
        LEFT JOIN skill_endorsements e ON s.id = e.skill_id
        ${whereClause}
        GROUP BY s.id, u.first_name, u.last_name, u.profile_image
        ${havingClause}
        ORDER BY ${orderByExpression} ${sortOrder}
        LIMIT $${limitParamPosition} OFFSET $${offsetParamPosition}
      `;

      const skillsResult = await db.query(skillsQuery, params);
      const skills = skillsResult.rows || [];

      // For pagination total, count distinct skills that match the same WHERE/GROUP/HAVING conditions
      // Build a parameters list for the count query without limit/offset
      const countParams = params.slice(0, params.length - 2); // exclude last two (limit, offset)

      const countQuery = `
        SELECT COUNT(*)::int AS total
        FROM (
          SELECT s.id
          FROM skillshowcase s
          JOIN users u ON s.user_id = u.id
          LEFT JOIN skill_endorsements e ON s.id = e.skill_id
          ${whereClause}
          GROUP BY s.id
          ${havingClause}
        ) AS matched_skills
      `;

      const countResult = await db.query(countQuery, countParams);
      const total = countResult.rows?.[0]?.total ?? 0;
      const pages = Math.ceil(total / limitNum);

      // Return results with human-friendly pagination metadata
      res.status(200).json({
        skills,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages
        }
      });
    } catch (error) {
      // Log server-side error and return a generic message to client
      console.error('Error fetching skills:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Get detailed single skill with endorsements
  async getSkillDetails(req, res) {
    try {
      const { skillId } = req.params;

      // Fetch skill and owner details
      const skillQuery = `
        SELECT
          s.*,
          u.first_name || ' ' || u.last_name AS user_name,
          u.profile_image AS user_image,
          u.bio AS user_bio
        FROM skillshowcase s
        JOIN users u ON s.user_id = u.id
        WHERE s.id = $1
      `;
      const skillResult = await db.query(skillQuery, [skillId]);

      if (!skillResult.rows || skillResult.rows.length === 0) {
        return res.status(404).json({ error: 'Skill not found' });
      }

      const skill = skillResult.rows[0];

      // Fetch endorsements along with the endorser user info
      const endorsementsQuery = `
        SELECT
          e.*,
          u.first_name || ' ' || u.last_name AS endorser_name,
          u.profile_image AS endorser_image
        FROM skill_endorsements e
        JOIN users u ON e.endorser_id = u.id
        WHERE e.skill_id = $1
        ORDER BY e.created_at DESC
      `;
      const endorsementsResult = await db.query(endorsementsQuery, [skillId]);
      const endorsements = endorsementsResult.rows || [];

      res.status(200).json({
        ...skill,
        endorsements
      });
    } catch (error) {
      console.error('Error fetching skill details:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Update a skill (title, description, category, level, portfolio_url)
  async updateSkill(req, res) {
    try {
      const { skillId } = req.params;
      const { title, description, category, skill_level, portfolio_url } = req.body;

      // Verify the skill exists and that the requester owns it or is an admin
      const ownerQuery = `SELECT user_id FROM skillshowcase WHERE id = $1`;
      const ownerResult = await db.query(ownerQuery, [skillId]);

      if (!ownerResult.rows || ownerResult.rows.length === 0) {
        return res.status(404).json({ error: 'Skill not found' });
      }

      const ownerId = ownerResult.rows[0].user_id;
      const currentUserId = req.user?.userId;
      const currentUserRole = req.user?.role;

      if (ownerId !== currentUserId && currentUserRole !== 'admin') {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      // Perform update and return the updated row
      const updateQuery = `
        UPDATE skillshowcase
        SET
          title = $1,
          description = $2,
          category = $3,
          skill_level = $4,
          portfolio_url = $5
        WHERE id = $6
        RETURNING *
      `;
      const updateParams = [title, description, category, skill_level, portfolio_url, skillId];

      const updatedResult = await db.query(updateQuery, updateParams);
      const updatedSkill = updatedResult.rows?.[0];

      res.status(200).json(updatedSkill);
    } catch (error) {
      console.error('Error updating skill:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};
