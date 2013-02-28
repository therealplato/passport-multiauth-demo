var crypto   = require('crypto');
module.exports = function(app, passport, db, USERS){
  var myGoogleClientID = '581866147802.apps.googleusercontent.com';
  var myGoogleClientSecret = 'sSl2VKq4KcddoJArhxrut6qq';

  var LocalStrategy = require('passport-local').Strategy;
  var GoogleOauthStrategy = require('passport-google-oauth').OAuth2Strategy;
  // old openid: var GoogleStrategy = require('passport-google').Strategy;

  // passport will use these functions to convert sessionid <=> user
  // IRL you'd talk to your database before calling done(err,id) / done(err,user)
  passport.serializeUser(function(user, done) {
    if(user.handle == undefined){
      // this will happen when /auth/google/callback redirects to
      // /auth/google/paperwork. the OAuth2 verify fn returned user {}.
      return done(null, true);    // serialize as true
    } else {
      return done(null, user.handle);
    };
  });

  passport.deserializeUser(function(handle, done) {
    console.log('deserializing user '+handle);
    if(handle === true){ 
      return done(null, {});
    } else {
      user = db.userByHandle(handle);
      if(user == null) {
        return done(new Error('not found'));
      } else {
        return done(null, user);
      };
    };
  });

  // set up verification functions for strategies: 
  // passport.use( new Strategy(function(_,cb){ /*auth logic*/ }) )
  // cb(null, false) if auth fails gracefully 
  // cb(null, user) if auth succeeds
  // cb(null, true) if auth succeeds with unknown google id
  // cb(err) if exception occurs

  // local: check if a u/p is good then cb
  passport.use(new LocalStrategy(
    { 
      usernameField:'handle', 
      passwordField:'password'
    }
   ,function(username, password, done) {
      var user = db.userByHandle(username);
      if(user == null) 
        { return done(null, false, {message: 'Bad username or password'}) };
      //keep going otherwise
      var toHash = password.concat(user.salt);
      var sha256er = crypto.createHash('sha256');
      sha256er.update(toHash,'utf8');
      var saltedHash = sha256er.digest('hex');
      if(saltedHash == user.hash) {   // password matched
        return done(null, user);
      } else {
        return done(null, false, {message: 'Bad username or password'});
      };
    }
  )); //end of passport.use() localstrategy

  passport.use('google',new GoogleOauthStrategy(
    {
      clientID: myGoogleClientID,
      clientSecret: myGoogleClientSecret,
      callbackURL: "http://127.0.0.1:3000/auth/google/callback",
      passReqToCallback: true,
    },
    function(req, accessToken, refreshToken, profile, done) {
      console.log('This is the verify function for Google Oauth 2.')
      process.nextTick(function () {
        //console.log(profile);
        // Check if this account is already attached to a user
        var user = null;
        USERS.forEach(function(thisuser) {
          if(thisuser.google.id==profile.id) {  user = thisuser;  };
        });  
        // If we find one, login as that user
        if(user != null) 
          return done(null, user);
        // Otherwise create a new user in session (not USERS.) login as true
        var tmpuser    = db.newUser();
        tmpuser.handle = profile.displayName;
        tmpuser.email  = profile.emails[0].value;
        //console.log('tmpuser:\n'+JSON.stringify(tmpuser,null,2));
        tmpuser.google = {
          id:profile.id,
          email:profile.emails[0].value,
          handle:profile.displayName
        }; 
        //USERS.push(tmpuser);
        //console.log('End of verify. Users:\n'+JSON.stringify(USERS,null,2));
        req.session.tmpuser = tmpuser;
        return done(null, {});
      });
    }
  ));

  passport.use('google-link', new GoogleOauthStrategy(
  {
    clientID: myGoogleClientID,
    clientSecret: myGoogleClientSecret,
    callbackURL: "http://127.0.0.1:3000/auth/link/google/callback",
    passReqToCallback: true,
  },
  function(req, accessToken, refreshToken, profile, done) {
    console.log('This is the verify function for google-link')
    process.nextTick(function () {
      //console.log(profile);
      // Check if this account is already linked to a user
      var user = null;
      USERS.forEach(function(thisuser) {
        if(thisuser.google.id==profile.id) {  user = thisuser;  };
      });  
      // If this account is already linked to a user, don't re-link
      if(user !== null)  return done(null, false);
      // Otherwise return account info, to be set later
      var google = {
        id:profile.id,
        email:profile.emails[0].value,
        handle:profile.displayName
      }; 
      return done(null,google);
    });
  }));
};
