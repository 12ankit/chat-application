const mongoose              = require('mongoose');
const request 				= require('request');
const bvalid                = require("bvalid");
const redis                 = require('redis');
const socketio              = require('socket.io');
const redisAdapter          = require('socket.io-redis');
const mongo                 = require('../services').Mongo;
const to                    = require('../services').Utility.to;
const helper                = require('../helper');
const utils					= require('../utils');
const configs               = require('../config/app').config;
const httpResponse          = helper.HttpResponse;
const constants             = helper.Constants;
const errorCodes            = helper.Errors;
const sendError 		    = httpResponse.sendError;
const sendSuccess			= httpResponse.sendSuccess;
const controller            = require('../controller');
const userController        = controller.main.maindata;
var io;

var redis_client             = redis.createClient(configs.REDIS_PORT,configs.REDIS_HOST);
// redis_client.auth(configs.REDIS_PASSWORD);
// redis_client.select(configs.REDIS_CHAT_DB, function() { /* ... */ });

redis_client.on("error", function (err) {
    console.log("Error " + err);
});

var redis_publisher         = redis.createClient(configs.REDIS_PORT,configs.REDIS_HOST);
// redis_publisher.auth(configs.REDIS_PASSWORD);

var redis_subscriber        = redis.createClient(configs.REDIS_PORT,configs.REDIS_HOST);
// redis_subscriber.auth(configs.REDIS_PASSWORD);

module.exports.listen = function(app) {
    
    io = socketio(app,{
        adapter: redisAdapter({ pubClient: redis_publisher, subClient: redis_subscriber })
    });
   
    io.on('connection',function(socket){
        socket.on('joingroup', ( data,cb ) => {
            data.socket_id = socket.id;
            userController.checkGroupMember(data , (err , resp ) => {
                if(err){
                    console.log(err);
                    return cb({ success : false , err : err });
                }
                socket.join(data.gid);
                console.log(io.sockets.adapter.rooms[data.gid].sockets);
                let sockets_arr = [];
                let activeconnections = io.sockets.adapter.rooms[data.gid].sockets;
                
                for(var socketid in activeconnections){
                    sockets_arr.push(socketid);
                }
                
                userController.getActiveGroupUsers(data.gid , sockets_arr , function(err, users){
                    if(err){
                        console.log(err);
                        return cb({ success : false , err : err });
                    }
                   io.to(data.gid).emit('aciveusers', {success : true ,data : users });
                    return cb({success : true});
                })
            });
        })
        handleMessageReceived(socket);
        handleUserDisconnection(socket);
    });
   return io;
}

var handleMessageReceived = function(socket) {

    socket.on('newmessage',function(data,cb) {
        // console.log(socket.rooms);
        userController.addNewMessage( data, (err, resp) => {
            console.log(err);
            if(err){
               return cb({ success : false , err : err });
            }
            io.to(data.gid).emit('ev', { success: true, data : resp });
            return cb({success : true});
        })
    })
}

var handleUserDisconnection = async function(socket){
    try{
        socket.on('disconnect',async  function(reason ){
            const user = await userController.fetchInactiveUser(socket.id);
            io.to(user.gid).emit('inactiveuser', { success : true ,data : user });
        })
    }catch(err){
        console.log("error in disconnection " , err );
        return;
    }
}
