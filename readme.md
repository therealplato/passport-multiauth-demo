## Demo - Using Passport to authenticate users with multiple auth methods

This is an attempt to gracefully handle users who want to use multiple third
party auth methods to log in to your site.

So far you can do the following with this demo:

You can make a local account with a username/password, (which logs you in
automatically), link a new Google account to it, log out, log in with the Google
account, and it's the same user as logging in with the local account.

If you log in for the first time with twitter or google, the app suggests a
username ('handle') based on the profile provided by the 3rd party.  It won't
let you choose a username that already exists. The user must accept this
suggested handle or an unused one to complete the registration process.

**Twitter works AS LONG AS you access the app with url 127.0.0.1:3000 instead of
localhost:3000.** This is because dev.twitter.com/apps/ provides a field to set
your callback URL, and it doesn't let you point to localhost. So if you initiate
an auth request to twitter.com from localhost, and it callsback to 127.0.0.1,
passport's oauth module comes up with an error "failed to find request token in
session".

This shouldn't be a problem when deployed on an actual domain.

You can't yet create an account with twitter or google, then link a new username
and password to it.

You can't yet unlink 3rd party accounts from a user.

###Usage

$ node app.js

$ firefox 127.0.0.1:3000

127.0.0.1:3000/ renders index.jade, providing the following:

* welcome message
* if logged in, options to link accounts
* if logged out, a form to log in with user/pass
* if logged out, links to start third party auth process
* form to create a new user with user/pass/pass
* list of user objects


### Storage

In this example we store user info in an array of objects, called `USERS`. The
code to access this is generally synchronous to keep it simple. In real life you
will store your users' information in a couchdb or sql or a distributed database
or whatever. You'll have to define serialization and deserialization functions
for Passport's session store; meaning you need to turn your `User` object into a
unique string, and turn that unique string into a `User` object.  And that will
probably be asynchronous.

###Control flow

All routes are in app.js. The flow between requests is:

####/

index is rendered for user... user clicks on link 'login with google' to url:

####/auth/google/start 

when we get a request here, we call `passport.authenticate('google')`. This
redirects to google.com; they'll callback soon.  

#### 'google' verify function

    passport.use('google', function(req, g_id, profile) { ... }

Passport calls this once google.com calls back to /auth/google/callback. 

In here we iterate through each user in USERS and look for a matching google ID.

If we find one, we call `done(null,user)`.

If we don't find one, we create a new user with a temporary handle, set 
`user._ISNEW = true`, do `USERS.push(user)`, and callback `done(null,user)`

`done()` expects either `done(err)`, `done(null,user)` or `done(null,false)`.
We don't callback with false because if a user has managed to login with their
google account we should keep them logged in. 

When done(null,user) is called, passport sets req.user to be that user object.


####/auth/google/callback 

google.com will redirect the user here with auth results.  We call
`passport.authenticate('google')` again as route middleware. Passport executes
the verification function. On failure passport redirects to /auth/failure. On
success passport continues on to execute the route's callback.

If this callback function is called, we have a session with a req.user.  We
test for the flag `if( req.user._ISNEW )`. If this exists, we redirect to
/auth/google/paperwork. If not, we redirect to /auth/success.

####/auth/google/paperwork

This renders jade template paperwork-google as a response. It passes a
'suggestion' string containing a guess at our new users' handle. The user clicks
a submit button to confirm this or submit something new. That posts the users'
choice to 

####/auth/google/paperwork/verify

which redirects to /auth/google/paperwork if the users' desired handle is in
use. If not it sets req.user.handle to the new handle and calls
req.logIn(req.user) to load the updated user from Passport's session store.
It's unclear if this will break anything in the future, since Passport already
has a logged in user. 

Finally we redirect to 

####/auth/google/paperwork/done

which simply serves up a confirmation page to the user.


  
  
  
  
