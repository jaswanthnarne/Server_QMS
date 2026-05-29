const AuditLog = require('../models/AuditLog');

const logAudit = async (req, action, targetType, targetId, targetName, details = {}) => {
    try {
        const user = req?.user || {};
        const userId = user._id || user.id;
        const userName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.username || user.phone || 'Unknown User';
        const userRole = user.role || 'unknown';
        const ipAddress = req?.headers?.['x-forwarded-for']?.split(',')?.[0]?.trim() || req?.ip || req?.connection?.remoteAddress || '';
        const userAgent = req?.headers?.['user-agent'] || '';

        if (!userId) {
            console.warn('Audit log skipped: no authenticated user present');
            return;
        }

        await AuditLog.create({
            userId,
            userName,
            userRole,
            action,
            targetType,
            targetId,
            targetName,
            details,
            ipAddress,
            userAgent
        });
    } catch (error) {
        console.error('Audit log failed:', error.message);
    }
};

module.exports = { logAudit };