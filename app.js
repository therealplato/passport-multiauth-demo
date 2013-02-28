// Read in some modules from other js files. passport and crypto 
// for authentication, express for web server
var http     = require('http');
var passport = require('passport');
var express  = require('express');
var crypto   = require('crypto');
var app      = module.exports = express();

//store users locally as an array of objects; irl you'd use a database
var USERS = [];
// load db manipulation functions (irl they are probably async)
var db = require('./db.js')(USERS);

//set up passport routes
require('./auth.js')(app, passport, db, USERS);

// Configure some Express settings
app.configure(function(){
  app.set('views', __dirname + '/views');  // 'res.render' template dir
  app.set('view engine', 'jade');     // assume .jade extension on templates
//  app.set('view options', { layout: false });  //deprecated in express 3.x
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
  //console.log('session:\n'+JSON.stringify(req.session,null,2));
  //console.log('users:\n'+JSON.stringify(USERS,null,2));
  if(req.user && req.user.handle){
    res.locals.logged_in_user = req.user
  } else {
    res.locals.logged_in_user = null;
  };
  res.locals.all_users = USERS;
  res.render('index');
});

app.post( '/auth/createuser', create_user_route );

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

app.get( '/auth/google/start'
, passport.authenticate('google'
  ,{  scope: ['https://www.googleapis.com/auth/userinfo.profile'
             ,'https://www.googleapis.com/auth/userinfo.email'] 
  })
);

app.get( '/auth/google/callback'
,function(req,res,next){
  console.log('Google called back. Calling passport.authenticate:');
  next();
}
,passport.authenticate('google', {
  successRedirect:'/auth/google/paperwork',
  failureRedirect:'/auth/failure'
})
);

app.get( '/auth/google/callback2'
,function(req,res,next){
  console.log('Google called back. Calling passport.authenticate:');
  next();
}
,passport.authenticate('google', {failureRedirect:'/auth/failure'})
,function(req,res){
  console.log('Passport passed req/res onward: success?'); 
  res.redirect('/auth/success');
});
// Upon seeing a google profile for the first time, we do NOT save it in USERS
// immediately. We keep a temporary user object in req.session.tmpuser until
// we can find a valid username.
app.get('/auth/google/paperwork', function(req, res) {
  console.log('got to paperwork with session:\n'+JSON.stringify(req.session,null,2));
  if(!req.user || req.user.handle) return res.redirect('/');

  // test for duplicate username and generate non-dupe if necessary:
  var _u = req.session.tmpuser; 
  if(db.userByHandle(_u.google.handle) == null) {
    var dupe = false;
    var suggestion = _u.google.handle;
  } else {
    var dupe = true;
    var i=1;
    while(true){
      var tmp = db.userByHandle(_u.google.handle + i);
      if(tmp) { i++; continue; } else { break };
    };
    var suggestion = _u.google.handle + i;
  };
  console.log('about to render paperwork-google');
  res.render('paperwork-google', 
    {dupe:dupe, suggestion:suggestion, tmpuser:_u});
});

// paperwork.jade submits a form to this verify url:
app.post('/auth/google/paperwork/verify', function(req, res) {
  // req.user should still be {}
  var _u = req.session.tmpuser;
  var name = req.body.confirmedHandle;
  if(req.user.handle || !_u)  return res.redirect('/');
  if(name === (null || '')) {
    console.log('someone submitted a blank handle form');
    res.redirect('/auth/google/paperwork');
  } else if(db.userByHandle(name) !== null) {
    console.log('Aw shit, someone already has that handle');
    _u.handle = name;
    res.redirect('/auth/google/paperwork');
  } else {
    _u.handle = name;
    //console.log('session before regen:\n'+JSON.stringify(req.session,null,2));
    db.createOrUpdateUser(_u, function(){
      //console.log('session after creation and login:\n'+JSON.stringify(req.session,null,2));
      res.redirect('/auth/google/paperwork/done');
    });
  };
});

app.get('/auth/google/paperwork/done', function(req,res) {
  req.logIn(req.session.tmpuser,function(){
    console.log('in paperwork/done, session:\n'+JSON.stringify(req.session,null,2));
    res.render('paperwork-google-done', {user:req.user});
    delete req.session.tmpuser;
  });
});

// This route starts to link a new google account to a logged in user
app.get( '/auth/link/google'
, passport.authorize('google-link'
  ,{  scope: ['https://www.googleapis.com/auth/userinfo.profile'
             ,'https://www.googleapis.com/auth/userinfo.email'] 
  })
);

app.get( '/auth/link/google/callback' 
, passport.authorize('google-link', {failureRedirect:'/auth/failure'})
, function(req, res) { // if we got here then auth succeeded
    req.user.google = req.account;
    db.createOrUpdateUser(req.user, function(){
      delete req.account;
      res.redirect( '/auth/success' );
    });
});



app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});



// **START LISTENING on configured port... incoming requests go to middleware chain**
http.createServer(app).listen(3000);
console.log('Listening on 3000');

// long functions go here
// NOTE create_user isn't checking for duplicate handles
function create_user_route(req, res) {
  console.log('req.session is\n'+JSON.stringify(req.session,null,2));
  if(db.userByHandle(req.body.handle) !== null)
    return res.send('Already have an account with that username');
  var user = db.newUser();
  console.log('user.handle will be '+req.body.handle);
  user.handle = req.body.handle;
  var sha256er = crypto.createHash('sha256');
  crypto.randomBytes(33, function(err, buffer){
    if(!err) { 
      var salt = buffer.toString('hex');
      user.salt = salt;
      var toHash = req.body.password.concat(salt);
      sha256er.update(toHash,'utf8');
      var hash = sha256er.digest('hex');
      user.hash = hash;
      USERS.push(user);
      console.log('logging in '+user.handle);
      req.logIn(user, function(err) {
        if(err) {
          res.send('Error starting session for '+user.handle)}
        else { 
          console.log('User created from u/p. req.session is\n'+JSON.stringify(req.session,null,2));
          res.render('createduser', {logged_in_user:req.user.handle})
        };
      });
      
    } else { 
      res.send('Error adding user '+req.body.handle+':\n'+err,500);
    };
  });
}; //end of create_user_route



// Old attempts:
/* instead of using failureRedirect, let's use a custom callback for auth:
 * BROKEN?
 *
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
*/
  /*
   * old openID version
  passport.authenticate( 'google', function(err, user, info){
    // passport.auth('google') set a req.user for us
    console.log('passport verified google auth, now in /auth/google/callback');
    console.log('err: '+err);
    console.log('req.user: '+JSON.stringify(req.user,null,2));
    console.log('req.session: '+JSON.stringify(req.session,null,2));
    if(req.session.tmpuser) {
      console.log('about to redirect to /auth/google/paperwork' +
        ' from /auth/google/callback');
      res.redirect('/auth/google/paperwork');
    } else if(user !== false){
      req.logIn(user)
      res.redirect('/auth/success');
    } else {
      res.redirect('/auth/failure');
    };
  });
  */

