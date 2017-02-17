"use strict";


const nconf = require('nconf'),
      jwt = require('jsonwebtoken'),
      db = require('./db'),
      bcrypt = require('bcrypt');

// constants for JWT, time is in seconds
const SECRET = nconf.get('AUTH_JWT_SECRET');
const TOKENTIME = nconf.get('AUTH_JWT_TOKENTIME')

// NOTE:  currently there is no provision for refresh tokens

exports.manager = {
  
    create: (user, cb) => {
        
        // if user has a verified property, this was a login, not registration
        if (user.verified) {
            cb(null, user);
            return;
        }
        
        // encrypt password then save user info to db
        bcrypt.hash(user.password, 10, (err, bcryptedPwd) => {
   
            user.pwd = bcryptedPwd;
            // 'password' is a RDMS key word, can't save a column with that name
            delete user.password;  
            
            db.knex.insert(user)
                    .into('users')
                    .returning('user_id')
                    .then( (result) => {
                        console.log(`Successfully created user with id ${result}`);
                        user.id = result[0];
                        cb(null, user);
                    }) 
                    .catch( (err) => {
                        console.error(err);
                        cb(null, err);
            });
        }); 
    },
    
    authenticate: (username, password, cb) => {
    
      db.knex('users')
            .where('username', username)
            .then( (rows) => {
                
                // if no such user, then register user; otherwise, log in
                if (0 === rows.length) {
                    console.log('No such user, registering new user');
                    cb(null, true);
                    return;
                }
        
                // login flow
                let bcryptedPwd = rows[0].pwd;
                // this function compares the plaintext password with the 
                // encrypted password in the db (after decrypting it)
                bcrypt.compare(password, bcryptedPwd, (err, doesMatch) => {

                    if (doesMatch) {
                        // log in
                        console.log('password matched');
                        cb(null, {
                            id: rows[0].user_id,
                            firstname: rows[0].first_name,
                            lastname: rows[0].last_name,
                            email: rows[0].email,
                            verified: true
                        });
                    } else {
                        // deny access
                        console.log('password DID NOT match');
                        cb(null, false);
                    }
                });
            }) 
            .catch( (err) => {
                console.error(err);
                res.status(500).json({'error' : `[DB ERROR] ${err}`});
            });
      
        }
};

exports.serialize = (req, res, next) => {

    // user has verified property set only for login, not registration
    let userToSerialize = req.user.verified ? req.user : req.body;
    
    this.manager.create(userToSerialize, (err, user) => {
      
        if (err) {
          return next(err);
        }
      
        // req.user contains necessary info for tokens
        req.user = {
          id: user.id
        };

        next();
    });
}

exports.generateToken = (req, res, next) => {
  
    req.token = jwt.sign({
        id: req.user.id,
        }, SECRET, {
        expiresIn: TOKENTIME
    });

    next();
}

exports.respondWithToken = (req, res) => {
        
    res.status(200).json({
        user: req.user,
        token: req.token
    });
}


