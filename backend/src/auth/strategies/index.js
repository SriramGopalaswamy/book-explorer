const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const MicrosoftStrategy = require('passport-microsoft').Strategy;
const User = require('../../modules/users/user.model');

// Serialize user for session
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findByPk(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

// Local Strategy (email/password)
passport.use(new LocalStrategy(
  {
    usernameField: 'email',
    passwordField: 'password'
  },
  async (email, password, done) => {
    try {
      const user = await User.findOne({ where: { email } });
      
      if (!user) {
        return done(null, false, { message: 'Invalid email or password' });
      }
      
      if (!user.isActive) {
        return done(null, false, { message: 'Account is inactive' });
      }
      
      const isValid = await user.validatePassword(password);
      
      if (!isValid) {
        return done(null, false, { message: 'Invalid email or password' });
      }
      
      // Update last login
      await user.update({ lastLoginAt: new Date() });
      
      return done(null, user);
    } catch (error) {
      return done(error);
    }
  }
));

// Microsoft Strategy (SSO)
if (process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET) {
  passport.use(new MicrosoftStrategy(
    {
      clientID: process.env.MICROSOFT_CLIENT_ID,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
      callbackURL: process.env.MICROSOFT_CALLBACK_URL || 'http://localhost:3000/api/auth/microsoft/callback',
      scope: ['user.read']
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        // Validate that profile has emails
        if (!profile.emails || profile.emails.length === 0) {
          return done(new Error('Microsoft profile does not include email address'));
        }
        
        // Find or create user based on Microsoft ID
        let user = await User.findOne({ where: { microsoftId: profile.id } });
        
        if (!user) {
          const email = profile.emails[0].value;
          
          // Check if user exists with same email
          user = await User.findOne({ where: { email } });
          
          if (user) {
            // Link Microsoft account to existing user
            await user.update({ microsoftId: profile.id });
          } else {
            // Create new user
            user = await User.create({
              username: email.split('@')[0],
              email,
              displayName: profile.displayName,
              microsoftId: profile.id,
              role: 'reader',
              isActive: true
            });
          }
        }
        
        if (!user.isActive) {
          return done(null, false, { message: 'Account is inactive' });
        }
        
        // Update last login
        await user.update({ lastLoginAt: new Date() });
        
        return done(null, user);
      } catch (error) {
        return done(error);
      }
    }
  ));
}

module.exports = passport;
