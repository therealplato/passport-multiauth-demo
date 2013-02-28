module.exports = function(USERS){
  var ret = {};  
  ret.newUser = function(){
    return {
      handle: null,
      email:  null,
      google: {id:null, handle:null, email:null},
      salt: null,
      hash: null
    };
  };

  ret.userByHandle = function(handle){
    if(handle===undefined) return null;
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

  ret.createOrUpdateUser = function(user,done){
    process.nextTick(function(){
      var tmp = ret.userByHandle(user.handle);
      if(tmp !== null){
        tmp = user;
        done();
      } else {
        USERS.push(user);
        done();
      };
    });
  };
  return ret;
};
