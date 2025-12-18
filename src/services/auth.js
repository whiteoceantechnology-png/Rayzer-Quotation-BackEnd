import passport from 'passport';
import LocalStrategy from 'passport-local';
import { Strategy as JWTStrategy, ExtractJwt } from 'passport-jwt';
import bcrypt from 'bcrypt';

import User from '../models/user.model.js';
import constants from '../config/constants.js';
import logger from '../utils/logger.js';

if (!constants.JWT_SECRET) {
  logger.warn('JWT secret is not configured; authentication may fail');
}

/**
 * Local Strategy Auth
 */
const localOpts = { usernameField: 'mobile_number' };

const localLogin = new LocalStrategy(
  localOpts,
  async (mobile_number, password, done) => {
    try {
      const user = await User.findOne({ where: { mobile_number } });

      if (!user) {
        logger.debug({ mobileNumber: mobile_number }, 'Local authentication failed: user not found');
        return done(null, false, { message: 'Invalid credentials' });
      }

      const isMatch = await bcrypt.compare(password, user.password);

      if (!isMatch) {
        logger.debug({ userId: user.id }, 'Local authentication failed: password mismatch');
        return done(null, false, { message: 'Invalid credentials' });
      }

      return done(null, user.toAuthJSON());
    } catch (e) {
      logger.error({ err: e }, 'Local authentication error');
      return done(e, false);
    }
  },
);

/**
 * JWT Strategy Auth
 */
const jwtOpts = {
  jwtFromRequest: ExtractJwt.fromExtractors([
    ExtractJwt.fromAuthHeaderAsBearerToken(),
    ExtractJwt.fromAuthHeaderWithScheme('JWT'),
  ]),
  secretOrKey: constants.JWT_SECRET,
  passReqToCallback: false,
};

const jwtLogin = new JWTStrategy(jwtOpts, async (payload, done) => {
  try {
    const user = await User.findByPk(payload.id);

    if (!user) {
      logger.debug({ userId: payload.id }, 'JWT authentication failed: user not found');
      return done(null, false);
    }
    return done(null, user);
  } catch (e) {
    logger.error({ err: e }, 'JWT authentication error');
    return done(e, false);
  }
});

passport.use(localLogin);
passport.use(jwtLogin);

export const authLocal = passport.authenticate('local', { session: false });
export const authJwt = passport.authenticate('jwt', { session: false });
