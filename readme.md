## Demo - Using Passport to authenticate users with multiple auth methods

Updated to use Express 3.x and Google Oauth2 *2013-02-28*

This is an example of gracefully handling both local and third party auth
methods. So far you can do the following with this demo:

You can make a local account with a username/password, (which logs you in
automatically), link a new Google account to it, log out, log in with the Google
account, and req.user is the same object for both methods.

If you log in for the first time with google, the app suggests a
username ('handle') based on the profile provided by the 3rd party.  It won't
let you choose a username that already exists. The user must accept this
suggested handle or an unused one to complete the registration process and save
the User object.

You can't yet unlink 3rd party accounts from a user.

### Usage

    $ git clone git://github.com/therealplato/passport-multiauth-demo.git
    $ cd passport-multiauth-demo
    $ npm install -d
    $ node app.js
    $ firefox 127.0.0.1:3000

### Files

`db.js` holds a few db manipulation functions  
`auth.js` sets up passport strategies (including verify callbacks)  
`app.js` sets up the Express server and sets up all other routes  

### Storage

In this example we store user info in an array of objects, called `USERS`. The
code to access this is generally synchronous to keep it simple. In real life you
will store your users' information in a couchdb or sql or a distributed database
or whatever. You'll have to define serialization and deserialization functions
for Passport's session store; meaning you need to turn your `User` object into a
unique string, and turn that unique string into a `User` object, those will
probably be asynchronous.

### Control flow
#### `/auth/google/start`
When we get a request here, we call `passport.authenticate('google')`. This
redirects to google.com; they'll callback soon. We are now using Google's OAuth2
system. This provides a better experience for users than openID.

#### `/auth/google/callback`
google.com will redirect the user here with auth results.  We call
`passport.authenticate('google')` again as route middleware. Passport executes
the verification function. On failure passport redirects to `/auth/failure`. On
success passport continues on to the next handler function in the route.

By this point Passport has populated `req.user`. If there was an existing user,
`req.user` will be that User object. If there was no known matching user,
`req.user` will be set to {} and `req.session.tmpuser` will be populated.

Existing users are redirected to `/auth/success`. New users are redirected to
`/auth/google/paperwork`.

#### 'google' verify function
*defined in auth.js*

In here we iterate through each user in `USERS` and look for a matching google
ID.

If we find one, we call `done(null,user)`.

If we don't find one, we create a temporary User and store it in 
`req.session.tmpuser`. Then we call `done(null,{})`.

When `done(null,user)` is called, passport sets `req.user` to be that user object.
So immediately after seeing a new google ID for the first time, `req.user ===
{}`.

The (de)serialization functions treat {} as a special case; instead of looking
through the `USERS` list it simply (de)serializes `{} => true; true => {}`.
Without this, passport will raise an error because `{}.handle === undefined`.

#### /auth/google/paperwork

This route checks if `req.session.tmpuser.handle` is used by an existing user.
This is initialized to an auto-suggested handle (`googleprofile.displayName`).
`tmpuser.handle` is later set to a user's desired handle in
`/auth/google/paperwork/verify`.

If a user matching `tmpuser.handle` exists, we generate a (valid, unused)
suggestion `res.locals.suggestion` and set the `res.locals.dupe` flag. The
template `views/paperwork-google.jade` is rendered, telling the user what the
suggestion was and whether it is a dupe. 

The user can submit their desired handle, which posts to...

####/auth/google/paperwork/verify

This double checks the user's desired handle. If it's in use, it sets
`req.session.tmpuser.handle=desired` and redirects back to
`/auth/google/paperwork`, where a new suggestion is generated and the user
submits a new attempt.

Once an unused handle is submitted, we save the user and redirect them to

####/auth/google/paperwork/done

Here we log in the new user and serve up a confirmation page to the user.
