import HTTPStatus from 'http-status';
import constants from '../config/constants.js';

const { ROLES } = constants;

/**
 * Middleware to check if the user has the required role.
 * ADMIN role always has access.
 *
 * @param {Array<String>} allowedRoles - The roles allowed to access the route
 */
export const checkRole = (allowedRoles = []) => (req, res, next) => {
    try {
        if (!req.user) {
            return res.sendStatus(HTTPStatus.UNAUTHORIZED);
        }

        const { role } = req.user;

        // Admin always has access
        if (role === ROLES.ADMIN) {
            return next();
        }

        if (allowedRoles.includes(role)) {
            return next();
        }

        return res.sendStatus(HTTPStatus.FORBIDDEN);
    } catch (e) {
        return res.sendStatus(HTTPStatus.FORBIDDEN);
    }
};
