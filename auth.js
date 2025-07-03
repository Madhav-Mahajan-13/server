import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import jwt from "jsonwebtoken";
import pool from "./db.js";

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "/auth/google/callback",
    },
    async (accessToken, refreshToken, profile, done) => {
      const email = profile.emails[0].value;
      const name = profile.displayName;
      const picture = profile.photos[0].value;

      try {
        const existing = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
        let user;
        if (existing.rows.length === 0) {
          const newUser = await pool.query(
            "INSERT INTO users (name, email, profile_picture) VALUES ($1, $2, $3) RETURNING *",
            [name, email, picture]
          );
          user = newUser.rows[0];
        } else {
          user = existing.rows[0];
        }

        console.log("user::", user);
        return done(null, user);
      } catch (err) {
        return done(err, null);
      }
    }
  )
);

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));
