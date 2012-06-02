// Read in some modules from other js files. passport and crypto 
// for authentication, express for web server
var passport = require('passport');
var express  = require('express');
var crypto   = require('crypto');

var app      = module.exports = express.createServer();

//store users locally as an array of objects; irl you'd use a database
var USERS = [];
var myTwitterConsumerKey = 'GFG7a5tt7XiVvR55OJM4Wg';
var myTwitterConsumerSecret = 'Gdaw3xmZEbaV6dMtgBgK5uoAVNkZIDdgNqUse52JlbM';

newUser = function() {
  data = 
  {
    handle: null,
    email:  null,
    google: {id:null, email:null},
    twitter: {id:null, email:null},
    salt: null,
    hash: null
  };
  return data;
};

userByHandle = function(handle) {
  var toReturn = null;
  USERS.forEach(function(user) {
    if(user.handle==handle) {
      console.log('found '+user.handle);
      toReturn=user;
    };
  });
  if(toReturn == null) {
    console.log('didnt find '+handle);
    return null;
  } else {
    return toReturn;
  };
};

// Authentication: who is this request coming from?
// Passport uses one Strategy for each auth type. local = username/pass
var LocalStrategy = require('passport-local').Strategy;
var GoogleStrategy = require('passport-google').Strategy;
var TwitterStrategy = require('passport-twitter').Strategy;

// passport will use these functions to convert sessionid <=> user
// IRL you'd talk to your database before calling done(err,id) / done(err,user)
passport.serializeUser(function(user, done) {
  done(null, user.handle);
});

passport.deserializeUser(function(handle, done) {
  console.log('deserializing user '+handle);
//  console.log(JSON.stringify(USERS,null,2));
  user = userByHandle(handle);
  if(user == null) {
    return done(new Error('not found'));
  } else {
    return done(null, user);
  };
});


// set up verification functions for strategies: 
// passport.use( new Strategy(function(_,cb){ /*auth logic*/ }) )
// cb(null, false) if auth fails gracefully 
// cb(null, user) if auth succeeds
// cb(err) if exception occurs

