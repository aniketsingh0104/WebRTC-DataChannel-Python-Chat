/*

*/

// configuration for RTCPeerConnection signaling
const configuration = {iceServers: [{urls: 'stun:stun.l.google.com:19302'}]};
let peerConnections = {};
let dataChannel = null;


// Create a new Websocket
var APP = {
    wsURL: 'ws://' + window.location.host + '/ws',   // url of websocket
    connected: false,
    roomOn: false,
    roomId: null,
    isPaired: false,

    sendMessage: function(data) {
        APP.socket.send(JSON.stringify(data));
        console.log(data);
    },

    appendChatMessage: function(message, owner) {
        let messageELement = null;
        if(owner === "user") {
            messageELement = '<div class="column is-full"><span class="tag is-primary chat-tag">' + message + '</span></div>'
        } else {
            messageELement = '<div class="column is-full"><span class="tag is-info chat-tag">' + message + '</span></div>'
        }
        $("#chat-room").append(messageELement);
    },

    messageUpdate: function(message) {
        console.log(APP.roomId)
        if(APP.roomId) {
            message = "Room: " + APP.roomId + " " + message;
            console.log(message);
        }
        $("#message").text(message);
    },

    initialize: function() {
        APP.socket = new WebSocket(APP.wsURL); // create a new websocket

        // Show a connected message when the WebSocket is opened.
        APP.socket.onopen = function(event) {
            APP.connected = true;
            console.log("Socket Connection open");
            APP.messageUpdate('Connected to Room Server');
        };

        // Show a disconnected message when the WebSocket is closed.
        APP.socket.onclose = function(event) {
            APP.connected = false;
            APP.messageUpdate('Disconnected from Room Server');
            APP.roomEnded();  // Room Ended - Disconnected from Server
    
        };

        // Handle any errors that occur.
        APP.socket.onerror = function(error) {
            APP.connected = false;
            APP.roomOn = false;
            APP.isPaired = false;
            APP.messageUpdate('Connection Error');
        };

        // Handle messages sent by the server.
        APP.socket.onmessage = async function(event) {
            let payload = JSON.parse(event.data);
            let action = payload.action;
            let data = payload.data;
            APP.serverMessage(action, data);
        };

    },

    roomStarted: function(roomId) {
        APP.roomOn = true;
        APP.roomId = roomId;
        // APP.resetBoard();
        $("#room-submit")[0].style.backgroundColor = "red";
        $("#room-submit").val("End Chat");
    },

    roomEnded: function() {
        $("#chat-room").val("");
        $("#room-submit")[0].style.backgroundColor = "";
        $("#room-submit").val("New Room");
        APP.roomOn = false;
        APP.isPaired = false;
        APP.roomId = null;
    },

    abortRoom: function() {
        // End Room/Chat
        let data = {
            action: "abort",
            room_id: APP.roomId
        };
        APP.sendMessage(data);
    },

    newRoom: function() {
        if(!APP.connected) {
            APP.initialize();
        }

        let data = {
            action: "new"
        };

        APP.sendMessage(data);
    },

    joinRoom: function(roomId) {
        if(!APP.connected) {
            APP.initialize();
        }

        let data = {
            action: "join",
            room_id: roomId
        };
        APP.sendMessage(data);
    },

    openDataChannel: function() {
        // Enable textarea and button when opened
        dataChannel.onopen = function(event) {
            console.log("dataChannel: open");
            $("#room-submit")[0].style.backgroundColor = "red";
            $("#room-submit").val("End Chat");
            APP.messageUpdate("Start Chatting")
        };

        // Disabled input when closed
        dataChannel.onclose = function(event) {
            console.log("dataChannel: close");
            APP.roomEnded();
        };

        dataChannel.onmessage = function (event) {
            console.log("dataChannel: message");
            const message = event.data;
            APP.appendChatMessage(message, "remote");
        };
    },

    serverMessage: async function (action, data) {
        try {
            switch (action) {
                case "desc": {
                    if (data.desc.type === 'offer') {
                        const peerConnection = new RTCPeerConnection(configuration);
                        peerConnections[APP.roomId] = peerConnection;
                        console.log("Got Offer");
                        peerConnection.setRemoteDescription(data.desc)
                        .then(() => peerConnection.createAnswer())
                        .then(sdp => peerConnection.setLocalDescription(sdp))
                        .then(function () {
                            APP.sendMessage({action: "desc", desc: peerConnection.localDescription});
                            console.log("Answer Sent");
                        });
                        peerConnection.onicecandidate = function(event) {
                            if (event.candidate) {
                                APP.sendMessage({action: "candidate", candidate: event.candidate});
                            }
                        };
                        peerConnections[APP.roomId].ondatachannel = function(event) {
                            dataChannel = event.channel;
                            APP.openDataChannel();
                            console.log("User B Got DataChannel from User A");
                        }
                        console.log("Ice candidates sent After getting an Offer");
                    } else if (data.desc.type === 'answer') {
                        await peerConnections[APP.roomId].setRemoteDescription(data.desc);
                        console.log("Got An Answer");
                    } else {
                        console.log('Unsupported SDP type.');
                    }
                    break;
                }
                case "candidate":
                    console.log("Got Ice Candidate");
                    await peerConnections[APP.roomId].addIceCandidate(data.candidate);
                    break;
                case "open": // socket connection established
                    APP.messageUpdate("Connected to Room Server")
                    break;
                case "wait-pair": // wait for other user
                    APP.roomStarted(data.room_id);
                    APP.messageUpdate("Waiting for Pair to join..");
                    break;
                case "ready": {// both users have joined through web socket
                    APP.roomStarted(data.room_id);
                    APP.isPaired = true;
                    const peerConnection = new RTCPeerConnection(configuration);
                    dataChannel = peerConnection.createDataChannel('sendDataChannel');
                    APP.openDataChannel();
                    console.log("Data Created by user A");
                    peerConnections[data.room_id] = peerConnection;
                    peerConnection.createOffer()
                    .then(sdp => peerConnection.setLocalDescription(sdp))
                    .then(function () {
                        APP.sendMessage({action: "desc", desc: peerConnection.localDescription});
                    });
                    console.log("Offer sent");
                    peerConnection.onicecandidate = function(event) {
                        if (event.candidate) {
                            APP.sendMessage({action: "candidate", candidate: event.candidate});
                        }
                    };
                    console.log("Ice candidates sent");
                    APP.messageUpdate("Connecting with other user...");
                    break;
                }
                case "end":
                    APP.roomEnded();
                    APP.messageUpdate("Room Closed. Thankyou!");
                    break;
                case "error":
                    if (data.message) {
                        APP.messageUpdate(data.message);
                    } else {
                        APP.messageUpdate("Opps!...Error Occured");
                    }
                    break;
                default:
                    APP.messageUpdate("Unknown Action: " + action);
            }
        } catch(err) {
            console.error(err);
            APP.messageUpdate("Unknown Error: " + err);
        }
    },

    sendUserMessage: function(message) {
        // ... append message in the chat box
        APP.appendChatMessage(message, "user");
        let data = {
            action: "message",
            user_message: message
        };
        APP.sendMessage(data);
    }

};

// on typying anything on room-id input change the state of button
$("#room-id").on("change paste keyup", function() {
    var value = $(this).val();
    if (value) {
      $("#room-submit").val("Join Room");
    } else {
      $("#room-submit").val("New Room");
    }
});

APP.initialize();

$("#room-submit").click(function() {
    if(APP.roomOn) {
        APP.abortRoom();
    } else {
        // New/Join Room
        let roomId = $("#room-id").val();
        if(roomId) {
            // console.log
            APP.joinRoom(roomId);
        } else {
            APP.newRoom();
        }
    }
});


function messageSender() {
    let message  = $("#chat-message").val();
    // console.log("Message value: " + message);
    if(message) {
        if(dataChannel && dataChannel.readyState=="open") {
            dataChannel.send(message);
            APP.appendChatMessage(message, "user");
            $("#chat-message").val('');
        }
        else if(dataChannel) {
            console.log("Data Channel State: " + dataChannel.readyState);
        } else {
            console.log("Data Channel Null: " + dataChannel.readyState);
        }
    }
}

$("#send").click(messageSender);






