Demo - Using Passport to authenticate users with multiple auth methods

This is currently broken. To reproduce my issue:

$ node app.js

$ firefox localhost:3000

localhost:3000/ renders index.jade, providing the following:

* form to create a new user with user/pass/pass
* form to log in with user/pass
* link to start the google auth process (making a new user in the process)
* logout button
* list of user objects


Step 1:
Create a new user, either with the user/pass/pass field or with google auth

Step 2: 
Optionally click 