// We have 5 strategies - user/pass, login with google, login with twitter,
// and two that are meant to link a new google or twitter to a logged in user
// local: check if a u/p is good then cb
passport.use(new LocalStrategy(
  { 
    usernameField:'handle', 
    passwordField:'password'
  }
 ,function(username, password, done) {
    var user = userByHandle(username);
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

// Normal 'login with google' - 
// sets req.user plus req.user._ISNEW flag, if no existing user found
passport.use('google', new GoogleStrategy(
  { returnURL: 'http://localhost:3000/auth/google/callback',
    realm: 'http://localhost:3000/'
  },function(g_id, profile, done) {
    g_id2 = new RegExp(/id=(.*)$/).exec(g_id)[1]; // capture trailing id param

    // Check if this account is already attached to a user
    var user = null;
    USERS.forEach(function(thisuser) {
      if(thisuser.google.id==g_id2) {  user = thisuser;  };
    });  
    
    // If we find one, login as that user
    if(user != null) { return done(null, user) }; // 
    
    // otherwise, we have no user associated with this google account yet...
    var tmpuser    = newUser();
    var email      = profile.emails[0].value;
    tmpuser.handle = g_id2;    // we need a tmp handle to maintain a session
    tmpuser.google = {id:null, email:null, handle:null}; 
    tmpuser.google.handle = new RegExp(/^(.*)@/).exec(email)[1];
    tmpuser.google.email  = email;
    tmpuser.google.id     = g_id2;
    tmpuser._ISNEW = true;
    USERS.push(tmpuser);
    return done(null, tmpuser);     
    // We have to push tmpuser into USERS now because subsequent /paperwork
    // needs a session, and the session de/serializer looks for USER.handle
  } //end of google_link verification function
)); //end of passport.use('google')

// This is a separate verification function; it'll be called with 
// passport.authorize instead of passport.authenticate, to keep old session
passport.use('google_link', new GoogleStrategy(
  { returnURL: 'http://localhost:3000/auth/link/google/callback',
    realm: 'http://localhost:3000/',
    passReqToCallback: true
  },function(req, g_id, profile, done) {
    if(!req.user) {
      console.log('google_link called without a req.user in session');
      return done(null, false);  //this is only to be used by a logged in user
    }; 

    // Check if this account is already attached to a user
    var user = null;
    g_id2 = /id=(.*)$/.exec(g_id)[1]; // g_id2 will be the 1st captured string
    USERS.forEach(function(thisuser) {
      if(thisuser.google.id==g_id2) {  user = thisuser;  };
    });  
    
    // we shouldn't find one - this is an attempt to link a new account
    if(user != null) { return done(null, false) }; // 
    
    // otherwise, we'll save profile info and associate it with a user soon.
    var account = {id:null, email:null}; 
    account.email = profile.emails[0].value;
    account.id = g_id2;
    return done(null, account);  // authorize() will add this to req.account
  } 
)); //end of passport.use('google_link')

passport.use('twitter', new TwitterStrategy(
  { consumerKey: myTwitterConsumerKey,
    consumerSecret: myTwitterConsumerSecret,
    callbackURL: 'http://127.0.0.1:3000/auth/twitter/callback',
  },function(token, tokenSecret, profile, done) {
    //console.log('twitter, req=\n'+JSON.stringify(req));

    // Check if this account is already attached to a user
    console.log(JSON.stringify(profile,null,2));
    t_id = profile.id;
    //new RegExp(/id=(.*)$/).exec(t_id)[1]; // g_id2 will be the 1st captured string
    var user = null;
    USERS.forEach(function(thisuser) {
      if(thisuser.twitter.id == t_id) {  user = thisuser;  };
    });  

    // If we find one, login as that user
    if(user != null) { return done(null, user) }; // 
    
    // otherwise, we have no user associated with this google account yet...
    var tmpuser    = newUser();
//    var email      = profile.emails[0].value;
    tmpuser.handle = t_id;    // we need a tmp handle to maintain a session
    tmpuser.twitter = {id:null, email:null, handle:null}; 
    tmpuser.twitter.handle = profile.username;
//    tmpuser.twitter.email  = email;
    tmpuser.twitter.id     = t_id;
    tmpuser._ISNEW = true;
    USERS.push(tmpuser);
    return done(null, tmpuser);     
//    var account = {id:null, email:null}; 
    return done(null, user);     // route will add this to req.user
  } //end of twitter verification function
));

passport.use('twitter_link', new TwitterStrategy(
  { consumerKey: 'GFG7a5tt7XiVvR55OJM4Wg',
    consumerSecret: 'Gdaw3xmZEbaV6dMtgBgK5uoAVNkZIDdgNqUse52JlbM',
    callbackURL: 'http://127.0.0.1:3000/auth/link/twitter/callback',
    passReqToCallback: true,
  },function(req, token, tokenSecret, profile, done) {
//    console.log('twitter_link, req=\n'+JSON.stringify(req));
    if(!req.user) {
      console.log('twitter_link called without a req.user in session');
      return done(null, false);  //this is only to be used by a logged in user
    }; 

    // Check if this account is already attached to a user
    var user = null;
/*    g_id_regex = /id=(.*)$/;      // capture id param from url
    match_id = g_id_regex.exec(g_id);    // run the regex
    g_id2 = match_id[1];                 // remember the captured string
*/
    console.log(JSON.stringify(profile,null,2));
    t_id = profile.id
    new RegExp(/id=(.*)$/).exec(g_id)[1]; // g_id2 will be the 1st captured string
    USERS.forEach(function(thisuser) {
      if(thisuser.twitter.id == t_id) {  user = thisuser;  };
    });  
    
    // we shouldn't find one - this is an attempt to link a new account
    if(user != null) { return done(null, false) }; // 
    
    // otherwise, we have no user associated with this twitter account yet...
    var account = {id:null, email:null}; 
//    handle_regex = /^(.*)@/;      // capture chars before @
//    match_handle = handle_regex.exec(email);
//    handle2 = match_handle[1];
    account.email = profile.emails[0].value;
    account.id = t_id;
    return done(null, account);     // route will add this to req.user
  } //end of twitter_link verification function
)); //end of passport.use()



// Configure some Express settings
app.configure(function(){
  app.set('views', __dirname + '/views');  // 'res.render' template dir
  app.set('view engine', 'jade');     // assume .jade extension on templates
  app.set('view options', { layout: false });  //don't use layout.jade
  app.use(express.logger('dev'));
  app.use(express.cookieParser());
  app.use(express.bodyParser());      // both used for forms
  app.use(express.methodOverride());  // "    "    "   "
  app.use(express.static(__dirname+'/public')); //try to route a static file
  app.use(express.session({secret:'carrot-punch-iterate-12340'}));
  app.use(passport.initialize());
  app.use(passport.session());
  app.use(app.router);
});

// ROUTES
//  app.get('/auth/start*', function

app.get( '/', function(req, res) {
  console.log('\'/\' called');
  console.log('session:\n'+JSON.stringify(req.session,null,2));
  console.log('users:\n'+JSON.stringify(USERS,null,2));
  var user=null;
  if(req.user) { user = req.user };
  res.render('index', {logged_in_user:user, all_users:USERS});
});

app.post( '/auth/createuser', function(req, res) {
  create_user(req,res,function(){
    
  })
});  //end of app.post('/auth/createuser',fn(){})


app.get( '/auth/logout' , function(req, res) {
  req.logOut();
  req.session.destroy();
  res.render('logout');
});

app.get( '/auth/success' , function(req,res) {
  console.log('in /auth/success');
  res.render('success', {logged_in_user:req.user});
//    res.send('Login succeeded as user ' + req.user.handle, 200);
});

app.get( '/auth/failure' , function(req, res) {
  res.render('failure');
//    res.send('Login failed', 500);
});

app.post( '/auth/password/start'
, passport.authenticate( 'local'
  , { successRedirect: '/auth/success',
      failureRedirect: '/auth/failure'  }
  )
);

app.get( '/auth/google/start', passport.authenticate('google') );
app.get( '/auth/google/callback'
, passport.authenticate( 'google', { failureRedirect: '/auth/failure'  })
, function(req, res){
    // passport.auth('google') set a req.user for us
    console.log('passport verified google auth, now in /auth/google/callback');
    console.log('req.user:\n'+JSON.stringify(req.user,null,2));
    console.log('req.session:\n'+JSON.stringify(req.session,null,2));
    if(req.user._ISNEW) {
    // the session has a tmp req.user, with req.user.handle set to google's id
      console.log('about to redirect to /auth/google/paperwork' +
        ' from /auth/google/callback');
      res.redirect('/auth/google/paperwork');
    } else {
      res.redirect('/auth/success');
    };
  }
);

// the 'google' verify callback redirects here if it created a new user
app.get('/auth/google/paperwork', function(req, res) {
  // We stored the new user in USERS with a _ISNEW flag
  console.log('foo');
  console.log('got to paperwork with session:\n'+JSON.stringify(req.session,null,2));
  if(userByHandle(req.user.google.handle) == null) {
    var dupe = false;
    var suggestion = req.user.google.handle;
  } else {
    var dupe = true;
    var i=1;
    while(true){
      var tmp = userByHandle(req.user.google.handle + i);
      if(tmp) { i++; continue; } else { break };
    };
    var suggestion = req.user.google.handle + i;
  };
  console.log('about to render paperwork-google');
  res.render('paperwork-google', 
    {dupe:dupe, suggestion:suggestion});
});

// paperwork.jade submits a form to this verify url:
app.post('/auth/google/paperwork/verify', function(req, res) {
  if(req.body.confirmedHandle == (null || '')) {
    console.log('someone submitted a blank handle form');
    res.redirect('/auth/google/paperwork');
  } else if(userByHandle(req.body.confirmedHandle != null)) {
    console.log('Aw shit, someone already has that handle');
    res.redirect('/auth/google/paperwork');
  } else {
    // overwrite tmp handle with user's choice
// might break session... passport uses user.handle to de/serialize
//    var realuser = userByHandle(req.user.handle);
//    console.log('same thing? '+(realuser == req.user));
//    delete realuser._ISNEW;
    console.log('session before regen:\n'+JSON.stringify(req.session,null,2));
//    req.session.reload(function(err) {
      req.user.handle = req.body.confirmedHandle;
      delete req.user._ISNEW;
      req.logIn(req.user, function(err) {
        console.log('session after regen and login:\n'+JSON.stringify(req.session,null,2));
        if(!err) {res.redirect('/auth/google/paperwork/done');}
        else { res.send(JSON.stringify(err),500);};
      });
//    });
  };
});

app.get('/auth/google/paperwork/done', function(req,res) {
  console.log('in paperwork/done, session:\n'+JSON.stringify(req.session,null,2));
  res.render('paperwork-google-done', {user:req.user});
});

// This route starts to link a new google account to a logged in user
app.get( '/auth/link/google', passport.authorize('google_link') );

app.get( '/auth/link/google/callback' 
  , passport.authorize('google_link', {failureRedirect:'/auth/failure'})
  , function(req, res) { // if we got here then auth succeeded
      var user = req.user;  //this is the same user who was logged in before
      var google = req.account;
      user.google = google;
      delete req.account;
      res.redirect( '/auth/success' );
  });

// TWITTER auth methods
// 1. start auth process from a logged out user
app.get( '/auth/twitter/start', passport.authenticate('twitter') );
// 2. twitter callsback here with results of auth attempt
app.get( '/auth/twitter/callback'
, passport.authenticate( 'twitter', { failureRedirect: '/auth/failure'  })
, function(req, res){
    // passport.auth('twitter') set a req.user for us
    console.log('passport verified twitter auth, now in /auth/twitter/callback');
    console.log('req.user:\n'+JSON.stringify(req.user,null,2));
    console.log('req.session:\n'+JSON.stringify(req.session,null,2));
    if(req.user._ISNEW) {
    // the session has a tmp req.user, with req.user.handle set to google's id
      console.log('about to redirect to /auth/twitter/paperwork' +
        ' from /auth/twitter/callback');
      res.redirect('/auth/twitter/paperwork');
    } else {
      res.redirect('/auth/success');
    };
  }
);


// the 'twitter' verify callback redirects here if it created a new user
app.get('/auth/twitter/paperwork', function(req, res) {
  // We stored the new user in USERS with a _ISNEW flag
  console.log('foo');
  console.log('got to paperwork with session:\n'+JSON.stringify(req.session,null,2));
  if(userByHandle(req.user.twitter.handle) == null) {
    var dupe = false;
    var suggestion = req.user.twitter.handle;
  } else {
    var dupe = true;
    var i=1;
    while(true){
      var tmp = userByHandle(req.user.twitter.handle + i);
      if(tmp) { i++; continue; } else { break };
    };
    var suggestion = req.user.twitter.handle + i;
  };
  console.log('about to render paperwork-twitter');
  res.render('paperwork-twitter', 
    {dupe:dupe, suggestion:suggestion});
});

// paperwork.jade submits a form to this verify url:
app.post('/auth/twitter/paperwork/verify', function(req, res) {
  if(req.body.confirmedHandle == (null || '')) {
    console.log('someone submitted a blank handle form');
    res.redirect('/auth/twitter/paperwork');
  } else if(userByHandle(req.body.confirmedHandle != null)) {
    console.log('Aw shit, someone already has that handle');
    res.redirect('/auth/twitter/paperwork');
  } else {
    // overwrite tmp handle with user's choice
// might break session... passport uses user.handle to de/serialize
//    var realuser = userByHandle(req.user.handle);
//    console.log('same thing? '+(realuser == req.user));
//    delete realuser._ISNEW;
    console.log('session before regen:\n'+JSON.stringify(req.session,null,2));
//    req.session.reload(function(err) {
      req.user.handle = req.body.confirmedHandle;
      delete req.user._ISNEW;
      req.logIn(req.user, function(err) {
        console.log('session after regen and login:\n'+JSON.stringify(req.session,null,2));
        if(!err) {res.redirect('/auth/twitter/paperwork/done');}
        else { res.send(JSON.stringify(err),500);};
      });
//    });
  };
});

app.get('/auth/twitter/paperwork/done', function(req,res) {
  console.log('in paperwork/done, session:\n'+JSON.stringify(req.session,null,2));
  res.render('paperwork-twitter-done', {user:req.user});
});

// This gets called if you try to link a twitter account to an existing user
app.get( '/auth/link/twitter', passport.authorize('twitter_link') );

app.get( '/auth/link/twitter/callback' 
  , passport.authorize('twitter_link', {failureRedirect:'/auth/failure'})
  , function(req, res) { // if we got here then auth succeeded
    console.log('in callback of /auth/link/twitter/done');
      var user = req.user;  //this is the same user who was logged in before
      var twitter = req.account;
      user.twitter = twitter;
      delete req.account;
      res.redirect( '/auth/success' );
  });







app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});



// **START LISTENING on configured port... incoming requests go to middleware chain**
app.listen(3000);
console.log("Server listening on port %d", app.address().port);



// long functions go here
create_user = function(req, res) {
  console.log('req.session is\n'+JSON.stringify(req.session,null,2));
  var user = newUser();
  console.log('user.handle will be '+req.body.handle);
  user.handle = req.body.handle;
  // we can't reuse the same hasher
  var sha256er = crypto.createHash('sha256');
  crypto.randomBytes(33, function(err, buffer){
    if(!err) { 
      var salt = buffer.toString('hex');
      user.salt = salt;
      toHash = req.body.password.concat(salt);
      sha256er.update(toHash,'utf8');
      hash = sha256er.digest('hex');
      user.hash = hash;
      USERS.push(user);
      console.log('logging in '+user.handle);
  
//        if(req.user) { req.logOut()};
       
      req.logIn(user, function(err) {
        if(err) {
          res.send('Error starting session for '+user.handle)}
        else { 
          console.log('req.session is\n'+JSON.stringify(req.session,null,2));
          res.render('createduser', {logged_in_user:req.user.handle})
        };
      });
      
    } else { 
      res.send('Error adding user '+req.body.handle+':\n'+err,500);
    };
  });
}; //end of create_user definition
