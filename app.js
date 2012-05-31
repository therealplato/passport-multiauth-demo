// Cuizini food app rewrite alpha
// Copyright 2012 Cuizini 

// Read in some modules from other js files. Async for control flow, passport
// and crypto for authentication, express for web server, nano for db
var passport = require('passport');
var express  = require('express');
var crypto   = require('crypto');

var app      = module.exports = express.createServer();

//store users locally as an array of objects; irl you'd use a database
var users = [];

newUser = function() {
  data = 
  {
    handle: null,
    email:  null,
    google_id: null,
    twitter_id: null,
    salt: null,
    hash: null
  };
  return data;
};

// Authentication: who is this request coming from?
// Passport uses one Strategy for each auth type. local = username/pass
var LocalStrategy = require('passport-local').Strategy;
var GoogleStrategy = require('passport-google').Strategy;

// passport will use these functions to convert sessionid <=> user
passport.serializeUser(function(user, done) {
  done(null, user.handle);
});

passport.deserializeUser(function(handle, done) {
  console.log('deserializing user '+handle);
  console.log(JSON.stringify(users,null,2));
  var toReturn = null;
  users.forEach(function(user) {
    if(user.handle==handle) {
      console.log('found it');
//      return done(null, user);
      toReturn=user;
    };
  });
  if(toReturn == null) {
    console.log('didnt find it');
    return done(new Error('not found'));
  } else {
    return done(null, toReturn);
  };
});


// set up verification functions for strategies: 
// passport.use( new Strategy(function(_,cb){ /*auth logic*/ }) )
// cb(null, false) if auth fails gracefully 
// cb(null, user) if auth succeeds
// cb(err) if exception occurs
// local: check if a u/p is good then cb

passport.use(new LocalStrategy(
  { usernameField:'handle', passwordField:'password' }
 ,function(username, password, done) {
    var user = null;
    users.forEach( function(thisuser) {
      if(thisuser.handle == username) {
        user = thisuser; 
      };
    }); // if thisuser was found, user will be non-null
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

passport.use(new GoogleStrategy(
  { returnURL: 'http://localhost:3000/auth/done/google',
    realm: 'http://localhost:3000/' }
  , function(g_id, profile, done) {
    console.log('id: '+g_id);
// we'll truncate the google id from e.g. 
// https://www.google.com/accounts/o8/id?id=tOawmBGNa0fg6xXOUjBEYeT-WiYObtDE
    g_id_regex = /id=(.*)$/;      // capture url param id
    match_id = g_id_regex.exec(g_id);    // run the regex
    g_id2 = match_id[1];              // g_id2 will be saved as qz_googleid
    console.log('id2: '+g_id2);
    console.log('profile:\n'+JSON.stringify(profile));
    var user = null;
    users.forEach(function(thisuser) {
      if(thisuser.google_id==g_id2) {
        user = thisuser;
      };
    });

    if(user != null) { return done(null, user) };
    // otherwise, we have no user associated with this google account yet
    
    email = profile.emails[0].value;
    handle_regex = /^(.*)@/;      // capture chars before @
    match_handle = handle_regex.exec(email);
    handle2 = match_handle[1];

    user = newUser();
    user.email = email;
    user.handle = handle2;
    user.google_id = g_id2;
    users.push(user);
    return done(null, user);
  } //end of google verification function
)); //end of passport.use() googlestrategy



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
    console.log('session:\n'+JSON.stringify(req.session,null,2));
    console.log('users:\n'+JSON.stringify(users,null,2));
    var user=null;
    if(req.user) { user = req.user };
    res.render('index', {logged_in_user:user, all_users:users});
  });

  app.post( '/auth/start/password'
  , passport.authenticate( 'local'
    , { successRedirect: '/auth/success',
        failureRedirect: '/auth/failure'  }
    )
  );

  app.get( '/auth/start/google', passport.authenticate('google') );

  app.get( '/auth/done/google'
  , passport.authenticate( 'google'
    , { successRedirect: '/auth/success',
        failureRedirect: '/auth/failure'  }
    )
  );

  app.get( '/auth/success' , function(req,res) {
    console.log('in /auth/success');
    res.render('success', {logged_in_user:req.user});
//    res.send('Login succeeded as user ' + req.user.handle, 200);
  });

  app.get( '/auth/failure' , function(req, res) {
    res.render('failure');
//    res.send('Login failed', 500);
  });
/*  app.post( '/auth/createuser', function(req,res,next) {
    if(req.user){
      req.logOut();
      next();
    };
  });*/

  app.post( '/auth/createuser', function(req, res) {
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
        users.push(user);
        console.log('logging in '+user.handle);
    
//        if(req.user) { req.logOut()};
       /* 
        req.session.regenerate(function(err){
          if(!err) {
            req.logIn(user, function(err) {
              if(err) {
                res.send('Error starting session for '+user.handle)}
              else { 
                console.log('req.session is\n'+JSON.stringify(req.session,null,2));
                res.render('createduser', {logged_in_user:req.user.handle})
              };
            });
          } else {
            res.redirect('/');
          };
        });
       */
         
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
  });  //end of app.post('/auth/createuser',fn(){})

  app.get( '/auth/logout' , function(req, res) {
    req.logOut();
    req.session.destroy();
    res.render('logout');
  });






app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

// **START LISTENING on configured port... incoming requests go to middleware chain**
app.listen(3000);
console.log("Server listening on port %d", app.address().port);
